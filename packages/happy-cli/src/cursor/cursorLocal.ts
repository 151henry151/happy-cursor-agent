import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { logger } from "@/ui/logger";
import { getCursorAgentPath } from "./utils/cursorPath";

export class ExitCodeError extends Error {
    public readonly exitCode: number;

    constructor(exitCode: number) {
        super(`Process exited with code: ${exitCode}`);
        this.name = 'ExitCodeError';
        this.exitCode = exitCode;
    }
}

export async function cursorLocal(opts: {
    abort: AbortSignal,
    sessionId: string | null,
    path: string,
    onSessionFound: (id: string) => void,
    onThinkingChange?: (thinking: boolean) => void,
    onMessage?: (message: any) => void,
    cursorArgs?: string[],
    cursorEnvVars?: Record<string, string>,
}) {
    let thinking = false;
    let stopThinkingTimeout: NodeJS.Timeout | null = null;
    const updateThinking = (newThinking: boolean) => {
        if (thinking !== newThinking) {
            thinking = newThinking;
            logger.debug(`[CursorLocal] Thinking state changed to: ${thinking}`);
            opts.onThinkingChange?.(thinking);
        }
    };

    try {
        process.stdin.pause();
        await new Promise<void>((resolve, reject) => {
            const args: string[] = [];

            if (opts.sessionId) {
                args.push('--resume', opts.sessionId);
            }

            if (opts.cursorArgs) {
                args.push(...opts.cursorArgs);
            }

            const env = {
                ...process.env,
                ...opts.cursorEnvVars
            };

            const agentPath = getCursorAgentPath();
            logger.debug(`[CursorLocal] Spawning agent: ${agentPath}`);
            logger.debug(`[CursorLocal] Args: ${JSON.stringify(args)}`);

            const child = spawn(agentPath, args, {
                stdio: ['inherit', 'inherit', 'inherit'],
                signal: opts.abort,
                cwd: opts.path,
                env,
            });

            child.on('error', (error) => {
                logger.debug(`[CursorLocal] Process error: ${error.message}`);
            });

            child.on('exit', (code, signal) => {
                if (signal === 'SIGTERM' && opts.abort.aborted) {
                    resolve();
                } else if (signal) {
                    reject(new Error(`Process terminated with signal: ${signal}`));
                } else if (code !== 0 && code !== null) {
                    reject(new ExitCodeError(code));
                } else {
                    resolve();
                }
            });
        });
    } finally {
        process.stdin.resume();
        if (stopThinkingTimeout) {
            clearTimeout(stopThinkingTimeout);
            stopThinkingTimeout = null;
        }
        updateThinking(false);
    }

    return opts.sessionId;
}
