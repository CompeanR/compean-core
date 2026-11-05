import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { compeanRules } from './index.js';

// An app's own config always matches its TypeScript files; this entry stands in for it.
const appBase = { files: ['**/*.{ts,tsx}'] };
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [appBase, ...compeanRules()], cwd: '/repo' });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
    const [result] = await eslint.lintText(code, { filePath: `/repo/${filePath}` });
    return (result?.messages ?? []).map((message) => message.ruleId ?? message.message);
}

describe('compeanRules', () => {
    it('keeps controllers and shared client code free of React, React Native and routers', async () => {
        expect(await ruleIds(`import { useState } from 'react';`, 'packages/client/features/notes/notes.controller.ts')).toEqual([
            'compean/platform-free',
        ]);
        expect(await ruleIds(`import { useRouter } from 'expo-router';`, 'packages/client/features/notes/notes.service.ts')).toEqual([
            'compean/platform-free',
        ]);
        expect(await ruleIds(`import { Link } from '@tanstack/react-router';`, 'apps/web/screens/notes.controller.ts')).toEqual([
            'compean/platform-free',
        ]);
        expect(await ruleIds(`import { useState } from 'react';`, 'apps/web/screens/notes.tsx')).toEqual([]);
    });

    it('keeps the domain package pure', async () => {
        expect(await ruleIds(`import { z } from 'zod';\nimport { isKept } from './verse.model';`, 'packages/domain/path.model.ts')).toEqual([]);
        expect(await ruleIds(`import { sql } from 'postgres';`, 'packages/domain/path.model.ts')).toEqual(['compean/domain-pure']);
        expect(await ruleIds(`import { NotesController } from '@roundkick/client';`, 'packages/domain/path.model.ts')).toEqual([
            'compean/domain-pure',
        ]);
    });

    it('rejects loaders in web route files', async () => {
        const route = `export const Route = createFileRoute('/notes')({ loader: () => fetchNotes(), component: NotesScreen });`;

        expect(await ruleIds(route, 'apps/web/routes/notes.tsx')).toEqual(['compean/no-route-loaders']);
        expect(await ruleIds(`export const Route = createFileRoute('/notes')({ component: NotesScreen });`, 'apps/web/routes/notes.tsx')).toEqual([]);
    });

    it('lets only client services use the query cache', async () => {
        expect(await ruleIds(`import { QueryClient } from '@tanstack/query-core';`, 'packages/client/features/notes/notes.service.ts')).toEqual([]);
        expect(await ruleIds(`import { QueryClient } from '@tanstack/query-core';`, 'packages/client/features/notes/notes.controller.ts')).toEqual([
            'compean/library-owners',
        ]);
    });

    it('lets only the client auth service import Better Auth, while the API may mount it', async () => {
        expect(await ruleIds(`import { createAuthClient } from 'better-auth/client';`, 'packages/client/features/auth/auth.service.ts')).toEqual([]);
        expect(await ruleIds(`import { createAuthClient } from 'better-auth/client';`, 'apps/web/screens/sign-in.tsx')).toEqual([
            'compean/library-owners',
        ]);
        expect(await ruleIds(`import { betterAuth } from 'better-auth';`, 'apps/api/auth.ts')).toEqual([]);
    });
});
