import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Layering rules from CLAUDE.md §4: dependencies point inward (app → services → domain).
const forbidOutward = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/generated/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'react/no-danger': 'error',
    },
  },
  {
    files: ['src/domain/**'],
    rules: forbidOutward(
      [
        '@/services/*',
        '@/adapters/*',
        '@/app/*',
        '@/lib/*',
        'next',
        'next/*',
        '@prisma/*',
        '@/generated/*',
      ],
      'domain/ is pure business rules: no I/O, framework or outer-layer imports.',
    ),
  },
  {
    files: ['src/services/**'],
    rules: forbidOutward(
      ['@/app/*', 'next', 'next/*', '@/adapters/container', '@/generated/*'],
      'services/ receive adapters as dependencies; they never import the app layer, Next.js or the container.',
    ),
  },
  {
    files: ['src/app/**', 'src/components/**'],
    rules: forbidOutward(
      ['@/adapters/db/*', '@/generated/*', '@prisma/*'],
      'Pages and components call services; database access goes through repositories.',
    ),
  },
  {
    // The seed is a CLI that prints demo logins for the developer.
    files: ['prisma/seed/**'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
