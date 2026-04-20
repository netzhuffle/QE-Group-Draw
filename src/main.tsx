import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";
import { LiveApp } from "./live-app.tsx";
import { resolveRuntimeConfig } from "./runtime-config.ts";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement === null) {
  throw new Error("Missing #app mount node.");
}

const runtimeConfig = resolveRuntimeConfig();

createRoot(rootElement).render(
  runtimeConfig.mode === "live" ? <LiveApp runtimeConfig={runtimeConfig} /> : <App />,
);
