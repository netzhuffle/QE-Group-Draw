import { describe, expect, test } from "bun:test";

import {
  buildConstraintFeed,
  buildNoteTextSegments,
  findTargetCue,
  findPlacementKey,
  getDivisionRuleSummary,
  getSlotRowClasses,
  groupTeamsBySeed,
  isNewestPlacedTeam,
  matchesExistingCue,
  matchesTargetCue,
} from "./app-helpers.ts";
import type { DivisionState, Team } from "./types.ts";

function createTeam(id: string, seed: Team["seed"], ngb: string, name = id): Team {
  return {
    id,
    name,
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

  test("builds emphasized note segments for groups and NGBs", () => {
    expect(
      buildNoteTextSegments(
        "Skipping Group B for Toulouse Minotaures because France is already represented there.",
      ),
    ).toMatchObject([
      { text: "Skipping ", emphasized: false },
      { text: "Group B", emphasized: true },
      { text: " for Toulouse Minotaures because ", emphasized: false },
      { text: "France", emphasized: true },
      { text: " is already represented there.", emphasized: false },
    ]);

    expect(
      buildNoteTextSegments(
        "Skipping Group C for Team, preserving a future slot for UK; placing them in Group D instead.",
      ),
    ).toMatchObject([
      { text: "Skipping ", emphasized: false },
      { text: "Group C", emphasized: true },
      { text: " for Team, preserving a future slot for ", emphasized: false },
      { text: "UK", emphasized: true },
      { text: "; placing them in ", emphasized: false },
      { text: "Group D", emphasized: true },
      { text: " instead.", emphasized: false },
    ]);
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
    expect(getSlotRowClasses("seed2", true, false, false, true, false)).toBe(
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
      drawOrder: [],
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

  test("builds division rule summary for pair rule divisions", () => {
    const state: DivisionState = {
      config: {
        id: "division-1",
        name: "Division 1",
        shortName: "Division 1",
        groupNames: ["A", "B"],
        duplicateAllowance: {
          ngb: "Germany",
          requiredGroupsWithPair: 2,
          maxTeamsPerGroup: 2,
        },
        teams: [
          createTeam("alpha", "seed1", "Belgium"),
          createTeam("stuttgart", "unseeded", "Germany", "Smoking Cauldron Stuttgart"),
        ],
      },
      groups: [
        { name: "A", slots: [null, null, null, null] },
        { name: "B", slots: [null, null, null, null] },
      ],
      placedTeamIds: new Set(),
      drawOrder: [],
      messages: [],
    };

    expect(getDivisionRuleSummary(state)).toBe(
      "Exactly 2 Germany pairs required. Other NGBs may not double up.",
    );
  });

  test("detects whether a placed team is the newest draw", () => {
    const state: DivisionState = {
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
      placedTeamIds: new Set(["alpha", "bravo"]),
      drawOrder: ["alpha", "bravo"],
      messages: [],
    };

    expect(isNewestPlacedTeam(state, "bravo")).toBe(true);
    expect(isNewestPlacedTeam(state, "alpha")).toBe(false);
    expect(isNewestPlacedTeam(state, "charlie")).toBe(false);
  });
});
