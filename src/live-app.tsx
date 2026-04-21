import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { Dispatch, ReactElement, SetStateAction } from "react";

import {
  buildScheduledSkipCues,
  clearAnimationTimeouts,
  getPlacementAnimationDuration,
  type SkipAnimationCue,
} from "./app-animation.ts";
import { GroupCard, RemovalModal, SeedSection, StatCard } from "./app-components.tsx";
import {
  buildConstraintFeed,
  buildNoteTextSegments,
  getDivisionRuleSummary,
  groupTeamsBySeed,
  isNewestPlacedTeam,
  type ConstraintFeedState,
} from "./app-helpers.ts";
import { divisionTabClasses, divisionThemeStyles } from "./app-theme.ts";
import {
  emptyReservationMap,
  getNewReservations,
  keepVisibleReservations,
  type ReservationMap,
} from "./app-reservations.ts";
import { divisions } from "./data.ts";
import { getUndrawnTeams } from "./draw-engine.ts";
import { fetchLiveSnapshot, openLiveSocket, sendLiveCommand } from "./live-client.ts";
import {
  createInitialLiveSnapshot,
  restoreDivisionStates,
  restoreVisibleReservations,
} from "./live-store.ts";
import type { RuntimeConfig } from "./runtime-config.ts";
import type { LiveCommand, LiveMutation, LiveSnapshot } from "./live-types.ts";
import type { DivisionState, PlacementAnimationPlan, SeedBracket } from "./types.ts";

const seedBracketOrder: SeedBracket[] = ["seed1", "seed2", "unseeded"];
const reconnectDelaysMs = [1000, 2000, 5000, 5000] as const;

type DivisionId = (typeof divisions)[number]["id"];
type DivisionStateRecord = Record<DivisionId, DivisionState>;

interface PendingRemovalConfirmation {
  divisionId: DivisionId;
  teamId: string;
  teamName: string;
  placementKey: string;
}

interface SnapshotQueueEntry {
  snapshot: LiveSnapshot;
  animate: boolean;
}

export function LiveApp(props: { runtimeConfig: RuntimeConfig }): ReactElement {
  const [divisionStates, setDivisionStates] = useState<DivisionStateRecord>(() =>
    restoreDivisionStates(createInitialLiveSnapshot()),
  );
  const [visibleReservations, setVisibleReservations] = useState<
    Record<DivisionId, ReservationMap>
  >(() => restoreVisibleReservations(createInitialLiveSnapshot()));
  const [activeDivisionId, setActiveDivisionId] = useState(divisions[0]?.id ?? "division-1");
  const [constraintFeed, setConstraintFeed] = useState<ConstraintFeedState | null>(null);
  const [highlightedPlacementKey, setHighlightedPlacementKey] = useState<string | null>(null);
  const [skipAnimationCues, setSkipAnimationCues] = useState<SkipAnimationCue[]>([]);
  const [animatedReservationKeys, setAnimatedReservationKeys] = useState<
    Record<DivisionId, string[]>
  >(
    () =>
      Object.fromEntries(divisions.map((division) => [division.id, [] as string[]])) as Record<
        DivisionId,
        string[]
      >,
  );
  const [isPlacementPending, setIsPlacementPending] = useState(false);
  const [isRemovalPending, setIsRemovalPending] = useState(false);
  const [removingPlacementKey, setRemovingPlacementKey] = useState<string | null>(null);
  const [pendingRemovalConfirmation, setPendingRemovalConfirmation] =
    useState<PendingRemovalConfirmation | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("Connecting");
  const [isCommandPending, setIsCommandPending] = useState(false);

  const animationTimeoutIdsRef = useRef<number[]>([]);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const appliedVersionRef = useRef(0);
  const snapshotQueueRef = useRef<SnapshotQueueEntry[]>([]);
  const isApplyingSnapshotRef = useRef(false);
  const divisionStatesRef = useRef(divisionStates);
  const visibleReservationsRef = useRef(visibleReservations);
  const activeDivisionIdRef = useRef(activeDivisionId);

  const isAdmin = props.runtimeConfig.adminPassword !== null;
  const isModalOpen = pendingRemovalConfirmation !== null;

  useEffect(() => {
    divisionStatesRef.current = divisionStates;
  }, [divisionStates]);

  useEffect(() => {
    visibleReservationsRef.current = visibleReservations;
  }, [visibleReservations]);

  useEffect(() => {
    activeDivisionIdRef.current = activeDivisionId;
  }, [activeDivisionId]);

  const cleanupLiveResources = useEffectEvent((): void => {
    shouldReconnectRef.current = false;
    clearAnimationTimeouts(animationTimeoutIdsRef.current);
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
  });

  const connectSocket = useCallback((): void => {
    shouldReconnectRef.current = true;
    socketRef.current?.close();
    socketRef.current = openLiveSocket(
      props.runtimeConfig.websocketEndpoint,
      (snapshot) => enqueueSnapshot(snapshot, snapshot.version > appliedVersionRef.current),
      (socket) => {
        if (socketRef.current !== socket) {
          return;
        }
        reconnectAttemptRef.current = 0;
        setConnectionLabel(isAdmin ? "Admin live" : "Live");
      },
      (socket) => {
        if (socketRef.current !== socket || !shouldReconnectRef.current) {
          return;
        }

        setConnectionLabel("Reconnecting");
        if (reconnectTimeoutRef.current !== null) {
          return;
        }

        const delay =
          reconnectDelaysMs[Math.min(reconnectAttemptRef.current, reconnectDelaysMs.length - 1)] ??
          reconnectDelaysMs[reconnectDelaysMs.length - 1];

        reconnectAttemptRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectSocket();
        }, delay);
      },
    );
  }, [isAdmin, props.runtimeConfig.websocketEndpoint]);

  useEffect(() => {
    if (constraintFeed === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setConstraintFeed((current) => (current?.id === constraintFeed.id ? null : current));
    }, 20000);

    return () => window.clearTimeout(timeoutId);
  }, [constraintFeed]);

  useEffect(() => {
    let isCancelled = false;

    const initialize = async (): Promise<void> => {
      try {
        const snapshot = await fetchLiveSnapshot(props.runtimeConfig.stateEndpoint);

        if (isCancelled) {
          return;
        }

        applySnapshotImmediately(snapshot);
        setIsInitialized(true);
        setLoadError(null);
        connectSocket();
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "Unable to load live state.");
      }
    };

    initialize().catch(() => undefined);

    return () => {
      isCancelled = true;
      cleanupLiveResources();
    };
  }, [connectSocket, props.runtimeConfig.stateEndpoint]);

  const activeState = divisionStates[activeDivisionId];
  const activeReservationMap = visibleReservations[activeDivisionId] ?? emptyReservationMap;
  const activeAnimatedReservationKeys = animatedReservationKeys[activeDivisionId] ?? [];

  if (activeState === undefined) {
    throw new Error(`Unknown division: ${activeDivisionId}`);
  }

  if (loadError !== null) {
    return (
      <div className="board-shell" style={divisionThemeStyles[activeDivisionId]}>
        <header className="hero-surface">
          <div className="eyebrow">Live Group Draw</div>
          <h1 className="hero-title">Connection Error</h1>
          <p className="hero-subtitle">{loadError}</p>
        </header>
      </div>
    );
  }

  const undrawnTeams = getUndrawnTeams(activeState);
  const placedTeamCount = activeState.config.teams.length - undrawnTeams.length;
  const progress = Math.round((placedTeamCount / activeState.config.teams.length) * 100);
  const latestMessage = activeState.messages[0] ?? "Ready for the next draw.";
  const noteLabel = constraintFeed === null ? "Latest note" : "Placement note";
  const noteMessage = constraintFeed === null ? latestMessage : constraintFeed.messages.join(" ");
  const noteSegments = buildNoteTextSegments(noteMessage);
  const teamsBySeed = groupTeamsBySeed(undrawnTeams);

  const editsDisabled =
    !isInitialized ||
    !isAdmin ||
    isCommandPending ||
    isPlacementPending ||
    isRemovalPending ||
    isModalOpen;

  return (
    <div className="board-shell" style={divisionThemeStyles[activeDivisionId]}>
      <header className="hero-surface">
        <div className="hero-grid">
          <div className="min-w-0">
            <div className="eyebrow">European Quadball Cup 2026</div>
            <h1 className="hero-title">Group Draw Board</h1>
            <p className="hero-subtitle">Live-sync board for admins and spectators.</p>
          </div>

          <nav aria-label="Divisions" className="tab-strip">
            {divisions.map((division) => {
              const isActive = division.id === activeDivisionId;

              return (
                <button
                  key={division.id}
                  aria-pressed={isActive}
                  className={divisionTabClasses[division.id]}
                  data-active={String(isActive)}
                  disabled={isPlacementPending || isRemovalPending || isModalOpen}
                  type="button"
                  onClick={() => setActiveDivisionId(division.id)}
                >
                  <span className="tab-button__label">{division.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="stats-row">
            <StatCard
              label="Placed"
              value={`${placedTeamCount}/${activeState.config.teams.length}`}
            />
            <StatCard label="Progress" value={`${progress}%`} />
            <StatCard label="Sync" value={connectionLabel} />
            {isAdmin ? (
              <button
                className="reset-button"
                disabled={editsDisabled}
                type="button"
                onClick={handleReset}
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>

        <div className={`note-strip${constraintFeed !== null ? " note-strip--constraint" : ""}`}>
          <span className="note-pill">{noteLabel}</span>
          <p className="note-strip__text" title={noteMessage}>
            {noteSegments.map((segment) =>
              segment.emphasized ? (
                <strong className="note-strip__emphasis" key={segment.key}>
                  {segment.text}
                </strong>
              ) : (
                <span key={segment.key}>{segment.text}</span>
              ),
            )}
          </p>
        </div>
      </header>

      <main className="stage-grid">
        <section className="panel-surface panel-groups">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Live board</div>
              <h2 className="panel-title">Groups A-F</h2>
            </div>
            <div className="legend-row">
              <span className="legend-chip legend-chip--seed1">Seed 1</span>
              <span className="legend-chip legend-chip--seed2">Seed 2</span>
              <span className="legend-chip legend-chip--unseeded">Unseeded</span>
            </div>
          </div>

          <div className="group-grid">
            {activeState.groups.map((group, groupIndex) => (
              <GroupCard
                groupIndex={groupIndex}
                group={group}
                highlightedPlacementKey={highlightedPlacementKey}
                removingPlacementKey={removingPlacementKey}
                animatedReservationKeys={activeAnimatedReservationKeys}
                reservationMap={activeReservationMap}
                skipAnimationCues={skipAnimationCues}
                canRemove={isAdmin && !isCommandPending && !isRemovalPending && !isModalOpen}
                onRemove={handleRemove}
                key={group.name}
              />
            ))}
          </div>
        </section>

        <aside className="panel-surface panel-rail">
          <div className="panel-header items-start gap-3">
            <div>
              <div className="eyebrow">{activeState.config.shortName}</div>
              <h2 className="panel-title">Draw Rail</h2>
            </div>
            <div className="panel-meta">{undrawnTeams.length} teams left</div>
          </div>

          <div className="rail-note">
            <span className="note-pill">Rule</span>
            <p>{getDivisionRuleSummary(activeState)}</p>
          </div>

          <div className="rail-scroll">
            {seedBracketOrder.map((seedBracket) => (
              <SeedSection
                key={seedBracket}
                disabled={editsDisabled}
                seedBracket={seedBracket}
                teams={teamsBySeed[seedBracket]}
                onDraw={handleDraw}
              />
            ))}
          </div>
        </aside>
      </main>

      {pendingRemovalConfirmation !== null ? (
        <RemovalModal
          teamName={pendingRemovalConfirmation.teamName}
          onCancel={() => setPendingRemovalConfirmation(null)}
          onConfirm={() => {
            const confirmation = pendingRemovalConfirmation;
            setPendingRemovalConfirmation(null);
            void submitCommand({
              kind: "remove",
              divisionId: confirmation.divisionId,
              teamId: confirmation.teamId,
              placementKey: confirmation.placementKey,
            });
          }}
        />
      ) : null}
    </div>
  );

  function enqueueSnapshot(snapshot: LiveSnapshot, animate: boolean): void {
    const queuedVersion = snapshotQueueRef.current.at(-1)?.snapshot.version ?? 0;
    const highestKnownVersion = Math.max(appliedVersionRef.current, queuedVersion);

    if (snapshot.version <= highestKnownVersion) {
      return;
    }

    snapshotQueueRef.current.push({ snapshot, animate });
    processNextSnapshot();
  }

  function processNextSnapshot(): void {
    if (isApplyingSnapshotRef.current) {
      return;
    }

    const nextEntry = snapshotQueueRef.current.shift();

    if (nextEntry === undefined) {
      return;
    }

    isApplyingSnapshotRef.current = true;
    applySnapshot(nextEntry.snapshot, nextEntry.animate);
  }

  function applySnapshot(snapshot: LiveSnapshot, animate: boolean): void {
    const nextStates = restoreDivisionStates(snapshot);
    const nextReservations = restoreVisibleReservations(snapshot);
    const mutation = snapshot.lastMutation;
    const divisionId = mutation?.divisionId;
    const shouldAnimate =
      animate &&
      mutation !== null &&
      isDivisionId(divisionId) &&
      divisionId === activeDivisionIdRef.current;

    if (!shouldAnimate || mutation === null || !isDivisionId(divisionId)) {
      applySnapshotImmediately(snapshot);
      processNextSnapshot();
      return;
    }

    if (mutation.kind === "placed") {
      applyPlacedSnapshot(snapshot, nextStates, nextReservations, mutation, divisionId);
      return;
    }

    if (mutation.kind === "removed") {
      applyRemovedSnapshot(snapshot, nextStates, nextReservations, mutation, divisionId);
      return;
    }

    clearTransientAnimationState();
    setDivisionStates(nextStates);
    setVisibleReservations(nextReservations);
    setConstraintFeed(buildConstraintFeed(mutation.messages));
    appliedVersionRef.current = snapshot.version;
    isApplyingSnapshotRef.current = false;
    processNextSnapshot();
  }

  function applySnapshotImmediately(snapshot: LiveSnapshot): void {
    clearTransientAnimationState();
    setDivisionStates(restoreDivisionStates(snapshot));
    setVisibleReservations(restoreVisibleReservations(snapshot));
    appliedVersionRef.current = snapshot.version;
    isApplyingSnapshotRef.current = false;
  }

  function clearTransientAnimationState(): void {
    setSkipAnimationCues([]);
    setConstraintFeed(null);
    setHighlightedPlacementKey(null);
    setRemovingPlacementKey(null);
    setIsPlacementPending(false);
    setIsRemovalPending(false);
    setAnimatedReservationKeys(
      Object.fromEntries(divisions.map((division) => [division.id, [] as string[]])) as Record<
        DivisionId,
        string[]
      >,
    );
  }

  function applyPlacedSnapshot(
    snapshot: LiveSnapshot,
    nextStates: DivisionStateRecord,
    nextReservations: Record<DivisionId, ReservationMap>,
    mutation: Extract<LiveMutation, { kind: "placed" }>,
    divisionId: DivisionId,
  ): void {
    const currentReservationMap = visibleReservationsRef.current[divisionId] ?? emptyReservationMap;
    const nextReservationMap = nextReservations[divisionId] ?? emptyReservationMap;
    const keptReservationMap = keepVisibleReservations(currentReservationMap, nextReservationMap);
    const newReservationMap = getNewReservations(currentReservationMap, nextReservationMap);
    const newReservationKeys = Object.keys(newReservationMap);
    const completionDelayMs = getPlacementAnimationDuration(
      mutation.animationPlan?.skipSteps ?? [],
    );

    setConstraintFeed(buildConstraintFeed(mutation.messages));
    setIsPlacementPending(true);

    if (mutation.animationPlan !== undefined && mutation.animationPlan.skipSteps.length > 0) {
      schedulePlacementAnimation(
        mutation.animationPlan,
        setSkipAnimationCues,
        animationTimeoutIdsRef.current,
      );
    }

    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        setDivisionStates(nextStates);
        setVisibleReservations((currentReservations) => ({
          ...currentReservations,
          [divisionId]: keptReservationMap,
        }));
        setAnimatedReservationKeys((currentKeys) => ({
          ...currentKeys,
          [divisionId]: [],
        }));
        setHighlightedPlacementKey(mutation.placementKey);
        setIsPlacementPending(false);
        appliedVersionRef.current = snapshot.version;
        isApplyingSnapshotRef.current = false;

        if (newReservationKeys.length > 0) {
          scheduleReservationReveal(
            snapshot.version,
            divisionId,
            newReservationMap,
            newReservationKeys,
          );
        }

        processNextSnapshot();
      }, completionDelayMs),
    );
  }

  function scheduleReservationReveal(
    snapshotVersion: number,
    divisionId: DivisionId,
    newReservationMap: ReservationMap,
    newReservationKeys: string[],
  ): void {
    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        if (appliedVersionRef.current !== snapshotVersion) {
          return;
        }

        setVisibleReservations((currentReservations) => ({
          ...currentReservations,
          [divisionId]: {
            ...currentReservations[divisionId],
            ...newReservationMap,
          },
        }));
        setAnimatedReservationKeys((currentKeys) => ({
          ...currentKeys,
          [divisionId]: newReservationKeys,
        }));
      }, 1000),
    );
    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        if (appliedVersionRef.current !== snapshotVersion) {
          return;
        }

        setAnimatedReservationKeys((currentKeys) => ({
          ...currentKeys,
          [divisionId]: (currentKeys[divisionId] ?? []).filter(
            (key) => !newReservationKeys.includes(key),
          ),
        }));
      }, 2600),
    );
  }

  function applyRemovedSnapshot(
    snapshot: LiveSnapshot,
    nextStates: DivisionStateRecord,
    nextReservations: Record<DivisionId, ReservationMap>,
    mutation: Extract<LiveMutation, { kind: "removed" }>,
    divisionId: DivisionId,
  ): void {
    setConstraintFeed(null);
    setIsRemovalPending(true);
    setRemovingPlacementKey(mutation.placementKey);

    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        setDivisionStates(nextStates);
        setVisibleReservations(nextReservations);
        setAnimatedReservationKeys((currentKeys) => ({
          ...currentKeys,
          [divisionId]: [],
        }));
        setRemovingPlacementKey(null);
        setIsRemovalPending(false);
        appliedVersionRef.current = snapshot.version;
        isApplyingSnapshotRef.current = false;
        processNextSnapshot();
      }, 450),
    );
  }

  function handleDraw(teamId: string): void {
    if (editsDisabled) {
      return;
    }

    void submitCommand({
      kind: "draw",
      divisionId: activeDivisionId,
      teamId,
    });
  }

  function handleRemove(teamId: string, placementKey: string, teamName: string): void {
    if (!isAdmin || isCommandPending || isRemovalPending || isModalOpen) {
      return;
    }

    const currentState = divisionStatesRef.current[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    if (!isNewestPlacedTeam(currentState, teamId)) {
      setPendingRemovalConfirmation({
        divisionId: activeDivisionId,
        teamId,
        teamName,
        placementKey,
      });
      return;
    }

    void submitCommand({
      kind: "remove",
      divisionId: activeDivisionId,
      teamId,
      placementKey,
    });
  }

  function handleReset(): void {
    if (editsDisabled) {
      return;
    }

    const currentState = divisionStatesRef.current[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    if (!window.confirm(`Reset ${currentState.config.name} and clear all current placements?`)) {
      return;
    }

    void submitCommand({
      kind: "reset",
      divisionId: activeDivisionId,
    });
  }

  async function submitCommand(command: LiveCommand): Promise<void> {
    if (!isAdmin || props.runtimeConfig.adminPassword === null) {
      return;
    }

    setIsCommandPending(true);

    try {
      const result = await sendLiveCommand(
        props.runtimeConfig.commandEndpoint,
        props.runtimeConfig.adminPassword,
        command,
      );

      enqueueSnapshot(result.snapshot, result.ok);

      if (!result.ok && command.divisionId === activeDivisionIdRef.current) {
        setConstraintFeed(buildConstraintFeed(result.messages));
      }
    } catch (error) {
      setConstraintFeed(
        buildConstraintFeed([
          error instanceof Error ? error.message : "Unable to submit the live command.",
        ]),
      );
    } finally {
      setIsCommandPending(false);
    }
  }
}

function schedulePlacementAnimation(
  animationPlan: PlacementAnimationPlan,
  setSkipAnimationCues: Dispatch<SetStateAction<SkipAnimationCue[]>>,
  timeoutIds: number[],
): void {
  for (const scheduledCue of buildScheduledSkipCues(animationPlan.skipSteps)) {
    timeoutIds.push(
      window.setTimeout(() => {
        setSkipAnimationCues((currentCues) =>
          currentCues.includes(scheduledCue.cue) ? currentCues : [...currentCues, scheduledCue.cue],
        );
      }, scheduledCue.atMs),
    );
    timeoutIds.push(
      window.setTimeout(() => {
        setSkipAnimationCues((currentCues) =>
          currentCues.filter((activeCue) => activeCue !== scheduledCue.cue),
        );
      }, scheduledCue.atMs + scheduledCue.durationMs),
    );
  }
}

function isDivisionId(value: string | undefined): value is DivisionId {
  return divisions.some((division) => division.id === value);
}
