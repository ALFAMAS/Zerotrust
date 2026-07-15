import type { KnipConfig } from "knip";

/**
 * Dead-code / dependency audit for the monorepo (API + Next.js UI).
 * Run: `bun run knip`. CI calls the same script.
 */
const config: KnipConfig = {
  workspaces: {
    ".": {
      entry: [
        "src/api/server.ts!",
        "src/index.ts!",
        "src/worker.ts!",
        "scripts/**/*.{js,mjs,cjs,ts}!",
        "plugins/*/index.ts!",
        "tests/load/*.k6.js!",
      ],
      project: ["src/**/*.ts", "plugins/**/*.ts", "scripts/**/*.{js,mjs,cjs,ts}"],
    },
    "packages/ui": {
      entry: [
        "src/app/**/{page,layout,loading,error,not-found,route,default}.{tsx,ts}!",
        "public/sw.js!",
      ],
      project: ["src/**/*.{ts,tsx}"],
    },
  },
  ignore: ["**/*.test.ts", "scripts/smoke/**"],
  ignoreDependencies: [
    // Tailwind v4 is CSS-first: consumed via `@import "tailwindcss"` /
    // `@import "tw-animate-css"` in globals.css, which knip cannot see.
    "tailwindcss",
    "tw-animate-css",
    "@radix-ui/react-popover",
    "@stripe/stripe-js",
    "@visx/gradient",
    "@types/bcryptjs",
    "@types/ua-parser-js",
    "esbuild",
    /^@biomejs\/cli-/,
    /^@parcel\/watcher-/,
    /^@swc\/core-/,
    /^@next\/swc-/,
    /^@rollup\/rollup-/,
    "@commitlint/cli",
    "@semantic-release/commit-analyzer",
    "@semantic-release/github",
    "@semantic-release/release-notes-generator",
    "conventional-changelog-conventionalcommits",
  ],
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
  },
  rules: {
    duplicates: "off",
    types: "off",
    enumMembers: "off",
    nsExports: "off",
    nsTypes: "off",
    exports: "off",
    unlisted: "off",
    binaries: "off",
  },
};

export default config;
