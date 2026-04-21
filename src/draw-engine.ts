import type {
  DivisionConfig,
  DivisionState,
  GroupState,
  PlacementAnimationPlan,
  PlacementAnimationStep,
  PlacementCoordinate,
  PlacementResult,
  RemovalResult,
  SeedBracket,
  SlotReservation,
  Team,
} from "./types.ts";
type PlacementOption = PlacementCoordinate;

interface CandidateAnalysis {
  eligiblePlacements: PlacementOption[];
  skippedForNgb: PlacementOption[];
  duplicateAllowancePlacements: PlacementOption[];
}

interface CompletionResult {
  possible: boolean;
  blockedTeam?: Team;
}

interface ForwardSkippedPlacement {
  placement: PlacementOption;
  reservedNgbs: string[];
}

const unseededSlotIndexes = [2, 3] as const;

export function createDivisionState(config: DivisionConfig): DivisionState {
  return {
    config,
    groups: config.groupNames.map((name) => ({
      name,
      slots: [null, null, null, null],
    })),
    placedTeamIds: new Set<string>(),
    drawOrder: [],
    messages: [buildReadyMessage(config)],
  };
}

export function resetDivisionState(config: DivisionConfig): DivisionState {
  return createDivisionState(config);
}

export function restoreDivisionState(
  config: DivisionConfig,
  drawOrder: string[],
  messages?: string[],
): DivisionState {
  const replayResult = replayDrawOrder(config, drawOrder);

  if (!replayResult.ok || replayResult.updatedState === undefined) {
    throw new Error(`Unable to restore division state for ${config.id}.`);
  }

  if (messages === undefined) {
    return replayResult.updatedState;
  }

  return {
    ...replayResult.updatedState,
    messages: [...messages],
  };
}

export function getUndrawnTeams(state: DivisionState): Team[] {
  return state.config.teams.filter((team) => !state.placedTeamIds.has(team.id));
}

export function placeTeamById(state: DivisionState, teamId: string): PlacementResult {
  const team = state.config.teams.find((entry) => entry.id === teamId);

  if (team === undefined) {
    return {
      ok: false,
      updatedState: state,
      messages: ["The selected team does not exist in this division."],
    };
  }

  if (state.placedTeamIds.has(team.id)) {
    return {
      ok: false,
      updatedState: state,
      messages: [`${team.name} has already been drawn.`],
    };
  }

  const candidateAnalysis = analyzeCandidates(state.groups, team, state.config);
  const remainingTeams = getUndrawnTeams(state).filter((entry) => entry.id !== team.id);
  const slotCandidateNgbMap = buildSlotCandidateNgbMap(state.groups, remainingTeams, state.config);
  const forwardSkipped: ForwardSkippedPlacement[] = [];
  let chosenPlacement: PlacementOption | undefined;

  for (const placement of candidateAnalysis.eligiblePlacements) {
    const nextGroups = cloneGroups(state.groups);
    nextGroups[placement.groupIndex]?.slots.splice(placement.slotIndex, 1, team);

    const completionResult = canCompleteDraw(nextGroups, remainingTeams, state.config);

    if (completionResult.possible) {
      chosenPlacement = placement;
      break;
    }

    forwardSkipped.push({
      placement,
      reservedNgbs: getReservedNgbsForPlacement(slotCandidateNgbMap, placement),
    });
  }

  if (chosenPlacement === undefined) {
    const messages = buildPlacementMessages(
      team,
      state.config,
      candidateAnalysis,
      forwardSkipped,
      undefined,
    );

    messages.push(
      `No valid placement remains for ${team.name}. Undo an earlier draw or reset ${state.config.shortName}.`,
    );

    return {
      ok: false,
      updatedState: {
        ...state,
        messages: limitMessages([...messages.toReversed(), ...state.messages]),
      },
      messages,
    };
  }

  const updatedGroups = cloneGroups(state.groups);
  updatedGroups[chosenPlacement.groupIndex]?.slots.splice(chosenPlacement.slotIndex, 1, team);

  const messages = buildPlacementMessages(
    team,
    state.config,
    candidateAnalysis,
    forwardSkipped,
    chosenPlacement,
  );

  messages.push(
    `${team.name} joins Group ${updatedGroups[chosenPlacement.groupIndex]?.name} in ${slotLabel(
      chosenPlacement.slotIndex,
    )}.`,
  );
  const animationPlan = buildPlacementAnimationPlan(
    state.groups,
    team,
    candidateAnalysis,
    forwardSkipped,
    chosenPlacement,
  );

  return {
    ok: true,
    updatedState: {
      ...state,
      groups: updatedGroups,
      placedTeamIds: new Set([...state.placedTeamIds, team.id]),
      drawOrder: [...state.drawOrder, team.id],
      messages: limitMessages([...messages.toReversed(), ...state.messages]),
    },
    messages,
    animationPlan,
  };
}

export function removeTeamById(state: DivisionState, teamId: string): RemovalResult {
  const team = state.config.teams.find((entry) => entry.id === teamId);

  if (team === undefined) {
    return {
      ok: false,
      updatedState: state,
      messages: ["The selected team does not exist in this division."],
    };
  }

  if (!state.placedTeamIds.has(team.id)) {
    return {
      ok: false,
      updatedState: state,
      messages: [`${team.name} is not currently on the board.`],
    };
  }

  const nextDrawOrder = state.drawOrder.filter((placedTeamId) => placedTeamId !== team.id);
  const rebuiltState = replayDrawOrder(state.config, nextDrawOrder);

  if (!rebuiltState.ok || rebuiltState.updatedState === undefined) {
    return {
      ok: false,
      updatedState: state,
      messages: [
        `Removing ${team.name} would leave the board in an inconsistent state. Reset ${state.config.shortName} if this persists.`,
      ],
    };
  }

  const removalMessage = `${team.name} was removed from the board and returned to the draw rail.`;

  return {
    ok: true,
    updatedState: {
      ...rebuiltState.updatedState,
      messages: limitMessages([removalMessage, ...rebuiltState.updatedState.messages]),
    },
    messages: [removalMessage],
    removedTeam: team,
  };
}

export function getSlotReservations(state: DivisionState): SlotReservation[] {
  const remainingTeams = getUndrawnTeams(state);
  return [...buildSlotCandidateNgbMap(state.groups, remainingTeams, state.config).entries()]
    .filter(([, candidateNgbs]) => candidateNgbs.size === 1)
    .flatMap(([key, reservedNgbs]) => {
      const [groupIndexText, slotIndexText] = key.split("-");
      const groupIndex = Number(groupIndexText);
      const slotIndex = Number(slotIndexText);

      if (Number.isNaN(groupIndex) || Number.isNaN(slotIndex)) {
        return [];
      }

      return [
        {
          groupIndex,
          slotIndex,
          reservedNgbs: [...reservedNgbs].toSorted(),
        } satisfies SlotReservation,
      ];
    })
    .toSorted((left, right) => comparePlacements(left, right));
}

function buildSlotCandidateNgbMap(
  groups: GroupState[],
  remainingTeams: Team[],
  config: DivisionConfig,
): Map<string, Set<string>> {
  const slotCandidateNgbs = new Map<string, Set<string>>();

  for (const team of remainingTeams) {
    const candidateAnalysis = analyzeCandidates(groups, team, config);
    const otherRemainingTeams = remainingTeams.filter((entry) => entry.id !== team.id);
    const validPlacements = candidateAnalysis.eligiblePlacements.filter((placement) => {
      const nextGroups = cloneGroups(groups);
      nextGroups[placement.groupIndex]?.slots.splice(placement.slotIndex, 1, team);
      return canCompleteDraw(nextGroups, otherRemainingTeams, config).possible;
    });

    for (const placement of validPlacements) {
      const key = buildPlacementKey(placement);
      const candidateNgbs = slotCandidateNgbs.get(key) ?? new Set<string>();
      candidateNgbs.add(team.ngb);
      slotCandidateNgbs.set(key, candidateNgbs);
    }
  }

  return slotCandidateNgbs;
}

function replayDrawOrder(
  config: DivisionConfig,
  drawOrder: string[],
): { ok: boolean; updatedState?: DivisionState } {
  let nextState = createDivisionState(config);

  for (const teamId of drawOrder) {
    const placementResult = placeTeamById(nextState, teamId);

    if (!placementResult.ok) {
      return { ok: false };
    }

    nextState = placementResult.updatedState;
  }

  return { ok: true, updatedState: nextState };
}

function buildReadyMessage(config: DivisionConfig): string {
  if (config.duplicateAllowance === undefined) {
    return `${config.name} is ready for the draw.`;
  }

  const groupLabel = config.duplicateAllowance.requiredGroupsWithPair === 1 ? "group" : "groups";
  return `${config.name} is ready for the draw. Exactly ${config.duplicateAllowance.requiredGroupsWithPair} ${groupLabel} must finish with exactly ${config.duplicateAllowance.maxTeamsPerGroup} ${config.duplicateAllowance.ngb} teams.`;
}

function limitMessages(messages: string[]): string[] {
  return messages.slice(0, 8);
}

function analyzeCandidates(
  groups: GroupState[],
  team: Team,
  config: DivisionConfig,
): CandidateAnalysis {
  const eligiblePlacements: PlacementOption[] = [];
  const skippedForNgb: PlacementOption[] = [];
  const duplicateAllowancePlacements: PlacementOption[] = [];

  for (const [groupIndex, group] of groups.entries()) {
    const slotIndex = getSlotIndex(group, team.seed);

    if (slotIndex === null) {
      continue;
    }

    const matchingTeams = group.slots.filter((entry) => entry?.ngb === team.ngb).length;

    if (matchingTeams === 0) {
      eligiblePlacements.push({ groupIndex, slotIndex });
      continue;
    }

    if (canUseDuplicateAllowance(team.ngb, matchingTeams, groups, config)) {
      const placement = { groupIndex, slotIndex };
      duplicateAllowancePlacements.push(placement);
      eligiblePlacements.push(placement);
      continue;
    }

    skippedForNgb.push({ groupIndex, slotIndex });
  }

  return {
    eligiblePlacements: sortPlacements(eligiblePlacements, team.seed),
    skippedForNgb,
    duplicateAllowancePlacements,
  };
}

function sortPlacements(placements: PlacementOption[], seed: SeedBracket): PlacementOption[] {
  if (seed !== "unseeded") {
    return placements;
  }

  return placements.toSorted((left, right) => {
    if (left.slotIndex !== right.slotIndex) {
      return left.slotIndex - right.slotIndex;
    }

    return left.groupIndex - right.groupIndex;
  });
}

function getSlotIndex(group: GroupState, seed: SeedBracket): number | null {
  if (seed === "seed1") {
    return group.slots[0] === null ? 0 : null;
  }

  if (seed === "seed2") {
    return group.slots[1] === null ? 1 : null;
  }

  for (const slotIndex of unseededSlotIndexes) {
    if (group.slots[slotIndex] === null) {
      return slotIndex;
    }
  }

  return null;
}

function canUseDuplicateAllowance(
  ngb: string,
  matchingTeamsInGroup: number,
  groups: GroupState[],
  config: DivisionConfig,
): boolean {
  const rule = config.duplicateAllowance;

  if (rule === undefined || rule.ngb !== ngb) {
    return false;
  }

  if (matchingTeamsInGroup >= rule.maxTeamsPerGroup) {
    return false;
  }

  return countGroupsWithDuplicate(groups, ngb, rule.maxTeamsPerGroup) < rule.requiredGroupsWithPair;
}

function cloneGroups(groups: GroupState[]): GroupState[] {
  return groups.map((group) => ({
    name: group.name,
    slots: [...group.slots],
  }));
}

function canCompleteDraw(
  groups: GroupState[],
  remainingTeams: Team[],
  config: DivisionConfig,
  memo = new Map<string, CompletionResult>(),
): CompletionResult {
  if (!satisfiesPairConstraint(groups, remainingTeams, config)) {
    const blockedTeam = remainingTeams[0];
    return { possible: false, blockedTeam };
  }

  if (remainingTeams.length === 0) {
    return { possible: hasRequiredDuplicateGroups(groups, config) };
  }

  const memoKey = buildMemoKey(groups, remainingTeams, config);
  const memoized = memo.get(memoKey);

  if (memoized !== undefined) {
    return memoized;
  }

  const optionSets = remainingTeams
    .map((team, order) => ({
      order,
      team,
      placements: analyzeCandidates(groups, team, config).eligiblePlacements,
    }))
    .toSorted(
      (left, right) => left.placements.length - right.placements.length || left.order - right.order,
    );

  const current = optionSets[0];

  if (current === undefined) {
    const success = {
      possible: hasRequiredDuplicateGroups(groups, config),
    } satisfies CompletionResult;
    memo.set(memoKey, success);
    return success;
  }

  if (current.placements.length === 0) {
    const failure = { possible: false, blockedTeam: current.team } satisfies CompletionResult;
    memo.set(memoKey, failure);
    return failure;
  }

  const nextRemainingTeams = remainingTeams.filter((team) => team.id !== current.team.id);
  let lastFailure: CompletionResult = { possible: false, blockedTeam: current.team };

  for (const placement of current.placements) {
    const nextGroups = cloneGroups(groups);
    nextGroups[placement.groupIndex]?.slots.splice(placement.slotIndex, 1, current.team);

    const result = canCompleteDraw(nextGroups, nextRemainingTeams, config, memo);

    if (result.possible) {
      memo.set(memoKey, result);
      return result;
    }

    lastFailure = result;
  }

  memo.set(memoKey, lastFailure);
  return lastFailure;
}

function satisfiesPairConstraint(
  groups: GroupState[],
  remainingTeams: Team[],
  config: DivisionConfig,
): boolean {
  const rule = config.duplicateAllowance;

  if (rule === undefined) {
    return true;
  }

  const duplicateGroups = countGroupsWithDuplicate(groups, rule.ngb, rule.maxTeamsPerGroup);

  if (duplicateGroups > rule.requiredGroupsWithPair) {
    return false;
  }

  const remainingAllowedTeams = remainingTeams.filter((team) => team.ngb === rule.ngb).length;
  const additionalPairs = groups
    .map((group) => targetTeamsNeededForDuplicate(group, rule.ngb, rule.maxTeamsPerGroup))
    .filter((needed): needed is number => needed !== null)
    .toSorted((left, right) => left - right);

  let possibleAdditionalPairs = 0;
  let availableTeams = remainingAllowedTeams;

  for (const teamsNeeded of additionalPairs) {
    if (teamsNeeded > availableTeams) {
      break;
    }

    availableTeams -= teamsNeeded;
    possibleAdditionalPairs += 1;
  }

  return duplicateGroups + possibleAdditionalPairs >= rule.requiredGroupsWithPair;
}

function targetTeamsNeededForDuplicate(
  group: GroupState,
  ngb: string,
  targetCount: number,
): number | null {
  const existingTargetTeams = group.slots.filter((entry) => entry?.ngb === ngb).length;

  if (existingTargetTeams >= targetCount) {
    return 0;
  }

  const openSlots = group.slots.filter((entry) => entry === null).length;
  const teamsNeeded = targetCount - existingTargetTeams;

  return openSlots >= teamsNeeded ? teamsNeeded : null;
}

function hasRequiredDuplicateGroups(groups: GroupState[], config: DivisionConfig): boolean {
  const rule = config.duplicateAllowance;

  if (rule === undefined) {
    return true;
  }

  return (
    countGroupsWithDuplicate(groups, rule.ngb, rule.maxTeamsPerGroup) ===
    rule.requiredGroupsWithPair
  );
}

function countGroupsWithDuplicate(groups: GroupState[], ngb: string, exactCount: number): number {
  return groups.filter(
    (group) => group.slots.filter((entry) => entry?.ngb === ngb).length === exactCount,
  ).length;
}

function buildMemoKey(
  groups: GroupState[],
  remainingTeams: Team[],
  config: DivisionConfig,
): string {
  const groupsKey = groups
    .map((group) => group.slots.map((team) => team?.id ?? "_").join(","))
    .join("|");
  const remainingKey = remainingTeams
    .map((team) => team.id)
    .toSorted()
    .join(",");
  const duplicateKey =
    config.duplicateAllowance === undefined
      ? "none"
      : `${config.duplicateAllowance.ngb}:${countGroupsWithDuplicate(
          groups,
          config.duplicateAllowance.ngb,
          config.duplicateAllowance.maxTeamsPerGroup,
        )}`;

  return `${groupsKey}::${remainingKey}::${duplicateKey}`;
}

function buildPlacementMessages(
  team: Team,
  config: DivisionConfig,
  candidateAnalysis: CandidateAnalysis,
  forwardSkipped: ForwardSkippedPlacement[],
  chosenPlacement: PlacementOption | undefined,
): string[] {
  const messages: string[] = [];
  const relevantSkippedForNgb = chosenPlacement
    ? candidateAnalysis.skippedForNgb.filter((placement) =>
        affectsChosenPlacement(placement, chosenPlacement),
      )
    : candidateAnalysis.skippedForNgb;
  const relevantDuplicateAllowancePlacements = chosenPlacement
    ? candidateAnalysis.duplicateAllowancePlacements.filter((placement) =>
        affectsOrMatchesChosenPlacement(placement, chosenPlacement),
      )
    : candidateAnalysis.duplicateAllowancePlacements;

  if (relevantSkippedForNgb.length > 0) {
    messages.push(
      `Skipping ${formatGroupNames(
        relevantSkippedForNgb.map((placement) => placement.groupIndex),
        config,
      )} for ${team.name} because ${team.ngb} is already represented there.`,
    );
  }

  if (relevantDuplicateAllowancePlacements.length > 0 && config.duplicateAllowance !== undefined) {
    messages.push(
      `${config.duplicateAllowance.ngb} may fill one of the required duplicate pair slots in ${config.shortName}, so ${formatGroupNames(
        relevantDuplicateAllowancePlacements.map((placement) => placement.groupIndex),
        config,
      )} remain eligible for ${team.name}.`,
    );
  }

  if (forwardSkipped.length > 0 && chosenPlacement !== undefined) {
    const blockedNgbs = [...new Set(forwardSkipped.flatMap((entry) => entry.reservedNgbs))];
    const blockerSuffix =
      blockedNgbs.length > 0
        ? `, preserving a future slot for ${joinNaturalList(blockedNgbs)}`
        : ", preserving a valid future draw";

    messages.push(
      `Skipping ${formatGroupNames(
        forwardSkipped.map((entry) => entry.placement.groupIndex),
        config,
      )} for ${team.name}${blockerSuffix}; placing them in Group ${
        config.groupNames[chosenPlacement.groupIndex]
      } instead.`,
    );
  }

  return messages;
}

function affectsChosenPlacement(
  placement: PlacementOption,
  chosenPlacement: PlacementOption,
): boolean {
  return comparePlacements(placement, chosenPlacement) < 0;
}

function affectsOrMatchesChosenPlacement(
  placement: PlacementOption,
  chosenPlacement: PlacementOption,
): boolean {
  return comparePlacements(placement, chosenPlacement) <= 0;
}

function comparePlacements(left: PlacementOption, right: PlacementOption): number {
  if (left.slotIndex !== right.slotIndex) {
    return left.slotIndex - right.slotIndex;
  }

  return left.groupIndex - right.groupIndex;
}

function formatGroupNames(groupIndexes: number[], config: DivisionConfig): string {
  const names = groupIndexes.map((groupIndex) => `Group ${config.groupNames[groupIndex]}`);
  return joinNaturalList(names);
}

function buildPlacementAnimationPlan(
  groups: GroupState[],
  team: Team,
  candidateAnalysis: CandidateAnalysis,
  forwardSkipped: ForwardSkippedPlacement[],
  chosenPlacement: PlacementOption,
): PlacementAnimationPlan | undefined {
  const skipSteps: PlacementAnimationStep[] = [];

  for (const placement of candidateAnalysis.skippedForNgb) {
    if (!affectsChosenPlacement(placement, chosenPlacement)) {
      continue;
    }

    const conflictingSlotIndexes =
      groups[placement.groupIndex]?.slots.flatMap((entry, slotIndex) =>
        entry?.ngb === team.ngb ? [slotIndex] : [],
      ) ?? [];

    skipSteps.push({
      kind: "ngb_limit",
      placement,
      conflictingSlotIndexes,
      ngb: team.ngb,
    });
  }

  for (const entry of forwardSkipped) {
    if (!affectsChosenPlacement(entry.placement, chosenPlacement)) {
      continue;
    }

    skipSteps.push({
      kind: "reserved",
      placement: entry.placement,
      reservedNgbs: entry.reservedNgbs,
    });
  }

  if (skipSteps.length === 0) {
    return undefined;
  }

  return {
    teamId: team.id,
    teamNgb: team.ngb,
    chosenPlacement,
    skipSteps: skipSteps.toSorted((left, right) =>
      comparePlacements(left.placement, right.placement),
    ),
  };
}

function joinNaturalList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function buildPlacementKey(placement: PlacementCoordinate): string {
  return `${placement.groupIndex}-${placement.slotIndex}`;
}

function getReservedNgbsForPlacement(
  slotCandidateNgbMap: Map<string, Set<string>>,
  placement: PlacementCoordinate,
): string[] {
  return [
    ...(slotCandidateNgbMap.get(buildPlacementKey(placement)) ?? new Set<string>()),
  ].toSorted();
}

function slotLabel(slotIndex: number): string {
  if (slotIndex === 0) {
    return "Seed 1";
  }

  if (slotIndex === 1) {
    return "Seed 2";
  }

  return "an unseeded slot";
}
