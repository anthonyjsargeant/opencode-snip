# AGENTS.md

## Repo Shape
- Single npm package, TypeScript source in `src/`.
- `src/index.ts` is the real plugin entrypoint.
- `.opencode/plugins/index.ts` re-exports `SnipPlugin` for OpenCode.

## Commands
- `npm ci` installs dependencies.
- `npm run build` compiles to `dist/`.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm test` runs Vitest once.
- `npm run lint` runs ESLint.
- CI runs `npm run typecheck` then `npm test` on every push and PR.

## Release
- Release is semantic-release on `main`.
- Commit messages must use Conventional Commits.
- `feat:` and `fix:` drive release types; breaking changes use `!`.
- `npm publish` is not the release path here; CI/CD handles it.

## Plugin Behavior
- The plugin prefixes `tool.execute.before` shell commands with `snip`.
- Keep `snip` insertion idempotent.
- Do not wrap shell builtins or shell-only forms like `cd`, `source`, `export`, `alias`, `unset`, `eval`, `exec`, `trap`.
- The code intentionally skips dangerous shell contexts such as command substitution, heredocs, here strings, and process substitution.

## Guardrails
- Preserve shell whitespace and command chaining behavior; tests cover `&&`, `;`, `&`, and blank-line splits.
- `OPENCODE_SNIP_MODE=off` or `OPENCODE_SNIP_DISABLED=true` disables wrapping.
- Node 24 is required by `package.json`.
- ESLint enforces single quotes and semicolons.
- Tests use Vitest and exclude `dist/` and `node_modules/`.
