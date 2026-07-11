import { z } from "zod";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 200;

/** Query-string pagination params shared by API list endpoints and UI list hooks. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Normalize raw query params into bounded page/limit/offset (mirrors API `parsePaginatedQuery`). */
export function parsePaginationQuery(
  raw: Record<string, string | string[] | undefined>,
  opts?: { defaultLimit?: number; maxLimit?: number }
): { page: number; limit: number; offset: number } {
  const maxLimit = opts?.maxLimit ?? MAX_LIMIT;
  const defaultLimit = opts?.defaultLimit ?? DEFAULT_LIMIT;

  const parsed = paginationQuerySchema.safeParse({
    page: typeof raw.page === "string" ? raw.page : undefined,
    limit: typeof raw.limit === "string" ? raw.limit : undefined,
  });

  let page = parsed.success ? parsed.data.page : DEFAULT_PAGE;
  let limit = parsed.success ? parsed.data.limit : defaultLimit;

  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
}
