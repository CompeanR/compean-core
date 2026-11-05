export interface ReportContext {
    /** Where it happened: a controller name, or "METHOD /path" on the server. */
    where: string;
    userId?: string;
}

/**
 * Where bugs go. Register one per app in boot.ts: the console locally and in tests, a vendor
 * adapter such as Sentry in production. Only `run()` and the server's error handler call it,
 * and they survive a reporter that throws.
 */
export abstract class ErrorReporter {
    public abstract report(error: unknown, context: ReportContext): void;
}

export class ConsoleReporter implements ErrorReporter {
    public report(error: unknown, context: ReportContext): void {
        try {
            console.error(`[${context.where}]`, error);
        } catch {
            // Reporting must never break the code that reports.
        }
    }
}
