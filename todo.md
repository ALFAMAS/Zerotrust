# zerotrust — Current TODO

- [ ] Repair the local Bun/Windows `node_modules` junction state so full `bun run type-check`, `bun run lint`, `bun run build`, and `bun run test` can run locally again. Current CWE/fetch hardening verification used `bunx biome check` on touched files and `bun build --packages external` because the local install reports workspace symlink/EACCES issues.
  - Latest blocker: `bun run build` cannot resolve `node_modules/typescript/lib/tsc.js`, local `biome` shim cannot resolve, `bunx vitest run ...` cannot resolve `vitest/config`, and importing modules that depend on `nanoid` can hit `EACCES`; use CI/full reinstall to run the complete suite. CWE-601 verification used Biome-on-touched-files, `bun build --packages external`, and direct safeRedirect smoke checks.
