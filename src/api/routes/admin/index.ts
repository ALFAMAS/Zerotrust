import { Hono } from "hono";
import { authMiddleware, requireAdmin } from "../../../middleware/auth";
import type { HonoEnv } from "../../../shared/types";
import auditRoutes from "./audit.routes";
import feedbackRoutes from "./feedback.routes";
import jitRoutes from "./jit.routes";
import rolesRoutes from "./roles.routes";
import segmentsRoutes from "./segments.routes";
import sessionsRoutes from "./sessions.routes";
import settingsRoutes from "./settings.routes";
import statsRoutes from "./stats.routes";
import uploadsRoutes from "./uploads.routes";
import usersRoutes from "./users.routes";

const router = new Hono<HonoEnv>();
router.use("*", authMiddleware);
router.use("*", requireAdmin);
router.route("/", settingsRoutes);
router.route("/", usersRoutes);
router.route("/", sessionsRoutes);
router.route("/", statsRoutes);
router.route("/", rolesRoutes);
router.route("/", jitRoutes);
router.route("/", auditRoutes);
router.route("/", feedbackRoutes);
router.route("/", segmentsRoutes);
router.route("/", uploadsRoutes);

export default router;
