import type { ZerotrustPlugin } from "../../src/plugins/types.js";
import { manifest } from "./manifest.js";
import routes from "./routes.js";

const plugin: ZerotrustPlugin = {
  manifest,
  register(ctx) {
    ctx.app.route("/auth/mfa", routes);
  },
};

export default plugin;
