import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '@/ui/logger';

let cachedAgentPath: string | null = null;

/**
 * Locate the `agent` CLI binary. Checks CURSOR_AGENT_PATH env override,
 * common install locations, and finally falls back to `which agent`.
 */
export function getCursorAgentPath(): string {
    if (cachedAgentPath) return cachedAgentPath;

    if (process.env.CURSOR_AGENT_PATH) {
        logger.debug(`[CursorPath] Using CURSOR_AGENT_PATH: ${process.env.CURSOR_AGENT_PATH}`);
        cachedAgentPath = process.env.CURSOR_AGENT_PATH;
        return cachedAgentPath;
    }

    const commonPaths = [
        join(homedir(), '.local', 'bin', 'agent'),
        '/usr/local/bin/agent',
    ];

    for (const p of commonPaths) {
        if (existsSync(p)) {
            logger.debug(`[CursorPath] Found agent at: ${p}`);
            cachedAgentPath = p;
            return cachedAgentPath;
        }
    }

    try {
        const result = execSync('which agent', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: homedir(),
        }).trim();
        if (result && existsSync(result)) {
            logger.debug(`[CursorPath] Found agent via which: ${result}`);
            cachedAgentPath = result;
            return cachedAgentPath;
        }
    } catch {
        // not found
    }

    cachedAgentPath = 'agent';
    logger.debug(`[CursorPath] Falling back to 'agent' command`);
    return cachedAgentPath;
}

/**
 * Map Happy permission mode to Cursor Agent CLI flags.
 */
export function mapToCursorPermissionArgs(mode: string | undefined): string[] {
    switch (mode) {
        case 'bypassPermissions':
        case 'yolo':
            return ['--force'];
        case 'plan':
            return ['--mode', 'plan'];
        case 'read-only':
            return ['--mode', 'ask'];
        default:
            return [];
    }
}
