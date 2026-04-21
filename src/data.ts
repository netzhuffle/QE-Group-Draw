import type { DivisionConfig, SeedBracket, Team } from "./types.ts";

const defaultGroupNames = ["A", "B", "C", "D", "E", "F"] as const;

const seedOrder: Record<SeedBracket, string> = {
  seed1: "1",
  seed2: "2",
  unseeded: "unseeded",
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
}

function createTeam(
  divisionId: string,
  seed: SeedBracket,
  ngb: string,
  ranking: string,
  name: string,
): Team {
  return {
    id: `${divisionId}-${seedOrder[seed]}-${slugify(name)}`,
    name,
    ngb,
    ranking,
    seed,
  };
}

const divisionOneTeams = [
  createTeam("division-1", "seed1", "Belgium", "D1 / 1", "Ghent Gargoyles"),
  createTeam("division-1", "seed1", "Germany", "D1 / 2", "Ruhr Phoenix"),
  createTeam("division-1", "seed1", "Germany", "D1 / 3", "Braunschweiger Broomicorns"),
  createTeam("division-1", "seed1", "France", "D1 / 4", "Titans Paris"),
  createTeam("division-1", "seed1", "UK", "D1 / 5", "Werewolves of London Firsts"),
  createTeam("division-1", "seed1", "Spain", "D1 / 6", "Malaka Vikings"),
  createTeam("division-1", "seed2", "UK", "D1 / 7", "London QC"),
  createTeam("division-1", "seed2", "France", "D1 / 8", "Paris Frog"),
  createTeam("division-1", "seed2", "Germany", "D1 / 9", "Rheinos Bonn"),
  createTeam("division-1", "seed2", "France", "D1 / 10", "Toulouse Minotaures"),
  createTeam("division-1", "seed2", "Norway", "D1 / 11", "Sagene IF 1"),
  createTeam("division-1", "seed2", "Italy", "D1 / 12", "Siena Ghibellines"),
  createTeam("division-1", "unseeded", "Belgium", "D1 / 13", "BEL Flamingos"),
  createTeam("division-1", "unseeded", "Germany", "D1 / 14", "Heidelberger HellHounds"),
  createTeam("division-1", "unseeded", "Austria", "D1 / 15", "Vienna Vanguards"),
  createTeam("division-1", "unseeded", "Türkiye", "D1 / 16", "Hacettepe Pegasus"),
  createTeam("division-1", "unseeded", "Germany", "D1 / 17", "Darmstadt Athenas"),
  createTeam("division-1", "unseeded", "Germany", "D1 / 18", "SCC Berlin Bluecaps Sky"),
  createTeam("division-1", "unseeded", "Spain", "D1 / 19", "Buckbeak Riders"),
  createTeam("division-1", "unseeded", "Germany", "D1 / 21", "Münster Marauders"),
  createTeam("division-1", "unseeded", "Poland", "D1 / 26", "Kraków Dragons"),
  createTeam("division-1", "unseeded", "UK", "D1 / 27", "Velociraptors QC"),
  createTeam("division-1", "unseeded", "UK", "D2 / 4", "Werewolves of London Seconds"),
  createTeam(
    "division-1",
    "unseeded",
    "Germany",
    "D2 / 11",
    "Smoking Thestrals Stuttgart-Tübingen",
  ),
] as const;

const divisionTwoTeams = [
  createTeam("division-2", "seed1", "Spain", "D1 / 22", "Sevilla Warriors"),
  createTeam("division-2", "seed1", "France", "D1 / 23", "Montpellier Boucaniers"),
  createTeam("division-2", "seed1", "Germany", "D1 / 25", "Münchner Wolpertinger"),
  createTeam("division-2", "seed1", "Belgium", "D1 / 28", "Liège Leviathans"),
  createTeam("division-2", "seed1", "Spain", "D1 / 29", "Madrid Wolves QT"),
  createTeam("division-2", "seed1", "Germany", "D2 / 2", "Augsburg Owls"),
  createTeam("division-2", "seed2", "Austria", "D2 / 5", "Danube Direwolves"),
  createTeam("division-2", "seed2", "UK", "D2 / 6", "Oxford Mammoths"),
  createTeam("division-2", "seed2", "Italy", "D2 / 9", "Garda Lakers"),
  createTeam("division-2", "seed2", "Germany", "D2 / 10", "Horkruxe Halle"),
  createTeam("division-2", "seed2", "France", "D2 / 13", "Olympiens Paris"),
  createTeam("division-2", "seed2", "UK", "D2 / 14", "Phoenix QC"),
  createTeam("division-2", "unseeded", "Czechia", "D2 / 15", "Prague Pegasus"),
  createTeam("division-2", "unseeded", "Austria", "D2 / 17", "SGGF"),
  createTeam("division-2", "unseeded", "Norway", "D2 / 19", "Sagene IF 2"),
  createTeam("division-2", "unseeded", "Switzerland", "D2 / 20", "Berner Boggarts"),
  createTeam("division-2", "unseeded", "UK", "D2 / 21", "Birmingham Badgers"),
  createTeam("division-2", "unseeded", "UK", "D2 / 22", "Olympians QC"),
  createTeam("division-2", "unseeded", "Norway", "D2 / 23", "NTNUI Rumpeldunk"),
  createTeam("division-2", "unseeded", "Poland", "new NGB spot", "SkyWeavers Łódź"),
  createTeam("division-2", "unseeded", "Switzerland", "new NGB spot", "Turicum Thunderbirds"),
  createTeam("division-2", "unseeded", "UK", "new NGB spot", "Southsea QC"),
  createTeam("division-2", "unseeded", "France", "new NGB spot", "Burning Hippogriffs - Caen Q"),
  createTeam("division-2", "unseeded", "Slovenia", "Non-Member spot", "Aemona Argonauts"),
] as const;

export const divisions: readonly DivisionConfig[] = [
  {
    id: "division-1",
    name: "EQC2026 Division 1",
    shortName: "Division 1",
    groupNames: defaultGroupNames,
    duplicateAllowance: {
      ngb: "Germany",
      requiredGroupsWithPair: 2,
      maxTeamsPerGroup: 2,
    },
    teams: divisionOneTeams,
  },
  {
    id: "division-2",
    name: "EQC2026 Division 2",
    shortName: "Division 2",
    groupNames: defaultGroupNames,
    teams: divisionTwoTeams,
  },
] as const;

export const seedBracketLabels: Record<SeedBracket, string> = {
  seed1: "Seed 1",
  seed2: "Seed 2",
  unseeded: "Unseeded",
};
