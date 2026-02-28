/**
 * Local launcher for Cursor Agent.
 *
 * In local mode the agent process inherits stdin/stdout/stderr so the
 * user interacts with it directly in the terminal. When a message
 * arrives from the mobile/web client, we abort the local process and
 * switch to remote mode.
 *
 * Unlike the Claude local launcher, we do NOT scan JSONL session files
 * because Cursor Agent doesn't write them. Instead we obtain the session
 * ID from the `system/init` message in remote mode, or from the
 * `--resume` flag if provided.
 */

import { logger } from "@/ui/logger";
import { cursorLocal, ExitCodeError } from "./cursorLocal";
import { CursorSession } from "./session";
import { Future } from "@/utils/future";

export type LauncherResult = { type: 'switch' } | { type: 'exit'; code: number };

export async function cursorLocalLauncher(session: CursorSession): Promise<LauncherResult> {
    let exitReason: LauncherResult | null = null;
    const processAbortController = new AbortController();
    const exitFuture = new Future<void>();

    try {
        async function abort() {
            if (!processAbortController.signal.aborted) {
                processAbortController.abort();
            }
            await exitFuture.promise;
        }

        async function doAbort() {
            logger.debug('[cursor-local]: doAbort');
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }
            session.client.closeClaudeSessionTurn('cancelled');
            session.queue.reset();
            await abort();
        }

        async function doSwitch() {
            logger.debug('[cursor-local]: doSwitch');
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }
            session.client.closeClaudeSessionTurn('cancelled');
            await abort();
        }

        session.client.rpcHandlerManager.registerHandler('abort', doAbort);
        session.client.rpcHandlerManager.registerHandler('switch', doSwitch);
        session.queue.setOnMessage(() => {
            doSwitch();
        });

        if (session.queue.size() > 0) {
            return { type: 'switch' };
        }

        while (true) {
            if (exitReason) return exitReason;

            logger.debug('[cursor-local]: launch');
            try {
                await cursorLocal({
                    path: session.path,
                    sessionId: session.sessionId,
                    onSessionFound: (id) => session.onSessionFound(id),
                    onThinkingChange: session.onThinkingChange,
                    abort: processAbortController.signal,
                    cursorEnvVars: session.cursorEnvVars,
                    cursorArgs: session.cursorArgs,
                });

                session.consumeOneTimeFlags();

                if (!exitReason) {
                    session.client.closeClaudeSessionTurn('completed');
                    exitReason = { type: 'exit', code: 0 };
                    break;
                }
            } catch (e) {
                logger.debug('[cursor-local]: launch error', e);
                if (e instanceof ExitCodeError) {
                    session.client.closeClaudeSessionTurn('failed');
                    exitReason = { type: 'exit', code: e.exitCode };
                    break;
                }
                if (!exitReason) {
                    session.client.sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                    continue;
                } else {
                    break;
                }
            }
            logger.debug('[cursor-local]: launch done');
        }
    } finally {
        exitFuture.resolve(undefined);
        session.client.rpcHandlerManager.registerHandler('abort', async () => {});
        session.client.rpcHandlerManager.registerHandler('switch', async () => {});
        session.queue.setOnMessage(null);
    }

    return exitReason || { type: 'exit', code: 0 };
}
