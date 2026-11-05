# Development tooling

Use Bun 1.4.4, pinned in `.bun-version` for CI and local version managers.
`bunfig.toml` withholds newly resolved dependency releases for seven days
(`minimumReleaseAge = 604800` seconds), including transitive dependencies.
Existing lockfile entries stay reproducible; the gate does not delay upgrades
of the Bun executable itself.

## Commands

- `bun check`: native TypeScript checking using `tsconfig.json`.
- `bun fmt`: native formatting, with the previous 100-column line width.
- `bun run lint`: Oxlint with type-aware rules.
- `bun run verify`: type checking, formatting check, lint, and all tests.
- `bun run check:ci`: the same checks with parallel tests, used by CI.
- `bun run build:all`: browser bundle, archive pages, and Linux server executable.

The `check` script now performs type checking only. Use `verify` for the full
local validation previously provided by that script.

## Tooling migration comparison (2026-11-05)

Both the previous Oxfmt 0.45.0 and updated Oxfmt 0.75.0 formatting checks passed
on the existing source, as did Bun's native formatter using Oxfmt defaults.
The explicit Bun formatter configuration preserves the line width after removing
the Oxfmt dependency; plain `bun fmt --check .` also passes.

The previous Oxlint check and native `bun check --no-script` passed before
upgrading the tooling. Updated Oxlint 1.90.0 with oxlint-tsgolint 7.0.2005
reported redundant assertions and React callback/dependency issues. The
assertions were removed, socket connection setup was moved into its effect,
and effect events now deliver snapshots to the latest render's handlers.
The existing runtime configuration global is explicitly allowed by the new
underscore naming rule.

Bun now handles compiler diagnostics instead of Oxlint's experimental
`typeCheck` option. Oxlint and oxlint-tsgolint remain necessary for type-aware
lint rules; they are not replaced by the native type checker.

Dependency updates respect the seven-day gate. A newer version in
`bun outdated` may therefore remain intentionally withheld.
