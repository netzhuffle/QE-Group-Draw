const ngbFlags: Record<string, string> = {
  Austria: "🇦🇹",
  Belgium: "🇧🇪",
  Czechia: "🇨🇿",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Italy: "🇮🇹",
  Norway: "🇳🇴",
  Poland: "🇵🇱",
  Slovenia: "🇸🇮",
  Spain: "🇪🇸",
  Switzerland: "🇨🇭",
  Türkiye: "🇹🇷",
  UK: "🇬🇧",
};

export function getFlag(ngb: string): string {
  return ngbFlags[ngb] ?? "🏳️";
}

export function getFlagModifierClass(ngb: string): string {
  return ngb === "Switzerland" ? " flag--swiss" : "";
}
