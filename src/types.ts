export type SeedBracket = "seed1" | "seed2" | "unseeded";

export interface Team {
  id: string;
  name: string;
  ngb: string;
  ranking: string;
  seed: SeedBracket;
}

export interface DivisionConfig {
  id: string;
  name: string;
  shortName: string;
  groupNames: readonly string[];
  duplicateAllowance?: {
    ngb: string;
    requiredGroupsWithPair: number;
    maxTeamsPerGroup: number;
  };
  teams: readonly Team[];
}

export interface GroupState {
  name: string;
  slots: Array<Team | null>;
}

export interface DivisionState {
  config: DivisionConfig;
  groups: GroupState[];
  placedTeamIds: Set<string>;
  messages: string[];
}

export interface PlacementResult {
  ok: boolean;
  updatedState: DivisionState;
  messages: string[];
}
