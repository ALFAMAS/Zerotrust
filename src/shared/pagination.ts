/**
 * Shared pagination helpers.
 *
 * Usage:
 *   const { page, limit, offset } = parsePaginatedQuery(c.req.query());
 *   const [rows, countResult] = await Promise.all([
 *     db.select().from(table).where(...).orderBy(...).offset(offset).limit(limit),
 *     db.select({ count: sql<number>`count(*)::int` }).from(table).where(...),
 *   ]);
 *   return c.json(paginated(rows, { page, limit, total: countResult[0]?.count ?? 0 }));
 */

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginatedMeta;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

/**
 * Parse page/limit from a query source.
 *
 * Accepts either:
 *   - c.req (Hono Context or Hono Request) — extracts query params via .req.query() or .query()
 *   - A plain object: { page: "1", limit: "20" }
 *   - A no-arg function returning query params (e.g. c.req.query.bind(c.req))
 *
 * Enforces sane bounds: page >= 1, 1 <= limit <= MAX_LIMIT.
 */
export function parsePaginatedQuery(
  query:
    | Record<string, string | string[] | undefined>
    | { query: (key?: string) => string | Record<string, string> }
    | (() => Record<string, string>),
  opts?: { defaultLimit?: number; maxLimit?: number }
): PaginationParams {
  let raw: Record<string, string | string[] | undefined>;
  if (typeof query === "function") {
    try {
      raw = query();
    } catch {
      raw = {};
    }
  } else if (
    query &&
    typeof query === "object" &&
    "query" in query &&
    typeof query.query === "function"
  ) {
    // Hono Context or Request — call .query() to get all params
    raw = query.query() as Record<string, string>;
  } else {
    raw = query as Record<string, string | string[] | undefined>;
  }

  const maxLimit = opts?.maxLimit ?? MAX_LIMIT;
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_LIMIT;

  let page = parseInt(typeof raw.page === "string" ? raw.page : String(DEFAULT_PAGE), 10);
  let limit = parseInt(typeof raw.limit === "string" ? raw.limit : String(defaultLimit), 10);

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Build a standardized paginated response envelope.
 *
 * @param data  The rows for this page
 * @param meta  { page, limit, total }
 */
export function paginated<T>(
  data: T[],
  meta: { page: number; limit: number; total: number }
): PaginatedResponse<T> {
  const total = Math.max(0, meta.total);
  const totalPages = Math.ceil(total / meta.limit);
  return {
    data,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total,
      totalPages,
      hasNext: meta.page < totalPages,
      hasPrev: meta.page > 1,
    },
  };
}
