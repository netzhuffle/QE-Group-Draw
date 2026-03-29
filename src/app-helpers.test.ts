import { describe, expect, test } from "bun:test";

import {
  buildConstraintFeed,
  findTargetCue,
  findPlacementKey,
  getSlotRowClasses,
  groupTeamsBySeed,
  matchesExistingCue,
  matchesTargetCue,
} from "./app-helpers.ts";
import type { DivisionState, Team } from "./types.ts";

function createTeam(id: string, seed: Team["seed"], ngb: string): Team {
  return {
    id,
    name: id,
    ngb,
    ranking: id,
    seed,
  };
}

describe("app helpers", () => {
  test("groups teams by seed bracket", () => {
    const seed1Team = createTeam("a", "seed1", "Belgium");
    const seed2Team = createTeam("b", "seed2", "France");
    const unseededTeam = createTeam("c", "unseeded", "Spain");
    const teams = [seed1Team, seed2Team, unseededTeam];

    expect(groupTeamsBySeed(teams)).toEqual({
      seed1: [seed1Team],
      seed2: [seed2Team],
      unseeded: [unseededTeam],
    });
  });

  test("builds constraint feed only from non-placement notes", () => {
    expect(
      buildConstraintFeed([
        "Skipping Group A for Team because France is already represented there.",
        "Team joins Group B in Seed 2.",
      ]),
    ).toEqual({
      id: expect.any(Number),
      messages: ["Skipping Group A for Team because France is already represented there."],
    });

    expect(buildConstraintFeed(["Team joins Group B in Seed 2."])).toBeNull();
  });

  test("matches existing and target skip cues correctly", () => {
    expect(
      matchesExistingCue(
        [{ kind: "ngb_existing", groupIndex: 2, slotIndexes: [0, 2], ngb: "Germany" }],
        2,
        2,
      ),
    ).toBe(true);
    expect(
      matchesTargetCue(
        [{ kind: "reserved_target", groupIndex: 1, slotIndex: 3, reservedNgbs: ["UK"] }],
        1,
        3,
      ),
    ).toBe(true);
    expect(
      matchesTargetCue([{ kind: "ngb_target", groupIndex: 1, slotIndex: 3, ngb: "UK" }], 1, 2),
    ).toBe(false);
    expect(
      findTargetCue(
        [
          { kind: "ngb_existing", groupIndex: 2, slotIndexes: [0], ngb: "Germany" },
          { kind: "ngb_target", groupIndex: 2, slotIndex: 1, ngb: "Germany" },
        ],
        2,
        1,
      ),
    ).toEqual({ kind: "ngb_target", groupIndex: 2, slotIndex: 1, ngb: "Germany" });
  });

  test("builds slot row class list", () => {
    expect(getSlotRowClasses("seed2", true, false, true, false)).toBe(
      "slot-row slot-row--seed2 slot-row--empty slot-row--cue-existing",
    );
  });

  test("finds the newly placed slot key", () => {
    const previousState: DivisionState = {
      config: {
        id: "division",
        name: "Division",
        shortName: "Division",
        groupNames: ["A", "B"],
        teams: [],
      },
      groups: [
        { name: "A", slots: [null, null, null, null] },
        { name: "B", slots: [null, null, null, null] },
      ],
      placedTeamIds: new Set(),
      messages: [],
    };
    const nextState: DivisionState = {
      ...previousState,
      groups: [
        { name: "A", slots: [createTeam("alpha", "seed1", "Belgium"), null, null, null] },
        { name: "B", slots: [null, null, null, null] },
      ],
    };

    expect(findPlacementKey(previousState, nextState, "alpha")).toBe("A-0");
  });
});
