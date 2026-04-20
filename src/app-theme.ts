import type { CSSProperties } from "react";

export type ThemeVariable =
  | "--primary"
  | "--primary-strong"
  | "--primary-soft"
  | "--primary-muted"
  | "--support-soft"
  | "--page-glow"
  | "--page-glow-soft"
  | "--panel-border"
  | "--group-tint"
  | "--rail-tint"
  | "--seed1-bg"
  | "--seed2-bg"
  | "--unseeded-bg"
  | "--seed1-pill"
  | "--seed2-pill"
  | "--unseeded-pill";

type ThemeStyle = CSSProperties & Record<ThemeVariable, string>;

export const divisionThemeStyles: Record<string, ThemeStyle> = {
  "division-1": {
    "--primary": "oklch(0.58 0.23 255)",
    "--primary-strong": "oklch(0.5 0.24 252)",
    "--primary-soft": "oklch(0.9 0.07 248)",
    "--primary-muted": "oklch(0.78 0.12 248)",
    "--support-soft": "oklch(0.94 0.06 20)",
    "--page-glow": "oklch(0.79 0.15 248 / 0.38)",
    "--page-glow-soft": "oklch(0.86 0.09 20 / 0.22)",
    "--panel-border": "oklch(0.8 0.07 248)",
    "--group-tint": "oklch(0.95 0.05 248 / 0.97)",
    "--rail-tint": "oklch(0.96 0.04 248 / 0.98)",
    "--seed1-bg": "oklch(0.9 0.08 248)",
    "--seed2-bg": "oklch(0.91 0.06 286)",
    "--unseeded-bg": "oklch(0.93 0.06 38)",
    "--seed1-pill": "oklch(0.5 0.24 252)",
    "--seed2-pill": "oklch(0.48 0.16 286)",
    "--unseeded-pill": "oklch(0.56 0.15 36)",
  },
  "division-2": {
    "--primary": "oklch(0.6 0.24 26)",
    "--primary-strong": "oklch(0.52 0.24 24)",
    "--primary-soft": "oklch(0.92 0.07 24)",
    "--primary-muted": "oklch(0.8 0.12 24)",
    "--support-soft": "oklch(0.93 0.05 250)",
    "--page-glow": "oklch(0.82 0.15 24 / 0.36)",
    "--page-glow-soft": "oklch(0.85 0.09 250 / 0.2)",
    "--panel-border": "oklch(0.82 0.08 24)",
    "--group-tint": "oklch(0.96 0.05 24 / 0.97)",
    "--rail-tint": "oklch(0.965 0.04 24 / 0.98)",
    "--seed1-bg": "oklch(0.91 0.08 24)",
    "--seed2-bg": "oklch(0.91 0.06 350)",
    "--unseeded-bg": "oklch(0.92 0.05 290)",
    "--seed1-pill": "oklch(0.52 0.24 24)",
    "--seed2-pill": "oklch(0.5 0.17 350)",
    "--unseeded-pill": "oklch(0.49 0.15 290)",
  },
};

export const divisionTabClasses: Record<string, string> = {
  "division-1": "tab-button tab-button--blue",
  "division-2": "tab-button tab-button--red",
};
