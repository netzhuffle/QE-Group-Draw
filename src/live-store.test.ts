import { describe, expect, test } from "bun:test";

import {
  createInitialLiveSnapshot,
  applyLiveCommand,
  restoreDivisionStates,
} from "./live-store.ts";

describe("live store", () => {
  test("creates an initial snapshot for both divisions", () => {
    const snapshot = createInitialLiveSnapshot();

    expect(snapshot.version).toBe(0);
    expect(Object.keys(snapshot.divisions)).toEqual(["division-1", "division-2"]);
    expect(snapshot.divisions["division-1"]?.drawOrder).toEqual([]);
    expect(snapshot.divisions["division-2"]?.drawOrder).toEqual([]);
  });

  test("applies a draw and stores the resulting replayable state", () => {
    const initial = createInitialLiveSnapshot();
    const result = applyLiveCommand(initial, {
      kind: "draw",
      divisionId: "division-1",
      teamId: "division-1-1-ghent-gargoyles",
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.lastMutation?.kind).toBe("placed");
    expect(result.snapshot.lastMutation?.divisionId).toBe("division-1");
    expect(result.snapshot.divisions["division-1"]?.drawOrder).toEqual([
      "division-1-1-ghent-gargoyles",
    ]);

    const restoredStates = restoreDivisionStates(result.snapshot);
    expect(restoredStates["division-1"]?.groups[0]?.slots[0]?.name).toBe("Ghent Gargoyles");
  });

  test("stores strategic reservations created by a draw", () => {
    let snapshot = createInitialLiveSnapshot();

    for (const teamId of [
      "division-1-1-ghent-gargoyles",
      "division-1-1-ruhr-phoenix",
      "division-1-1-braunschweiger-broomicorns",
      "division-1-1-titans-paris",
      "division-1-1-werewolves-of-london-firsts",
      "division-1-1-malaka-vikings",
      "division-1-2-london-qc",
      "division-1-2-paris-frog",
      "division-1-2-rheinos-bonn",
      "division-1-2-toulouse-minotaures",
      "division-1-2-sagene-if-1",
      "division-1-2-siena-ghibellines",
      "division-1-unseeded-bel-flamingos",
      "division-1-unseeded-heidelberger-hellhounds",
      "division-1-unseeded-vienna-vanguards",
      "division-1-unseeded-metu-unicorns",
    ]) {
      const result = applyLiveCommand(snapshot, {
        kind: "draw",
        divisionId: "division-1",
        teamId,
      });

      expect(result.ok).toBe(true);
      snapshot = result.snapshot;
    }

    expect(snapshot.lastMutation?.kind).toBe("placed");
    expect(
      Object.values(snapshot.divisions["division-1"]?.visibleReservations ?? {}),
    ).toContainEqual(["Germany"]);
  });

  test("removes a team and rebuilds the persisted draw order", () => {
    let snapshot = createInitialLiveSnapshot();

    for (const teamId of ["division-1-1-ghent-gargoyles", "division-1-2-london-qc"]) {
      const result = applyLiveCommand(snapshot, {
        kind: "draw",
        divisionId: "division-1",
        teamId,
      });

      expect(result.ok).toBe(true);
      snapshot = result.snapshot;
    }

    const removal = applyLiveCommand(snapshot, {
      kind: "remove",
      divisionId: "division-1",
      teamId: "division-1-1-ghent-gargoyles",
      placementKey: "A-0",
    });

    expect(removal.ok).toBe(true);
    expect(removal.snapshot.lastMutation?.kind).toBe("removed");
    expect(removal.snapshot.divisions["division-1"]?.drawOrder).toEqual(["division-1-2-london-qc"]);
    const restoredStates = restoreDivisionStates(removal.snapshot);
    expect(restoredStates["division-1"]?.groups[0]?.slots[0]).toBeNull();
  });

  test("resets one division without touching the other", () => {
    let snapshot = createInitialLiveSnapshot();

    const draw = applyLiveCommand(snapshot, {
      kind: "draw",
      divisionId: "division-2",
      teamId: "division-2-1-sevilla-warriors",
    });
    expect(draw.ok).toBe(true);
    snapshot = draw.snapshot;

    const reset = applyLiveCommand(snapshot, {
      kind: "reset",
      divisionId: "division-1",
    });

    expect(reset.ok).toBe(true);
    expect(reset.snapshot.lastMutation?.kind).toBe("reset");
    expect(reset.snapshot.divisions["division-1"]?.drawOrder).toEqual([]);
    expect(reset.snapshot.divisions["division-2"]?.drawOrder).toEqual([
      "division-2-1-sevilla-warriors",
    ]);
  });
});
