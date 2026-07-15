import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const routeAndComponentRoots = [join(sourceRoot, "app"), join(sourceRoot, "components")];
const applicationRoots = [join(sourceRoot, "app", "admin"), join(sourceRoot, "app", "dashboard")];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) return [];
    return [path];
  });
}

describe("Levels route migration", () => {
  it("keeps page components free of legacy raw palette utilities", () => {
    const rawPalette =
      /(?:bg|text|border|ring|from|via|to)-(?:(?:red|green|emerald|amber|yellow|orange|blue|indigo|violet|purple|zinc|gray)-\d+|white|black)/g;
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(rawPalette) ?? [];
      return matches.map((match) => `${relative(sourceRoot, file)}: ${match}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps page components free of legacy decorative effects", () => {
    const decoration = /(?:bg-grid|backdrop-blur|blur-\[|shadow-2xl)/g;
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(decoration) ?? [];
      return matches.map((match) => `${relative(sourceRoot, file)}: ${match}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("uses the Levels type scale instead of arbitrary font sizes", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(/text-\[[^\]]+\]/g) ?? [];
      return matches.map((match) => `${relative(sourceRoot, file)}: ${match}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps inline SVG presentation colors in the central theme", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(/(?:fill|stroke)="#[0-9a-f]{3,8}"/gi) ?? [];
      return matches.map((match) => `${relative(sourceRoot, file)}: ${match}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("uses the Levels spacing steps for margins, padding, and gaps", () => {
    const spacingUtility =
      /(?:^|[^\w-])((?:-)?(?:p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|space-[xy])-(\[[^\]]+\]|\d+(?:\.\d+)?))/g;
    const allowedSteps = new Set(["0", "1", "2", "3", "4", "6", "8"]);
    const documentedConstraints: Record<string, Set<string>> = {
      "components/app-shell/AppShell.tsx": new Set(["ml-16", "ml-64"]),
      "components/CommandPalette.tsx": new Set(["pt-[15vh]"]),
      "components/ui/password-input.tsx": new Set(["pr-12"]),
    };
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/");
      return [...source.matchAll(spacingUtility)]
        .filter(
          (match) =>
            !allowedSteps.has(match[2]) && !documentedConstraints[sourcePath]?.has(match[1])
        )
        .map((match) => `${sourcePath}: ${match[1]}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("uses Levels radii instead of oversized or arbitrary corners", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(/rounded-(?:2xl|3xl|\[[^\]]+\])/g) ?? [];
      return matches.map((match) => `${relative(sourceRoot, file)}: ${match}`);
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("uses next/image instead of raw image elements", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, "utf8").includes("<img") ? [relative(sourceRoot, file)] : []
    );

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps decorative glow effects out of the Levels interface", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) => {
      const matches = readFileSync(file, "utf8").match(/drop-shadow\(/g) ?? [];
      return matches.map(() => relative(sourceRoot, file));
    });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("has one canonical implementation for badges, skeletons, and empty states", () => {
    const duplicatePrimitives = ["Badge.tsx", "Skeleton.tsx", "EmptyState.tsx"]
      .map((name) => join(sourceRoot, "components", name))
      .filter(existsSync)
      .map((file) => relative(sourceRoot, file));

    expect(duplicatePrimitives, duplicatePrimitives.join("\n")).toEqual([]);
  });

  it("routes application headings through the shared PageHeader", () => {
    const offenders = applicationRoots.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, "utf8").includes("<h1") ? [relative(sourceRoot, file)] : []
    );

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("provides a reduced-motion fallback for pulsing loading states", () => {
    const offenders = routeAndComponentRoots.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("animate-pulse") && !line.includes("motion-reduce:animate-none"))
        .map(() => relative(sourceRoot, file))
    );

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
