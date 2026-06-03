const MODE = (process.env.OPENCODE_SNIP_MODE ?? 'balanced').toLowerCase();
const DISABLED =
    process.env.OPENCODE_SNIP_DISABLED === 'true' || MODE === 'off';

const BUILTIN_DENYLIST = new Set([
    'cd',
    'source',
    '.',
    'export',
    'alias',
    'unset',
    'if',
    'then',
    'fi',
    'for',
    'while',
    'case',
    'do',
    'done',
    'function',
    'eval',
    'exec',
    'trap',
]);

const ALWAYS_SKIP_COMMANDS = new Set([
    'date',
    'mktemp',
    'printf',
    '[',
    '[[',
]);

const HIGH_VALUE_COMMANDS = new Set([
    'go',
    'cargo',
    'pytest',
    'jest',
    'vitest',
    'npm',
    'pnpm',
    'yarn',
    'git',
    'kubectl',
    'terraform',
    'helm',
    'docker',
    'find',
    'grep',
    'rg',
]);

type SplitPart = {
    type: 'segment' | 'delimiter';
    value: string;
};

function isEnvAssignment(token: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*=.+$/.test(token);
}

function normalizeMode(): 'conservative' | 'balanced' | 'aggressive' {
    if (MODE === 'conservative') return 'conservative';
    if (MODE === 'balanced') return 'balanced';
    if (MODE === 'aggressive') return 'aggressive';
    return 'balanced';
}

function parseLeadingEnvAndCommand(segment: string): {
    envTokens: string[];
    commandToken: string | null;
    trimmed: string;
} {
    const trimmed = segment.trim();
    if (!trimmed) {
        return {envTokens: [], commandToken: null, trimmed};
    }

    const tokens = trimmed.split(/\s+/);
    const envTokens: string[] = [];

    let i = 0;
    while (i < tokens.length && isEnvAssignment(tokens[i])) {
        envTokens.push(tokens[i]);
        i++;
    }

    return {
        envTokens,
        commandToken: tokens[i] ?? null,
        trimmed,
    };
}

function isDangerousShellContext(trimmed: string): boolean {
    // Command substitution / backticks
    if (trimmed.includes('$(') || trimmed.includes('`')) return true;

    // Heredocs / here strings / process substitution
    if (trimmed.includes('<<') || trimmed.includes('<<<')) return true;
    if (trimmed.includes('<(') || trimmed.includes('>(')) return true;

    return false;
}

function shouldWrapSingleCommand(segment: string): boolean {
    if (DISABLED) return false;

    const {commandToken, trimmed} = parseLeadingEnvAndCommand(segment);

    if (!trimmed || !commandToken) return false;

    if (normalizeMode() === 'conservative' && !HIGH_VALUE_COMMANDS.has(commandToken)) {
        return false;
    }

    // Idempotency
    if (trimmed.startsWith('snip ')) return false;

    // Unsafe shell contexts that can break agent workflows
    if (isDangerousShellContext(trimmed)) return false;

    // Builtins / shell-only forms
    if (BUILTIN_DENYLIST.has(commandToken)) return false;

    // Commands known to break orchestration / handoff flows
    if (commandToken === 'date') return false;
    if (commandToken === 'mktemp') return false;
    if (commandToken === 'printf') return false;

    // Otherwise wrap
    return true;
}

function insertSnipIntoSingleCommand(segment: string): string {
    const match = segment.match(/^(\s*)(.*?)(\s*)$/s);
    if (!match) return segment;

    const [, leadingWs, core, trailingWs] = match;
    if (!core.trim()) return segment;

    const trimmed = core.trim();

    // idempotency
    if (trimmed.startsWith('snip ')) {
        return segment;
    }

    if (!shouldWrapSingleCommand(segment)) {
        return segment;
    }

    let i = 0;
    const len = core.length;

    while (i < len && /\s/.test(core[i])) i++;

    while (i < len) {
        const start = i;

        while (i < len && !/\s/.test(core[i])) i++;
        const token = core.slice(start, i);

        if (isEnvAssignment(token)) {
            while (i < len && /\s/.test(core[i])) i++;
            continue;
        }

        const cmdStart = start;
        const cmdEnd = i;
        const commandToken = core.slice(cmdStart, cmdEnd);

        if (BUILTIN_DENYLIST.has(commandToken) || ALWAYS_SKIP_COMMANDS.has(commandToken)) {
            return segment;
        }

        const beforeCommand = core.slice(0, cmdStart);

        const rawCommand = core.slice(cmdStart);

// ✅ split ONLY the command token, not the whole string
        const matchCmd = rawCommand.match(/^(\S+)([\s\S]*)$/);

        if (!matchCmd) {
            return segment;
        }

        let [_, cmdToken, remainder] = matchCmd;

        if (cmdToken.startsWith('/')) {
            cmdToken = cmdToken.split('/').pop()!;
        }

// ✅ preserve ALL whitespace in remainder
        const normalizedCommand = cmdToken + remainder;

        return `${leadingWs}${beforeCommand}snip ${normalizedCommand}${trailingWs}`;
    }

    return segment;
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
    const parts: SplitPart[] = [];
    let buf = '';

    let inSingle = false;
    let inDouble = false;

    const pushBuf = () => {
        parts.push({type: 'segment', value: buf});
        buf = '';
    };

    let i = 0;
    while (i < command.length) {
        const ch = command[i];
        const next = command[i + 1] ?? '';

        if (!inDouble && ch === '\'') {
            inSingle = !inSingle;
            buf += ch;
            i++;
            continue;
        }

        if (!inSingle && ch === '"') {
            inDouble = !inDouble;
            buf += ch;
            i++;
            continue;
        }

        if (!inSingle && !inDouble) {
            // escaped blank line: "\\\n\\\n"
            if (
                ch === '\\' &&
                next === '\n' &&
                command[i + 2] === '\\' &&
                command[i + 3] === '\n'
            ) {
                pushBuf();
                parts.push({
                    type: 'delimiter',
                    value: '\\\n\\\n',
                });
                i += 4;
                continue;
            }

            if (ch === '&' && next === '&') {
                pushBuf();
                parts.push({type: 'delimiter', value: '&&'});
                i += 2;
                continue;
            }

            if (ch === '\n') {
                let j = i + 1;
                while (j < command.length && (command[j] === ' ' || command[j] === '\t')) {
                    j++;
                }
                if (j < command.length && command[j] === '\n') {
                    pushBuf();
                    parts.push({type: 'delimiter', value: command.slice(i, j + 1)});
                    i = j + 1;
                    continue;
                }
            }

            if (ch === ';') {
                pushBuf();
                parts.push({type: 'delimiter', value: ';'});
                i++;
                continue;
            }

            if (ch === '&') {
                pushBuf();
                parts.push({type: 'delimiter', value: '&'});
                i++;
                continue;
            }
        }

        buf += ch;
        i++;
    }

    pushBuf();
    return parts;
}

function wrapCommand(command: string): string {
    const parts = splitTopLevel(command);

    return parts
        .map((part) => {
            if (part.type === 'delimiter') return part.value;
            if (!part.value.trim()) return part.value;
            return insertSnipIntoSingleCommand(part.value);
        })
        .join('');
}

export const SnipPlugin = async () => {
    return {
        'tool.execute.before': async (input: any, output: any) => {
            try {
                if (input.tool !== 'bash') return;
                if (DISABLED) return;

                const command = output?.args?.command;
                if (!command || typeof command !== 'string') return;

                output.args.command = wrapCommand(command);
            } catch {
                // fail open: never break the pipeline
                return;
            }
        },
    };
};
