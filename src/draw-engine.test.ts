import { describe, expect, test } from "bun:test";

import { divisions } from "./data.ts";
import { createDivisionState, getSlotReservations, placeTeamById } from "./draw-engine.ts";
import type { DivisionConfig, SeedBracket, SlotReservation, Team } from "./types.ts";

function createTeam(id: string, seed: SeedBracket, ngb: string, name = id): Team {
  return {
    id,
    name,
    ngb,
    ranking: id,
    seed,
  };
}

function createDivisionConfig(
  teams: Team[],
  options?: {
    groupNames?: string[];
    duplicateAllowance?: DivisionConfig["duplicateAllowance"];
  },
): DivisionConfig {
  return {
    id: "test-division",
    name: "Test Division",
    shortName: "Test Division",
    groupNames: options?.groupNames ?? ["A", "B", "C"],
    duplicateAllowance: options?.duplicateAllowance,
    teams,
  };
}

describe("placeTeamById", () => {
  test("fills seed 1 groups in order", () => {
    const teams = [
      createTeam("alpha", "seed1", "Belgium", "Alpha"),
      createTeam("bravo", "seed1", "France", "Bravo"),
      createTeam("charlie", "seed1", "Spain", "Charlie"),
    ];
    const state = createDivisionState(createDivisionConfig(teams));

    const firstResult = placeTeamById(state, "alpha");
    const secondResult = placeTeamById(firstResult.updatedState, "bravo");
    const thirdResult = placeTeamById(secondResult.updatedState, "charlie");

    expect(firstResult.updatedState.groups[0]?.slots[0]?.name).toBe("Alpha");
    expect(secondResult.updatedState.groups[1]?.slots[0]?.name).toBe("Bravo");
    expect(thirdResult.updatedState.groups[2]?.slots[0]?.name).toBe("Charlie");
  });

  test("skips groups that already contain the same NGB", () => {
    const teams = [
      createTeam("seed-a", "seed1", "France", "Seed A"),
      createTeam("seed-b", "seed1", "Germany", "Seed B"),
      createTeam("seed-c", "seed1", "Spain", "Seed C"),
      createTeam("pick", "seed2", "France", "Pick"),
    ];
    let state = createDivisionState(createDivisionConfig(teams));

    state = placeTeamById(state, "seed-a").updatedState;
    state = placeTeamById(state, "seed-b").updatedState;
    state = placeTeamById(state, "seed-c").updatedState;

    const result = placeTeamById(state, "pick");

    expect(result.ok).toBe(true);
    expect(result.updatedState.groups[1]?.slots[1]?.name).toBe("Pick");
    expect(result.messages.join(" ")).toContain("Skipping Group A");
    expect(result.animationPlan?.skipSteps).toEqual([
      {
        kind: "ngb_limit",
        placement: { groupIndex: 0, slotIndex: 1 },
        conflictingSlotIndexes: [0],
        ngb: "France",
      },
    ]);
  });

  test("allows one German duplicate group when the pair rule is active", () => {
    const teams = [
      createTeam("seed-a", "seed1", "Germany", "Seed A"),
      createTeam("seed-b", "seed1", "France", "Seed B"),
      createTeam("seed-c", "seed1", "Spain", "Seed C"),
      createTeam("pick", "seed2", "Germany", "Pick"),
    ];
    let state = createDivisionState(
      createDivisionConfig(teams, {
        groupNames: ["A", "B", "C"],
        duplicateAllowance: {
          ngb: "Germany",
          requiredGroupsWithPair: 1,
          maxTeamsPerGroup: 2,
        },
      }),
    );

    state = placeTeamById(state, "seed-a").updatedState;
    state = placeTeamById(state, "seed-b").updatedState;
    state = placeTeamById(state, "seed-c").updatedState;

    const result = placeTeamById(state, "pick");

    expect(result.ok).toBe(true);
    expect(result.updatedState.groups[0]?.slots[1]?.name).toBe("Pick");
    expect(result.messages.join(" ")).toContain("duplicate pair");
  });

  test("uses forward-looking placement to preserve the only future slot", () => {
    const teams = [
      createTeam("seed-a", "seed1", "Belgium", "Seed A"),
      createTeam("seed-b", "seed1", "France", "Seed B"),
      createTeam("seed-c", "seed1", "Spain", "Seed C"),
      createTeam("seed-d", "seed2", "Germany", "Seed D"),
      createTeam("future-team", "seed2", "Spain", "Future Team"),
      createTeam("drawn-team", "seed2", "Belgium", "Drawn Team"),
    ];
    let state = createDivisionState(createDivisionConfig(teams));

    state = placeTeamById(state, "seed-a").updatedState;
    state = placeTeamById(state, "seed-b").updatedState;
    state = placeTeamById(state, "seed-c").updatedState;
    state = placeTeamById(state, "seed-d").updatedState;

    const result = placeTeamById(state, "drawn-team");

    expect(result.ok).toBe(true);
    expect(result.updatedState.groups[2]?.slots[1]?.name).toBe("Drawn Team");
    expect(result.messages.join(" ")).toContain("Spain");
    expect(result.animationPlan?.skipSteps).toEqual([
      {
        kind: "reserved",
        placement: { groupIndex: 1, slotIndex: 1 },
        reservedNgbs: ["Spain"],
      },
    ]);
    expect(getSlotReservations(result.updatedState)).toEqual([
      {
        groupIndex: 1,
        slotIndex: 1,
        reservedNgbs: ["Spain"],
      } satisfies SlotReservation,
    ]);
  });

  test("marks slots whose remaining valid candidates all share one NGB", () => {
    const division = divisions.find((entry) => entry.id === "division-1");

    if (division === undefined) {
      throw new Error("Missing Division 1 fixture.");
    }

    const drawOrder = [
      "Ghent Gargoyles",
      "Titans Paris",
      "Malaka Vikings",
      "Ruhr Phoenix",
      "Braunschweiger Broomicorns",
      "Werewolves of London Firsts",
      "Paris Frog",
      "Sagene IF 1",
      "Toulouse Minotaures",
      "Siena Ghibellines",
      "London QC",
      "Rheinos Bonn",
      "Vienna Vanguards",
      "BEL Flamingos",
    ] as const;

    let state = createDivisionState(division);

    for (const teamName of drawOrder) {
      const team = division.teams.find((entry) => entry.name === teamName);

      if (team === undefined) {
        throw new Error(`Missing fixture for ${teamName}.`);
      }

      const result = placeTeamById(state, team.id);

      if (!result.ok) {
        throw new Error(`Failed to place ${teamName}: ${result.messages.join(" | ")}`);
      }

      state = result.updatedState;
    }

    const metu = division.teams.find((entry) => entry.name === "METU Unicorns");

    if (metu === undefined) {
      throw new Error("Missing fixture for METU Unicorns.");
    }

    const result = placeTeamById(state, metu.id);

    expect(result.ok).toBe(true);
    expect(getSlotReservations(result.updatedState)).toEqual([
      {
        groupIndex: 0,
        slotIndex: 3,
        reservedNgbs: ["Germany"],
      } satisfies SlotReservation,
      {
        groupIndex: 1,
        slotIndex: 3,
        reservedNgbs: ["Germany"],
      } satisfies SlotReservation,
      {
        groupIndex: 3,
        slotIndex: 3,
        reservedNgbs: ["UK"],
      } satisfies SlotReservation,
    ]);
  });

  test("fills first unseeded slots across all groups before second unseeded slots", () => {
    const teams = [
      createTeam("alpha", "unseeded", "Belgium", "Alpha"),
      createTeam("bravo", "unseeded", "France", "Bravo"),
      createTeam("charlie", "unseeded", "Spain", "Charlie"),
      createTeam("delta", "unseeded", "Germany", "Delta"),
    ];
    let state = createDivisionState(createDivisionConfig(teams, { groupNames: ["A", "B", "C"] }));

    state = placeTeamById(state, "alpha").updatedState;
    state = placeTeamById(state, "bravo").updatedState;
    state = placeTeamById(state, "charlie").updatedState;

    const fourthResult = placeTeamById(state, "delta");

    expect(state.groups[0]?.slots[2]?.name).toBe("Alpha");
    expect(state.groups[1]?.slots[2]?.name).toBe("Bravo");
    expect(state.groups[2]?.slots[2]?.name).toBe("Charlie");
    expect(fourthResult.updatedState.groups[0]?.slots[3]?.name).toBe("Delta");
    expect(fourthResult.animationPlan).toBeUndefined();
  });

  test("does not report same-ngb skips from groups after the chosen placement", () => {
    const teams = [
      createTeam("seed-a", "seed1", "France", "Seed A"),
      createTeam("seed-b", "seed1", "Spain", "Seed B"),
      createTeam("seed-c", "seed1", "Germany", "Seed C"),
      createTeam("seed-d", "seed1", "UK", "Seed D"),
      createTeam("pick", "seed2", "UK", "Pick"),
    ];
    let state = createDivisionState(
      createDivisionConfig(teams, { groupNames: ["A", "B", "C", "D"] }),
    );

    state = placeTeamById(state, "seed-a").updatedState;
    state = placeTeamById(state, "seed-b").updatedState;
    state = placeTeamById(state, "seed-c").updatedState;
    state = placeTeamById(state, "seed-d").updatedState;

    const result = placeTeamById(state, "pick");

    expect(result.ok).toBe(true);
    expect(result.updatedState.groups[0]?.slots[1]?.name).toBe("Pick");
    expect(result.messages.join(" ")).not.toContain("Skipping Group D");
  });

  test("reports failure when no valid placement remains", () => {
    const teams = [
      createTeam("seed-a", "seed1", "Belgium", "Seed A"),
      createTeam("seed-b", "seed1", "France", "Seed B"),
      createTeam("seed-c", "seed2", "Germany", "Seed C"),
      createTeam("seed-d", "seed2", "Italy", "Seed D"),
      createTeam("broken", "seed2", "Belgium", "Broken Team"),
    ];
    let state = createDivisionState(createDivisionConfig(teams, { groupNames: ["A", "B"] }));

    state = placeTeamById(state, "seed-a").updatedState;
    state = placeTeamById(state, "seed-b").updatedState;
    state = placeTeamById(state, "seed-c").updatedState;
    state = placeTeamById(state, "seed-d").updatedState;

    const result = placeTeamById(state, "broken");

    expect(result.ok).toBe(false);
    expect(result.messages.join(" ")).toContain("No valid placement remains");
  });

  test("allows Ghent Gargoyles as the first real Division 1 draw", () => {
    const division = divisions.find((entry) => entry.id === "division-1");

    if (division === undefined) {
      throw new Error("Missing Division 1 fixture.");
    }

    const state = createDivisionState(division);
    const team = division.teams.find((entry) => entry.name === "Ghent Gargoyles");

    if (team === undefined) {
      throw new Error("Missing Ghent Gargoyles fixture.");
    }

    const result = placeTeamById(state, team.id);

    expect(result.ok).toBe(true);
    expect(result.updatedState.groups[0]?.slots[0]?.name).toBe("Ghent Gargoyles");
  });

  test("can complete a full real Division 1 draw", () => {
    const division = divisions.find((entry) => entry.id === "division-1");

    if (division === undefined) {
      throw new Error("Missing Division 1 fixture.");
    }

    const drawOrder = [
      "Ghent Gargoyles",
      "Ruhr Phoenix",
      "Braunschweiger Broomicorns",
      "Titans Paris",
      "Werewolves of London Firsts",
      "Malaka Vikings",
      "London QC",
      "Paris Frog",
      "Toulouse Minotaures",
      "Rheinos Bonn",
      "Sagene IF 1",
      "Siena Ghibellines",
      "Buckbeak Riders",
      "Heidelberger HellHounds",
      "Velociraptors QC",
      "BEL Flamingos",
      "Werewolves of London Seconds",
      "Vienna Vanguards",
      "METU Unicorns",
      "Hacettepe Pegasus",
      "Darmstadt Athenas",
      "SCC Berlin Bluecaps Sky",
      "Münster Marauders",
      "Kraków Dragons",
    ] as const;

    let state = createDivisionState(division);

    for (const teamName of drawOrder) {
      const team = division.teams.find((entry) => entry.name === teamName);

      if (team === undefined) {
        throw new Error(`Missing fixture for ${teamName}.`);
      }

      const result = placeTeamById(state, team.id);

      expect(result.ok).toBe(true);
      state = result.updatedState;
    }

    expect(state.placedTeamIds.size).toBe(division.teams.length);
    const groupsWithGermanPair = state.groups.filter(
      (group) => group.slots.filter((team) => team?.ngb === "Germany").length === 2,
    );

    expect(groupsWithGermanPair).toHaveLength(1);
  });
});
