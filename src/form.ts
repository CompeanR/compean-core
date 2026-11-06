import type { z } from 'zod';
import { Observable } from './observable.js';

type FieldErrors<V> = Partial<Record<keyof V, string>>;

export interface FormView<V> {
    values: V;
    /** Errors for fields the user has touched, or all of them after a submit. */
    errors: FieldErrors<V>;
    /** An error that belongs to the whole form (a rule across fields), shown after a submit. */
    formError: string | null;
    /** True when the current values pass the schema. */
    canSubmit: boolean;
}

interface Validation<V> {
    valid: boolean;
    fieldErrors: FieldErrors<V>;
    formError: string | null;
}

/**
 * A form's values and errors, checked by a domain schema. A controller holds one as
 * `public readonly`, the screen binds inputs to it, and `submit()` runs only valid input.
 */
export class Form<S extends z.ZodObject> extends Observable {
    private values: z.input<S>;
    /** Fields whose errors are visible: visited by the user, or every field after a failed submit. */
    private readonly touched = new Set<keyof z.input<S>>();
    /** True after a failed submit; the form-level error shows only then. */
    private submitted = false;

    public constructor(
        private readonly schema: S,
        private readonly initial: z.input<S>,
    ) {
        super();
        this.values = { ...initial };
    }

    /** If the field was touched, its visible error is re-checked against the new value. */
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
        this.submitted = false;
        this.notify();
    }

    /** A snapshot for the screen: a copy of the values, the visible errors and whether it can submit. */
    public view(): FormView<z.input<S>> {
        const validation = this.validate();
        const errors: FieldErrors<z.input<S>> = {};
        for (const field of this.touched) {
            const message = validation.fieldErrors[field];
            if (message) {
                errors[field] = message;
            }
        }
        return {
            values: { ...this.values },
            errors,
            formError: this.submitted ? validation.formError : null,
            canSubmit: validation.valid,
        };
    }

    /**
     * Runs `action` with the parsed input when it's valid; otherwise shows every error and skips
     * it. The values stay as they are either way; clear them with `reset()` inside `action`.
     *
     * @throws whatever `action` throws, so the surrounding `run()` reports it.
     */
    public async submit(action: (input: z.output<S>) => Promise<void>): Promise<void> {
        const result = this.schema.safeParse(this.values);
        if (!result.success) {
            this.submitted = true;
            for (const field of Object.keys(this.schema.shape) as Array<keyof z.input<S>>) {
                this.touched.add(field);
            }
            this.notify();
            return;
        }
        await action(result.data);
    }

    private validate(): Validation<z.input<S>> {
        const result = this.schema.safeParse(this.values);
        const validation: Validation<z.input<S>> = { valid: result.success, fieldErrors: {}, formError: null };
        if (result.success) {
            return validation;
        }
        for (const issue of result.error.issues) {
            const field = issue.path[0] as keyof z.input<S> | undefined;
            if (field === undefined) {
                validation.formError ??= issue.message;
            } else if (!validation.fieldErrors[field]) {
                validation.fieldErrors[field] = issue.message;
            }
        }
        return validation;
    }
}
