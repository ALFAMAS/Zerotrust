export { exchangeToken } from "./exchange.js";
export { requireFederatedIdentity } from "./middleware.js";
export {
  getProvider,
  initFederationFromEnv,
  listProviders,
  registerProvider,
  removeProvider,
} from "./registry.js";
export { default as federationRoutes } from "./routes.js";
export type {
  FederatedClaim,
  FederatedProvider,
  FederationTokenRequest,
  FederationTokenResponse,
} from "./types.js";
