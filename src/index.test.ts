import { describe, it, expect, beforeEach } from 'vitest';
import { SnipPlugin } from './index';

describe('toolExecuteBefore', () => {
  let mockInput: { tool: string; sessionID: string; callID: string };
  let mockOutput: { args: { command: string } };
  let plugin: Awaited<ReturnType<typeof SnipPlugin>>;
  let toolExecuteBefore: Awaited<
      ReturnType<typeof SnipPlugin>
  >['tool.execute.before'];
  const originalSnipMode = process.env.OPENCODE_SNIP_MODE;
  const originalSnipDisabled = process.env.OPENCODE_SNIP_DISABLED;

  beforeEach(async () => {
    process.env.OPENCODE_SNIP_MODE = originalSnipMode;
    process.env.OPENCODE_SNIP_DISABLED = originalSnipDisabled;

    mockInput = { tool: 'bash', sessionID: 's', callID: 'c' };
    mockOutput = { args: { command: '' } };

    plugin = await SnipPlugin();
    toolExecuteBefore = plugin['tool.execute.before'];
  });

  it('should default to balanced mode', async () => {
    delete process.env.OPENCODE_SNIP_MODE;

    plugin = await SnipPlugin();
    toolExecuteBefore = plugin['tool.execute.before'];
    mockOutput.args.command = 'git log';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('snip git log');
  });

  it('should wrap only high-value commands in conservative mode', async () => {
    process.env.OPENCODE_SNIP_MODE = 'conservative';

    plugin = await SnipPlugin();
    toolExecuteBefore = plugin['tool.execute.before'];

    mockOutput.args.command = 'git log';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('snip git log');

    mockOutput.args.command = 'echo hello';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('echo hello');
  });

  it('should keep broad wrapping in aggressive mode', async () => {
    process.env.OPENCODE_SNIP_MODE = 'aggressive';

    plugin = await SnipPlugin();
    toolExecuteBefore = plugin['tool.execute.before'];
    mockOutput.args.command = 'echo hello';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('snip echo hello');
  });

  it('should prefix simple command with snip', async () => {
    mockOutput.args.command = 'go test ./...';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('snip go test ./...');
  });

  it('should handle command with one env var prefix', async () => {
    mockOutput.args.command = 'CGO_ENABLED=0 go test ./...';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'CGO_ENABLED=0 snip go test ./...'
    );
  });

  it('should handle command with multiple env var prefixes', async () => {
    mockOutput.args.command = 'CGO_ENABLED=0 GOOS=linux go test ./...';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'CGO_ENABLED=0 GOOS=linux snip go test ./...'
    );
  });

  it('should handle command with &&', async () => {
    mockOutput.args.command = 'go test && go build';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip go test && snip go build'
    );
  });

  it('should handle command with newline', async () => {
    mockOutput.args.command = 'git log \\\n head';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip git log \\\n head'
    );
  });

  it('should handle command with ;', async () => {
    mockOutput.args.command = 'go test; go build';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip go test; snip go build'
    );
  });

  it('should handle command with double newline', async () => {
    mockOutput.args.command = 'test -f foo.txt \\\n\\\n echo missing';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip test -f foo.txt \\\n\\\n snip echo missing'
    );
  });

  it('should handle command with &', async () => {
    mockOutput.args.command = 'sleep 1 & sleep 2 &';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip sleep 1 & snip sleep 2 &'
    );
  });

  it('should handle mixed operators', async () => {
    mockOutput.args.command = 'go test && go build; go run';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'snip go test && snip go build; snip go run'
    );
  });

  it('should handle env vars with operators', async () => {
    mockOutput.args.command = 'FOO=bar go test && go build';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe(
        'FOO=bar snip go test && snip go build'
    );
  });

  it('should not double prefix already prefixed command', async () => {
    mockOutput.args.command = 'snip go test';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('snip go test');
  });

  it('should not modify non-bash tool calls', async () => {
    mockInput.tool = 'read';
    mockOutput.args.command = 'go test';

    await toolExecuteBefore(mockInput, mockOutput);

    expect(mockOutput.args.command).toBe('go test');
  });

  describe('unproxyable shell builtins', () => {
    it('should skip cd', async () => {
      mockOutput.args.command = 'cd /tmp';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('cd /tmp');
    });

    it('should skip source', async () => {
      mockOutput.args.command = 'source ~/.bashrc';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('source ~/.bashrc');
    });

    it('should skip . (dot)', async () => {
      mockOutput.args.command = '. ./env.sh';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('. ./env.sh');
    });

    it('should skip export', async () => {
      mockOutput.args.command = 'export FOO=bar';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('export FOO=bar');
    });

    it('should skip alias', async () => {
      mockOutput.args.command = 'alias ll="ls -la"';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('alias ll="ls -la"');
    });

    it('should skip unset', async () => {
      mockOutput.args.command = 'unset VAR';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('unset VAR');
    });

    it('should skip export with env var prefix', async () => {
      mockOutput.args.command = 'CGO_ENABLED=0 export FOO=bar';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe(
          'CGO_ENABLED=0 export FOO=bar'
      );
    });

    it('should skip cd but snip chained command', async () => {
      mockOutput.args.command = 'cd /tmp && ls';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe(
          'cd /tmp && snip ls'
      );
    });

    it('should not split operators inside single quotes', async () => {
      mockOutput.args.command = 'echo \'a && b\' && echo done';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe(
          'snip echo \'a && b\' && snip echo done'
      );
    });

    it('should not modify segment with only env vars', async () => {
      mockOutput.args.command = 'FOO=bar BAZ=qux';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe('FOO=bar BAZ=qux');
    });

    it('should split on plain blank line (non-escaped newline pair)', async () => {
      mockOutput.args.command = 'echo first\n\necho second';

      await toolExecuteBefore(mockInput, mockOutput);

      expect(mockOutput.args.command).toBe(
          'snip echo first\n\nsnip echo second'
      );
    });

    it('should safely handle errors and not throw (catch block coverage)', async () => {
      const plugin = await SnipPlugin();
      const toolExecuteBefore = plugin['tool.execute.before'];

      const mockInput = {
        tool: 'bash',
        sessionID: 's',
        callID: 'c',
      };

      const mockOutput = {
        args: {
          get command() {
            throw new Error('boom');
          },
        },
      };

      await expect(toolExecuteBefore(mockInput, mockOutput)).resolves.toBeUndefined();
    });
  });
});
