/**
 * A/B experimentation framework.
 *
 * Deterministic, sticky variant assignment layered on the same FNV-1a bucketing
 * the feature-flag engine uses for percentage rollout — a user always lands in
 * the same variant for a given experiment, with no storage needed. Exposure and
 * conversion counts are tracked per variant so you can read a conversion rate.
 *
 * The tracker is in-memory (per process), matching the webhook-delivery-log
 * approach; durable persistence can be layered later without changing the
 * assignment contract.
 */
import { getLogger } from "../logger";

const logger = getLogger("experiments");

export interface Variant {
  name: string;
  /** Relative weight; need not sum to 100 (normalized internally). */
  weight: number;
}

/** Stable 0–9999 bucket (4-digit precision) for an experiment+subject. */
function bucket(experimentKey: string, subjectId: string): number {
  let hash = 0x811c9dc5;
  const input = `exp:${experimentKey}:${subjectId}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 10000;
}

/**
 * Assign `subjectId` to a variant deterministically by weight. Returns the
 * variant name, or null if the variant list is empty/invalid.
 */
export function assignVariant(
  experimentKey: string,
  subjectId: string,
  variants: Variant[]
): string | null {
  const valid = variants.filter((v) => v.name && v.weight > 0);
  if (valid.length === 0) return null;

  const total = valid.reduce((s, v) => s + v.weight, 0);
  const point = (bucket(experimentKey, subjectId) / 10000) * total;

  let cumulative = 0;
  for (const v of valid) {
    cumulative += v.weight;
    if (point < cumulative) return v.name;
  }
  return valid[valid.length - 1].name; // float edge → last bucket
}

// ── Exposure / conversion tracking (in-memory) ───────────────────────────────

// ── Exposure / conversion tracking (durable) ──────────────────────────────────

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { experimentResultsTable } from "../db/schema";

interface VariantStats {
  exposures: number;
  conversions: number;
}
const stats = new Map<string, Map<string, VariantStats>>();

function statsFor(experimentKey: string, variant: string): VariantStats {
  let byVariant = stats.get(experimentKey);
  if (!byVariant) {
    byVariant = new Map();
    stats.set(experimentKey, byVariant);
  }
  let s = byVariant.get(variant);
  if (!s) {
    s = { exposures: 0, conversions: 0 };
    byVariant.set(variant, s);
  }
  return s;
}

/** Record that a subject saw variant of experimentKey. */
export function recordExposure(experimentKey: string, variant: string): void {
  statsFor(experimentKey, variant).exposures += 1;
  void persistExposure(experimentKey, variant);
}

async function persistExposure(experimentKey: string, variant: string): Promise<void> {
  try {
    const db = getDb();
    await db.insert(experimentResultsTable).values({
      experimentKey, variant, subjectId: "_aggregate_", converted: false,
    }).onConflictDoNothing();
  } catch { /* non-fatal */ }
}

/** Record a conversion for variant of experimentKey. */
export function recordConversion(experimentKey: string, variant: string): void {
  statsFor(experimentKey, variant).conversions += 1;
  void persistConversion(experimentKey, variant);
}

async function persistConversion(experimentKey: string, variant: string): Promise<void> {
  try {
    const db = getDb();
    await db.update(experimentResultsTable)
      .set({ converted: true })
      .where(and(
        eq(experimentResultsTable.experimentKey, experimentKey),
        eq(experimentResultsTable.variant, variant),
        eq(experimentResultsTable.subjectId, "_aggregate_")
      ));
  } catch { /* non-fatal */ }
}

export interface VariantResult {
  variant: string;
  exposures: number;
  conversions: number;
  conversionRate: number; // 0–1
}

/** Per-variant results (conversion rate) for an experiment. */
export function getExperimentResults(experimentKey: string): VariantResult[] {
  const byVariant = stats.get(experimentKey);
  if (!byVariant) return [];
  return [...byVariant.entries()].map(([variant, s]) => ({
    variant,
    exposures: s.exposures,
    conversions: s.conversions,
    conversionRate: s.exposures > 0 ? s.conversions / s.exposures : 0,
  }));
}

/** Assign + record an exposure in one call (the common path). */
export function exposeToExperiment(
  experimentKey: string,
  subjectId: string,
  variants: Variant[]
): string | null {
  const variant = assignVariant(experimentKey, subjectId, variants);
  if (variant) recordExposure(experimentKey, variant);
  return variant;
}

/** Test/maintenance helper. */
export function _resetExperiments(): void {
  stats.clear();
  logger.debug("experiment stats reset");
}
