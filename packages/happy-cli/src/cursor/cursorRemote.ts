/**
 * Remote mode for Cursor Agent. Each turn spawns a new `agent` process
 * with `--output-format stream-json`, using `--resume <session-id>` for
 * context continuity. This is necessary because Cursor Agent does not
 * support `--input-format stream-json` (unlike Claude Code).
 *
 * Messages are forwarded to the Happy mobile/web client via the same
 * pipeline used for Claude Code.
 */

import { EnhancedMode } from "@/claude/loop";
import { cursorQuery, type CursorQueryOptions } from "./sdk";
import { mapToCursorPermissionArgs } from "./utils/cursorPath";
import type { SDKMessage, SDKSystemMessage } from "@/claude/sdk/types";
import { AbortError } from "@/claude/sdk/types";
import { logger } from "@/lib";

export async function cursorRemote(opts: {
    sessionId: string | null;
    path: string;
    cursorEnvVars?: Record<string, string>;
    cursorArgs?: string[];
    signal?: AbortSignal;

    nextMessage: () => Promise<{ message: string; mode: EnhancedMode } | null>;
    onReady: () => void;

    onSessionFound: (id: string) => void;
    onThinkingChange?: (thinking: boolean) => void;
    onMessage: (message: SDKMessage) => void;
    onCompletionEvent?: (message: string) => void;
    onSessionReset?: () => void;
}) {
    let sessionId = opts.sessionId;

    if (!sessionId && opts.cursorArgs) {
        for (let i = 0; i < opts.cursorArgs.length; i++) {
            if (opts.cursorArgs[i] === '--resume') {
                if (i + 1 < opts.cursorArgs.length) {
                    const nextArg = opts.cursorArgs[i + 1];
                    if (!nextArg.startsWith('-') && nextArg.includes('-')) {
                        sessionId = nextArg;
                        logger.debug(`[cursorRemote] Found --resume with session ID: ${sessionId}`);
                        break;
                    }
                }
            }
        }
    }

    if (opts.cursorEnvVars) {
        Object.entries(opts.cursorEnvVars).forEach(([key, value]) => {
            process.env[key] = value;
        });
    }

    let thinking = false;
    const updateThinking = (newThinking: boolean) => {
        if (thinking !== newThinking) {
            thinking = newThinking;
            logger.debug(`[cursorRemote] Thinking state changed to: ${thinking}`);
            opts.onThinkingChange?.(thinking);
        }
    };

    // Multi-turn loop: each iteration is one user turn
    while (true) {
        const incoming = await opts.nextMessage();
        if (!incoming) return;

        const mode = incoming.mode;
        const queryOpts: CursorQueryOptions = {
            cwd: opts.path,
            resume: sessionId ?? undefined,
            model: mode.model,
            permissionMode: mode.permissionMode,
            abort: opts.signal,
            cursorEnvVars: opts.cursorEnvVars,
            cursorArgs: opts.cursorArgs,
        };

        updateThinking(true);

        try {
            logger.debug(`[cursorRemote] Starting turn, sessionId=${sessionId}`);
            const response = cursorQuery({ prompt: incoming.message, options: queryOpts });

            for await (const message of response) {
                logger.debugLargeJson(`[cursorRemote] Message ${message.type}`, message);
                opts.onMessage(message);

                if (message.type === 'system' && (message as any).subtype === 'init') {
                    updateThinking(true);
                    const systemInit = message as SDKSystemMessage;
                    if (systemInit.session_id) {
                        sessionId = systemInit.session_id;
                        logger.debug(`[cursorRemote] Session ID from init: ${sessionId}`);
                        opts.onSessionFound(sessionId);
                    }
                }

                if (message.type === 'thinking') {
                    updateThinking(true);
                }

                if (message.type === 'result') {
                    updateThinking(false);
                    logger.debug('[cursorRemote] Result received, turn complete');
                }
            }
        } catch (e) {
            if (e instanceof AbortError) {
                logger.debug(`[cursorRemote] Aborted`);
                return;
            }
            throw e;
        } finally {
            updateThinking(false);
        }

        opts.onReady();
    }
}
