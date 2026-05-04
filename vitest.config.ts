import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 用真实 fs / 子进程时大多不能并行(spike 阶段不重要,Phase 1 起会大量用到)
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Windows 上 stdin 默认 GBK,确保 stdout 测试不被编码问题污染
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});
