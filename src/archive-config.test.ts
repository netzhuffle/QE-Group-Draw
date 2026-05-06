import { describe, expect, test } from "bun:test";

import { buildArchiveRuntimeScript } from "./archive-config.ts";
import { parseLiveSnapshot } from "./live-types.ts";

describe("archive config", () => {
  test("builds a static runtime config that loads the archived snapshot", () => {
    expect(buildArchiveRuntimeScript()).toContain('"mode":"archive"');
    expect(buildArchiveRuntimeScript()).toContain('"stateEndpoint":"/archive-state.json"');
  });

  test("ships a valid archived final snapshot", async () => {
    const snapshot = parseLiveSnapshot(await Bun.file("src/archive-state.json").json());

    expect(snapshot.divisions["division-1"]?.drawOrder).toHaveLength(24);
    expect(snapshot.divisions["division-2"]?.drawOrder).toHaveLength(24);
  });
});
