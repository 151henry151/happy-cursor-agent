/**
 * Mode-switching loop for Cursor Agent.
 *
 * Alternates between local (interactive terminal) and remote (headless
 * stream-json) modes, exactly like the Claude loop but using Cursor-
 * specific launchers and session management.
 */

import { ApiSessionClient } from "@/api/apiSession";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { logger } from "@/ui/logger";
import { CursorSession } from "./session";
import { cursorLocalLauncher, type LauncherResult } from "./cursorLocalLauncher";
import { cursorRemoteLauncher } from "./cursorRemoteLauncher";
import { ApiClient } from "@/lib";
import type { EnhancedMode, PermissionMode } from "@/claude/loop";

interface CursorLoopOptions {
    path: string;
    model?: string;
    permissionMode?: PermissionMode;
    startingMode?: 'local' | 'remote';
    onModeChange: (mode: 'local' | 'remote') => void;
    session: ApiSessionClient;
    api: ApiClient;
    cursorEnvVars?: Record<string, string>;
    cursorArgs?: string[];
    messageQueue: MessageQueue2<EnhancedMode>;
    onSessionReady?: (session: CursorSession) => void;
}

export async function cursorLoop(opts: CursorLoopOptions): Promise<number> {
    const logPath = logger.logFilePath;
    const session = new CursorSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        logPath,
        sessionId: null,
        cursorEnvVars: opts.cursorEnvVars,
        cursorArgs: opts.cursorArgs,
        messageQueue: opts.messageQueue,
        onModeChange: opts.onModeChange,
    });

    opts.onSessionReady?.(session);

    let mode: 'local' | 'remote' = opts.startingMode ?? 'local';
    while (true) {
        logger.debug(`[cursorLoop] Iteration with mode: ${mode}`);

        switch (mode) {
            case 'local': {
                const result = await cursorLocalLauncher(session);
                switch (result.type) {
                    case 'switch':
                        mode = 'remote';
                        opts.onModeChange?.(mode);
                        break;
                    case 'exit':
                        return result.code;
                    default:
                        const _: never = result satisfies never;
                }
                break;
            }

            case 'remote': {
                const reason = await cursorRemoteLauncher(session);
                switch (reason) {
                    case 'exit':
                        return 0;
                    case 'switch':
                        mode = 'local';
                        opts.onModeChange?.(mode);
                        break;
                    default:
                        const _: never = reason satisfies never;
                }
                break;
            }

            default: {
                const _: never = mode satisfies never;
            }
        }
    }
}
