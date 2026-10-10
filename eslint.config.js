import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.harness/**',
      '.healtest/**',
      'fixtures/**',
      'oracles/**',
      'scripts/**',
      'scripts-dev/**',
      'dashboard/tokens.css',
      'node_modules/**',
    ],
  },
  ...tseslint.configs.recommended,
);
