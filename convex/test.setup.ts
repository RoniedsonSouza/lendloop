/// <reference types="vite/client" />
// Function modules for convex-test (files with more than one dot, like tests, are excluded).
export const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
