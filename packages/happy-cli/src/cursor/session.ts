/**
 * CursorSession mirrors the Claude Session class but is tailored for
 * Cursor Agent. The main differences:
 *  - No hookSettingsPath (Cursor doesn't use Claude's SessionStart hooks)
 *  - No sandboxConfig pass-through (Cursor has its own sandbox via --sandbox)
 *  - Session ID is obtained from the stream-json `system/init` message
 */

import { ApiClient, ApiSessionClient } from "@/lib";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { EnhancedMode } from "@/claude/loop";
import { logger } from "@/ui/logger";

export class CursorSession {
    readonly path: string;
    readonly logPath: string;
    readonly api: ApiClient;
    readonly client: ApiSessionClient;
    readonly queue: MessageQueue2<EnhancedMode>;
    readonly cursorEnvVars?: Record<string, string>;
    cursorArgs?: string[];
    readonly _onModeChange: (mode: 'local' | 'remote') => void;

    sessionId: string | null;
    mode: 'local' | 'remote' = 'local';
    thinking: boolean = false;

    private sessionFoundCallbacks: ((sessionId: string) => void)[] = [];
    private keepAliveInterval: NodeJS.Timeout;

    constructor(opts: {
        api: ApiClient;
        client: ApiSessionClient;
        path: string;
        logPath: string;
        sessionId: string | null;
        cursorEnvVars?: Record<string, string>;
        cursorArgs?: string[];
        messageQueue: MessageQueue2<EnhancedMode>;
        onModeChange: (mode: 'local' | 'remote') => void;
    }) {
        this.path = opts.path;
        this.api = opts.api;
        this.client = opts.client;
        this.logPath = opts.logPath;
        this.sessionId = opts.sessionId;
        this.queue = opts.messageQueue;
        this.cursorEnvVars = opts.cursorEnvVars;
        this.cursorArgs = opts.cursorArgs;
        this._onModeChange = opts.onModeChange;

        this.client.keepAlive(this.thinking, this.mode);
        this.keepAliveInterval = setInterval(() => {
            this.client.keepAlive(this.thinking, this.mode);
        }, 2000);
    }

    cleanup = (): void => {
        clearInterval(this.keepAliveInterval);
        this.sessionFoundCallbacks = [];
        logger.debug('[CursorSession] Cleaned up resources');
    };

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking;
        this.client.keepAlive(thinking, this.mode);
    };

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.client.keepAlive(this.thinking, mode);
        this._onModeChange(mode);
    };

    onSessionFound = (sessionId: string) => {
        this.sessionId = sessionId;
        this.client.updateMetadata((metadata) => ({
            ...metadata,
            cursorSessionId: sessionId,
        }));
        logger.debug(`[CursorSession] Session ID ${sessionId} added to metadata`);

        for (const callback of this.sessionFoundCallbacks) {
            callback(sessionId);
        }
    };

    addSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        this.sessionFoundCallbacks.push(callback);
    };

    removeSessionFoundCallback = (callback: (sessionId: string) => void): void => {
        const index = this.sessionFoundCallbacks.indexOf(callback);
        if (index !== -1) {
            this.sessionFoundCallbacks.splice(index, 1);
        }
    };

    clearSessionId = (): void => {
        this.sessionId = null;
        logger.debug('[CursorSession] Session ID cleared');
    };

    consumeOneTimeFlags = (): void => {
        if (!this.cursorArgs) return;

        const filteredArgs: string[] = [];
        for (let i = 0; i < this.cursorArgs.length; i++) {
            const arg = this.cursorArgs[i];

            if (arg === '--continue') {
                logger.debug('[CursorSession] Consumed --continue flag');
                continue;
            }

            if (arg === '--resume') {
                if (i + 1 < this.cursorArgs.length) {
                    const nextArg = this.cursorArgs[i + 1];
                    if (!nextArg.startsWith('-') && nextArg.includes('-')) {
                        i++;
                        logger.debug(`[CursorSession] Consumed --resume flag with session ID: ${nextArg}`);
                    } else {
                        logger.debug('[CursorSession] Consumed --resume flag (no session ID)');
                    }
                } else {
                    logger.debug('[CursorSession] Consumed --resume flag (no session ID)');
                }
                continue;
            }

            filteredArgs.push(arg);
        }

        this.cursorArgs = filteredArgs.length > 0 ? filteredArgs : undefined;
        logger.debug(`[CursorSession] Consumed one-time flags, remaining args:`, this.cursorArgs);
    };
}
