import { getSlotReservations } from "./draw-engine.ts";
import type { DivisionState, PlacementAnimationPlan } from "./types.ts";

export type ReservationMap = Record<string, string[]>;

export const emptyReservationMap: ReservationMap = {};

export function buildReservationMap(state: DivisionState): ReservationMap {
  return getSlotReservations(state).reduce<ReservationMap>((reservationMap, reservation) => {
    const groupName = state.groups[reservation.groupIndex]?.name;

    if (groupName === undefined) {
      return reservationMap;
    }

    reservationMap[`${groupName}-${reservation.slotIndex}`] = reservation.reservedNgbs;
    return reservationMap;
  }, {});
}

export function buildStrategicReservationMap(
  state: DivisionState,
  animationPlan: PlacementAnimationPlan | undefined,
): ReservationMap {
  if (animationPlan === undefined) {
    return emptyReservationMap;
  }

  return animationPlan.skipSteps.reduce<ReservationMap>((reservationMap, step) => {
    if (step.kind !== "reserved" || step.reservedNgbs.length !== 1) {
      return reservationMap;
    }

    const groupName = state.groups[step.placement.groupIndex]?.name;

    if (groupName === undefined) {
      return reservationMap;
    }

    reservationMap[`${groupName}-${step.placement.slotIndex}`] = step.reservedNgbs;
    return reservationMap;
  }, {});
}

export function mergeReservationMaps(...reservationMaps: ReservationMap[]): ReservationMap {
  return reservationMaps.reduce<ReservationMap>((mergedMap, reservationMap) => {
    Object.assign(mergedMap, reservationMap);
    return mergedMap;
  }, {});
}

export function keepVisibleReservations(
  currentReservationMap: ReservationMap,
  nextReservationMap: ReservationMap,
): ReservationMap {
  return Object.fromEntries(
    Object.entries(currentReservationMap).filter(([key, reservedNgbs]) =>
      reservationSetsMatch(reservedNgbs, nextReservationMap[key]),
    ),
  );
}

export function getNewReservations(
  currentReservationMap: ReservationMap,
  nextReservationMap: ReservationMap,
): ReservationMap {
  return Object.fromEntries(
    Object.entries(nextReservationMap).filter(
      ([key, reservedNgbs]) => !reservationSetsMatch(reservedNgbs, currentReservationMap[key]),
    ),
  );
}

export function reservationSetsMatch(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((ngb, index) => ngb === right[index]);
}
