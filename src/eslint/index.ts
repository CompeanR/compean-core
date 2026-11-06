import type { ESLint, Linter, Rule } from 'eslint';

type ImportNode = { source?: { value?: unknown } | null };

/** Packages that only run on one platform: React, React Native, Expo and the routers. */
const PLATFORM_IMPORT =
    /^(react|react-dom|react-native|react-router|expo)(\/|$)|^react-native-|^react-router-|^@tanstack\/react-|^expo-|^@expo\/|^@react-navigation\//;
/** What packages/domain may import: its own files and zod. */
const DOMAIN_ALLOWED = /^(\.{1,2}\/|zod(\/|$))/;
/** Tests may import their runner and test libraries, which the platform and purity rules would flag. */
const TEST_FILES = ['**/*.test.{ts,tsx}'];

/** TanStack Router calls whose options object defines a route. */
const ROUTE_FACTORIES = new Set([
    'createFileRoute',
    'createRoute',
    'createRootRoute',
    'createRootRouteWithContext',
    'createLazyFileRoute',
]);

/** Which files may import a library that must stay hidden behind one kind of module. */
const LIBRARY_OWNERS: ReadonlyArray<{ library: RegExp; owner: RegExp; ownerName: string }> = [
    {
        library: /^@tanstack\/(query-core|react-query)(\/|$)/,
        owner: /(\.service|(^|[\\/])boot)\.tsx?$/,
        ownerName: 'a client service (*.service.ts) or boot.ts',
    },
    { library: /^better-auth(\/|$)/, owner: /(^|[\\/])auth\.service\.tsx?$/, ownerName: 'the auth service (auth.service.ts)' },
];

function importSource(node: ImportNode): string | null {
    const value = node.source?.value;
    return typeof value === 'string' ? value : null;
}

function propertyName(key: Rule.Node | { type: string; name?: string; value?: unknown }): unknown {
    if (key.type === 'Identifier') {
        return (key as { name: string }).name;
    }
    if (key.type === 'Literal') {
        return (key as { value: unknown }).value;
    }
    return null;
}

function calleeName(callee: { type: string; name?: string; callee?: unknown }): string | null {
    if (callee.type === 'Identifier') {
        return callee.name ?? null;
    }
    if (callee.type === 'CallExpression') {
        return calleeName(callee.callee as { type: string; name?: string; callee?: unknown });
    }
    return null;
}

/** True for the options object of `createFileRoute('/path')({...})`, `createRoute({...})` and similar. */
function isRouteDefinition(object: Rule.Node | undefined): boolean {
    const call = object?.parent;
    if (object?.type !== 'ObjectExpression' || call?.type !== 'CallExpression') {
        return false;
    }
    const name = calleeName(call.callee as { type: string; name?: string; callee?: unknown });
    return name !== null && ROUTE_FACTORIES.has(name);
}

function onImports(check: (node: Rule.Node, source: string) => void): Rule.RuleListener {
    const visit = (node: Rule.Node) => {
        const source = importSource(node as unknown as ImportNode);
        if (source) {
            check(node, source);
        }
    };
    return { ImportDeclaration: visit, ExportNamedDeclaration: visit, ExportAllDeclaration: visit, ImportExpression: visit };
}

const platformFree: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: { description: 'Shared client code and controllers run on web and mobile, so they import no platform or router.' },
        messages: {
            platform:
                "'{{source}}' is platform code. Controllers and packages/client stay platform-free; use it in a screen or an adapter.",
        },
        schema: [],
    },
    create: (context) =>
        onImports((node, source) => {
            if (PLATFORM_IMPORT.test(source)) {
                context.report({ node, messageId: 'platform', data: { source } });
            }
        }),
};

const domainPure: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: { description: 'packages/domain is shared by client and server, so it imports only itself and Zod.' },
        messages: { impure: "packages/domain may import only its own files and zod, not '{{source}}'." },
        schema: [],
    },
    create: (context) =>
        onImports((node, source) => {
            if (!DOMAIN_ALLOWED.test(source)) {
                context.report({ node, messageId: 'impure', data: { source } });
            }
        }),
};

const noRouteLoaders: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: { description: 'Controllers load data; route files only pick a screen.' },
        messages: { loader: "Routes never use loaders. Load data in the screen's controller through a service." },
        schema: [],
    },
    create: (context) => ({
        Property(node) {
            if (!node.computed && propertyName(node.key) === 'loader' && isRouteDefinition(node.parent)) {
                context.report({ node, messageId: 'loader' });
            }
        },
    }),
};

const libraryOwners: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: { description: 'Libraries hidden behind one kind of module stay there.' },
        messages: { owner: "Only {{ownerName}} may import '{{source}}'." },
        schema: [],
    },
    create: (context) =>
        onImports((node, source) => {
            for (const { library, owner, ownerName } of LIBRARY_OWNERS) {
                if (library.test(source) && !owner.test(context.filename)) {
                    context.report({ node, messageId: 'owner', data: { source, ownerName } });
                }
            }
        }),
};

const plugin: ESLint.Plugin = {
    meta: { name: '@compean/core/eslint' },
    rules: {
        'platform-free': platformFree,
        'domain-pure': domainPure,
        'no-route-loaders': noRouteLoaders,
        'library-owners': libraryOwners,
    },
};

/**
 * The framework rules a tool can check, as an ESLint flat config. Add it after your TypeScript
 * parser setup: `export default [...typescriptConfig, ...compeanRules()]`.
 */
export function compeanRules(): Linter.Config[] {
    return [
        { plugins: { compean: plugin } },
        {
            files: ['packages/client/**/*.{ts,tsx}', '**/*.controller.{ts,tsx}'],
            ignores: TEST_FILES,
            rules: { 'compean/platform-free': 'error' },
        },
        {
            files: ['packages/domain/**/*.{ts,tsx}'],
            ignores: TEST_FILES,
            rules: { 'compean/domain-pure': 'error' },
        },
        {
            files: ['apps/web/routes/**/*.{ts,tsx}'],
            rules: { 'compean/no-route-loaders': 'error' },
        },
        {
            files: ['packages/client/**/*.{ts,tsx}', 'apps/web/**/*.{ts,tsx}', 'apps/mobile/**/*.{ts,tsx}'],
            ignores: TEST_FILES,
            rules: { 'compean/library-owners': 'error' },
        },
    ];
}
