import { UserError, type UserErrorStatus } from './user-error.js';

/** The part of a fetch or hc response that `readJson` needs. */
export interface JsonResponse<T> {
    ok: boolean;
    status: number;
    json(): Promise<T>;
}

const KNOWN_STATUSES: ReadonlySet<number> = new Set<UserErrorStatus>([400, 401, 403, 404, 409]);

/**
 * The body of a successful response. A 4xx with `{ message }` becomes a UserError, so `run()`
 * shows its words; any other failure becomes a plain Error, which `run()` treats as a bug.
 */
export async function readJson<T>(request: Promise<JsonResponse<T>> | JsonResponse<T>): Promise<T> {
    const response = await request;
    if (response.ok) {
        return response.status === 204 ? (undefined as T) : response.json();
    }
    if (response.status >= 400 && response.status < 500) {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        if (typeof body?.message === 'string') {
            const status = KNOWN_STATUSES.has(response.status) ? (response.status as UserErrorStatus) : 400;
            throw new UserError(body.message, status);
        }
    }
    throw new Error(`Request failed with status ${response.status}`);
}
