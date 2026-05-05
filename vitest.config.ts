import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 用真实 fs / 子进程时大多不能并行(spike 阶段不重要,Phase 1 起会大量用到)
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // C1 修复:globalSetup 只跑一次 build,避免 6 个 fork 并行写同一 dist/ 的 file-lock 竞争
    globalSetup: ['./vitest.global-setup.ts'],
    // Windows 上 stdin 默认 GBK,确保 stdout 测试不被编码问题污染
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
  },
});
