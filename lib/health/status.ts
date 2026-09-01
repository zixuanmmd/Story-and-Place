export type HealthStatus = {
  status: "ok" | "degraded";
  checks: {
    app: "ok";
    database: "ok" | "degraded";
    media: "ok" | "degraded";
  };
};

export function resolveHealthStatus(
  databaseReachable: boolean,
  mediaReachable: boolean,
): HealthStatus {
  return {
    status: databaseReachable && mediaReachable ? "ok" : "degraded",
    checks: {
      app: "ok",
      database: databaseReachable ? "ok" : "degraded",
      media: mediaReachable ? "ok" : "degraded",
    },
  };
}
