import { Observable } from './observable.js';
import { $S } from './registry.js';
import { reportSafely } from './report-safely.js';
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
    private loadInFlight = false;

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

    /** 'loading' until the loading run succeeds; 'error' if it failed. */
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
     * Runs async work and handles every failure. The first run while the screen isn't loaded is
     * the loading run: it decides the status ('ready' or 'error'). Every other run reports a
     * failure as an error toast. A UserError shows its own message; anything else shows a generic
     * one and is reported as a bug. Callers write no try/catch.
     */
    protected async run(task: () => Promise<void>): Promise<void> {
        const isLoadingRun = this.currentStatus !== 'ready' && !this.loadInFlight;
        if (isLoadingRun) {
            this.loadInFlight = true;
        }
        try {
            await task();
            if (isLoadingRun) {
                this.settle('ready', null);
            }
        } catch (error) {
            const message = error instanceof UserError ? error.message : GENERIC_MESSAGE;
            if (!(error instanceof UserError)) {
                reportSafely(error, { where: this.constructor.name });
            }
            if (isLoadingRun) {
                this.settle('error', message);
            } else {
                $S(ToastService).show(message, 'error');
            }
        } finally {
            if (isLoadingRun) {
                this.loadInFlight = false;
            }
        }
    }

    private settle(status: ControllerStatus, loadError: string | null): void {
        this.currentStatus = status;
        this.currentLoadError = loadError;
        this.notify();
    }
}
