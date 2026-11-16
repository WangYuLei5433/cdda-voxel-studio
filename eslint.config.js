import globals from 'globals';
import tseslint from 'typescript-eslint';

const style = {
  semi: ['error', 'always'],
  quotes: ['error', 'single', { avoidEscape: true }],
};

export default [
  { ignores: ['vendor/**', 'dist/**'] },
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-undef': 'error', ...style },
  },
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['src/**/*.ts', 'tests/**/*.ts'] })),
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], ...style },
  },
];
