import type { PlacementAnimationStep } from "./types.ts";

const CUE_STAGGER_MS = 500;
const NGB_EXISTING_DISPLAY_MS = 1500;
const NGB_TARGET_DISPLAY_MS = 2100;
const RESERVED_DISPLAY_MS = 2400;

export type SkipAnimationCue =
  | {
      kind: "ngb_existing";
      groupIndex: number;
      slotIndexes: number[];
      ngb: string;
    }
  | {
      kind: "ngb_target";
      groupIndex: number;
      slotIndex: number;
      ngb: string;
    }
  | {
      kind: "reserved_target";
      groupIndex: number;
      slotIndex: number;
      reservedNgbs: string[];
    };

export interface ScheduledSkipCue {
  atMs: number;
  durationMs: number;
  cue: SkipAnimationCue;
}

export function buildScheduledSkipCues(skipSteps: PlacementAnimationStep[]): ScheduledSkipCue[] {
  const scheduledCues: ScheduledSkipCue[] = [];
  let offsetMs = 0;

  for (const step of skipSteps) {
    if (step.kind === "ngb_limit") {
      scheduledCues.push({
        atMs: offsetMs,
        durationMs: NGB_EXISTING_DISPLAY_MS,
        cue: {
          kind: "ngb_existing",
          groupIndex: step.placement.groupIndex,
          slotIndexes: step.conflictingSlotIndexes,
          ngb: step.ngb,
        },
      });
      offsetMs += CUE_STAGGER_MS;
      scheduledCues.push({
        atMs: offsetMs,
        durationMs: NGB_TARGET_DISPLAY_MS,
        cue: {
          kind: "ngb_target",
          groupIndex: step.placement.groupIndex,
          slotIndex: step.placement.slotIndex,
          ngb: step.ngb,
        },
      });
      offsetMs += CUE_STAGGER_MS;
      continue;
    }

    scheduledCues.push({
      atMs: offsetMs,
      durationMs: RESERVED_DISPLAY_MS,
      cue: {
        kind: "reserved_target",
        groupIndex: step.placement.groupIndex,
        slotIndex: step.placement.slotIndex,
        reservedNgbs: step.reservedNgbs,
      },
    });
    offsetMs += CUE_STAGGER_MS;
  }

  return scheduledCues;
}

export function getPlacementAnimationDuration(skipSteps: PlacementAnimationStep[]): number {
  return buildScheduledSkipCues(skipSteps).reduce(
    (endMs, scheduledCue) => Math.max(endMs, scheduledCue.atMs + scheduledCue.durationMs),
    0,
  );
}

export function clearAnimationTimeouts(timeoutIds: number[]): void {
  for (const timeoutId of timeoutIds) {
    window.clearTimeout(timeoutId);
  }

  timeoutIds.length = 0;
}
