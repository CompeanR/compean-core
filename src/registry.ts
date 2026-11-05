import { ConsoleReporter, ErrorReporter } from './reporting.js';
import { ToastService } from './toast.service.js';

type Token<T> = abstract new (...args: never[]) => T;

const services = new Map<Token<unknown>, unknown>();

const defaults = new Map<Token<unknown>, () => unknown>([
    [ToastService, () => new ToastService()],
    [ErrorReporter, () => new ConsoleReporter()],
]);

/** Makes `instance` the one `$S(token)` returns. Called from boot.ts and from tests. */
export function register<T>(token: Token<T>, instance: T): void {
    services.set(token, instance);
}

/** The registered service for this class. Throws for a service nobody registered: that is a wiring bug. */
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
