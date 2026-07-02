export interface BackgroundJobTopologyEnv {
  NODE_ENV?: string;
  WORKER_MODE?: string;
}

export interface BackgroundJobTopology {
  startInApiProcess: boolean;
  workerMode: boolean;
  production: boolean;
}

export interface WarnLogger {
  warn(message: string): void;
}

export const PRODUCTION_API_SCHEDULER_WARNING =
  "Production API process is starting background schedulers because WORKER_MODE is not true; run API replicas with WORKER_MODE=true and exactly one dedicated worker via bun run src/worker.ts";

export function resolveBackgroundJobTopology(env: BackgroundJobTopologyEnv): BackgroundJobTopology {
  const workerMode = env.WORKER_MODE === "true";
  return {
    startInApiProcess: !workerMode,
    workerMode,
    production: env.NODE_ENV === "production",
  };
}

export function warnIfApiRunsSchedulersInProduction(
  logger: WarnLogger,
  topology: BackgroundJobTopology
): void {
  if (topology.production && topology.startInApiProcess) {
    logger.warn(PRODUCTION_API_SCHEDULER_WARNING);
  }
}
