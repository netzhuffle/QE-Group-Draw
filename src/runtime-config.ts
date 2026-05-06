export interface RuntimeConfig {
  mode: "local" | "live" | "archive";
  stateEndpoint: string;
  commandEndpoint: string;
  websocketEndpoint: string;
  adminPassword: string | null;
}

interface RuntimeConfigOverrides {
  mode?: RuntimeConfig["mode"];
  stateEndpoint?: string;
  commandEndpoint?: string;
  websocketEndpoint?: string;
}

declare global {
  interface Window {
    __GROUPDRAW_RUNTIME_CONFIG__?: RuntimeConfigOverrides;
  }
}

const archiveHostnames = new Set(["groupdraw.quadball.eu"]);

function getAdminPassword(): string | null {
  const adminPassword = new URL(window.location.href).searchParams.get("admin")?.trim();
  return adminPassword === undefined || adminPassword === "" ? null : adminPassword;
}

export function getDefaultRuntimeMode(hostname: string): RuntimeConfig["mode"] {
  return archiveHostnames.has(hostname) ? "archive" : "local";
}

export function resolveRuntimeConfig(): RuntimeConfig {
  const overrides = window.__GROUPDRAW_RUNTIME_CONFIG__ ?? {};
  const runtimeMode =
    overrides.mode === "live" || overrides.mode === "archive"
      ? overrides.mode
      : getDefaultRuntimeMode(window.location.hostname);

  return {
    mode: runtimeMode,
    stateEndpoint: overrides.stateEndpoint ?? "/archive-state.json",
    commandEndpoint: overrides.commandEndpoint ?? "/api/admin/command",
    websocketEndpoint: overrides.websocketEndpoint ?? "/api/ws",
    adminPassword: getAdminPassword(),
  };
}
