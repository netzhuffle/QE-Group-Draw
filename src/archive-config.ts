import { parseLiveSnapshot } from "./live-types.ts";

export const archiveRuntimeConfig = {
  mode: "archive",
  stateEndpoint: "/archive-state.json",
} as const;

export function buildArchiveRuntimeScript(): string {
  return `<script>window.__GROUPDRAW_RUNTIME_CONFIG__=${JSON.stringify(
    archiveRuntimeConfig,
  )};</script>`;
}

export function parseArchiveSnapshot(value: unknown): void {
  parseLiveSnapshot(value);
}
