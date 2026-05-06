import archiveSnapshotJson from "./archive-state.json";
import { parseLiveSnapshot } from "./live-types.ts";

export const archivedLiveSnapshot = parseLiveSnapshot(archiveSnapshotJson as unknown);
