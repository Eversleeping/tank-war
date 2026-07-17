import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 默认 node 环境跑纯逻辑；需要 DOM 的测试文件用 // @vitest-environment jsdom 顶部注释切换
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
    },
  },
});
