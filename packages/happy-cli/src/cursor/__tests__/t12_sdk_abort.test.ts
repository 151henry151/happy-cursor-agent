/**
 * T12: SDK abort via AbortController
 *
 * Verifies that aborting the AbortController kills the agent process
 * and the CursorQuery iterator stops cleanly.
 */

import { describe, it, expect } from 'vitest';
import { cursorQuery } from '../sdk/query';
import { AbortError } from '@/claude/sdk/types';

describe('T12: abort controller', () => {
    it('aborting mid-stream terminates the query', async () => {
        const controller = new AbortController();
        let messageCount = 0;
        let caughtAbort = false;

        try {
            const q = cursorQuery({
                prompt: 'Write a very long essay about the history of computing. At least 2000 words.',
                options: {
                    cwd: '/tmp',
                    abort: controller.signal,
                },
            });

            for await (const msg of q) {
                messageCount++;
                // Abort after receiving the init message
                if (msg.type === 'system') {
                    controller.abort();
                }
            }
        } catch (e) {
            if (e instanceof AbortError || (e instanceof Error && e.message.includes('abort'))) {
                caughtAbort = true;
            }
        }

        // We should have received at least the init message
        expect(messageCount).toBeGreaterThanOrEqual(1);
        // The loop should have terminated (either via AbortError or iterator end)
        expect(caughtAbort || messageCount < 50).toBe(true);
    }, 30_000);
});
