import type { Config } from 'prettier';

/**
 * The formatting every Compean project shares. Point to it from package.json with
 * `"prettier": "@compean/core/prettier"` instead of copying it.
 */
const config: Config = {
    printWidth: 130,
    tabWidth: 4,
    useTabs: false,
    singleQuote: true,
    jsxSingleQuote: true,
    semi: true,
    trailingComma: 'all',
    bracketSpacing: true,
};

export default config;
