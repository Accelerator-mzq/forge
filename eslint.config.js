// eslint.config.js — Phase 0 不开 type-aware rules,避免 tsconfig exclude tests 与 ESLint files 冲突
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // 忽略构建产物、依赖、spike 目录(配置文件本身移到末尾专用 block 处理)
    ignores: ['dist/**', 'node_modules/**', 'spike/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // 注意:这里【不写】 project 字段,Phase 0 不开 type-aware rules
        // Phase 1+ 真需要时再加 tsconfig.test.json 让 lint 能跨 src + tests
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // 禁止未使用变量,但允许以 _ 开头的参数名(占位参数常见写法)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // any 类型给出警告而非报错,CLI 工具初期有时难以避免
      '@typescript-eslint/no-explicit-any': 'warn',
      // CLI 工具需要 console 输出,不限制
      'no-console': 'off',
    },
  },
  // src 专用 type-aware block — 追加在文件末尾(在 export default [...] 数组里)
  // 注意:tests/ 不开 type-aware(避免 vitest 全局 globals 报错噪音)
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json'], // src 走 tsconfig.json,有 type info
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // type-aware rules — 只对 src 生效
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  // 配置文件自己进 lint(eslint.config.js / vitest.config.ts / etc),但不开 type-aware
  {
    files: ['*.config.{js,ts,mjs,cjs}', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // 配置文件不进 tsconfig.json,不开 type-aware
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
];
