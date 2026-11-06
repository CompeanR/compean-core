import { Observable } from './observable.js';
import { $S } from './registry.js';
import { reportSafely } from './report-safely.js';
import { ToastService } from './toast.service.js';
import { UserError } from './user-error.js';

/**
 * What the screen shows as a whole: a loading view, the content, or a full-screen error with retry.
 * See "Controller status" in the README's design notes.
 */
export type ControllerStatus = 'loading' | 'ready' | 'error';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

/**
 * One screen's logic and state. `state` is what the screen renders; actions are public methods.
 * A controller runs unchanged on web and mobile, so it never imports React, React Native or a
 * router. Subclasses override `initialize()` and `state`, load data with `load()` and perform
 * actions with `run()`; neither needs a try/catch.
 */
export abstract class Controller<TState> extends Observable {
    /** Undone on `dispose()` in reverse order, so the last thing tracked is undone first. */
    private readonly cleanups: Array<() => void> = [];
    private currentStatus: ControllerStatus = 'loading';
    /** The message for the 'error' status; null in any other status. */
    private currentLoadError: string | null = null;
    /** Loads started but not finished. While above zero, `start()` leaves the status alone. */
    private loadsInFlight = 0;

    /** Read by the screen after every `notify()`. Build it from fields; never fetch or do slow work here. */
    public abstract get state(): TState;

    /**
     * Subclass hook, called once by `start()` when the screen mounts. Start loading with `load()`
     * and subscribe to services here, registering each unsubscribe with `track()`.
     */
    public initialize(): void {}

    /**
     * Mounts the controller: calls `initialize()`, then marks a screen that started no load as
     * ready. `useController` calls this; tests call it in place of mounting a screen.
     */
    public start(): void {
        this.initialize();
        if (this.loadsInFlight === 0 && this.currentStatus === 'loading') {
            this.settle('ready', null);
        }
    }

    /** Safe to call more than once: each cleanup runs only the first time. */
    public dispose(): void {
        for (const cleanup of this.cleanups.splice(0).reverse()) {
            cleanup();
        }
    }

    protected get status(): ControllerStatus {
        return this.currentStatus;
    }

    /** The message to show when status is 'error': a UserError's own words, or a generic one. */
    protected get loadError(): string | null {
        return this.currentLoadError;
    }

    /** Runs `cleanup` (an unsubscribe, a clearTimeout) when the controller is disposed. */
    protected track(cleanup: () => void): void {
        this.cleanups.push(cleanup);
    }

    /**
     * Loads the screen's data. Before the screen is ready, success makes it 'ready' and failure
     * makes it 'error' (shown full screen, with a retry that calls `load()` again). Once ready, a
     * load is a refresh: the data stays on screen and a failure shows as a toast. Never rejects.
     */
    protected async load(task: () => Promise<void>): Promise<void> {
        const decidesStatus = this.currentStatus !== 'ready';
        if (decidesStatus && this.currentStatus === 'error') {
            this.settle('loading', null);
        }
        this.loadsInFlight += 1;
        try {
            await task();
            if (decidesStatus) {
                this.settle('ready', null);
            }
        } catch (error) {
            const message = this.describeAndReport(error);
            if (decidesStatus) {
                this.settle('error', message);
            } else {
                $S(ToastService).show(message, 'error');
            }
        } finally {
            this.loadsInFlight -= 1;
        }
    }

    /**
     * Performs an action. It never changes the screen's status: a failure shows as an error toast,
     * with a UserError's own message or a generic one, and bugs are reported. Never rejects.
     */
    protected async run(task: () => Promise<void>): Promise<void> {
        try {
            await task();
        } catch (error) {
            $S(ToastService).show(this.describeAndReport(error), 'error');
        }
    }

    /** The message the user sees for this error; reports it first unless it's a UserError. */
    private describeAndReport(error: unknown): string {
        if (error instanceof UserError) {
            return error.message;
        }
        reportSafely(error, { where: this.constructor.name });
        return GENERIC_MESSAGE;
    }

    private settle(status: ControllerStatus, loadError: string | null): void {
        this.currentStatus = status;
        this.currentLoadError = loadError;
        this.notify();
    }
}
