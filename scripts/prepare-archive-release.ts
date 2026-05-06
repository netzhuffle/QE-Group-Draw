import { readFile, writeFile } from "node:fs/promises";

import { buildArchiveRuntimeScript, parseArchiveSnapshot } from "../src/archive-config.ts";

const [, , indexPath, snapshotPath] = Bun.argv;

if (indexPath === undefined || snapshotPath === undefined) {
  throw new Error("Usage: bun scripts/prepare-archive-release.ts <index.html> <snapshot.json>");
}

const [indexHtml, snapshotJson] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(snapshotPath, "utf8"),
]);

parseArchiveSnapshot(JSON.parse(snapshotJson) as unknown);

if (!indexHtml.includes("</head>")) {
  throw new Error(`Cannot inject archive runtime config into ${indexPath}: missing </head>.`);
}

await writeFile(indexPath, indexHtml.replace("</head>", `${buildArchiveRuntimeScript()}</head>`));
