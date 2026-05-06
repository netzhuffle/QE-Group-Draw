import { describe, expect, test } from "bun:test";

import { parseLiveSnapshot } from "./live-types.ts";
import { getDefaultRuntimeMode } from "./runtime-config.ts";

describe("archive config", () => {
  test("uses archive mode for the archive hostname", () => {
    expect(getDefaultRuntimeMode("groupdraw.quadball.eu")).toBe("archive");
  });

  test("keeps local mode for the static jannis.rocks path", () => {
    expect(getDefaultRuntimeMode("jannis.rocks")).toBe("local");
  });

  test("ships a valid archived final snapshot", async () => {
    const snapshot = parseLiveSnapshot(await Bun.file("src/archive-state.json").json());

    expect(snapshot.divisions["division-1"]?.drawOrder).toHaveLength(24);
    expect(snapshot.divisions["division-2"]?.drawOrder).toHaveLength(24);
  });
});
