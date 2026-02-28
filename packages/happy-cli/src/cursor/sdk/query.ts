/**
 * Cursor Agent SDK query implementation.
 *
 * Spawns `agent -p --output-format stream-json --trust` and reads NDJSON
 * messages from stdout. The message format is compatible with the Claude
 * Code SDK types (system/init, user, assistant, result, thinking, etc.)
 * so all existing converters and formatters work unchanged.
 *
 * IMPORTANT: Unlike Claude Code, Cursor Agent does NOT support
 * `--input-format stream-json`. Multi-turn conversations must be achieved
 * by spawning a new process per turn using `--resume <session-id>`.
 * The `cursorQueryMultiTurn` helper orchestrates this pattern.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Stream } from '@/claude/sdk/stream';
import type { SDKMessage, SDKUserMessage, SDKSystemMessage, CanCallToolCallback, PermissionResult } from '@/claude/sdk/types';
import { AbortError } from '@/claude/sdk/types';
import { getCursorAgentPath, mapToCursorPermissionArgs } from '../utils/cursorPath';
import { logger } from '@/ui/logger';

export interface CursorQueryOptions {
    abort?: AbortSignal;
    cwd?: string;
    resume?: string;
    model?: string;
    permissionMode?: string;
    appendSystemPrompt?: string;
    customSystemPrompt?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    canCallTool?: CanCallToolCallback;
    cursorEnvVars?: Record<string, string>;
    cursorArgs?: string[];
}

export class CursorQuery implements AsyncIterableIterator<SDKMessage> {
    private inputStream = new Stream<SDKMessage>();
    private sdkMessages: AsyncIterableIterator<SDKMessage>;

    constructor(
        childStdout: NodeJS.ReadableStream,
        private processExitPromise: Promise<void>,
    ) {
        this.readMessages(childStdout);
        this.sdkMessages = this.readSdkMessages();
    }

    setError(error: Error): void {
        this.inputStream.error(error);
    }

    next(...args: [] | [undefined]): Promise<IteratorResult<SDKMessage>> {
        return this.sdkMessages.next(...args);
    }

    return(value?: any): Promise<IteratorResult<SDKMessage>> {
        return this.sdkMessages.return ? this.sdkMessages.return(value) : Promise.resolve({ done: true, value: undefined });
    }

    throw(e: any): Promise<IteratorResult<SDKMessage>> {
        return this.sdkMessages.throw ? this.sdkMessages.throw(e) : Promise.reject(e);
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<SDKMessage> {
        return this.sdkMessages;
    }

    private async readMessages(stdout: NodeJS.ReadableStream): Promise<void> {
        const rl = createInterface({ input: stdout });
        try {
            for await (const line of rl) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line) as SDKMessage;
                        this.inputStream.enqueue(message);
                    } catch {
                        logger.debug(`[CursorQuery] Non-JSON line: ${line.substring(0, 200)}`);
                    }
                }
            }
            await this.processExitPromise;
        } catch (error) {
            this.inputStream.error(error as Error);
        } finally {
            this.inputStream.done();
            rl.close();
        }
    }

    private async *readSdkMessages(): AsyncIterableIterator<SDKMessage> {
        for await (const message of this.inputStream) {
            yield message;
        }
    }
}

/**
 * Spawn `agent` in print/headless mode with stream-json output for a
 * single turn. For multi-turn conversations, use `cursorQueryMultiTurn`.
 */
export function cursorQuery(config: {
    prompt: string;
    options?: CursorQueryOptions;
}): CursorQuery {
    const opts = config.options ?? {};
    const args: string[] = ['-p', '--output-format', 'stream-json', '--trust'];

    if (opts.resume) args.push('--resume', opts.resume);
    if (opts.model) args.push('--model', opts.model);

    const permArgs = mapToCursorPermissionArgs(opts.permissionMode);
    args.push(...permArgs);

    if (opts.cwd) args.push('--workspace', opts.cwd);

    if (opts.cursorArgs) {
        args.push(...opts.cursorArgs);
    }

    args.push(config.prompt.trim());

    const agentPath = getCursorAgentPath();
    logger.debug(`[CursorQuery] Spawning: ${agentPath} ${args.join(' ')}`);

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...opts.cursorEnvVars,
    };

    const child = spawn(agentPath, args, {
        cwd: opts.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: opts.abort,
        env,
    }) as ChildProcessWithoutNullStreams;

    child.stdin.end();

    if (process.env.DEBUG) {
        child.stderr.on('data', (data: Buffer) => {
            logger.debug('Cursor Agent stderr: ' + data.toString());
        });
    }

    const cleanup = () => {
        if (!child.killed) {
            child.kill('SIGTERM');
        }
    };

    opts.abort?.addEventListener('abort', cleanup);
    process.on('exit', cleanup);

    const processExitPromise = new Promise<void>((resolve) => {
        child.on('close', (code) => {
            if (opts.abort?.aborted) {
                query.setError(new AbortError('Cursor Agent process aborted by user'));
            }
            if (code !== 0 && code !== null) {
                query.setError(new Error(`Cursor Agent process exited with code ${code}`));
            } else {
                resolve();
            }
        });
    });

    const query = new CursorQuery(child.stdout, processExitPromise);

    child.on('error', (error) => {
        if (opts.abort?.aborted) {
            query.setError(new AbortError('Cursor Agent process aborted by user'));
        } else {
            query.setError(new Error(`Failed to spawn Cursor Agent process: ${error.message}`));
        }
    });

    processExitPromise.finally(() => {
        cleanup();
        opts.abort?.removeEventListener('abort', cleanup);
    });

    return query;
}

/**
 * Extract session_id from the messages collected so far.
 */
function extractSessionId(messages: SDKMessage[]): string | null {
    for (const msg of messages) {
        if (msg.type === 'system' && (msg as any).subtype === 'init') {
            return (msg as SDKSystemMessage).session_id ?? null;
        }
    }
    return null;
}

/**
 * Multi-turn conversation orchestrator. Spawns a new `agent` process for
 * each turn, using `--resume <session-id>` to maintain context.
 *
 * Yields all SDKMessages from every turn sequentially. The caller sees a
 * single continuous stream of messages across all turns.
 */
export async function* cursorQueryMultiTurn(config: {
    messages: AsyncIterable<SDKUserMessage>;
    options?: CursorQueryOptions;
}): AsyncGenerator<SDKMessage> {
    const opts = config.options ?? {};
    let sessionId: string | null = opts.resume ?? null;

    for await (const userMsg of config.messages) {
        const prompt = typeof userMsg.message.content === 'string'
            ? userMsg.message.content
            : JSON.stringify(userMsg.message.content);

        const turnOpts: CursorQueryOptions = {
            ...opts,
            resume: sessionId ?? undefined,
        };

        const turnMessages: SDKMessage[] = [];
        const q = cursorQuery({ prompt, options: turnOpts });

        for await (const msg of q) {
            turnMessages.push(msg);
            yield msg;
        }

        const foundId = extractSessionId(turnMessages);
        if (foundId) {
            sessionId = foundId;
        }
    }
}
