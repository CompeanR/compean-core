import { Observable } from './observable.js';

export type ToastTone = 'success' | 'error';

export interface Toast {
    id: number;
    message: string;
    tone: ToastTone;
}

/** The one channel for short feedback messages. Controllers write the words; `<Toaster />` decides the look. */
export class ToastService extends Observable {
    private current: Toast | null = null;
    private nextId = 1;

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
        if (this.current?.id !== id) return;
        this.current = null;
        this.notify();
    }
}
