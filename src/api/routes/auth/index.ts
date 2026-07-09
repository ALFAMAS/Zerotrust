import { Hono } from "hono";
import type { HonoEnv } from "../../../shared/types";
import avatarRoutes from "./avatar.routes";
import loginRoutes from "./login.routes";
import profileRoutes from "./profile.routes";
import registerRoutes from "./register.routes";
import tokenRoutes from "./token.routes";

const router = new Hono<HonoEnv>();
router.route("/", registerRoutes);
router.route("/", loginRoutes);
router.route("/", tokenRoutes);
router.route("/", profileRoutes);
router.route("/", avatarRoutes);

export default router;
