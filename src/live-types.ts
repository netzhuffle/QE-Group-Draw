import type { ReservationMap } from "./app-reservations.ts";
import type { PlacementAnimationPlan } from "./types.ts";

export interface SerializedDivisionLiveState {
  drawOrder: string[];
  messages: string[];
  visibleReservations: ReservationMap;
}

interface LiveMutationBase {
  version: number;
  at: string;
  divisionId: string;
  messages: string[];
}

export interface TeamPlacedMutation extends LiveMutationBase {
  kind: "placed";
  teamId: string;
  placementKey: string | null;
  animationPlan?: PlacementAnimationPlan;
}

export interface TeamRemovedMutation extends LiveMutationBase {
  kind: "removed";
  teamId: string;
  teamName: string;
  placementKey: string | null;
}

export interface DivisionResetMutation extends LiveMutationBase {
  kind: "reset";
}

export type LiveMutation = TeamPlacedMutation | TeamRemovedMutation | DivisionResetMutation;

export interface LiveSnapshot {
  version: number;
  updatedAt: string;
  divisions: Record<string, SerializedDivisionLiveState>;
  lastMutation: LiveMutation | null;
}

export interface LiveSnapshotEnvelope {
  type: "snapshot";
  snapshot: LiveSnapshot;
}

export type LiveCommand =
  | {
      kind: "draw";
      divisionId: string;
      teamId: string;
    }
  | {
      kind: "remove";
      divisionId: string;
      teamId: string;
      placementKey: string | null;
    }
  | {
      kind: "reset";
      divisionId: string;
    };

export interface LiveCommandResponse {
  ok: boolean;
  snapshot: LiveSnapshot;
  messages: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isReservationMap(value: unknown): value is ReservationMap {
  return isRecord(value) && Object.values(value).every(isStringArray);
}

function isPlacementAnimationPlan(value: unknown): value is PlacementAnimationPlan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.teamId === "string" &&
    typeof value.teamNgb === "string" &&
    isRecord(value.chosenPlacement) &&
    typeof value.chosenPlacement.groupIndex === "number" &&
    typeof value.chosenPlacement.slotIndex === "number" &&
    Array.isArray(value.skipSteps)
  );
}

function isLiveMutation(value: unknown): value is LiveMutation {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.version !== "number" ||
    typeof value.at !== "string" ||
    typeof value.divisionId !== "string" ||
    !isStringArray(value.messages) ||
    typeof value.kind !== "string"
  ) {
    return false;
  }

  if (value.kind === "placed") {
    return (
      typeof value.teamId === "string" &&
      (typeof value.placementKey === "string" || value.placementKey === null) &&
      (value.animationPlan === undefined || isPlacementAnimationPlan(value.animationPlan))
    );
  }

  if (value.kind === "removed") {
    return (
      typeof value.teamId === "string" &&
      typeof value.teamName === "string" &&
      (typeof value.placementKey === "string" || value.placementKey === null)
    );
  }

  return value.kind === "reset";
}

function isSerializedDivisionLiveState(value: unknown): value is SerializedDivisionLiveState {
  return (
    isRecord(value) &&
    isStringArray(value.drawOrder) &&
    isStringArray(value.messages) &&
    isReservationMap(value.visibleReservations)
  );
}

export function parseLiveSnapshot(value: unknown): LiveSnapshot {
  if (!isRecord(value)) {
    throw new Error("Invalid live snapshot payload.");
  }

  if (
    typeof value.version !== "number" ||
    typeof value.updatedAt !== "string" ||
    !isRecord(value.divisions) ||
    !(
      value.lastMutation === null ||
      value.lastMutation === undefined ||
      isLiveMutation(value.lastMutation)
    )
  ) {
    throw new Error("Invalid live snapshot payload.");
  }

  if (!Object.values(value.divisions).every(isSerializedDivisionLiveState)) {
    throw new Error("Invalid live snapshot payload.");
  }

  const divisions: Record<string, SerializedDivisionLiveState> = {};

  for (const [divisionId, divisionState] of Object.entries(value.divisions)) {
    if (!isSerializedDivisionLiveState(divisionState)) {
      throw new Error("Invalid live snapshot payload.");
    }

    divisions[divisionId] = divisionState;
  }

  return {
    version: value.version,
    updatedAt: value.updatedAt,
    divisions,
    lastMutation: value.lastMutation ?? null,
  };
}

export function parseLiveSnapshotEnvelope(value: unknown): LiveSnapshotEnvelope {
  if (!isRecord(value) || value.type !== "snapshot") {
    throw new Error("Invalid live snapshot envelope.");
  }

  return {
    type: "snapshot",
    snapshot: parseLiveSnapshot(value.snapshot),
  };
}

export function parseLiveCommandResponse(value: unknown): LiveCommandResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !isStringArray(value.messages)) {
    throw new Error("Invalid live command response.");
  }

  return {
    ok: value.ok,
    messages: value.messages,
    snapshot: parseLiveSnapshot(value.snapshot),
  };
}

export function parseLiveCommand(value: unknown): LiveCommand {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.divisionId !== "string") {
    throw new Error("Invalid live command.");
  }

  if (value.kind === "draw" && typeof value.teamId === "string") {
    return {
      kind: "draw",
      divisionId: value.divisionId,
      teamId: value.teamId,
    };
  }

  if (value.kind === "remove" && typeof value.teamId === "string") {
    return {
      kind: "remove",
      divisionId: value.divisionId,
      teamId: value.teamId,
      placementKey: typeof value.placementKey === "string" ? value.placementKey : null,
    };
  }

  if (value.kind === "reset") {
    return {
      kind: "reset",
      divisionId: value.divisionId,
    };
  }

  throw new Error("Invalid live command.");
}
