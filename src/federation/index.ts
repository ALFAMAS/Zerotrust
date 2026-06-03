export {
  registerProvider,
  getProvider,
  listProviders,
  removeProvider,
  initFederationFromEnv,
} from "./registry.js";
export { exchangeToken } from "./exchange.js";
export { requireFederatedIdentity } from "./middleware.js";
export type {
  FederatedProvider,
  FederationTokenRequest,
  FederationTokenResponse,
  FederatedClaim,
} from "./types.js";
export { default as federationRoutes } from "./routes.js";
