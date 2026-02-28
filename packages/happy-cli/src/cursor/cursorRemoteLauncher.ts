/**
 * Remote launcher for Cursor Agent.
 *
 * Renders the Ink-based remote mode UI and drives cursorRemote() in a
 * loop, forwarding messages from the phone/web to the headless agent
 * process and streaming back SDK messages for display and sync.
 *
 * Message conversion: we reuse the Claude SDKToLogConverter because the
 * Cursor Agent stream-json output is structurally identical.
 */

import { render } from "ink";
import { CursorSession } from "./session";
import { MessageBuffer } from "@/ui/ink/messageBuffer";
import { RemoteModeDisplay } from "@/ui/ink/RemoteModeDisplay";
import React from "react";
import { cursorRemote } from "./cursorRemote";
import { Future } from "@/utils/future";
import type { SDKMessage, SDKAssistantMessage, SDKUserMessage } from "@/claude/sdk/types";
import { formatClaudeMessageForInk } from "@/ui/messageFormatterInk";
import { logger } from "@/ui/logger";
import { SDKToLogConverter } from "@/claude/utils/sdkToLogConverter";
import { EnhancedMode } from "@/claude/loop";

export async function cursorRemoteLauncher(session: CursorSession): Promise<'switch' | 'exit'> {
    logger.debug('[cursorRemoteLauncher] Starting remote launcher');

    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
    logger.debug(`[cursorRemoteLauncher] TTY available: ${hasTTY}`);

    const messageBuffer = new MessageBuffer();
    let inkInstance: any = null;

    let exitReason: 'switch' | 'exit' | null = null;
    let abortController: AbortController | null = null;
    let abortFuture: Future<void> | null = null;

    async function abort() {
        if (abortController && !abortController.signal.aborted) {
            abortController.abort();
        }
        await abortFuture?.promise;
    }

    async function doAbort() {
        logger.debug('[cursor-remote]: doAbort');
        await abort();
    }

    async function doSwitch() {
        logger.debug('[cursor-remote]: doSwitch');
        if (!exitReason) {
            exitReason = 'switch';
        }
        await abort();
    }

    if (hasTTY) {
        console.clear();
        inkInstance = render(React.createElement(RemoteModeDisplay, {
            messageBuffer,
            logPath: process.env.DEBUG ? session.logPath : undefined,
            onExit: async () => {
                logger.debug('[cursor-remote]: Exiting client via Ctrl-C');
                if (!exitReason) {
                    exitReason = 'exit';
                }
                await abort();
            },
            onSwitchToLocal: () => {
                logger.debug('[cursor-remote]: Switching to local mode');
                doSwitch();
            },
        }), {
            exitOnCtrlC: false,
            patchConsole: false,
        });

        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding("utf8");
    }

    session.client.rpcHandlerManager.registerHandler('abort', doAbort);
    session.client.rpcHandlerManager.registerHandler('switch', doSwitch);

    const sdkToLogConverter = new SDKToLogConverter({
        sessionId: session.sessionId || 'unknown',
        cwd: session.path,
        version: process.env.npm_package_version,
    }, new Map());

    let ongoingToolCalls = new Map<string, { parentToolCallId: string | null }>();

    function onMessage(message: SDKMessage) {
        formatClaudeMessageForInk(message, messageBuffer);

        // Track active tool calls
        if (message.type === 'assistant') {
            const umessage = message as SDKAssistantMessage;
            if (umessage.message.content && Array.isArray(umessage.message.content)) {
                for (const c of umessage.message.content) {
                    if (c.type === 'tool_use') {
                        logger.debug('[cursor-remote]: detected tool use ' + c.id! + ' parent: ' + umessage.parent_tool_use_id);
                        ongoingToolCalls.set(c.id!, { parentToolCallId: umessage.parent_tool_use_id ?? null });
                    }
                }
            }
        }
        if (message.type === 'user') {
            const umessage = message as SDKUserMessage;
            if (umessage.message.content && Array.isArray(umessage.message.content)) {
                for (const c of umessage.message.content) {
                    if (c.type === 'tool_result' && c.tool_use_id) {
                        ongoingToolCalls.delete(c.tool_use_id);
                    }
                }
            }
        }

        const logMessage = sdkToLogConverter.convert(message);
        if (logMessage) {
            session.client.sendClaudeSessionMessage(logMessage);
        }
    }

    try {
        let pending: { message: string; mode: EnhancedMode } | null = null;
        let previousSessionId: string | null = null;

        while (!exitReason) {
            logger.debug('[cursor-remote]: launch');
            messageBuffer.addMessage('═'.repeat(40), 'status');

            const isNewSession = session.sessionId !== previousSessionId;
            if (isNewSession) {
                messageBuffer.addMessage('Starting new Cursor Agent session...', 'status');
                sdkToLogConverter.resetParentChain();
                logger.debug(`[cursor-remote]: New session (prev: ${previousSessionId}, curr: ${session.sessionId})`);
            } else {
                messageBuffer.addMessage('Continuing Cursor Agent session...', 'status');
            }

            previousSessionId = session.sessionId;
            const controller = new AbortController();
            abortController = controller;
            abortFuture = new Future<void>();

            try {
                await cursorRemote({
                    sessionId: session.sessionId,
                    path: session.path,
                    cursorEnvVars: session.cursorEnvVars,
                    cursorArgs: session.cursorArgs,
                    nextMessage: async () => {
                        if (pending) {
                            const p = pending;
                            pending = null;
                            return p;
                        }
                        const msg = await session.queue.waitForMessagesAndGetAsString(controller.signal);
                        if (msg) {
                            return { message: msg.message, mode: msg.mode };
                        }
                        return null;
                    },
                    onSessionFound: (sessionId) => {
                        sdkToLogConverter.updateSessionId(sessionId);
                        session.onSessionFound(sessionId);
                    },
                    onThinkingChange: session.onThinkingChange,
                    onMessage,
                    onCompletionEvent: (message: string) => {
                        logger.debug(`[cursor-remote]: Completion event: ${message}`);
                        session.client.sendSessionEvent({ type: 'message', message });
                    },
                    onSessionReset: () => {
                        logger.debug('[cursor-remote]: Session reset');
                        session.clearSessionId();
                    },
                    onReady: () => {
                        session.client.closeClaudeSessionTurn('completed');
                        if (!pending && session.queue.size() === 0) {
                            session.api.push().sendToAllDevices(
                                'It\'s ready!',
                                'Cursor Agent is waiting for your command',
                                { sessionId: session.client.sessionId },
                            );
                        }
                    },
                    signal: abortController.signal,
                });

                session.consumeOneTimeFlags();

                if (!exitReason && abortController.signal.aborted) {
                    session.client.closeClaudeSessionTurn('cancelled');
                    session.client.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                }
            } catch (e) {
                logger.debug('[cursor-remote]: launch error', e);
                if (!exitReason) {
                    session.client.closeClaudeSessionTurn('failed');
                    session.client.sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                    continue;
                }
            } finally {
                logger.debug('[cursor-remote]: launch finally');

                for (const [toolCallId, { parentToolCallId }] of ongoingToolCalls) {
                    const converted = sdkToLogConverter.generateInterruptedToolResult(toolCallId, parentToolCallId);
                    if (converted) {
                        session.client.sendClaudeSessionMessage(converted);
                    }
                }
                ongoingToolCalls.clear();

                abortController = null;
                abortFuture?.resolve(undefined);
                abortFuture = null;
                logger.debug('[cursor-remote]: launch done');
            }
        }
    } finally {
        process.stdin.off('data', abort);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        if (inkInstance) {
            inkInstance.unmount();
        }
        messageBuffer.clear();

        if (abortFuture) {
            abortFuture.resolve(undefined);
        }
    }

    return exitReason || 'exit';
}
