export interface RuntimeConfig {
  mode: "local" | "live";
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

function getAdminPassword(): string | null {
  const adminPassword = new URL(window.location.href).searchParams.get("admin")?.trim();
  return adminPassword === undefined || adminPassword === "" ? null : adminPassword;
}

export function resolveRuntimeConfig(): RuntimeConfig {
  const overrides = window.__GROUPDRAW_RUNTIME_CONFIG__ ?? {};

  return {
    mode: overrides.mode === "live" ? "live" : "local",
    stateEndpoint: overrides.stateEndpoint ?? "/api/state",
    commandEndpoint: overrides.commandEndpoint ?? "/api/admin/command",
    websocketEndpoint: overrides.websocketEndpoint ?? "/api/ws",
    adminPassword: getAdminPassword(),
  };
}
