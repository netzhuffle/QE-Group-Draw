import { describe, expect, test } from "bun:test";

import {
  getNewReservations,
  keepVisibleReservations,
  mergeReservationMaps,
  reservationSetsMatch,
} from "./app-reservations.ts";

describe("app reservations", () => {
  test("merges reservation maps in order", () => {
    expect(
      mergeReservationMaps({ "A-2": ["Germany"] }, { "B-3": ["UK"], "A-2": ["France"] }),
    ).toEqual({
      "A-2": ["France"],
      "B-3": ["UK"],
    });
  });

  test("keeps only unchanged visible reservations", () => {
    expect(
      keepVisibleReservations(
        {
          "A-2": ["Germany"],
          "B-3": ["UK"],
        },
        {
          "A-2": ["Germany"],
          "C-3": ["France"],
        },
      ),
    ).toEqual({
      "A-2": ["Germany"],
    });
  });

  test("returns only newly introduced or changed reservations", () => {
    expect(
      getNewReservations(
        {
          "A-2": ["Germany"],
          "B-3": ["UK"],
        },
        {
          "A-2": ["Germany"],
          "B-3": ["France"],
          "C-2": ["Spain"],
        },
      ),
    ).toEqual({
      "B-3": ["France"],
      "C-2": ["Spain"],
    });
  });

  test("matches reservation sets by exact ordered contents", () => {
    expect(reservationSetsMatch(["Germany"], ["Germany"])).toBe(true);
    expect(reservationSetsMatch(["Germany"], ["UK"])).toBe(false);
    expect(reservationSetsMatch(["Germany", "UK"], ["Germany", "UK"])).toBe(true);
    expect(reservationSetsMatch(["Germany", "UK"], ["UK", "Germany"])).toBe(false);
    expect(reservationSetsMatch(undefined, undefined)).toBe(true);
    expect(reservationSetsMatch(["Germany"], undefined)).toBe(false);
  });
});
