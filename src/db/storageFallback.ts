/**
 * Helpers for treating optional feature tables as unavailable when a deployment
 * has not run the latest migrations yet.
 */
function escapeRegExp(s: string): string {
  // SECURITY (CWE-1333): table/column names are interpolated into a RegExp;
  // escape metacharacters so a name containing regex syntax can't break the
  // pattern or cause exponential backtracking.
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isUnavailableStorageError(
  error: unknown,
  tableNames: string[],
  columnNames: string[] = []
) {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === "42P01" || candidate.code === "42703") return true;

    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (
      tableNames.some((table) =>
        new RegExp(`relation\\s+["']?(?:\\w+\\.)?${escapeRegExp(table)}["']?\\s+does not exist`, "i").test(
          message
        )
      )
    ) {
      return true;
    }
    if (
      columnNames.some((column) =>
        new RegExp(`column\\s+["']?${escapeRegExp(column)}["']?\\s+does not exist`, "i").test(message)
      )
    ) {
      return true;
    }

    current = candidate.cause;
  }
  return false;
}
