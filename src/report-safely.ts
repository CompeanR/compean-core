import { $S } from './registry.js';
import { ConsoleReporter, ErrorReporter, type ReportContext } from './reporting.js';

/** Reports through the registered reporter, falling back to the console if that reporter fails. */
export function reportSafely(error: unknown, context: ReportContext): void {
    try {
        $S(ErrorReporter).report(error, context);
    } catch (reporterFailure) {
        const console = new ConsoleReporter();
        console.report(error, context);
        console.report(reporterFailure, { where: 'ErrorReporter' });
    }
}
