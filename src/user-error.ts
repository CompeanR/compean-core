export type UserErrorStatus = 400 | 401 | 403 | 404 | 409;

/**
 * An error the user can fix or should be told about. Its message is shown to them word for word,
 * so write it where the cause is known. Anything that isn't a UserError is treated as a bug.
 */
export class UserError extends Error {
    public constructor(
        message: string,
        public readonly status: UserErrorStatus = 400,
    ) {
        super(message);
        this.name = 'UserError';
    }
}
