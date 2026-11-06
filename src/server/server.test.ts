import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { ErrorReporter, register, UserError } from '../index.js';
import { RecordingReporter, resetServices } from '../testing/index.js';
import { handleErrors, loadConfig, validator } from './index.js';

const MoveSchema = z.object({ toStage: z.enum(['APPLIED', 'TECHNICAL']) });

function buildApp() {
    const app = new Hono()
        .post('/applications/:id/transition', validator('json', MoveSchema), (c) => {
            if (c.req.param('id') === 'rejected') {
                throw new UserError("Can't move from REJECTED to TECHNICAL", 409);
            }
            return c.json({ stage: c.req.valid('json').toStage }, 200);
        })
        .get('/crash', () => {
            throw new TypeError("Cannot read properties of undefined (reading 'stage')");
        });
    app.onError(handleErrors());
    return app;
}

function post(app: Hono, path: string, body: unknown) {
    return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('handleErrors', () => {
    let reporter: RecordingReporter;

    beforeEach(() => {
        resetServices();
        reporter = new RecordingReporter();
        register(ErrorReporter, reporter);
    });

    it('answers a UserError with its message and status, without reporting it', async () => {
        const res = await post(buildApp(), '/applications/rejected/transition', { toStage: 'TECHNICAL' });

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ message: "Can't move from REJECTED to TECHNICAL" });
        expect(reporter.reports).toEqual([]);
    });

    it('answers a bug with a generic 500 and reports it with the request', async () => {
        const res = await buildApp().request('/crash');

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ message: 'Something went wrong' });
        expect(reporter.reports[0]?.context).toEqual({ where: 'GET /crash' });
    });
});

describe('validator', () => {
    beforeEach(() => resetServices());

    it('passes valid input to the handler', async () => {
        const res = await post(buildApp(), '/applications/a1/transition', { toStage: 'APPLIED' });

        expect(await res.json()).toEqual({ stage: 'APPLIED' });
    });

    it('answers invalid input with 400 and a readable message, through the same handler', async () => {
        const res = await post(buildApp(), '/applications/a1/transition', { toStage: 'HIRED' });

        expect(res.status).toBe(400);
        expect((await res.json()).message).toMatch(/^toStage: /);
    });
});

describe('loadConfig', () => {
    const ConfigSchema = z.object({
        DATABASE_URL: z.string().url(),
        PORT: z.coerce.number().default(3000),
    });

    it('parses and defaults the environment', () => {
        expect(loadConfig(ConfigSchema, { DATABASE_URL: 'postgres://localhost/app' })).toEqual({
            DATABASE_URL: 'postgres://localhost/app',
            PORT: 3000,
        });
    });

    it('fails at startup naming every problem', () => {
        expect(() => loadConfig(ConfigSchema, { PORT: 'abc' })).toThrow(/Invalid configuration:\n- DATABASE_URL: .+\n- PORT: .+/);
    });
});

describe('handleErrors with Hono exceptions', () => {
    beforeEach(() => {
        resetServices();
        register(ErrorReporter, new RecordingReporter());
    });

    it('answers malformed JSON with 400 and a readable message', async () => {
        const res = await buildApp().request('/applications/a1/transition', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{not json',
        });

        expect(res.status).toBe(400);
        expect((await res.json()).message).not.toBe('');
    });

    it('keeps a custom response from an HTTPException, headers included', async () => {
        const { HTTPException } = await import('hono/http-exception');
        const app = new Hono().get('/private', () => {
            throw new HTTPException(401, { res: new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }) });
        });
        app.onError(handleErrors());

        const res = await app.request('/private');

        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    });

    it('still answers 500 when the reporter itself fails', async () => {
        register(ErrorReporter, { report: () => { throw new Error('sentry down'); } });
        const errors = (await import('vitest')).vi.spyOn(console, 'error').mockImplementation(() => {});

        const res = await buildApp().request('/crash');

        expect(res.status).toBe(500);
        errors.mockRestore();
    });
});
