/**
 * T7: Session ID from system/init
 * T8: --resume preserves context
 * T9: --continue resumes last session
 *
 * Cursor Agent provides session_id in the `system/init` message, which
 * replaces Claude Code's SessionStart hook mechanism.
 */

import { describe, it, expect } from 'vitest';
import { cursorQuery } from '../sdk/query';

async function runAndGetInit(prompt: string, extraArgs: string[] = []): Promise<{ init: any; result: any; allMessages: any[] }> {
    const allMessages: any[] = [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let init: any = null;
    let result: any = null;

    try {
        const q = cursorQuery({
            prompt,
            options: { cwd: '/tmp', abort: controller.signal, cursorArgs: extraArgs },
        });

        for await (const msg of q) {
            allMessages.push(msg);
            if (msg.type === 'system' && (msg as any).subtype === 'init') {
                init = msg;
            }
            if (msg.type === 'result') {
                result = msg;
                break;
            }
        }
    } catch {
        // ok
    } finally {
        clearTimeout(timeout);
    }
    return { init, result, allMessages };
}

describe('T7: session_id from system/init', () => {
    it('system/init message contains a UUID session_id', async () => {
        const { init } = await runAndGetInit('Say OK');
        expect(init).toBeDefined();
        expect(init.session_id).toBeTruthy();
        expect(typeof init.session_id).toBe('string');
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        expect(init.session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }, 60_000);

    it('system/init contains model info', async () => {
        const { init } = await runAndGetInit('Say OK');
        expect(init.model).toBeTruthy();
    }, 60_000);
});

describe('T8: --resume preserves session', () => {
    it('resumed session has same session_id as original', async () => {
        // Create a session
        const { init: init1 } = await runAndGetInit('Remember: the secret code is ALPHA. Say OK.');
        expect(init1).toBeDefined();
        const sessionId = init1.session_id;

        // Resume the session
        const { init: init2, result: result2 } = await runAndGetInit(
            'What is the secret code I told you?',
            ['--resume', sessionId],
        );
        expect(init2).toBeDefined();
        expect(init2.session_id).toBe(sessionId);

        // The result should reference ALPHA (context preserved)
        expect(result2).toBeDefined();
        if (result2?.result) {
            expect(result2.result.toUpperCase()).toContain('ALPHA');
        }
    }, 120_000);
});

describe('T9: --continue resumes last session', () => {
    it('--continue produces a valid session', async () => {
        // First create a session
        await runAndGetInit('Say hello');

        // Now continue
        const { init } = await runAndGetInit('Say goodbye', ['--continue']);
        expect(init).toBeDefined();
        expect(init.session_id).toBeTruthy();
    }, 120_000);
});
