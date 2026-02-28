/**
 * Entry point for `happy cursor` subcommand.
 *
 * Mirrors the structure of runClaude.ts but adapted for Cursor Agent:
 *  - No Hook server / hookSettingsPath (Cursor doesn't use Claude hooks)
 *  - No Session scanner / JSONL file watching
 *  - No Happy MCP server (Cursor has its own MCP support)
 *  - Session ID is obtained from the stream-json `system/init` message
 *  - Uses `agent` CLI binary instead of `claude`
 */

import os from 'node:os';
import { randomUUID } from 'node:crypto';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { cursorLoop } from '@/cursor/loop';
import { AgentState, Metadata } from '@/api/types';
import packageJson from '../../package.json';
import { Credentials, readSettings } from '@/persistence';
import type { EnhancedMode, PermissionMode } from '@/claude/loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import { getEnvironmentInfo } from '@/ui/doctor';
import { configuration } from '@/configuration';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { initialMachineMetadata } from '@/daemon/run';
import { startOfflineReconnection, connectionState } from '@/utils/serverConnectionErrors';
import { CursorSession } from './session';

export interface CursorStartOptions {
    model?: string;
    permissionMode?: PermissionMode;
    startingMode?: 'local' | 'remote';
    cursorEnvVars?: Record<string, string>;
    cursorArgs?: string[];
    startedBy?: 'daemon' | 'terminal';
}

export async function runCursor(credentials: Credentials, options: CursorStartOptions = {}): Promise<void> {
    logger.debug(`[CURSOR] ===== CURSOR AGENT MODE STARTING =====`);

    const workingDirectory = process.cwd();
    const sessionTag = randomUUID();

    logger.debugLargeJson('[CURSOR-START] Happy process started', getEnvironmentInfo());
    logger.debug(`[CURSOR-START] Options: startedBy=${options.startedBy}, startingMode=${options.startingMode}`);

    if (options.startedBy === 'daemon' && options.startingMode === 'local') {
        throw new Error('Daemon-spawned sessions cannot use local/interactive mode. Use --happy-starting-mode remote.');
    }

    connectionState.setBackend('Cursor');

    const api = await ApiClient.create(credentials);
    const state: AgentState = {};

    const settings = await readSettings();
    const machineId = settings?.machineId;
    if (!machineId) {
        console.error(`[CURSOR-START] No machine ID found. Run "happy auth login" first.`);
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);

    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata,
    });

    const metadata: Metadata = {
        path: workingDirectory,
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId,
        homeDir: os.homedir(),
        happyHomeDir: configuration.happyHomeDir,
        happyLibDir: '',
        happyToolsDir: '',
        startedFromDaemon: options.startedBy === 'daemon',
        hostPid: process.pid,
        startedBy: options.startedBy || 'terminal',
        lifecycleState: 'running',
        lifecycleStateSince: Date.now(),
        flavor: 'cursor',
        sandbox: null,
        dangerouslySkipPermissions: options.permissionMode === 'bypassPermissions',
    };

    const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });

    if (!response) {
        console.error('Failed to create session (server unreachable). Please check your connection.');
        process.exit(1);
    }

    logger.debug(`Session created: ${response.id}`);

    try {
        logger.debug(`[CURSOR-START] Reporting session ${response.id} to daemon`);
        const result = await notifyDaemonSessionStarted(response.id, metadata);
        if (result.error) {
            logger.debug(`[CURSOR-START] Failed to report to daemon:`, result.error);
        }
    } catch (error) {
        logger.debug('[CURSOR-START] Failed to report to daemon:', error);
    }

    const session = api.sessionSyncClient(response);

    let currentSession: CursorSession | null = null;

    logger.infoDeveloper(`Session: ${response.id}`);
    logger.infoDeveloper(`Logs: ${logger.logFilePath}`);

    session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser: options.startingMode !== 'remote',
    }));

    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
        logger.infoDeveloper('Sleep prevention enabled (macOS)');
    }

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) =>
        hashObject({
            isPlan: mode.permissionMode === 'plan',
            model: mode.model,
        }),
    );

    let currentPermissionMode: PermissionMode | undefined = options.permissionMode;
    let currentModel = options.model;
    session.onUserMessage((message) => {
        let messagePermissionMode: PermissionMode | undefined = currentPermissionMode;
        if (message.meta?.permissionMode) {
            messagePermissionMode = message.meta.permissionMode;
            currentPermissionMode = messagePermissionMode;
        }

        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            messageModel = message.meta.model || undefined;
            currentModel = messageModel;
        }

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode || 'default',
            model: messageModel,
        };
        messageQueue.push(message.content.text, enhancedMode);
        logger.debugLargeJson('User message pushed to queue:', message);
    });

    const cleanup = async () => {
        logger.debug('[CURSOR-START] Received termination signal, cleaning up...');
        try {
            if (session) {
                session.updateMetadata((currentMetadata) => ({
                    ...currentMetadata,
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now(),
                    archivedBy: 'cli',
                    archiveReason: 'User terminated',
                }));
                currentSession?.cleanup();
                session.sendSessionDeath();
                await session.flush();
                await session.close();
            }
            stopCaffeinate();
            logger.debug('[CURSOR-START] Cleanup complete, exiting');
            process.exit(0);
        } catch (error) {
            logger.debug('[CURSOR-START] Error during cleanup:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('uncaughtException', (error) => {
        logger.debug('[CURSOR-START] Uncaught exception:', error);
        cleanup();
    });
    process.on('unhandledRejection', (reason) => {
        logger.debug('[CURSOR-START] Unhandled rejection:', reason);
        cleanup();
    });

    const exitCode = await cursorLoop({
        path: workingDirectory,
        model: options.model,
        permissionMode: options.permissionMode,
        startingMode: options.startingMode,
        messageQueue,
        api,
        onModeChange: (newMode) => {
            session.sendSessionEvent({ type: 'switch', mode: newMode });
            session.updateAgentState((currentState) => ({
                ...currentState,
                controlledByUser: newMode === 'local',
            }));
        },
        onSessionReady: (sessionInstance) => {
            currentSession = sessionInstance;
        },
        session,
        cursorEnvVars: options.cursorEnvVars,
        cursorArgs: options.cursorArgs,
    });

    (currentSession as CursorSession | null)?.cleanup();

    session.sendSessionDeath();

    logger.debug('Waiting for socket to flush...');
    await session.flush();

    logger.debug('Closing session...');
    await session.close();

    stopCaffeinate();
    logger.debug('Stopped sleep prevention');

    process.exit(exitCode);
}
