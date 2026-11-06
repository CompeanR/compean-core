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
        expect(
            await ruleIds(`import { useRouter } from 'expo-router';`, 'packages/client/features/notes/notes.service.ts'),
        ).toEqual(['compean/platform-free']);
        expect(await ruleIds(`import { Link } from '@tanstack/react-router';`, 'apps/web/screens/notes.controller.ts')).toEqual([
            'compean/platform-free',
        ]);
        expect(await ruleIds(`import { useState } from 'react';`, 'apps/web/screens/notes.tsx')).toEqual([]);
    });

    it('keeps the domain package pure', async () => {
        expect(
            await ruleIds(`import { z } from 'zod';\nimport { isKept } from './verse.model';`, 'packages/domain/path.model.ts'),
        ).toEqual([]);
        expect(await ruleIds(`import { sql } from 'postgres';`, 'packages/domain/path.model.ts')).toEqual([
            'compean/domain-pure',
        ]);
        expect(await ruleIds(`import { NotesController } from '@roundkick/client';`, 'packages/domain/path.model.ts')).toEqual([
            'compean/domain-pure',
        ]);
    });

    it('rejects loaders in web route files', async () => {
        const route = `export const Route = createFileRoute('/notes')({ loader: () => fetchNotes(), component: NotesScreen });`;

        expect(await ruleIds(route, 'apps/web/routes/notes.tsx')).toEqual(['compean/no-route-loaders']);
        expect(
            await ruleIds(
                `export const Route = createFileRoute('/notes')({ component: NotesScreen });`,
                'apps/web/routes/notes.tsx',
            ),
        ).toEqual([]);
    });

    it('lets only client services use the query cache', async () => {
        expect(
            await ruleIds(
                `import { QueryClient } from '@tanstack/query-core';`,
                'packages/client/features/notes/notes.service.ts',
            ),
        ).toEqual([]);
        expect(
            await ruleIds(
                `import { QueryClient } from '@tanstack/query-core';`,
                'packages/client/features/notes/notes.controller.ts',
            ),
        ).toEqual(['compean/library-owners']);
    });

    it('lets only the client auth service import Better Auth, while the API may mount it', async () => {
        expect(
            await ruleIds(
                `import { createAuthClient } from 'better-auth/client';`,
                'packages/client/features/auth/auth.service.ts',
            ),
        ).toEqual([]);
        expect(await ruleIds(`import { createAuthClient } from 'better-auth/client';`, 'apps/web/screens/sign-in.tsx')).toEqual([
            'compean/library-owners',
        ]);
        expect(await ruleIds(`import { betterAuth } from 'better-auth';`, 'apps/api/auth.ts')).toEqual([]);
    });
});

describe('compeanRules, review fixes', () => {
    it('flags loader only inside a route definition', async () => {
        expect(await ruleIds(`const { loader } = props;\nconst config = { loader: true };`, 'apps/web/routes/notes.tsx')).toEqual(
            [],
        );
        expect(
            await ruleIds(
                `export const Route = createRoute({ getParentRoute: () => root, path: '/notes', loader: () => load() });`,
                'apps/web/routes/notes.tsx',
            ),
        ).toEqual(['compean/no-route-loaders']);
    });

    it('does not treat oauth.service.ts as the auth service', async () => {
        expect(
            await ruleIds(
                `import { createAuthClient } from 'better-auth/client';`,
                'packages/client/features/auth/oauth.service.ts',
            ),
        ).toEqual(['compean/library-owners']);
    });

    it('treats Expo, React Router and React Navigation as platform code', async () => {
        for (const source of ['expo', '@expo/vector-icons', 'react-router', '@react-navigation/native']) {
            expect(await ruleIds(`import x from '${source}';`, 'packages/client/features/notes/notes.controller.ts')).toEqual([
                'compean/platform-free',
            ]);
        }
    });
});

describe('compeanRules, test files and boot', () => {
    it('lets test files import their runner and test libraries', async () => {
        expect(await ruleIds(`import { describe } from 'vitest';`, 'packages/domain/note.model.test.ts')).toEqual([]);
        expect(
            await ruleIds(
                `import { render } from '@testing-library/react';`,
                'packages/client/features/notes/notes.controller.test.ts',
            ),
        ).toEqual([]);
    });

    it('lets boot.ts build the query cache', async () => {
        expect(await ruleIds(`import { QueryClient } from '@tanstack/query-core';`, 'apps/web/src/boot.ts')).toEqual([]);
    });
});
