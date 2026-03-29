import type { SkipAnimationCue } from "./app-animation.ts";
import type { DivisionState, GroupState, SeedBracket, Team } from "./types.ts";

export interface ConstraintFeedState {
  id: number;
  messages: string[];
}

export function groupTeamsBySeed(teams: Team[]): Record<SeedBracket, Team[]> {
  const grouped: Record<SeedBracket, Team[]> = {
    seed1: [],
    seed2: [],
    unseeded: [],
  };

  for (const team of teams) {
    grouped[team.seed].push(team);
  }

  return grouped;
}

export function buildConstraintFeed(messages: string[]): ConstraintFeedState | null {
  const placementNotes = messages.filter((message) => !message.includes(" joins Group "));

  return placementNotes.length > 0 ? { id: Date.now(), messages: placementNotes } : null;
}

export function matchesExistingCue(
  cues: SkipAnimationCue[],
  groupIndex: number,
  slotIndex: number,
): boolean {
  return cues.some(
    (cue) =>
      cue.kind === "ngb_existing" &&
      cue.groupIndex === groupIndex &&
      cue.slotIndexes.includes(slotIndex),
  );
}

export function matchesTargetCue(
  cues: SkipAnimationCue[],
  groupIndex: number,
  slotIndex: number,
): boolean {
  return cues.some(
    (cue) =>
      (cue.kind === "ngb_target" || cue.kind === "reserved_target") &&
      cue.groupIndex === groupIndex &&
      cue.slotIndex === slotIndex,
  );
}

export function findTargetCue(
  cues: SkipAnimationCue[],
  groupIndex: number,
  slotIndex: number,
): SkipAnimationCue | null {
  for (let index = cues.length - 1; index >= 0; index -= 1) {
    const cue = cues[index];

    if (cue === undefined) {
      continue;
    }

    if (
      (cue.kind === "ngb_target" || cue.kind === "reserved_target") &&
      cue.groupIndex === groupIndex &&
      cue.slotIndex === slotIndex
    ) {
      return cue;
    }
  }

  return null;
}

export function getSlotRowClasses(
  slotTone: SeedBracket,
  isEmpty: boolean,
  isPlacedHighlight: boolean,
  isCueExisting: boolean,
  isCueTarget: boolean,
): string {
  return [
    "slot-row",
    `slot-row--${slotTone}`,
    isEmpty ? "slot-row--empty" : "",
    isPlacedHighlight ? "slot-row--placed" : "",
    isCueExisting ? "slot-row--cue-existing" : "",
    isCueTarget ? "slot-row--cue-target" : "",
  ]
    .filter((className) => className.length > 0)
    .join(" ");
}

export function getDivisionRuleSummary(state: DivisionState): string {
  const rule = state.config.duplicateAllowance;

  if (rule === undefined) {
    return "No group may contain two teams from the same NGB.";
  }

  return `Exactly one group in ${state.config.shortName} must finish with two ${rule.ngb} teams. All other same-NGB clashes are still skipped.`;
}

export function getPoolRuleChip(state: DivisionState): string {
  const rule = state.config.duplicateAllowance;

  if (rule === undefined) {
    return "No duplicate NGBs";
  }

  return `${rule.ngb}: 1 pair required`;
}

export function findPlacementKey(
  previousState: DivisionState,
  nextState: DivisionState,
  teamId: string,
): string | null {
  for (const [groupIndex, group] of nextState.groups.entries()) {
    const previousGroup = previousState.groups[groupIndex];

    for (const [slotIndex, team] of group.slots.entries()) {
      if (team?.id !== teamId) {
        continue;
      }

      if (previousGroup?.slots[slotIndex]?.id !== teamId) {
        return `${group.name}-${slotIndex}`;
      }
    }
  }

  return null;
}

export function getPlacedCount(group: GroupState): number {
  return group.slots.filter((slot) => slot !== null).length;
}
