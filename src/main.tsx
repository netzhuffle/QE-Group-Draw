import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (rootElement === null) {
  throw new Error("Missing #app mount node.");
}

createRoot(rootElement).render(<App />);
