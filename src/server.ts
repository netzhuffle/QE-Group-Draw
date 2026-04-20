import { dirname, join, normalize, resolve } from "node:path";
import { mkdir, readFile, rename } from "node:fs/promises";

import {
  applyLiveCommand,
  createInitialLiveSnapshot,
  normalizeLiveSnapshot,
} from "./live-store.ts";
import {
  parseLiveCommand,
  parseLiveSnapshot,
  type LiveCommandResponse,
  type LiveSnapshot,
  type LiveSnapshotEnvelope,
} from "./live-types.ts";

const port = Number(process.env.PORT ?? "3010");
const distDir = resolve(process.cwd(), "dist");
const stateFilePath = resolve(
  process.env.STATE_FILE ?? join(process.cwd(), "data", "live-state.json"),
);
const adminPassword = process.env.ADMIN_PASSWORD ?? "";
const websocketTopic = "groupdraw-live";

let currentSnapshot = await loadSnapshot(stateFilePath);
let mutationQueue = Promise.resolve();

const server = Bun.serve({
  port,
  fetch(request, serverInstance) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ws") {
      const upgraded = serverInstance.upgrade(request, { data: {} });

      return upgraded ? undefined : new Response("WebSocket upgrade failed.", { status: 400 });
    }

    if (url.pathname === "/api/state") {
      return Response.json(currentSnapshot);
    }

    if (url.pathname === "/api/admin/command" && request.method === "POST") {
      return handleAdminCommand(request);
    }

    if (url.pathname === "/healthz") {
      return Response.json({
        ok: true,
        version: currentSnapshot.version,
      });
    }

    return serveFrontend(url.pathname);
  },
  websocket: {
    data: {} as Record<string, never>,
    open(ws) {
      ws.subscribe(websocketTopic);
      ws.send(JSON.stringify(buildSnapshotEnvelope(currentSnapshot)));
    },
    message() {},
  },
});

console.log(`Live groupdraw server listening on http://127.0.0.1:${server.port}`);

async function handleAdminCommand(request: Request): Promise<Response> {
  if (!isAuthorizedAdmin(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const command = parseLiveCommand(await request.json());
  const commandResult = await enqueueMutation(async () => {
    const result = applyLiveCommand(currentSnapshot, command);

    if (!result.ok) {
      return result;
    }

    currentSnapshot = result.snapshot;
    await persistSnapshot(stateFilePath, currentSnapshot);
    server.publish(websocketTopic, JSON.stringify(buildSnapshotEnvelope(currentSnapshot)));
    return result;
  });

  const status = commandResult.ok ? 200 : 409;
  return Response.json(commandResult satisfies LiveCommandResponse, { status });
}

function buildSnapshotEnvelope(snapshot: LiveSnapshot): LiveSnapshotEnvelope {
  return {
    type: "snapshot",
    snapshot,
  };
}

function isAuthorizedAdmin(request: Request): boolean {
  if (adminPassword.length === 0) {
    return false;
  }

  const url = new URL(request.url);
  const requestPassword =
    request.headers.get("x-groupdraw-admin") ?? url.searchParams.get("admin") ?? "";

  return requestPassword === adminPassword;
}

async function serveFrontend(pathname: string): Promise<Response> {
  if (pathname === "/") {
    return new Response(await renderLiveIndex(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  const assetPath = resolveAssetPath(pathname);

  if (assetPath === null) {
    return new Response("Not Found", { status: 404 });
  }

  const file = Bun.file(assetPath);

  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file);
}

function resolveAssetPath(pathname: string): string | null {
  const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  const assetPath = resolve(distDir, `.${safePath}`);

  if (!assetPath.startsWith(distDir)) {
    return null;
  }

  return assetPath;
}

async function renderLiveIndex(): Promise<string> {
  const template = await readFile(join(distDir, "index.html"), "utf8");
  const runtimeScript = `<script>window.__GROUPDRAW_RUNTIME_CONFIG__=${JSON.stringify({
    mode: "live",
    stateEndpoint: "/api/state",
    commandEndpoint: "/api/admin/command",
    websocketEndpoint: "/api/ws",
  })};</script>`;

  return template.includes("</head>")
    ? template.replace("</head>", `${runtimeScript}</head>`)
    : `${runtimeScript}${template}`;
}

async function loadSnapshot(filePath: string): Promise<LiveSnapshot> {
  try {
    const fileContents = await readFile(filePath, "utf8");
    return normalizeLiveSnapshot(parseLiveSnapshot(JSON.parse(fileContents) as unknown));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return createInitialLiveSnapshot();
    }

    throw error;
  }
}

async function persistSnapshot(filePath: string, snapshot: LiveSnapshot): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;

  await Bun.write(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(work, work);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
