import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Only this tree's tests. Without the explicit include, a git worktree checked out under
  // .claude/worktrees is globbed too and every test is counted twice.
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
