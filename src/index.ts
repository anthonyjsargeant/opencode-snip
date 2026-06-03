const DISABLED = process.env.OPENCODE_SNIP_DISABLED === "true"

const BUILTIN_DENYLIST = new Set([
  "cd",
  "source",
  ".",
  "export",
  "alias",
  "unset",
])

type SplitPart = {
  type: "segment" | "delimiter"
  value: string
}

function isEnvAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(token)
}

function insertSnipIntoSingleCommand(segment: string): string {
  const match = segment.match(/^(\s*)(.*?)(\s*)$/s)
  if (!match) return segment

  const [, leadingWs, core, trailingWs] = match
  if (!core.trim()) return segment

  const trimmed = core.trim()

  // idempotency
  if (trimmed.startsWith("snip ")) {
    return segment
  }

  // Preserve original whitespace/newlines by parsing from the raw core string
  let i = 0
  const len = core.length

  // skip internal leading whitespace (already captured in leadingWs for most cases,
  // but keep this defensive)
  while (i < len && /\s/.test(core[i])) i++

  const envRanges: string[] = []

  while (i < len) {
    const start = i

    // read token until whitespace
    while (i < len && !/\s/.test(core[i])) i++
    const token = core.slice(start, i)

    if (isEnvAssignment(token)) {
      envRanges.push(token)

      // preserve the exact whitespace after each env assignment
      const wsStart = i
      while (i < len && /\s/.test(core[i])) i++
      envRanges.push(core.slice(wsStart, i))
      continue
    }

    // first non-env token = command
    const cmdStart = start
    const cmdEnd = i
    const commandToken = core.slice(cmdStart, cmdEnd)

    if (BUILTIN_DENYLIST.has(commandToken)) {
      return segment
    }

    const beforeCommand = core.slice(0, cmdStart)
    const fromCommandOnward = core.slice(cmdStart)

    return `${leadingWs}${beforeCommand}snip ${fromCommandOnward}${trailingWs}`
  }

  return segment
}

/**
 * Split on top-level:
 * - &&
 * - ;
 * - &
 * - blank lines (\n ... \n)
 *
 * Do NOT split on:
 * - pipes |
 * - single newlines
 * - anything inside quotes
 */
function splitTopLevel(command: string): SplitPart[] {
  const parts: SplitPart[] = []
  let buf = ""

  let inSingle = false
  let inDouble = false

  const pushBuf = () => {
    parts.push({ type: "segment", value: buf })
    buf = ""
  }

  let i = 0
  while (i < command.length) {
    const ch = command[i]
    const next = command[i + 1] ?? ""

    // quote tracking
    if (!inDouble && ch === "'") {
      inSingle = !inSingle
      buf += ch
      i++
      continue
    }

    if (!inSingle && ch === '"') {
      inDouble = !inDouble
      buf += ch
      i++
      continue
    }

    if (!inSingle && !inDouble) {
      // 1) escaped blank line: "\\\n\\\n"
      //    Split HERE so the second command gets its own snip prefix.
      if (
          ch === "\\" &&
          next === "\n" &&
          command[i + 2] === "\\" &&
          command[i + 3] === "\n"
      ) {
        pushBuf()
        parts.push({
          type: "delimiter",
          value: "\\\n\\\n",
        })
        i += 4
        continue
      }

      // 2) &&
      if (ch === "&" && next === "&") {
        pushBuf()
        parts.push({ type: "delimiter", value: "&&" })
        i += 2
        continue
      }

      // 3) plain blank line: \n[spaces/tabs]*\n
      if (ch === "\n") {
        let j = i + 1
        while (j < command.length && (command[j] === " " || command[j] === "\t")) {
          j++
        }
        if (j < command.length && command[j] === "\n") {
          pushBuf()
          parts.push({ type: "delimiter", value: command.slice(i, j + 1) })
          i = j + 1
          continue
        }
      }

      // 4) ;
      if (ch === ";") {
        pushBuf()
        parts.push({ type: "delimiter", value: ";" })
        i++
        continue
      }

      // 5) single &
      if (ch === "&") {
        pushBuf()
        parts.push({ type: "delimiter", value: "&" })
        i++
        continue
      }
    }

    buf += ch
    i++
  }

  pushBuf()
  return parts
}


function wrapCommand(command: string): string {
  const parts = splitTopLevel(command)

  return parts
      .map((part) => {
        if (part.type === "delimiter") return part.value

        // If a segment is only whitespace, leave it alone.
        if (!part.value.trim()) return part.value

        return insertSnipIntoSingleCommand(part.value)
      })
      .join("")
}

export const SnipPlugin = async () => {
  return {
    "tool.execute.before": async (input: any, output: any) => {
      try {
        if (input.tool !== "bash") return
        if (DISABLED) return

        const command = output?.args?.command
        if (!command || typeof command !== "string") return

        output.args.command = wrapCommand(command)
      } catch {
        // fail open: never break the pipeline
        return
      }
    },
  }
}
