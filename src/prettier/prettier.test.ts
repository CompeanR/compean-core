import { format } from 'prettier';
import { describe, expect, it } from 'vitest';
import config from './index.js';

describe('prettier config', () => {
    it('formats with 4 spaces, single quotes, semicolons and trailing commas', async () => {
        const source = 'const a = {b: "c", d: [1, 2]}\nfunction f(){return a}';

        const formatted = await format(source, { ...config, parser: 'typescript' });

        expect(formatted).toBe("const a = { b: 'c', d: [1, 2] };\nfunction f() {\n    return a;\n}\n");
    });

    it('keeps lines up to 130 characters on one line', async () => {
        const call = `doSomething(${'argumentNumber, '.repeat(6)}last);`;
        expect(call.length).toBeLessThan(130);

        const formatted = await format(call, { ...config, parser: 'typescript' });

        expect(formatted.trim().split('\n')).toHaveLength(1);
    });
});
