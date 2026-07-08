/** DI-1 — compliance domain tables. */
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const soc2ControlsTable = pgTable("soc2_controls", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  controlId: text("control_id").notNull().unique(), // "CC6.1" | "A1.2" | ...
  category: text("category").notNull(), // "CC6" | "A1" | "C1" | "P"
  title: text("title").notNull(),
  description: text("description"),
  implementation: text("implementation").notNull(), // what we do
  evidence: text("evidence"), // where proof lives
  status: text("status").notNull().default("implemented"), // "implemented" | "partial" | "planned"
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const riskAssessmentsTable = pgTable(
  "risk_assessments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    year: integer("year").notNull(), // assessment year
    riskId: text("risk_id").notNull(), // "R-001" | "R-002" | ...
    category: text("category").notNull(), // "security" | "availability" | "compliance" | "financial"
    title: text("title").notNull(),
    description: text("description"),
    likelihood: integer("likelihood").notNull(), // 1-5
    impact: integer("impact").notNull(), // 1-5
    riskScore: integer("risk_score").notNull(), // likelihood * impact
    treatment: text("treatment").notNull(), // "mitigate" | "accept" | "transfer" | "avoid"
    mitigation: text("mitigation"),
    owner: text("owner"),
    status: text("status").notNull().default("open"), // "open" | "mitigated" | "closed"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    riskAssessmentsYearIdx: index("risk_assessments_year_idx").on(t.year),
    riskAssessmentsRiskIdUnq: unique().on(t.year, t.riskId),
  })
);
