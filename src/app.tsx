import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, ReactElement, SetStateAction } from "react";

import {
  buildScheduledSkipCues,
  clearAnimationTimeouts,
  getPlacementAnimationDuration,
  type SkipAnimationCue,
} from "./app-animation.ts";
import { getFlag, getFlagModifierClass } from "./app-flags.ts";
import {
  buildConstraintFeed,
  findTargetCue,
  findPlacementKey,
  getDivisionRuleSummary,
  getPlacedCount,
  getPoolRuleChip,
  getSlotRowClasses,
  groupTeamsBySeed,
  matchesExistingCue,
  matchesTargetCue,
  type ConstraintFeedState,
} from "./app-helpers.ts";
import { divisions, seedBracketLabels } from "./data.ts";
import {
  createDivisionState,
  getUndrawnTeams,
  placeTeamById,
  resetDivisionState,
} from "./draw-engine.ts";
import type {
  DivisionState,
  GroupState,
  PlacementAnimationPlan,
  SeedBracket,
  Team,
} from "./types.ts";

const seedBracketOrder: SeedBracket[] = ["seed1", "seed2", "unseeded"];
const slotLabels = ["Seed 1", "Seed 2", "Unseeded", "Unseeded"] as const;

type DivisionId = (typeof divisions)[number]["id"];

type DivisionStateRecord = Record<DivisionId, DivisionState>;
type ThemeVariable =
  | "--primary"
  | "--primary-strong"
  | "--primary-soft"
  | "--primary-muted"
  | "--support-soft"
  | "--page-glow"
  | "--page-glow-soft"
  | "--panel-border"
  | "--group-tint"
  | "--rail-tint"
  | "--seed1-bg"
  | "--seed2-bg"
  | "--unseeded-bg"
  | "--seed1-pill"
  | "--seed2-pill"
  | "--unseeded-pill";
type ThemeStyle = CSSProperties & Record<ThemeVariable, string>;

const divisionThemeStyles: Record<DivisionId, ThemeStyle> = {
  "division-1": {
    "--primary": "oklch(0.58 0.23 255)",
    "--primary-strong": "oklch(0.5 0.24 252)",
    "--primary-soft": "oklch(0.9 0.07 248)",
    "--primary-muted": "oklch(0.78 0.12 248)",
    "--support-soft": "oklch(0.94 0.06 20)",
    "--page-glow": "oklch(0.79 0.15 248 / 0.38)",
    "--page-glow-soft": "oklch(0.86 0.09 20 / 0.22)",
    "--panel-border": "oklch(0.8 0.07 248)",
    "--group-tint": "oklch(0.95 0.05 248 / 0.97)",
    "--rail-tint": "oklch(0.96 0.04 248 / 0.98)",
    "--seed1-bg": "oklch(0.9 0.08 248)",
    "--seed2-bg": "oklch(0.91 0.06 286)",
    "--unseeded-bg": "oklch(0.93 0.06 38)",
    "--seed1-pill": "oklch(0.5 0.24 252)",
    "--seed2-pill": "oklch(0.48 0.16 286)",
    "--unseeded-pill": "oklch(0.56 0.15 36)",
  },
  "division-2": {
    "--primary": "oklch(0.6 0.24 26)",
    "--primary-strong": "oklch(0.52 0.24 24)",
    "--primary-soft": "oklch(0.92 0.07 24)",
    "--primary-muted": "oklch(0.8 0.12 24)",
    "--support-soft": "oklch(0.93 0.05 250)",
    "--page-glow": "oklch(0.82 0.15 24 / 0.36)",
    "--page-glow-soft": "oklch(0.85 0.09 250 / 0.2)",
    "--panel-border": "oklch(0.82 0.08 24)",
    "--group-tint": "oklch(0.96 0.05 24 / 0.97)",
    "--rail-tint": "oklch(0.965 0.04 24 / 0.98)",
    "--seed1-bg": "oklch(0.91 0.08 24)",
    "--seed2-bg": "oklch(0.91 0.06 350)",
    "--unseeded-bg": "oklch(0.92 0.05 290)",
    "--seed1-pill": "oklch(0.52 0.24 24)",
    "--seed2-pill": "oklch(0.5 0.17 350)",
    "--unseeded-pill": "oklch(0.49 0.15 290)",
  },
};

const divisionTabClasses: Record<DivisionId, string> = {
  "division-1": "tab-button tab-button--blue",
  "division-2": "tab-button tab-button--red",
};

export function App(): ReactElement {
  const [divisionStates, setDivisionStates] = useState<DivisionStateRecord>(
    () =>
      Object.fromEntries(
        divisions.map((division) => [division.id, createDivisionState(division)]),
      ) as DivisionStateRecord,
  );
  const [activeDivisionId, setActiveDivisionId] = useState<DivisionId>(
    divisions[0]?.id ?? "division-1",
  );
  const [highlightedPlacementKey, setHighlightedPlacementKey] = useState<string | null>(null);
  const [skipAnimationCues, setSkipAnimationCues] = useState<SkipAnimationCue[]>([]);
  const [constraintFeed, setConstraintFeed] = useState<ConstraintFeedState | null>(null);
  const [isPlacementAnimating, setIsPlacementAnimating] = useState(false);
  const animationTimeoutIdsRef = useRef<number[]>([]);
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
  const teamsBySeed = groupTeamsBySeed(undrawnTeams);

  useEffect(() => {
    if (constraintFeed === null) {
      return;
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

  const handleDraw = (teamId: string): void => {
    if (isPlacementAnimating) {
      return;
    }

    const currentState = divisionStates[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    stopPlacementAnimation(
      animationTimeoutIdsRef.current,
      setSkipAnimationCues,
      setIsPlacementAnimating,
    );

    const result = placeTeamById(currentState, teamId);
    setConstraintFeed(buildConstraintFeed(result.messages));

    if (!result.ok || result.updatedState === currentState) {
      setHighlightedPlacementKey(null);
      return;
    }

    const placementKey = findPlacementKey(currentState, result.updatedState, teamId);
    setHighlightedPlacementKey(null);
    const applyPlacement = (): void => {
      setDivisionStates((currentStates) => ({
        ...currentStates,
        [activeDivisionId]: result.updatedState,
      }));
      setHighlightedPlacementKey(placementKey);
      stopPlacementAnimation(
        animationTimeoutIdsRef.current,
        setSkipAnimationCues,
        setIsPlacementAnimating,
      );
    };

    if (result.animationPlan === undefined || result.animationPlan.skipSteps.length === 0) {
      applyPlacement();
      return;
    }

    setIsPlacementAnimating(true);
    schedulePlacementAnimation(
      result.animationPlan,
      setSkipAnimationCues,
      animationTimeoutIdsRef.current,
    );

    const completionDelayMs = getPlacementAnimationDuration(result.animationPlan.skipSteps);
    animationTimeoutIdsRef.current.push(window.setTimeout(applyPlacement, completionDelayMs));
  };

  const handleReset = (): void => {
    const currentState = divisionStates[activeDivisionId];

    if (currentState === undefined) {
      return;
    }

    if (!window.confirm(`Reset ${currentState.config.name} and clear all current placements?`)) {
      return;
    }

    setDivisionStates((currentStates) => ({
      ...currentStates,
      [activeDivisionId]: resetDivisionState(currentState.config),
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
                  disabled={isPlacementAnimating}
                  type="button"
                  onClick={() => setActiveDivisionId(division.id)}
                >
                  {division.name}
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
              disabled={isPlacementAnimating}
              type="button"
              onClick={handleReset}
            >
              Reset
            </button>
          </div>
        </div>

        <div className={`note-strip${constraintFeed !== null ? " note-strip--constraint" : ""}`}>
          <span className="note-pill">{noteLabel}</span>
          <p className="note-strip__text min-w-0 truncate">{noteMessage}</p>
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
                skipAnimationCues={skipAnimationCues}
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

          <div className="chip-row">
            <span className="rule-chip">A to F order</span>
            <span className="rule-chip">Seeded slots locked</span>
            <span className="rule-chip">Future-safe draw</span>
            <span className="rule-chip rule-chip--accent">{getPoolRuleChip(activeState)}</span>
          </div>

          <div className="rail-scroll">
            {seedBracketOrder.map((seedBracket) => (
              <SeedSection
                key={seedBracket}
                disabled={isPlacementAnimating}
                seedBracket={seedBracket}
                teams={teamsBySeed[seedBracket]}
                onDraw={handleDraw}
              />
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function StatCard(props: { label: string; value: string }): ReactElement {
  return (
    <div className="stat-card">
      <span className="stat-label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function GroupCard(props: {
  groupIndex: number;
  group: GroupState;
  highlightedPlacementKey: string | null;
  skipAnimationCues: SkipAnimationCue[];
}): ReactElement {
  const placedCount = getPlacedCount(props.group);

  return (
    <section className="group-card">
      <header className="group-card__header">
        <h3 className="group-card__letter">{props.group.name}</h3>
        <span className="group-card__count">{placedCount}/4</span>
      </header>

      <ol className="slot-list">
        {props.group.slots.map((slot, slotIndex) => {
          const slotTone = slotIndex === 0 ? "seed1" : slotIndex === 1 ? "seed2" : "unseeded";
          const label = slotLabels[slotIndex] ?? "Open";
          const slotKey = `${props.group.name}-${slotIndex}`;
          const isPlacedHighlight = props.highlightedPlacementKey === slotKey;
          const isCueExisting = matchesExistingCue(
            props.skipAnimationCues,
            props.groupIndex,
            slotIndex,
          );
          const isCueTarget = matchesTargetCue(
            props.skipAnimationCues,
            props.groupIndex,
            slotIndex,
          );
          const slotClasses = getSlotRowClasses(
            slotTone,
            slot === null,
            isPlacedHighlight,
            isCueExisting,
            isCueTarget,
          );

          return (
            <li className={slotClasses} key={slotKey}>
              {slot === null ? (
                <>
                  <span className={`slot-pill slot-pill--${slotTone}`}>{label}</span>
                  {renderSlotCuePreview(props.skipAnimationCues, props.groupIndex, slotIndex)}
                </>
              ) : (
                <div className="slot-team" title={`${slot.name} (${slot.ngb})`}>
                  <span
                    aria-label={slot.ngb}
                    className={`slot-flag${getFlagModifierClass(slot.ngb)}${isCueExisting ? " slot-flag--focus" : ""}`}
                  >
                    {getFlag(slot.ngb)}
                  </span>
                  <strong className="truncate text-[0.8rem] leading-tight font-bold text-slate-900">
                    {slot.name}
                  </strong>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SeedSection(props: {
  disabled: boolean;
  seedBracket: SeedBracket;
  teams: Team[];
  onDraw: (teamId: string) => void;
}): ReactElement {
  return (
    <section className={`seed-section seed-section--${props.seedBracket}`}>
      <div className="seed-header">
        <div>
          <h3 className="text-[1.1rem] leading-none font-black tracking-[-0.03em] text-slate-900">
            {seedBracketLabels[props.seedBracket]}
          </h3>
          <span className="mt-1 block text-[0.68rem] font-semibold text-slate-500">
            {props.teams.length} left
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {props.teams.length === 0 ? (
          <div className="empty-state">
            All {seedBracketLabels[props.seedBracket]} teams are placed.
          </div>
        ) : (
          props.teams.map((team) => (
            <button
              className={`team-button team-button--${props.seedBracket}`}
              disabled={props.disabled}
              key={team.id}
              title={team.name}
              type="button"
              onClick={() => props.onDraw(team.id)}
            >
              <span aria-label={team.ngb} className={`flag-badge${getFlagModifierClass(team.ngb)}`}>
                {getFlag(team.ngb)}
              </span>
              <span className="min-w-0 truncate text-[0.82rem] font-bold text-slate-900">
                {team.name}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function stopPlacementAnimation(
  timeoutIds: number[],
  setSkipAnimationCues: Dispatch<SetStateAction<SkipAnimationCue[]>>,
  setIsPlacementAnimating: (value: boolean) => void,
): void {
  clearAnimationTimeouts(timeoutIds);
  setSkipAnimationCues([]);
  setIsPlacementAnimating(false);
}

function renderSlotCuePreview(
  cues: SkipAnimationCue[],
  groupIndex: number,
  slotIndex: number,
): ReactElement | null {
  const cue = findTargetCue(cues, groupIndex, slotIndex);

  if (cue === null) {
    return null;
  }

  if (cue.kind === "ngb_target" && cue.groupIndex === groupIndex && cue.slotIndex === slotIndex) {
    return (
      <span className="slot-cue slot-cue--blocked" title={`${cue.ngb} blocked here`}>
        <span
          aria-label={cue.ngb}
          className={`slot-flag slot-cue__flag${getFlagModifierClass(cue.ngb)}`}
        >
          {getFlag(cue.ngb)}
        </span>
        <span aria-hidden="true" className="slot-cue__forbidden">
          ⊘
        </span>
      </span>
    );
  }

  if (
    cue.kind === "reserved_target" &&
    cue.groupIndex === groupIndex &&
    cue.slotIndex === slotIndex
  ) {
    return (
      <span
        className="slot-cue slot-cue--reserved"
        title={`Reserved for ${cue.reservedNgbs.join(", ")}`}
      >
        {cue.reservedNgbs.map((ngb) => (
          <span
            aria-label={ngb}
            className={`slot-flag slot-cue__flag${getFlagModifierClass(ngb)}`}
            key={ngb}
          >
            {getFlag(ngb)}
          </span>
        ))}
      </span>
    );
  }

  return null;
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

  const clearAtMs = getPlacementAnimationDuration(animationPlan.skipSteps);
  timeoutIds.push(window.setTimeout(() => setSkipAnimationCues([]), clearAtMs));
}
