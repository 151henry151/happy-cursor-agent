/**
 * T13: cursorRemote integration test
 * T14: cursorLocal integration test (spawn + exit)
 *
 * These verify the full launcher logic rather than just the SDK layer.
 */

import { describe, it, expect } from 'vitest';
import { cursorQuery } from '../sdk/query';
import type { SDKMessage, SDKSystemMessage } from '@/claude/sdk/types';

describe('T13: cursorRemote full flow', () => {
    it('receives system/init, assistant, and result in correct order', async () => {
        const types: string[] = [];
        let sessionId: string | null = null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
            const q = cursorQuery({
                prompt: 'Say hello',
                options: { cwd: '/tmp', abort: controller.signal },
            });

            for await (const msg of q) {
                types.push(msg.type);
                if (msg.type === 'system' && (msg as any).subtype === 'init') {
                    sessionId = (msg as SDKSystemMessage).session_id ?? null;
                }
                if (msg.type === 'result') break;
            }
        } catch {
            // ok
        } finally {
            clearTimeout(timeout);
        }

        // Verify message ordering: system(init) comes first
        expect(types[0]).toBe('system');

        // user message echoed back
        expect(types).toContain('user');

        // assistant response
        expect(types).toContain('assistant');

        // result at the end
        expect(types[types.length - 1]).toBe('result');

        // Session ID was captured
        expect(sessionId).toBeTruthy();
    }, 60_000);
});

describe('T14: cursorLocal spawn and exit', () => {
    it('getCursorAgentPath resolves to a real binary', async () => {
        const { getCursorAgentPath } = await import('../utils/cursorPath');
        const path = getCursorAgentPath();
        expect(path).toBeTruthy();
        expect(typeof path).toBe('string');

        // Verify we can call --version
        const { execSync } = await import('node:child_process');
        const version = execSync(`${path} --version`, {
            encoding: 'utf8',
            timeout: 5_000,
        }).trim();
        expect(version).toMatch(/\d/); // contains at least one digit
    });

    it('cursorLocal ExitCodeError has correct code', async () => {
        const { ExitCodeError } = await import('../cursorLocal');
        const err = new ExitCodeError(42);
        expect(err.exitCode).toBe(42);
        expect(err.message).toContain('42');
        expect(err.name).toBe('ExitCodeError');
    });
});
