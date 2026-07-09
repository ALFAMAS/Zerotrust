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
  ignore: [
    "**/*.test.ts",
    "scripts/smoke/**",
    // Known orphans / stubs — tracked for future wiring
    "src/api/schemas/admin.schema.ts",
    "src/api/schemas/mfa.schema.ts",
    "src/api/schemas/session.schema.ts",
    "src/middleware/continuousEval.ts",
    "src/middleware/deviceAttestation.ts",
    "src/models/user.model.ts",
    "src/plugins/index.ts",
    "src/services/auth/apiKeyRotation.service.ts",
    "src/services/auth/sessionCache.service.ts",
    "src/services/compliance/privacy.service.ts",
    "packages/ui/src/components/charts/area-chart-loading.tsx",
    "packages/ui/src/components/charts/motion-utils.ts",
    "packages/ui/src/components/charts/pie-center-shell.tsx",
    "packages/ui/src/components/charts/series-path-utils.ts",
    "packages/ui/src/components/charts/use-animated-series-path.ts",
    "packages/ui/src/components/charts/y-axis-ticks.ts",
    "packages/ui/src/components/ui/separator.tsx",
    "packages/ui/src/components/ui/skeleton.tsx",
    "packages/ui/src/config/authUiRedirects.ts",
    "packages/ui/src/lib/hooks/index.ts",
    "packages/ui/src/lib/offlineQueue.ts",
  ],
  ignoreDependencies: [
    "@radix-ui/react-popover",
    "@radix-ui/react-separator",
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
