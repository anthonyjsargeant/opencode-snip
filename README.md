# opencode-snip

OpenCode plugin that prefixes eligible `bash` commands with [`snip`](https://github.com/edouard-claude/snip) before execution.

## What it does

- Hooks `tool.execute.before` for `bash` commands.
- Prefixes eligible commands with `snip`.
- Leaves commands unchanged when wrapping is disabled or unsafe.

## Installation

This repository is not published to npm.

### 1. Clone the repo and install dependencies

```bash
git clone https://github.com/anthonyjsargeant/opencode-snip.git
cd opencode-snip
npm ci
npm run build
```

### 2. Point OpenCode at the local plugin entrypoint

Add the plugin to your `opencode.json` file:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-snip"]
}
```

Then create a symlink from OpenCode's plugin directory:

```bash
mkdir -p ~/.config/opencode/plugins
ln -s /path/to/opencode-snip/.opencode/plugins/index.ts ~/.config/opencode/plugins/opencode-snip.ts
```

## Configuration

- `OPENCODE_SNIP_MODE=off`: disable wrapping
- `OPENCODE_SNIP_MODE=conservative`: only wrap high-value commands
- `OPENCODE_SNIP_MODE=balanced`: default behavior
- `OPENCODE_SNIP_MODE=aggressive`: currently behaves like `balanced`
- `OPENCODE_SNIP_DISABLED=true`: disable wrapping

## Behavior

The plugin wraps each eligible top-level command segment separately. It splits on `&&`, `;`, `&`, and blank lines, but not on pipes, single newlines, or quoted text.

It skips commands already prefixed with `snip`, shell builtins, unsafe shell contexts, and command tokens like `date`, `mktemp`, `printf`, `[`, and `[[`.

Environment assignments before the command are preserved:

```bash
FOO=bar npm test
```

becomes:

```bash
FOO=bar snip npm test
```

### Conservative mode

`OPENCODE_SNIP_MODE=conservative` only wraps commands whose first token is in the high-value list, including:

- `go`
- `cargo`
- `pytest`
- `jest`
- `vitest`
- `npm`
- `pnpm`
- `yarn`
- `git`
- `kubectl`
- `terraform`
- `helm`
- `docker`
- `find`
- `grep`
- `rg`

## Notes

- If wrapping fails, the plugin leaves the original command unchanged.
- `balanced` is the default mode, and `aggressive` currently behaves the same way.

## Development

```bash
npm ci
npm run build
npm run typecheck
npm test
npm run lint
```

## License

MIT
