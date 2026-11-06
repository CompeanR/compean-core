import { Observable } from './observable.js';

export type ToastTone = 'success' | 'error';

export interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
}

/** The one channel for short feedback messages. Controllers write the words; `<Toaster />` decides the look. */
export class ToastService extends Observable {
    /** The toast on screen; null when none is showing. */
    private current: Toast | null = null;
    /** Ids increase, so a late `dismiss` of an older toast never hides a newer one. */
    private nextId = 1;

    /** Shows `message`, replacing any toast on screen. Use 'error' only outside `load()` and `run()`, which show their own. */
    public show(message: string, tone: ToastTone = 'success'): void {
        this.current = { id: this.nextId++, message, tone };
        this.notify();
    }

    /** The toast to display, or null when none is showing. */
    public latest(): Toast | null {
        return this.current;
    }

    /** Hides the toast with this id; a newer toast stays. */
    public dismiss(id: number): void {
        if (this.current?.id !== id) {
            return;
        }
        this.current = null;
        this.notify();
    }
}
