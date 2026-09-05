// @ts-check
import tseslint from 'typescript-eslint';

/**
 * ESLINT — ADMIN_SERVER. Bu server allaqachon feature-based va toza
 * (22 modul, har birida `dto/`). Konfiguratsiya MINIMAL: kod sifati
 * (yengil) + bitta chegara qoidasi — `common/` feature'lardan import
 * qilmaydi. Feature'lar orasidagi importlar bu yerda cheklanmaydi:
 * ular kam va aniq (tenants → provisioning kabi orkestratsiya).
 *
 * `server/eslint.config.js` bilan bir xil bo'lishi SHART EMAS — ikki
 * server ikki xil konvensiyada (zod vs class-validator) va bu ataylab.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'prisma/**', 'scripts/**', 'test/**', '*.js', '*.cjs', '*.mjs'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  {
    files: ['src/common/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../!(common)/**', '../../!(common)/**'],
              message: "`common/` feature'lardan import qilmaydi — bu kod bitta feature'ga tegishli bo'lsa o'sha yerga ko'chiring.",
            },
          ],
        },
      ],
    },
  },
);
