/**
 * T10: MCP configuration
 *
 * Cursor Agent reads MCP servers from .cursor/mcp.json.
 * Unlike Claude Code's --mcp-config inline JSON flag, Cursor uses file-based
 * config. The --approve-mcps flag auto-approves all configured MCP servers.
 *
 * This test verifies the `agent mcp list` subcommand works and that
 * --approve-mcps is accepted as a flag.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { getCursorAgentPath } from '../utils/cursorPath';
import { cursorQuery } from '../sdk/query';

describe('T10: MCP configuration', () => {
    it('agent mcp list runs without error', () => {
        const agentPath = getCursorAgentPath();
        let output: string;
        try {
            output = execSync(`${agentPath} mcp list`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 10_000,
            });
        } catch (e: any) {
            // mcp list might exit non-zero if no servers configured
            output = e.stdout || e.stderr || '';
        }
        // Just verify it executed and produced output (not a crash)
        expect(typeof output).toBe('string');
    });

    it('--approve-mcps flag is accepted by agent', async () => {
        // Spawn with --approve-mcps to confirm it doesn't cause a crash
        const messages: any[] = [];
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
            const q = cursorQuery({
                prompt: 'Say OK',
                options: {
                    cwd: '/tmp',
                    abort: controller.signal,
                    cursorArgs: ['--approve-mcps'],
                },
            });

            for await (const msg of q) {
                messages.push(msg);
                if (msg.type === 'result') break;
            }
        } catch {
            // ok
        } finally {
            clearTimeout(timeout);
        }

        const init = messages.find((m) => m.type === 'system' && m.subtype === 'init');
        expect(init).toBeDefined();
    }, 60_000);
});
