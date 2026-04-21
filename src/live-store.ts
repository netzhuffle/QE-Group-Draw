import {
  buildReservationMap,
  buildStrategicReservationMap,
  emptyReservationMap,
  getNewReservations,
  keepVisibleReservations,
  mergeReservationMaps,
  type ReservationMap,
} from "./app-reservations.ts";
import { findPlacementKey } from "./app-helpers.ts";
import { divisions } from "./data.ts";
import {
  createDivisionState,
  placeTeamById,
  removeTeamById,
  resetDivisionState,
  restoreDivisionState,
} from "./draw-engine.ts";
import type { DivisionState } from "./types.ts";
import type {
  DivisionResetMutation,
  LiveCommand,
  LiveCommandResponse,
  LiveSnapshot,
  LiveMutation,
  SerializedDivisionLiveState,
  TeamPlacedMutation,
  TeamRemovedMutation,
} from "./live-types.ts";

type DivisionId = (typeof divisions)[number]["id"];

type DivisionStatesRecord = Record<DivisionId, DivisionState>;
type DivisionReservationRecord = Record<DivisionId, ReservationMap>;

function getNowIso(): string {
  return new Date().toISOString();
}

function getDivisionConfig(divisionId: string) {
  return divisions.find((division) => division.id === divisionId);
}

function getDivisionStateFromSnapshot(
  snapshot: LiveSnapshot,
  divisionId: DivisionId,
): SerializedDivisionLiveState {
  return (
    snapshot.divisions[divisionId] ?? {
      drawOrder: [],
      messages: [createDivisionState(getRequiredDivisionConfig(divisionId)).messages[0] ?? ""],
      visibleReservations: emptyReservationMap,
    }
  );
}

function getRequiredDivisionConfig(divisionId: string) {
  const config = getDivisionConfig(divisionId);

  if (config === undefined) {
    throw new Error(`Unknown division: ${divisionId}`);
  }

  return config;
}

export function createInitialLiveSnapshot(): LiveSnapshot {
  return {
    version: 0,
    updatedAt: getNowIso(),
    lastMutation: null,
    divisions: Object.fromEntries(
      divisions.map((division) => [
        division.id,
        {
          drawOrder: [],
          messages: createDivisionState(division).messages,
          visibleReservations: emptyReservationMap,
        } satisfies SerializedDivisionLiveState,
      ]),
    ),
  };
}

export function normalizeLiveSnapshot(snapshot: LiveSnapshot): LiveSnapshot {
  const normalizedDivisions = Object.fromEntries(
    divisions.map((division) => {
      const current = snapshot.divisions[division.id];
      return [
        division.id,
        current ?? {
          drawOrder: [],
          messages: createDivisionState(division).messages,
          visibleReservations: emptyReservationMap,
        },
      ];
    }),
  );

  return {
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    lastMutation: snapshot.lastMutation,
    divisions: normalizedDivisions,
  };
}

export function restoreDivisionStates(snapshot: LiveSnapshot): DivisionStatesRecord {
  return Object.fromEntries(
    divisions.map((division) => {
      const storedState = getDivisionStateFromSnapshot(snapshot, division.id);
      return [
        division.id,
        restoreDivisionState(division, storedState.drawOrder, storedState.messages),
      ];
    }),
  ) as DivisionStatesRecord;
}

export function restoreVisibleReservations(snapshot: LiveSnapshot): DivisionReservationRecord {
  return Object.fromEntries(
    divisions.map((division) => [
      division.id,
      getDivisionStateFromSnapshot(snapshot, division.id).visibleReservations,
    ]),
  ) as DivisionReservationRecord;
}

function buildPlacedMutation(
  snapshot: LiveSnapshot,
  divisionId: DivisionId,
  messages: string[],
  teamId: string,
  placementKey: string | null,
  animationPlan: TeamPlacedMutation["animationPlan"],
): TeamPlacedMutation {
  return {
    kind: "placed",
    version: snapshot.version + 1,
    at: getNowIso(),
    divisionId,
    messages,
    teamId,
    placementKey,
    animationPlan,
  };
}

function buildRemovedMutation(
  snapshot: LiveSnapshot,
  divisionId: DivisionId,
  messages: string[],
  teamId: string,
  teamName: string,
  placementKey: string | null,
): TeamRemovedMutation {
  return {
    kind: "removed",
    version: snapshot.version + 1,
    at: getNowIso(),
    divisionId,
    messages,
    teamId,
    teamName,
    placementKey,
  };
}

function buildResetMutation(
  snapshot: LiveSnapshot,
  divisionId: DivisionId,
  messages: string[],
): DivisionResetMutation {
  return {
    kind: "reset",
    version: snapshot.version + 1,
    at: getNowIso(),
    divisionId,
    messages,
  };
}

function buildUpdatedSnapshot(
  snapshot: LiveSnapshot,
  divisionId: DivisionId,
  updatedState: DivisionState,
  visibleReservations: ReservationMap,
  mutation: LiveMutation,
): LiveSnapshot {
  return {
    version: mutation.version,
    updatedAt: mutation.at,
    lastMutation: mutation,
    divisions: {
      ...snapshot.divisions,
      [divisionId]: {
        drawOrder: updatedState.drawOrder,
        messages: updatedState.messages,
        visibleReservations,
      },
    },
  };
}

export function applyLiveCommand(
  snapshot: LiveSnapshot,
  command: LiveCommand,
): LiveCommandResponse {
  const normalizedSnapshot = normalizeLiveSnapshot(snapshot);
  const config = getDivisionConfig(command.divisionId);

  if (config === undefined) {
    return {
      ok: false,
      snapshot: normalizedSnapshot,
      messages: ["The requested division does not exist."],
    };
  }

  const divisionId = config.id;
  const currentStoredState = getDivisionStateFromSnapshot(normalizedSnapshot, divisionId);
  const currentState = restoreDivisionState(
    config,
    currentStoredState.drawOrder,
    currentStoredState.messages,
  );
  const currentReservations = currentStoredState.visibleReservations;

  if (command.kind === "draw") {
    const placementResult = placeTeamById(currentState, command.teamId);

    if (!placementResult.ok) {
      return {
        ok: false,
        snapshot: normalizedSnapshot,
        messages: placementResult.messages,
      };
    }

    const nextReservationMap = mergeReservationMaps(
      buildReservationMap(placementResult.updatedState),
      buildStrategicReservationMap(placementResult.updatedState, placementResult.animationPlan),
    );
    const visibleReservations = mergeReservationMaps(
      keepVisibleReservations(currentReservations, nextReservationMap),
      getNewReservations(currentReservations, nextReservationMap),
    );
    const placementKey = findPlacementKey(
      currentState,
      placementResult.updatedState,
      command.teamId,
    );
    const mutation = buildPlacedMutation(
      normalizedSnapshot,
      divisionId,
      placementResult.messages,
      command.teamId,
      placementKey,
      placementResult.animationPlan,
    );

    return {
      ok: true,
      snapshot: buildUpdatedSnapshot(
        normalizedSnapshot,
        divisionId,
        placementResult.updatedState,
        visibleReservations,
        mutation,
      ),
      messages: placementResult.messages,
    };
  }

  if (command.kind === "remove") {
    const removalResult = removeTeamById(currentState, command.teamId);

    if (!removalResult.ok) {
      return {
        ok: false,
        snapshot: normalizedSnapshot,
        messages: removalResult.messages,
      };
    }

    const mutation = buildRemovedMutation(
      normalizedSnapshot,
      divisionId,
      removalResult.messages,
      command.teamId,
      removalResult.removedTeam?.name ?? command.teamId,
      command.placementKey,
    );

    return {
      ok: true,
      snapshot: buildUpdatedSnapshot(
        normalizedSnapshot,
        divisionId,
        removalResult.updatedState,
        buildReservationMap(removalResult.updatedState),
        mutation,
      ),
      messages: removalResult.messages,
    };
  }

  const updatedState = resetDivisionState(config);
  const resetMessage = `${config.name} was reset.`;
  const mutation = buildResetMutation(normalizedSnapshot, divisionId, [resetMessage]);

  return {
    ok: true,
    snapshot: buildUpdatedSnapshot(normalizedSnapshot, divisionId, updatedState, {}, mutation),
    messages: [resetMessage],
  };
}
