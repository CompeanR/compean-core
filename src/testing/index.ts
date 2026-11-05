import { ErrorReporter, type ReportContext } from '../reporting.js';

export { resetServices } from '../registry.js';

/** An ErrorReporter that keeps every report, for assertions. */
export class RecordingReporter implements ErrorReporter {
    public readonly reports: Array<{ error: unknown; context: ReportContext }> = [];

    public report(error: unknown, context: ReportContext): void {
        this.reports.push({ error, context });
    }
}

export type Recorded<T> = T & { readonly calls: Array<[string, ...unknown[]]> };

/** A navigation object for controller tests: every method exists and records its calls. */
export function recordingNavigation<T extends object>(): Recorded<T> {
    const calls: Array<[string, ...unknown[]]> = [];
    return new Proxy({ calls } as Recorded<T>, {
        get(target, property) {
            if (property === 'calls') return calls;
            if (typeof property !== 'string') return Reflect.get(target, property);
            return (...args: unknown[]) => {
                calls.push([property, ...args]);
            };
        },
    });
}
