import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'src/generated/',
      'playwright-report/',
      'test-results/',
      'coverage/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The engine is framework-agnostic: it must never import Preact (PLAN §2).
    files: ['src/engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['preact', 'preact/*', '@preact/*'],
              message: 'Engine must not import Preact; talk via the store.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
