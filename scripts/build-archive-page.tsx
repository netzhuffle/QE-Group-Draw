import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { SkipAnimationCue } from "../src/app-animation.ts";
import { GroupCard, StatCard } from "../src/app-components.tsx";
import { buildNoteTextSegments } from "../src/app-helpers.ts";
import { emptyReservationMap } from "../src/app-reservations.ts";
import { divisionThemeStyles } from "../src/app-theme.ts";
import { archivedLiveSnapshot } from "../src/archive-state.ts";
import { divisions } from "../src/data.ts";
import { restoreDivisionStates, restoreVisibleReservations } from "../src/live-store.ts";

type DivisionId = (typeof divisions)[number]["id"];
const [, , distDirectory = "dist"] = Bun.argv;
const emptyAnimatedReservationKeys: string[] = [];
const emptySkipAnimationCues: SkipAnimationCue[] = [];
const archivePages: Array<{ fileName: string; divisionId: DivisionId }> = [
  { fileName: "archive.html", divisionId: "division-1" },
  { fileName: "archive-division-1.html", divisionId: "division-1" },
  { fileName: "archive-division-2.html", divisionId: "division-2" },
];

const styles = await readFile(`${distDirectory}/styles.css`, "utf8").catch(async () => {
  const cssAssetName = await findAssetName(distDirectory, /^index-.*\.css$/);
  return readFile(`${distDirectory}/${cssAssetName}`, "utf8");
});
const faviconAssetName = await findAssetName(distDirectory, /^favicon-.*\.png$/);

await Promise.all(
  archivePages.map((page) =>
    writeFile(
      `${distDirectory}/${page.fileName}`,
      renderArchiveDocument(styles, faviconAssetName, page.divisionId),
    ),
  ),
);

async function findAssetName(directory: string, pattern: RegExp): Promise<string> {
  for await (const entry of new Bun.Glob("*").scan({ cwd: directory })) {
    const assetName = basename(entry);

    if (pattern.test(assetName)) {
      return assetName;
    }
  }

  throw new Error(`Missing asset matching ${pattern} in ${directory}.`);
}

function renderArchiveDocument(
  stylesheet: string,
  faviconFileName: string,
  activeDivisionId: DivisionId,
): string {
  const appMarkup = renderToStaticMarkup(<ArchiveBoard activeDivisionId={activeDivisionId} />);

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><meta name="color-scheme" content="light"/><title>EQC 2026 Group Draw</title><link rel="icon" type="image/png" href="./${faviconFileName}"/><style>${escapeStyleContent(
    stylesheet,
  )}</style></head><body><div id="app">${appMarkup}</div></body></html>`;
}

function escapeStyleContent(stylesheet: string): string {
  return stylesheet.replaceAll("</style", "<\\/style");
}

function ArchiveBoard(props: { activeDivisionId: DivisionId }): ReactElement {
  const divisionStates = restoreDivisionStates(archivedLiveSnapshot);
  const visibleReservations = restoreVisibleReservations(archivedLiveSnapshot);
  const activeState = divisionStates[props.activeDivisionId];

  if (activeState === undefined) {
    throw new Error(`Unknown division: ${props.activeDivisionId}`);
  }

  const activeReservationMap = visibleReservations[props.activeDivisionId] ?? emptyReservationMap;
  const placedTeamCount = activeState.config.teams.length;
  const latestMessage = activeState.messages[0] ?? "Draw complete.";
  const noteSegments = buildNoteTextSegments(latestMessage);

  return (
    <div className="board-shell" style={divisionThemeStyles[props.activeDivisionId]}>
      <header className="hero-surface">
        <div className="hero-grid">
          <div className="min-w-0">
            <div className="eyebrow">European Quadball Cup 2026</div>
            <h1 className="hero-title">Group Draw Board</h1>
            <p className="hero-subtitle">Archived final draw board.</p>
          </div>

          <nav aria-label="Divisions" className="tab-strip">
            {divisions.map((division) => {
              const isActive = division.id === props.activeDivisionId;
              const tabClassName =
                division.id === "division-1"
                  ? "tab-button tab-button--blue"
                  : "tab-button tab-button--red";

              return (
                <a
                  aria-current={isActive ? "page" : undefined}
                  className={tabClassName}
                  data-active={String(isActive)}
                  href={division.id === "division-1" ? "/division-1" : "/division-2"}
                  key={division.id}
                >
                  <span className="tab-button__label">{division.name}</span>
                </a>
              );
            })}
          </nav>

          <div className="stats-row">
            <StatCard
              label="Placed"
              value={`${placedTeamCount}/${activeState.config.teams.length}`}
            />
            <StatCard label="Progress" value="100%" />
          </div>
        </div>

        <div className="note-strip">
          <span className="note-pill">Latest note</span>
          <p className="note-strip__text" title={latestMessage}>
            {noteSegments.map((segment) =>
              segment.emphasized ? (
                <strong className="note-strip__emphasis" key={segment.key}>
                  {segment.text}
                </strong>
              ) : (
                <span key={segment.key}>{segment.text}</span>
              ),
            )}
          </p>
        </div>
      </header>

      <main className="stage-grid stage-grid--archive">
        <section className="panel-surface panel-groups">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Archived board</div>
              <h2 className="panel-title">Groups A-F</h2>
            </div>
            <div className="legend-row">
              <span className="legend-chip legend-chip--seed1">Seed 1</span>
              <span className="legend-chip legend-chip--seed2">Seed 2</span>
              <span className="legend-chip legend-chip--unseeded">Unseeded</span>
            </div>
          </div>

          <div className="group-grid">
            {activeState.groups.map((group, groupIndex) => (
              <GroupCard
                animatedReservationKeys={emptyAnimatedReservationKeys}
                canRemove={false}
                group={group}
                groupIndex={groupIndex}
                highlightedPlacementKey={null}
                key={group.name}
                removingPlacementKey={null}
                reservationMap={activeReservationMap}
                skipAnimationCues={emptySkipAnimationCues}
                onRemove={noopRemove}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function noopRemove(): void {
  return undefined;
}
