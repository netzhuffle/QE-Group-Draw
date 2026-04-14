import type { ReactElement } from "react";

import type { SkipAnimationCue } from "./app-animation.ts";
import { getFlag, getFlagModifierClass } from "./app-flags.ts";
import {
  findTargetCue,
  getPlacedCount,
  getSlotRowClasses,
  matchesExistingCue,
} from "./app-helpers.ts";
import type { ReservationMap } from "./app-reservations.ts";
import { seedBracketLabels } from "./data.ts";
import type { GroupState, SeedBracket, Team } from "./types.ts";

const slotLabels = ["Seed 1", "Seed 2", "Unseeded", "Unseeded"] as const;

export function StatCard(props: { label: string; value: string }): ReactElement {
  return (
    <div className="stat-card">
      <span className="stat-label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function GroupCard(props: {
  groupIndex: number;
  group: GroupState;
  highlightedPlacementKey: string | null;
  removingPlacementKey: string | null;
  animatedReservationKeys: string[];
  reservationMap: ReservationMap;
  skipAnimationCues: SkipAnimationCue[];
  canRemove: boolean;
  onRemove: (teamId: string, placementKey: string, teamName: string) => void;
}): ReactElement {
  const placedCount = getPlacedCount(props.group);

  return (
    <section className="group-card">
      <header className="group-card__header">
        <h3 className="group-card__letter">{props.group.name}</h3>
        <span className="group-card__count">{placedCount}/4</span>
      </header>

      <ol className="slot-list">
        {props.group.slots.map((slot, slotIndex) => {
          const slotTone = slotIndex === 0 ? "seed1" : slotIndex === 1 ? "seed2" : "unseeded";
          const label = slotLabels[slotIndex] ?? "Open";
          const slotKey = `${props.group.name}-${slotIndex}`;
          const isPlacedHighlight = props.highlightedPlacementKey === slotKey;
          const isRemoving = props.removingPlacementKey === slotKey;
          const reservationNgbs = props.reservationMap[slotKey] ?? [];
          const targetCue = findTargetCue(props.skipAnimationCues, props.groupIndex, slotIndex);
          const isCueExisting = matchesExistingCue(
            props.skipAnimationCues,
            props.groupIndex,
            slotIndex,
          );
          const isCueTarget = targetCue !== null;
          const isReservationCue = targetCue?.kind === "reserved_target";
          const slotClasses = getSlotRowClasses(
            slotTone,
            slot === null,
            isPlacedHighlight,
            isRemoving,
            isCueExisting,
            isCueTarget,
          );

          return (
            <li className={slotClasses} key={slotKey}>
              {slot === null ? (
                <div className="slot-empty">
                  {reservationNgbs.length > 0 ? (
                    <span className="slot-empty__reservations">
                      {reservationNgbs.map((ngb) => (
                        <span
                          aria-label={ngb}
                          className={`slot-flag${getFlagModifierClass(ngb)}${
                            isReservationCue ? " slot-flag--focus" : ""
                          }${
                            props.animatedReservationKeys.includes(slotKey)
                              ? " slot-flag--reservation-drop"
                              : ""
                          }`}
                          key={`${slotKey}-${ngb}`}
                          title={`Reserved for ${ngb}`}
                        >
                          {getFlag(ngb)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className={`slot-pill slot-pill--${slotTone}`}>{label}</span>
                  {renderSlotCuePreview(targetCue, reservationNgbs)}
                </div>
              ) : (
                <button
                  className="slot-team"
                  disabled={!props.canRemove}
                  title={`Remove ${slot.name} (${slot.ngb})`}
                  type="button"
                  onClick={() => props.onRemove(slot.id, slotKey, slot.name)}
                >
                  <span
                    aria-label={slot.ngb}
                    className={`slot-flag${getFlagModifierClass(slot.ngb)}${isCueExisting ? " slot-flag--focus" : ""}`}
                  >
                    {getFlag(slot.ngb)}
                  </span>
                  <strong className="truncate text-[0.8rem] leading-tight font-bold text-slate-900">
                    {slot.name}
                  </strong>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RemovalModal(props: {
  teamName: string;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <div aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-card">
        <div className="eyebrow">Confirm Removal</div>
        <h2 className="modal-title">Remove {props.teamName}?</h2>
        <p className="modal-copy">
          This will remove the team from the board, return it to the draw rail, and replay the
          current division state. This cannot be undone.
        </p>
        <div className="modal-actions">
          <button
            autoFocus
            className="modal-button modal-button--secondary"
            onClick={props.onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="modal-button modal-button--danger"
            onClick={props.onConfirm}
            type="button"
          >
            Remove Team
          </button>
        </div>
      </div>
    </div>
  );
}

export function SeedSection(props: {
  disabled: boolean;
  seedBracket: SeedBracket;
  teams: Team[];
  onDraw: (teamId: string) => void;
}): ReactElement {
  return (
    <section className={`seed-section seed-section--${props.seedBracket}`}>
      <div className="seed-header">
        <div>
          <h3 className="text-[1.1rem] leading-none font-black tracking-[-0.03em] text-slate-900">
            {seedBracketLabels[props.seedBracket]}
          </h3>
          <span className="mt-1 block text-[0.68rem] font-semibold text-slate-500">
            {props.teams.length} left
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        {props.teams.length === 0 ? (
          <div className="empty-state">
            All {seedBracketLabels[props.seedBracket]} teams are placed.
          </div>
        ) : (
          props.teams.map((team) => (
            <button
              className={`team-button team-button--${props.seedBracket}`}
              disabled={props.disabled}
              key={team.id}
              title={team.name}
              type="button"
              onClick={() => props.onDraw(team.id)}
            >
              <span aria-label={team.ngb} className={`flag-badge${getFlagModifierClass(team.ngb)}`}>
                {getFlag(team.ngb)}
              </span>
              <span className="min-w-0 truncate text-[0.82rem] font-bold text-slate-900">
                {team.name}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function renderSlotCuePreview(
  cue: SkipAnimationCue | null,
  visibleReservationNgbs: string[],
): ReactElement | null {
  if (cue === null) {
    return null;
  }

  if (cue.kind === "ngb_target") {
    return (
      <span className="slot-cue slot-cue--blocked" title={`${cue.ngb} blocked here`}>
        <span
          aria-label={cue.ngb}
          className={`slot-flag slot-cue__flag${getFlagModifierClass(cue.ngb)}`}
        >
          {getFlag(cue.ngb)}
        </span>
        <span aria-hidden="true" className="slot-cue__forbidden">
          ⊘
        </span>
      </span>
    );
  }

  if (cue.kind === "reserved_target" && visibleReservationNgbs.length === 0) {
    return (
      <span
        className="slot-cue slot-cue--reserved"
        title={`Reserved for ${cue.reservedNgbs.join(", ")}`}
      >
        {cue.reservedNgbs.map((ngb) => (
          <span
            aria-label={ngb}
            className={`slot-flag slot-cue__flag${getFlagModifierClass(ngb)}`}
            key={ngb}
          >
            {getFlag(ngb)}
          </span>
        ))}
      </span>
    );
  }

  return null;
}
