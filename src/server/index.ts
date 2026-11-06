import { zValidator } from '@hono/zod-validator';
import type { ErrorHandler, ValidationTargets } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { reportSafely } from '../report-safely.js';
import { UserError } from '../user-error.js';

const GENERIC_MESSAGE = 'Something went wrong';

/**
 * The app's one error handler: `app.onError(handleErrors())`. A UserError becomes `{ message }`
 * with its status; anything else is reported and answered with a generic 500.
 */
export function handleErrors(): ErrorHandler {
    return (error, c) => {
        if (error instanceof UserError) {
            return c.json({ message: error.message }, error.status);
        }
        if (error instanceof HTTPException && error.status < 500) {
            if (error.res) {
                return error.getResponse();
            }
            return c.json({ message: error.message || 'The request could not be processed' }, error.status as ContentfulStatusCode);
        }
        reportSafely(error, { where: `${c.req.method} ${c.req.path}` });
        return c.json({ message: GENERIC_MESSAGE }, 500);
    };
}

/**
 * zValidator that reports invalid input as a UserError, so it reaches the client through the same
 * handler and shape as every other user-facing error.
 */
export function validator<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
    target: Target,
    schema: Schema,
) {
    return zValidator(target, schema, (result) => {
        if (!result.success) {
            throw new UserError(describeIssues(result.error.issues), 400);
        }
    });
}

/**
 * The environment, parsed and defaulted by `schema`. Call it first in boot.ts.
 *
 * @throws Error naming every missing or invalid variable, so a bad deploy stops at startup.
 */
export function loadConfig<Schema extends z.ZodObject>(
    schema: Schema,
    env: Record<string, string | undefined> = process.env,
): z.output<Schema> {
    const result = schema.safeParse(env);
    if (!result.success) {
        const lines = result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
        throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
    }
    return result.data;
}

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
    return issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ');
}
