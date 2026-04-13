import type { SkipAnimationCue } from "./app-animation.ts";
import type { DivisionState, GroupState, SeedBracket, Team } from "./types.ts";

export interface ConstraintFeedState {
  id: number;
  messages: string[];
}

export interface NoteTextSegment {
  key: string;
  text: string;
  emphasized: boolean;
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

export function buildNoteTextSegments(message: string): NoteTextSegment[] {
  const emphasisRanges: Array<{ start: number; end: number }> = [];
  const addRange = (start: number, end: number): void => {
    if (start >= end) {
      return;
    }

    emphasisRanges.push({ start, end });
  };

  for (const match of message.matchAll(/Group [A-Z]/g)) {
    if (match.index !== undefined) {
      addRange(match.index, match.index + match[0].length);
    }
  }

  for (const match of message.matchAll(/because (.+?) is already represented there\./g)) {
    if (match.index !== undefined && match[1] !== undefined) {
      const start = match.index + "because ".length;
      addRange(start, start + match[1].length);
    }
  }

  for (const match of message.matchAll(/preserving a future slot for (.+?)(?=;|,|$)/g)) {
    if (match.index !== undefined && match[1] !== undefined) {
      const start = match.index + "preserving a future slot for ".length;
      addRange(start, start + match[1].length);
    }
  }

  for (const match of message.matchAll(/^(.+?) may form exactly one duplicate pair/g)) {
    if (match.index !== undefined && match[1] !== undefined) {
      addRange(match.index, match.index + match[1].length);
    }
  }

  if (emphasisRanges.length === 0) {
    return [{ key: "0-full", text: message, emphasized: false }];
  }

  const mergedRanges = emphasisRanges
    .toSorted((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((ranges, range) => {
      const previousRange = ranges.at(-1);

      if (previousRange === undefined || range.start > previousRange.end) {
        ranges.push({ ...range });
        return ranges;
      }

      previousRange.end = Math.max(previousRange.end, range.end);
      return ranges;
    }, []);

  const segments: NoteTextSegment[] = [];
  let cursor = 0;

  for (const range of mergedRanges) {
    if (cursor < range.start) {
      segments.push({
        key: `${cursor}-${range.start}-plain`,
        text: message.slice(cursor, range.start),
        emphasized: false,
      });
    }

    segments.push({
      key: `${range.start}-${range.end}-strong`,
      text: message.slice(range.start, range.end),
      emphasized: true,
    });
    cursor = range.end;
  }

  if (cursor < message.length) {
    segments.push({
      key: `${cursor}-${message.length}-plain`,
      text: message.slice(cursor),
      emphasized: false,
    });
  }

  return segments;
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
  isRemoving: boolean,
  isCueExisting: boolean,
  isCueTarget: boolean,
): string {
  return [
    "slot-row",
    `slot-row--${slotTone}`,
    isEmpty ? "slot-row--empty" : "",
    isPlacedHighlight ? "slot-row--placed" : "",
    isRemoving ? "slot-row--removing" : "",
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

  const hasOpenSpot = state.config.teams.some(
    (team) => team.name === "OPEN SPOT" || team.ngb === "UNKNOWN",
  );

  return hasOpenSpot
    ? `Exactly 1 ${rule.ngb} pair required. Other NGBs may not double up. 1 open spot could add another pair.`
    : `Exactly 1 ${rule.ngb} pair required. Other NGBs may not double up.`;
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
