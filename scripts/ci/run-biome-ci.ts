export function containsBiomeInternalError(output: string): boolean {
  return (
    output.includes("internalError/panic") ||
    output.includes("Biome encountered an unexpected error")
  );
}

export async function runBiomeCi(): Promise<number> {
  const child = Bun.spawn([process.execPath, "x", "biome", "ci"], {
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  process.stdout.write(stdout);
  process.stderr.write(stderr);

  if (exitCode !== 0) return exitCode;
  if (containsBiomeInternalError(`${stdout}\n${stderr}`)) {
    process.stderr.write("Biome emitted an internal error while exiting zero; failing closed.\n");
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await runBiomeCi());
}
