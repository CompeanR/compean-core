import { ConsoleReporter, ErrorReporter } from './reporting.js';
import { ToastService } from './toast.service.js';

type Token<T> = abstract new (...args: never[]) => T;

const services = new Map<Token<unknown>, unknown>();

/**
 * Framework services that work without wiring, so tests and local runs need no boot code. A
 * default must be what production wants; apps replace the reporter with a vendor one.
 */
const defaults = new Map<Token<unknown>, () => unknown>([
    [ToastService, () => new ToastService()],
    [ErrorReporter, () => new ConsoleReporter()],
]);

/** What callers of `$S(token)` can use: the class's public members, so a test fake needs only those. */
type PublicShape<T> = { [K in keyof T]: T[K] };

/**
 * Makes `instance` the one `$S(token)` returns. Called from boot.ts and from tests. The type comes
 * from the class alone; `instance` must offer its public members, so a fake with extra fields fits.
 */
export function register<T>(token: Token<T>, instance: NoInfer<PublicShape<T>>): void {
    services.set(token, instance);
}

/**
 * The service registered for this class, or a framework default (ToastService, ErrorReporter).
 *
 * @throws Error when nothing was registered for it: a wiring bug, fixed in boot.ts.
 */
export function $S<T>(token: Token<T>): T {
    if (!services.has(token)) {
        const create = defaults.get(token);
        if (!create) {
            throw new Error(`${token.name} is not registered. Register it in boot.ts.`);
        }
        services.set(token, create());
    }
    return services.get(token) as T;
}

/** Forgets every registered service. Tests call it before each test. */
export function resetServices(): void {
    services.clear();
}
