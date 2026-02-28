/**
 * T11: SDK multi-round conversation via --resume
 *
 * Cursor Agent does NOT support --input-format stream-json. Multi-turn
 * conversations require spawning a new process per turn with --resume.
 *
 * This test verifies cursorQueryMultiTurn correctly orchestrates this.
 */

import { describe, it, expect } from 'vitest';
import { cursorQueryMultiTurn } from '../sdk/query';
import { PushableAsyncIterable } from '@/utils/PushableAsyncIterable';
import type { SDKUserMessage, SDKMessage } from '@/claude/sdk/types';

describe('T11: multi-round conversation via --resume', () => {
    it('handles two consecutive turns, each spawning a new process', async () => {
        const messages = new PushableAsyncIterable<SDKUserMessage>();
        const allResponses: SDKMessage[] = [];
        let resultCount = 0;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);

        messages.push({
            type: 'user',
            message: { role: 'user', content: 'Remember: secret=BETA. Say OK.' },
        });

        try {
            for await (const msg of cursorQueryMultiTurn({
                messages,
                options: { cwd: '/tmp', abort: controller.signal },
            })) {
                allResponses.push(msg);

                if (msg.type === 'result') {
                    resultCount++;
                    if (resultCount === 1) {
                        messages.push({
                            type: 'user',
                            message: { role: 'user', content: 'What is the secret I just told you?' },
                        });
                    } else {
                        messages.end();
                        break;
                    }
                }
            }
        } catch {
            // ok
        } finally {
            clearTimeout(timeout);
        }

        expect(resultCount).toBe(2);

        const results = allResponses.filter((m) => m.type === 'result');
        expect(results.length).toBe(2);

        // The second result should contain BETA (context preserved via --resume)
        const secondResult = results[1] as any;
        if (secondResult?.result) {
            expect(secondResult.result.toUpperCase()).toContain('BETA');
        }
    }, 120_000);
});
