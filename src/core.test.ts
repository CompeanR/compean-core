import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { QueryClient } from '@tanstack/query-core';
import {
    $S,
    changed,
    ConsoleReporter,
    Controller,
    ErrorReporter,
    Form,
    Observable,
    readJson,
    register,
    ToastService,
    UserError,
} from './index.js';
import { RecordingReporter, recordingNavigation, resetServices } from './testing/index.js';

class Counter extends Observable {
    public value = 0;

    public increment(): void {
        this.value += 1;
        this.notify();
    }
}

describe('Observable', () => {
    it('notifies every subscriber until it unsubscribes', () => {
        const counter = new Counter();
        const seen: number[] = [];
        const unsubscribe = counter.subscribe(() => seen.push(counter.value));

        counter.increment();
        unsubscribe();
        counter.increment();

        expect(seen).toEqual([1]);
    });
});

describe('registry', () => {
    beforeEach(() => resetServices());

    it('returns the registered instance', () => {
        const toasts = new ToastService();
        register(ToastService, toasts);

        expect($S(ToastService)).toBe(toasts);
    });

    it('fails loudly for a service nobody registered', () => {
        class Missing {}

        expect(() => $S(Missing)).toThrow('Missing is not registered');
    });

    it('gives the framework services a default so tests and local runs need no wiring', () => {
        expect($S(ToastService)).toBeInstanceOf(ToastService);
        expect($S(ErrorReporter)).toBeInstanceOf(ConsoleReporter);
    });
});

describe('ToastService', () => {
    it('keeps the latest message, defaulting to a success tone', () => {
        const toasts = new ToastService();
        toasts.show('Note added');

        expect(toasts.latest()).toMatchObject({ message: 'Note added', tone: 'success' });
    });

    it('dismisses only the toast it was asked to', () => {
        const toasts = new ToastService();
        toasts.show('First');
        const first = toasts.latest()!;
        toasts.show('Second');

        toasts.dismiss(first.id);

        expect(toasts.latest()?.message).toBe('Second');
    });
});

describe('ConsoleReporter', () => {
    it('never throws, even when the console does', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {
            throw new Error('console unavailable');
        });

        expect(() => new ConsoleReporter().report(new Error('bug'), { where: 'Test' })).not.toThrow();
        spy.mockRestore();
    });
});

interface ProfileState {
    status: string;
    name: string;
}

class ProfileController extends Controller<ProfileState> {
    public name = '';
    public loads = 0;

    public constructor(private readonly loadName: () => Promise<string>) {
        super();
    }

    public get state(): ProfileState {
        return { status: this.status, name: this.name };
    }

    public initialize(): void {
        void this.reload();
    }

    public reload(): Promise<void> {
        return this.run(async () => {
            this.loads += 1;
            this.name = await this.loadName();
        });
    }

    public rename(task: () => Promise<void>): Promise<void> {
        return this.run(task);
    }

    public watch(cleanup: () => void): void {
        this.track(cleanup);
    }
}

describe('Controller.run', () => {
    let reporter: RecordingReporter;
    let toasts: ToastService;

    beforeEach(() => {
        resetServices();
        reporter = new RecordingReporter();
        toasts = new ToastService();
        register(ErrorReporter, reporter);
        register(ToastService, toasts);
    });

    it('starts loading and becomes ready after the first successful run', async () => {
        const controller = new ProfileController(async () => 'Ada');
        expect(controller.state.status).toBe('loading');

        await controller.reload();

        expect(controller.state).toEqual({ status: 'ready', name: 'Ada' });
    });

    it('shows the error state when the first load fails, and recovers on retry', async () => {
        let fail = true;
        const controller = new ProfileController(async () => {
            if (fail) throw new Error('database down');
            return 'Ada';
        });

        await controller.reload();
        expect(controller.state.status).toBe('error');

        fail = false;
        await controller.reload();
        expect(controller.state.status).toBe('ready');
    });

    it('shows a UserError message as an error toast once loaded, without reporting it', async () => {
        const controller = new ProfileController(async () => 'Ada');
        await controller.reload();

        await controller.rename(async () => {
            throw new UserError("Can't move from REJECTED to TECHNICAL", 409);
        });

        expect(toasts.latest()).toMatchObject({ message: "Can't move from REJECTED to TECHNICAL", tone: 'error' });
        expect(reporter.reports).toEqual([]);
        expect(controller.state.status).toBe('ready');
    });

    it('shows a generic message for a bug and reports it with the controller name', async () => {
        const controller = new ProfileController(async () => 'Ada');
        await controller.reload();

        await controller.rename(async () => {
            throw new TypeError("Cannot read properties of undefined (reading 'stage')");
        });

        expect(toasts.latest()).toMatchObject({ message: 'Something went wrong. Try again.', tone: 'error' });
        expect(reporter.reports).toHaveLength(1);
        expect(reporter.reports[0]?.context).toEqual({ where: 'ProfileController' });
    });

    it('notifies subscribers when the status changes', async () => {
        const controller = new ProfileController(async () => 'Ada');
        const statuses: string[] = [];
        controller.subscribe(() => statuses.push(controller.state.status));

        await controller.reload();

        expect(statuses).toContain('ready');
    });

    it('runs every tracked cleanup once on dispose', () => {
        const controller = new ProfileController(async () => 'Ada');
        const cleanup = vi.fn();
        controller.watch(cleanup);

        controller.dispose();
        controller.dispose();

        expect(cleanup).toHaveBeenCalledTimes(1);
    });
});

const NoteSchema = z.object({
    body: z.string().trim().min(1, 'Write something first').max(20, 'Too long'),
});

describe('Form', () => {
    it('hides errors until a field is touched', () => {
        const form = new Form(NoteSchema, { body: '' });

        expect(form.view().errors).toEqual({});

        form.touch('body');

        expect(form.view().errors).toEqual({ body: 'Write something first' });
    });

    it('updates values, clears a fixed error and reports whether it can submit', () => {
        const form = new Form(NoteSchema, { body: '' });
        form.touch('body');

        form.set('body', 'Call the recruiter');

        expect(form.view()).toEqual({ values: { body: 'Call the recruiter' }, errors: {}, canSubmit: true });
    });

    it('runs the action with the parsed input only when valid', async () => {
        const form = new Form(NoteSchema, { body: '  hello  ' });
        const action = vi.fn(async () => {});

        await form.submit(action);

        expect(action).toHaveBeenCalledWith({ body: 'hello' });
    });

    it('shows every error and skips the action when invalid', async () => {
        const form = new Form(NoteSchema, { body: '   ' });
        const action = vi.fn(async () => {});

        await form.submit(action);

        expect(action).not.toHaveBeenCalled();
        expect(form.view().errors).toEqual({ body: 'Write something first' });
    });

    it('lets the action failure propagate so run() can handle it, keeping the values', async () => {
        const form = new Form(NoteSchema, { body: 'hello' });

        await expect(form.submit(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
        expect(form.view().values.body).toBe('hello');
    });

    it('resets values and hides errors', () => {
        const form = new Form(NoteSchema, { body: '' });
        form.touch('body');
        form.set('body', 'draft');

        form.reset();

        expect(form.view()).toEqual({ values: { body: '' }, errors: {}, canSubmit: false });
    });

    it('notifies on every change', () => {
        const form = new Form(NoteSchema, { body: '' });
        const listener = vi.fn();
        form.subscribe(listener);

        form.set('body', 'a');
        form.touch('body');
        form.reset();

        expect(listener).toHaveBeenCalledTimes(3);
    });
});

function response(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
            return body;
        },
    };
}

describe('readJson', () => {
    it('returns the body of a successful response', async () => {
        await expect(readJson(Promise.resolve(response(200, { id: 'a1' })))).resolves.toEqual({ id: 'a1' });
    });

    it('returns undefined for 204 No Content', async () => {
        await expect(readJson(Promise.resolve(response(204, undefined)))).resolves.toBeUndefined();
    });

    it('turns a 4xx with a message into a UserError', async () => {
        const error = await readJson(Promise.resolve(response(409, { message: 'Already applied' }))).catch((e) => e);

        expect(error).toBeInstanceOf(UserError);
        expect(error).toMatchObject({ message: 'Already applied', status: 409 });
    });

    it('turns a 5xx into a plain Error', async () => {
        const error = await readJson(Promise.resolve(response(500, { message: 'Something went wrong' }))).catch((e) => e);

        expect(error).not.toBeInstanceOf(UserError);
        expect(error.message).toBe('Request failed with status 500');
    });
});

describe('changed', () => {
    it('refreshes every query that depends on the resource, and only those', async () => {
        const cache = new QueryClient();
        const query = (key: string, dependsOn: string[]) =>
            cache.fetchQuery({ queryKey: [key], meta: { dependsOn }, queryFn: async () => key, staleTime: Infinity });
        await query('dashboard', ['applications', 'jobs']);
        await query('pipeline', ['applications']);
        await query('saved-searches', ['jobs']);

        await changed(cache, 'applications');

        expect(cache.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
        expect(cache.getQueryState(['pipeline'])?.isInvalidated).toBe(true);
        expect(cache.getQueryState(['saved-searches'])?.isInvalidated).toBe(false);
    });
});

describe('recordingNavigation', () => {
    interface ApplicationNavigation {
        toResumeVersion(versionId: string): void;
        back(): void;
    }

    it('records each call with its arguments', () => {
        const navigation = recordingNavigation<ApplicationNavigation>();

        navigation.toResumeVersion('v1');
        navigation.back();

        expect(navigation.calls).toEqual([['toResumeVersion', 'v1'], ['back']]);
    });
});
