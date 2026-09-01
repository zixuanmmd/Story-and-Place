import type { SafeMonitoringEvent } from "@/lib/monitoring/safe-event";

export type MonitoringEnvelope = SafeMonitoringEvent & {
  source: "story-and-place";
  channel: "client" | "server";
};

export interface ErrorMonitoringProvider {
  capture(event: MonitoringEnvelope): void | Promise<void>;
}

class RuntimeLogMonitoringProvider implements ErrorMonitoringProvider {
  capture(event: MonitoringEnvelope) {
    console.error(JSON.stringify(event));
  }
}

const runtimeLogProvider = new RuntimeLogMonitoringProvider();

export function getErrorMonitoringProvider(): ErrorMonitoringProvider {
  // A future paid or self-hosted provider adapter belongs behind this function.
  // The rest of the app must continue sending only SafeMonitoringEvent fields.
  return runtimeLogProvider;
}
