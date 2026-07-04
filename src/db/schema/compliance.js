"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskAssessmentsTable = exports.soc2ControlsTable = void 0;
/** DI-1 — compliance domain tables. */
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.soc2ControlsTable = (0, pg_core_1.pgTable)("soc2_controls", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    controlId: (0, pg_core_1.text)("control_id").notNull().unique(), // "CC6.1" | "A1.2" | ...
    category: (0, pg_core_1.text)("category").notNull(), // "CC6" | "A1" | "C1" | "P"
    title: (0, pg_core_1.text)("title").notNull(),
    description: (0, pg_core_1.text)("description"),
    implementation: (0, pg_core_1.text)("implementation").notNull(), // what we do
    evidence: (0, pg_core_1.text)("evidence"), // where proof lives
    status: (0, pg_core_1.text)("status").notNull().default("implemented"), // "implemented" | "partial" | "planned"
    lastReviewedAt: (0, pg_core_1.timestamp)("last_reviewed_at", { withTimezone: true }),
    reviewedBy: (0, pg_core_1.text)("reviewed_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
});
exports.riskAssessmentsTable = (0, pg_core_1.pgTable)("risk_assessments", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    year: (0, pg_core_1.integer)("year").notNull(), // assessment year
    riskId: (0, pg_core_1.text)("risk_id").notNull(), // "R-001" | "R-002" | ...
    category: (0, pg_core_1.text)("category").notNull(), // "security" | "availability" | "compliance" | "financial"
    title: (0, pg_core_1.text)("title").notNull(),
    description: (0, pg_core_1.text)("description"),
    likelihood: (0, pg_core_1.integer)("likelihood").notNull(), // 1-5
    impact: (0, pg_core_1.integer)("impact").notNull(), // 1-5
    riskScore: (0, pg_core_1.integer)("risk_score").notNull(), // likelihood * impact
    treatment: (0, pg_core_1.text)("treatment").notNull(), // "mitigate" | "accept" | "transfer" | "avoid"
    mitigation: (0, pg_core_1.text)("mitigation"),
    owner: (0, pg_core_1.text)("owner"),
    status: (0, pg_core_1.text)("status").notNull().default("open"), // "open" | "mitigated" | "closed"
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true }).notNull().default((0, drizzle_orm_1.sql) `now()`),
}, (t) => ({
    riskAssessmentsYearIdx: (0, pg_core_1.index)("risk_assessments_year_idx").on(t.year),
    riskAssessmentsRiskIdUnq: (0, pg_core_1.unique)().on(t.year, t.riskId),
}));
//# sourceMappingURL=compliance.js.map