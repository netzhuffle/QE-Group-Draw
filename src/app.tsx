import { useEffect, useRef, useState } from "react";
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
  findPlacementKey,
  getDivisionRuleSummary,
  groupTeamsBySeed,
  isNewestPlacedTeam,
  type ConstraintFeedState,
} from "./app-helpers.ts";
import { divisionTabClasses, divisionThemeStyles } from "./app-theme.ts";
import {
  buildReservationMap,
  buildStrategicReservationMap,
  emptyReservationMap,
  getNewReservations,
  keepVisibleReservations,
  mergeReservationMaps,
  type ReservationMap,
} from "./app-reservations.ts";
import { divisions } from "./data.ts";
import {
  createDivisionState,
  getUndrawnTeams,
  placeTeamById,
  removeTeamById,
  resetDivisionState,
} from "./draw-engine.ts";
import type { DivisionState, PlacementAnimationPlan, SeedBracket } from "./types.ts";

const seedBracketOrder: SeedBracket[] = ["seed1", "seed2", "unseeded"];

type DivisionId = (typeof divisions)[number]["id"];

type DivisionStateRecord = Record<DivisionId, DivisionState>;
interface PendingRemovalConfirmation {
  divisionId: DivisionId;
  teamId: string;
  teamName: string;
  placementKey: string;
}

export function App(): ReactElement {
  const [divisionStates, setDivisionStates] = useState<DivisionStateRecord>(
    () =>
      Object.fromEntries(
        divisions.map((division) => [division.id, createDivisionState(division)]),
      ) as DivisionStateRecord,
  );
  const [activeDivisionId, setActiveDivisionId] = useState(divisions[0]?.id ?? "division-1");
  const [highlightedPlacementKey, setHighlightedPlacementKey] = useState<string | null>(null);
  const [skipAnimationCues, setSkipAnimationCues] = useState<SkipAnimationCue[]>([]);
  const [constraintFeed, setConstraintFeed] = useState<ConstraintFeedState | null>(null);
  const [visibleReservations, setVisibleReservations] = useState<
    Record<DivisionId, ReservationMap>
  >(
    () =>
      Object.fromEntries(
        divisions.map((division) => [division.id, {} as ReservationMap]),
      ) as Record<DivisionId, ReservationMap>,
  );
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
  const animationTimeoutIdsRef = useRef<number[]>([]);
  const pendingDrawRef = useRef<{ divisionId: DivisionId; teamId: string } | null>(null);
  const queuedDrawsRef = useRef(
    Object.fromEntries(divisions.map((division) => [division.id, [] as string[]])) as Record<
      DivisionId,
      string[]
    >,
  );
  const activeState = divisionStates[activeDivisionId];

  if (activeState === undefined) {
    throw new Error(`Unknown division: ${activeDivisionId}`);
  }

  const undrawnTeams = getUndrawnTeams(activeState);
  const placedTeamCount = activeState.config.teams.length - undrawnTeams.length;
  const progress = Math.round((placedTeamCount / activeState.config.teams.length) * 100);
  const latestMessage = activeState.messages[0] ?? "Ready for the next draw.";
  const noteLabel = constraintFeed === null ? "Latest note" : "Placement note";
  const noteMessage = constraintFeed === null ? latestMessage : constraintFeed.messages.join(" ");
  const noteSegments = buildNoteTextSegments(noteMessage);
  const teamsBySeed = groupTeamsBySeed(undrawnTeams);
  const activeAnimatedReservationKeys = animatedReservationKeys[activeDivisionId] ?? [];
  const activeReservationMap = visibleReservations[activeDivisionId] ?? emptyReservationMap;
  const isModalOpen = pendingRemovalConfirmation !== null;

  useEffect(() => {
    if (constraintFeed === null) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setConstraintFeed((current) => (current?.id === constraintFeed.id ? null : current));
    }, 20000);

    return () => window.clearTimeout(timeoutId);
  }, [constraintFeed]);

  useEffect(
    () => () => {
      clearAnimationTimeouts(animationTimeoutIdsRef.current);
    },
    [],
  );

  const processDraw = (
    divisionId: DivisionId,
    currentState: DivisionState,
    currentReservationMap: ReservationMap,
    teamId: string,
  ): void => {
    pendingDrawRef.current = { divisionId, teamId };
    setIsPlacementPending(true);

    const result = placeTeamById(currentState, teamId);
    setConstraintFeed(buildConstraintFeed(result.messages));

    if (!result.ok || result.updatedState === currentState) {
      pendingDrawRef.current = null;
      setIsPlacementPending(false);
      return;
    }

    const placementKey = findPlacementKey(currentState, result.updatedState, teamId);
    const nextReservationMap = mergeReservationMaps(
      buildReservationMap(result.updatedState),
      buildStrategicReservationMap(result.updatedState, result.animationPlan),
    );
    const keptReservationMap = keepVisibleReservations(currentReservationMap, nextReservationMap);
    const newReservationMap = getNewReservations(currentReservationMap, nextReservationMap);
    const effectiveReservationMap = mergeReservationMaps(keptReservationMap, newReservationMap);
    setHighlightedPlacementKey(null);
    const applyPlacement = (): void => {
      setDivisionStates((currentStates) => ({
        ...currentStates,
        [divisionId]: result.updatedState,
      }));
      setHighlightedPlacementKey(placementKey);
      setVisibleReservations((currentReservations) => ({
        ...currentReservations,
        [divisionId]: keptReservationMap,
      }));
      setAnimatedReservationKeys((currentKeys) => ({
        ...currentKeys,
        [divisionId]: [],
      }));
      pendingDrawRef.current = null;
      setIsPlacementPending(false);

      if (Object.keys(newReservationMap).length === 0) {
        queueNextDraw(divisionId, result.updatedState, effectiveReservationMap);
        return;
      }

      const newReservationKeys = Object.keys(newReservationMap);
      animationTimeoutIdsRef.current.push(
        window.setTimeout(() => {
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
          setAnimatedReservationKeys((currentKeys) => ({
            ...currentKeys,
            [divisionId]: (currentKeys[divisionId] ?? []).filter(
              (key) => !newReservationKeys.includes(key),
            ),
          }));
        }, 2600),
      );
      queueNextDraw(divisionId, result.updatedState, effectiveReservationMap);
    };

    if (result.animationPlan === undefined || result.animationPlan.skipSteps.length === 0) {
      applyPlacement();
      return;
    }

    schedulePlacementAnimation(
      result.animationPlan,
      setSkipAnimationCues,
      animationTimeoutIdsRef.current,
    );

    const completionDelayMs = getPlacementAnimationDuration(result.animationPlan.skipSteps);
    animationTimeoutIdsRef.current.push(window.setTimeout(applyPlacement, completionDelayMs));
  };

  const queueNextDraw = (
    divisionId: DivisionId,
    nextState: DivisionState,
    currentReservationMap: ReservationMap,
  ): void => {
    const queuedDraws = queuedDrawsRef.current[divisionId] ?? [];
    queuedDrawsRef.current[divisionId] = queuedDraws;
    const nextTeamId = queuedDraws.shift();

    if (nextTeamId === undefined) {
      return;
    }

    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        processDraw(divisionId, nextState, currentReservationMap, nextTeamId);
      }, 0),
    );
  };

  const handleDraw = (teamId: string): void => {
    if (isRemovalPending || isModalOpen) {
      return;
    }

    const currentState = divisionStates[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    if (isPlacementPending) {
      const pendingDraw = pendingDrawRef.current;
      const queuedDraws = queuedDrawsRef.current[activeDivisionId] ?? [];
      queuedDrawsRef.current[activeDivisionId] = queuedDraws;

      if (pendingDraw?.divisionId === activeDivisionId && pendingDraw.teamId === teamId) {
        return;
      }

      if (queuedDraws.includes(teamId)) {
        return;
      }

      queuedDraws.push(teamId);
      return;
    }

    processDraw(activeDivisionId, currentState, activeReservationMap, teamId);
  };

  const executeRemoval = (
    divisionId: DivisionId,
    currentState: DivisionState,
    teamId: string,
    placementKey: string,
  ): void => {
    setPendingRemovalConfirmation(null);

    stopPlacementAnimation(
      animationTimeoutIdsRef.current,
      setSkipAnimationCues,
      setIsPlacementPending,
    );
    queuedDrawsRef.current[divisionId] = [];
    pendingDrawRef.current = null;
    setConstraintFeed(null);
    setHighlightedPlacementKey(null);
    setAnimatedReservationKeys((currentKeys) => ({
      ...currentKeys,
      [divisionId]: [],
    }));
    setRemovingPlacementKey(placementKey);
    setIsRemovalPending(true);

    animationTimeoutIdsRef.current.push(
      window.setTimeout(() => {
        const removalResult = removeTeamById(currentState, teamId);

        if (!removalResult.ok) {
          setRemovingPlacementKey(null);
          setIsRemovalPending(false);
          return;
        }

        setDivisionStates((currentStates) => ({
          ...currentStates,
          [divisionId]: removalResult.updatedState,
        }));
        setVisibleReservations((currentReservations) => ({
          ...currentReservations,
          [divisionId]: buildReservationMap(removalResult.updatedState),
        }));
        setAnimatedReservationKeys((currentKeys) => ({
          ...currentKeys,
          [divisionId]: [],
        }));
        setRemovingPlacementKey(null);
        setIsRemovalPending(false);
      }, 450),
    );
  };

  const handleRemove = (teamId: string, placementKey: string, teamName: string): void => {
    if (isRemovalPending || isModalOpen) {
      return;
    }

    const currentState = divisionStates[activeDivisionId];

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

    executeRemoval(activeDivisionId, currentState, teamId, placementKey);
  };

  const handleReset = (): void => {
    const currentState = divisionStates[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    if (!window.confirm(`Reset ${currentState.config.name} and clear all current placements?`)) {
      return;
    }

    stopPlacementAnimation(
      animationTimeoutIdsRef.current,
      setSkipAnimationCues,
      setIsPlacementPending,
    );
    queuedDrawsRef.current[activeDivisionId] = [];
    pendingDrawRef.current = null;
    setIsRemovalPending(false);
    setRemovingPlacementKey(null);
    setPendingRemovalConfirmation(null);

    setDivisionStates((currentStates) => ({
      ...currentStates,
      [activeDivisionId]: resetDivisionState(currentState.config),
    }));
    setVisibleReservations((currentReservations) => ({
      ...currentReservations,
      [activeDivisionId]: {},
    }));
    setAnimatedReservationKeys((currentKeys) => ({
      ...currentKeys,
      [activeDivisionId]: [],
    }));
  };

  return (
    <div className="board-shell" style={divisionThemeStyles[activeDivisionId]}>
      <header className="hero-surface">
        <div className="hero-grid">
          <div className="min-w-0">
            <div className="eyebrow">European Quadball Cup 2026</div>
            <h1 className="hero-title">Group Draw Board</h1>
            <p className="hero-subtitle">Broadcast-first group draw control board.</p>
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
            <StatCard label="Division" value={activeState.config.shortName} />
            <StatCard
              label="Placed"
              value={`${placedTeamCount}/${activeState.config.teams.length}`}
            />
            <StatCard label="Progress" value={`${progress}%`} />
            <button
              className="reset-button"
              disabled={isPlacementPending || isRemovalPending || isModalOpen}
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
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
                canRemove={!isRemovalPending && !isModalOpen}
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
                disabled={isRemovalPending || isModalOpen}
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
            const currentState = divisionStates[confirmation.divisionId];

            if (currentState === undefined) {
              setPendingRemovalConfirmation(null);
              return;
            }

            executeRemoval(
              confirmation.divisionId,
              currentState,
              confirmation.teamId,
              confirmation.placementKey,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function stopPlacementAnimation(
  timeoutIds: number[],
  setSkipAnimationCues: Dispatch<SetStateAction<SkipAnimationCue[]>>,
  setIsPlacementPending: (value: boolean) => void,
): void {
  clearAnimationTimeouts(timeoutIds);
  setSkipAnimationCues([]);
  setIsPlacementPending(false);
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
