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
        return this.load(async () => {
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

describe('Controller load and run', () => {
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

        expect(form.view()).toEqual({ values: { body: 'Call the recruiter' }, errors: {}, formError: null, canSubmit: true });
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

        await expect(
            form.submit(async () => {
                throw new Error('offline');
            }),
        ).rejects.toThrow('offline');
        expect(form.view().values.body).toBe('hello');
    });

    it('resets values and hides errors', () => {
        const form = new Form(NoteSchema, { body: '' });
        form.touch('body');
        form.set('body', 'draft');

        form.reset();

        expect(form.view()).toEqual({ values: { body: '' }, errors: {}, formError: null, canSubmit: false });
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

describe('edge cases: form rules, loading, reporting, readJson, navigation fake', () => {
    let reporter: RecordingReporter;
    let toasts: ToastService;

    beforeEach(() => {
        resetServices();
        reporter = new RecordingReporter();
        toasts = new ToastService();
        register(ErrorReporter, reporter);
        register(ToastService, toasts);
    });

    it('cannot submit, and shows a form error, when a form-level rule fails', async () => {
        const PasswordSchema = z
            .object({ password: z.string(), confirm: z.string() })
            .refine((v) => v.password === v.confirm, 'Passwords must match');
        const form = new Form(PasswordSchema, { password: 'a', confirm: 'b' });
        const action = vi.fn(async () => {});

        expect(form.view().canSubmit).toBe(false);
        await form.submit(action);

        expect(action).not.toHaveBeenCalled();
        expect(form.view().formError).toBe('Passwords must match');
    });

    it('shows errors after submit for schema fields missing from the initial values', async () => {
        const Schema = z.object({ body: z.string().min(1, 'Write something first'), title: z.string({ error: 'Add a title' }) });
        const form = new Form(Schema, { body: 'hello' } as z.input<typeof Schema>);

        await form.submit(async () => {});

        expect(form.view().errors).toEqual({ title: 'Add a title' });
    });

    it('returns a copy of the values, not its own object', () => {
        const form = new Form(NoteSchema, { body: 'a' });
        (form.view().values as { body: string }).body = 'changed';

        expect(form.view().values.body).toBe('a');
    });

    it('lets only load() decide the status; an action meanwhile uses the toast path', async () => {
        let finishLoad!: (name: string) => void;
        const controller = new ProfileController(
            () =>
                new Promise((resolve) => {
                    finishLoad = resolve;
                }),
        );
        const load = controller.reload();

        await controller.rename(async () => {
            throw new UserError('Already saved', 409);
        });
        expect(controller.state.status).toBe('loading');
        expect(toasts.latest()?.message).toBe('Already saved');

        await controller.rename(async () => {});
        expect(controller.state.status).toBe('loading');

        finishLoad('Ada');
        await load;
        expect(controller.state.status).toBe('ready');
    });

    it('keeps a UserError message as the load error, without reporting it', async () => {
        const controller = new ProfileController(async () => {
            throw new UserError('Application not found', 404);
        });

        await controller.reload();

        expect(controller.state.status).toBe('error');
        expect((controller as unknown as { loadError: string }).loadError).toBe('Application not found');
        expect(reporter.reports).toEqual([]);
    });

    it('still shows the toast when the reporter itself fails', async () => {
        register(ErrorReporter, {
            report: () => {
                throw new Error('sentry down');
            },
        });
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const controller = new ProfileController(async () => 'Ada');
        await controller.reload();

        await expect(
            controller.rename(async () => {
                throw new Error('bug');
            }),
        ).resolves.toBeUndefined();

        expect(toasts.latest()?.message).toBe('Something went wrong. Try again.');
        expect(errors).toHaveBeenCalled();
        errors.mockRestore();
    });

    it('turns a 4xx without a readable message into a plain Error', async () => {
        const error = await readJson(Promise.resolve(response(400, undefined))).catch((e) => e);

        expect(error).not.toBeInstanceOf(UserError);
    });

    it('maps a 4xx outside the known statuses to a 400 UserError', async () => {
        const error = await readJson(Promise.resolve(response(422, { message: 'Too many notes' }))).catch((e) => e);

        expect(error).toMatchObject({ message: 'Too many notes', status: 400 });
    });

    it('can be awaited without hanging', async () => {
        const navigation = recordingNavigation<{ back(): void }>();

        await expect(Promise.resolve(navigation)).resolves.toBe(navigation);
    });
});

interface NewApplicationState {
    status: string;
}

class NewApplicationController extends Controller<NewApplicationState> {
    public get state(): NewApplicationState {
        return { status: this.status };
    }

    public save(task: () => Promise<void>): Promise<void> {
        return this.run(task);
    }
}

describe('Controller.start, load and run', () => {
    let toasts: ToastService;

    beforeEach(() => {
        resetServices();
        toasts = new ToastService();
        register(ErrorReporter, new RecordingReporter());
        register(ToastService, toasts);
    });

    it('starts a screen that loads nothing as ready', () => {
        const controller = new NewApplicationController();

        controller.start();

        expect(controller.state.status).toBe('ready');
    });

    it('shows a failed action as a toast on a screen that loads nothing', async () => {
        const controller = new NewApplicationController();
        controller.start();

        await controller.save(async () => {
            throw new UserError('Name taken', 409);
        });

        expect(controller.state.status).toBe('ready');
        expect(toasts.latest()).toMatchObject({ message: 'Name taken', tone: 'error' });
    });

    it('stays loading after start while initialize() is loading', () => {
        const controller = new ProfileController(() => new Promise(() => {}));

        controller.start();

        expect(controller.state.status).toBe('loading');
    });

    it('never lets a successful action turn a failed load into ready', async () => {
        const controller = new ProfileController(async () => {
            throw new Error('offline');
        });
        await controller.reload();

        await controller.rename(async () => {});

        expect(controller.state.status).toBe('error');
    });

    it('keeps the data on screen when a refresh fails, and shows a toast', async () => {
        let fail = false;
        const controller = new ProfileController(async () => {
            if (fail) throw new UserError('Could not refresh', 409);
            return 'Ada';
        });
        await controller.reload();

        fail = true;
        await controller.reload();

        expect(controller.state).toEqual({ status: 'ready', name: 'Ada' });
        expect(toasts.latest()?.message).toBe('Could not refresh');
    });
});

class DashboardController extends Controller<{ status: string; parts: string[] }> {
    public parts: string[] = [];

    public constructor(private readonly sources: Array<() => Promise<string>>) {
        super();
    }

    public get state() {
        return { status: this.status, parts: this.parts };
    }

    public initialize(): void {
        for (const source of this.sources) {
            void this.load(async () => {
                this.parts.push(await source());
            });
        }
    }
}

describe('Controller with several first loads', () => {
    beforeEach(() => {
        resetServices();
        register(ErrorReporter, new RecordingReporter());
        register(ToastService, new ToastService());
    });

    function deferred() {
        let resolve!: (value: string) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<string>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    }

    it('is ready only after every first load succeeds', async () => {
        const a = deferred();
        const b = deferred();
        const controller = new DashboardController([() => a.promise, () => b.promise]);
        controller.start();

        a.resolve('jobs');
        await a.promise;
        await Promise.resolve();
        expect(controller.state.status).toBe('loading');

        b.resolve('applications');
        await vi.waitFor(() => expect(controller.state.status).toBe('ready'));
    });

    it('shows the error when one first load fails, even if another finishes later', async () => {
        const a = deferred();
        const b = deferred();
        const controller = new DashboardController([() => a.promise, () => b.promise]);
        controller.start();

        a.reject(new UserError('Jobs are unavailable', 404));
        await a.promise.catch(() => {});
        b.resolve('applications');
        await new Promise((done) => setTimeout(done, 0));

        expect(controller.state.status).toBe('error');
        expect((controller as unknown as { loadError: string }).loadError).toBe('Jobs are unavailable');
    });

    it('shows the error when the last first load fails after another succeeded', async () => {
        const a = deferred();
        const b = deferred();
        const controller = new DashboardController([() => a.promise, () => b.promise]);
        controller.start();

        const seen: string[] = [];
        controller.subscribe(() => seen.push(controller.state.status));
        a.resolve('jobs');
        await a.promise;
        b.reject(new Error('offline'));
        await new Promise((done) => setTimeout(done, 0));

        expect(controller.state.status).toBe('error');
        expect(seen).not.toContain('ready');
    });
});

describe('register with fakes', () => {
    class RealNotes {
        private readonly secret = 'internal';

        public list(): string[] {
            return [this.secret];
        }
    }

    class FakeNotes {
        public readonly added: string[] = [];

        public list(): string[] {
            return ['fake'];
        }
    }

    it('accepts a fake with the public shape of the service, extra members included, without a cast', () => {
        resetServices();
        const fake = new FakeNotes();

        register(RealNotes, fake);

        expect($S(RealNotes).list()).toEqual(['fake']);
    });
});
