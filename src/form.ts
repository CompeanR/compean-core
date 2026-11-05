import type { z } from 'zod';
import { Observable } from './observable.js';

type FieldErrors<V> = Partial<Record<keyof V, string>>;

export interface FormView<V> {
    values: V;
    /** Errors for fields the user has touched, or all of them after a submit. */
    errors: FieldErrors<V>;
    /** True when the current values pass the schema. */
    canSubmit: boolean;
}

/**
 * A form's values and errors, checked by a domain schema. A controller holds one as
 * `public readonly`, the screen binds inputs to it, and `submit()` runs only valid input.
 */
export class Form<S extends z.ZodObject> extends Observable {
    private values: z.input<S>;
    private readonly touched = new Set<keyof z.input<S>>();

    public constructor(
        private readonly schema: S,
        private readonly initial: z.input<S>,
    ) {
        super();
        this.values = { ...initial };
    }

    public set<K extends keyof z.input<S>>(field: K, value: z.input<S>[K]): void {
        this.values = { ...this.values, [field]: value };
        this.notify();
    }

    /** Marks a field as visited (usually on blur), so its error starts showing. */
    public touch(field: keyof z.input<S>): void {
        this.touched.add(field);
        this.notify();
    }

    /** Back to the initial values, with every error hidden. */
    public reset(): void {
        this.values = { ...this.initial };
        this.touched.clear();
        this.notify();
    }

    public view(): FormView<z.input<S>> {
        const errors = this.allErrors();
        const shown: FieldErrors<z.input<S>> = {};
        for (const field of this.touched) {
            const message = errors[field];
            if (message) shown[field] = message;
        }
        return { values: this.values, errors: shown, canSubmit: Object.keys(errors).length === 0 };
    }

    /**
     * Runs `action` with the parsed input when it's valid; otherwise shows every field's error and
     * skips it. A failure inside `action` propagates, so `run()` can report it and the values stay.
     */
    public async submit(action: (input: z.output<S>) => Promise<void>): Promise<void> {
        const result = this.schema.safeParse(this.values);
        if (!result.success) {
            for (const field of Object.keys(this.values) as Array<keyof z.input<S>>) {
                this.touched.add(field);
            }
            this.notify();
            return;
        }
        await action(result.data);
    }

    private allErrors(): FieldErrors<z.input<S>> {
        const result = this.schema.safeParse(this.values);
        const errors: FieldErrors<z.input<S>> = {};
        if (result.success) return errors;
        for (const issue of result.error.issues) {
            const field = issue.path[0] as keyof z.input<S> | undefined;
            if (field !== undefined && !errors[field]) errors[field] = issue.message;
        }
        return errors;
    }
}
