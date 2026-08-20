const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/**
 * ESLint flat config.
 *
 * ESLint 10 dropped `.eslintrc.*` support entirely, so this file replaces the
 * previous `.eslintrc.json` (which ESLint 10 silently ignored — `npm run lint`
 * exited 2 with "couldn't find an eslint.config.js" before this was added).
 * The rule set is carried over unchanged; only the config format differs.
 *
 * Warning budget
 * --------------
 * `npm run lint` runs with `--max-warnings=23`, which is the count at the time
 * this config landed. Errors are always zero. The budget is a ratchet: new
 * warnings fail CI, and the number should only ever be revised downward as the
 * remaining `no-explicit-any` sites in src/routes/** grow real types.
 */
module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'public/**', 'client/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      // TypeScript sources use ESM import/export syntax even though tsc emits
      // commonjs (see tsconfig.json `module`).
      sourceType: 'module',
      // No `parserOptions.project`: the rule set below is syntax-only
      // (`recommended`, not `recommended-type-checked`), so type information is
      // not needed. Skipping it keeps lint fast and avoids having to enumerate
      // test files in a second tsconfig.
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      // `no-undef` cannot see TypeScript's type-only declarations, so it
      // reports built-in type namespaces such as `NodeJS.ProcessEnv` as
      // undefined globals. tsc already rejects genuinely undefined
      // identifiers, which is why typescript-eslint recommends disabling this
      // rule on TypeScript sources.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prettier/prettier': 'error',
    },
  },
  {
    // The suites import `describe`/`it`/`expect` explicitly from 'vitest' rather
    // than relying on the injected globals, so no extra globals are declared
    // here — declaring them would trip `no-redeclare` on every test file.
    files: ['tests/**/*.ts'],
    rules: {
      // Tests legitimately log progress and assert on loosely typed fixtures.
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // CLI entry points: stdout *is* the user interface here, so `console` is the
    // correct channel rather than the pino logger used by the HTTP service.
    files: ['src/db/migrate.ts', 'src/db/seed.ts', 'src/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
