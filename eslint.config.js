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
  {
    // Models use named PALETTE swatches only; kit.ts is the one place colours are defined
    // (PLAN §5.1). Numeric 0x… literals can't be told apart from other hex numbers, so
    // only the string forms are banned.
    files: ['src/models/**'],
    ignores: ['src/models/kit.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'No raw hex colours in models: use a PALETTE swatch name from kit.ts.',
        },
        {
          selector: 'TemplateElement[value.raw=/^#[0-9a-fA-F]{3,8}$/]',
          message: 'No raw hex colours in models: use a PALETTE swatch name from kit.ts.',
        },
      ],
    },
  },
  prettier,
);
