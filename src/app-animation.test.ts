import { describe, expect, test } from "bun:test";

import { buildScheduledSkipCues, getPlacementAnimationDuration } from "./app-animation.ts";
import type { PlacementAnimationStep } from "./types.ts";

describe("app animation helpers", () => {
  test("builds staged cues for ngb-limit and reserved skips", () => {
    const skipSteps: PlacementAnimationStep[] = [
      {
        kind: "ngb_limit",
        placement: { groupIndex: 0, slotIndex: 1 },
        conflictingSlotIndexes: [0],
        ngb: "France",
      },
      {
        kind: "reserved",
        placement: { groupIndex: 1, slotIndex: 1 },
        reservedNgbs: ["Spain"],
      },
    ];

    expect(buildScheduledSkipCues(skipSteps)).toEqual([
      {
        atMs: 0,
        durationMs: 1500,
        cue: {
          kind: "ngb_existing",
          groupIndex: 0,
          slotIndexes: [0],
          ngb: "France",
        },
      },
      {
        atMs: 500,
        durationMs: 2100,
        cue: {
          kind: "ngb_target",
          groupIndex: 0,
          slotIndex: 1,
          ngb: "France",
        },
      },
      {
        atMs: 1000,
        durationMs: 2400,
        cue: {
          kind: "reserved_target",
          groupIndex: 1,
          slotIndex: 1,
          reservedNgbs: ["Spain"],
        },
      },
    ]);
  });

  test("sums placement animation duration by skip kind", () => {
    const skipSteps: PlacementAnimationStep[] = [
      {
        kind: "ngb_limit",
        placement: { groupIndex: 0, slotIndex: 1 },
        conflictingSlotIndexes: [0],
        ngb: "France",
      },
      {
        kind: "reserved",
        placement: { groupIndex: 1, slotIndex: 1 },
        reservedNgbs: ["Spain", "UK"],
      },
    ];

    expect(getPlacementAnimationDuration(skipSteps)).toBe(3400);
  });
});
