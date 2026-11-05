import { Observable } from './observable.js';
import { $S } from './registry.js';
import { ErrorReporter } from './reporting.js';
import { ToastService } from './toast.service.js';
import { UserError } from './user-error.js';

export type ControllerStatus = 'loading' | 'ready' | 'error';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

/**
 * One screen's logic and state. `state` is what the screen renders; actions are public methods.
 * Runs on web and mobile alike, so it never imports React, React Native or a router.
 */
export abstract class Controller<TState> extends Observable {
    private readonly cleanups: Array<() => void> = [];
    private currentStatus: ControllerStatus = 'loading';
    private currentLoadError: string | null = null;

    /** Display-ready values for the screen. */
    public abstract get state(): TState;

    /** Called once when the screen mounts: start loading and subscribe here. */
    public initialize(): void {}

    /** Runs every cleanup registered with `track()`. */
    public dispose(): void {
        for (const cleanup of this.cleanups.splice(0).reverse()) {
            cleanup();
        }
    }

    /** 'loading' until the first successful `run()`; 'error' if that first run failed. */
    protected get status(): ControllerStatus {
        return this.currentStatus;
    }

    /** The message to show when status is 'error': a UserError's own words, or a generic one. */
    protected get loadError(): string | null {
        return this.currentLoadError;
    }

    /** Registers a cleanup, such as an unsubscribe, to run on `dispose()`. */
    protected track(cleanup: () => void): void {
        this.cleanups.push(cleanup);
    }

    /**
     * Runs async work and handles every failure. Before the screen has loaded, a failure becomes
     * the 'error' status; afterwards it becomes an error toast. A UserError shows its own message;
     * anything else shows a generic one and is reported as a bug. Callers write no try/catch.
     */
    protected async run(task: () => Promise<void>): Promise<void> {
        try {
            await task();
            if (this.currentStatus !== 'ready') {
                this.currentStatus = 'ready';
                this.currentLoadError = null;
                this.notify();
            }
        } catch (error) {
            const message = error instanceof UserError ? error.message : GENERIC_MESSAGE;
            if (!(error instanceof UserError)) {
                $S(ErrorReporter).report(error, { where: this.constructor.name });
            }
            if (this.currentStatus === 'ready') {
                $S(ToastService).show(message, 'error');
            } else {
                this.currentStatus = 'error';
                this.currentLoadError = message;
                this.notify();
            }
        }
    }
}
