import { Registry, register } from "prom-client";

export const metricsRegistry = new Registry();
export { register };
