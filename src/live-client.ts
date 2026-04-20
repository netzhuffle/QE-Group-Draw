import {
  parseLiveCommandResponse,
  parseLiveSnapshot,
  parseLiveSnapshotEnvelope,
  type LiveCommand,
  type LiveCommandResponse,
  type LiveSnapshot,
} from "./live-types.ts";

function buildUrl(pathname: string): URL {
  return new URL(pathname, window.location.origin);
}

export async function fetchLiveSnapshot(stateEndpoint: string): Promise<LiveSnapshot> {
  const response = await fetch(buildUrl(stateEndpoint));

  if (!response.ok) {
    throw new Error(`Unable to load live state (${response.status}).`);
  }

  return parseLiveSnapshot(await response.json());
}

export async function sendLiveCommand(
  commandEndpoint: string,
  adminPassword: string,
  command: LiveCommand,
): Promise<LiveCommandResponse> {
  const response = await fetch(buildUrl(commandEndpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-groupdraw-admin": adminPassword,
    },
    body: JSON.stringify(command),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Unable to submit live command (${response.status}).`);
  }

  return parseLiveCommandResponse(await response.json());
}

export function openLiveSocket(
  websocketEndpoint: string,
  onSnapshot: (snapshot: LiveSnapshot) => void,
  onOpen: (socket: WebSocket) => void,
  onClose: (socket: WebSocket) => void,
): WebSocket {
  const url = buildUrl(websocketEndpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  const socket = new WebSocket(url);
  socket.addEventListener("open", () => onOpen(socket));
  socket.addEventListener("close", () => onClose(socket));
  socket.addEventListener("message", (event) => {
    const data = parseLiveSnapshotEnvelope(JSON.parse(String(event.data)) as unknown);

    if (data.type === "snapshot") {
      onSnapshot(data.snapshot);
    }
  });

  return socket;
}
