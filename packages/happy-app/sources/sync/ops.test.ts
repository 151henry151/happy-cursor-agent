import { beforeEach, describe, expect, it, vi } from 'vitest';

const { machineRPCMock } = vi.hoisted(() => ({
    machineRPCMock: vi.fn()
}));

vi.mock('./apiSocket', () => ({
    apiSocket: {
        machineRPC: machineRPCMock
    }
}));

vi.mock('./sync', () => ({
    sync: {
        encryption: {
            getMachineEncryption: vi.fn()
        }
    }
}));

import { machineSpawnNewSession } from './ops';

describe('machineSpawnNewSession', () => {
    beforeEach(() => {
        machineRPCMock.mockReset();
    });

    it('normalizes mixed-case agent values before RPC', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'session-1' });

        const result = await machineSpawnNewSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            approvedNewDirectoryCreation: true,
            agent: 'Cursor' as any,
            token: 'token-1',
            secret: 'secret-1'
        });

        expect(result).toEqual({ type: 'success', sessionId: 'session-1' });
        expect(machineRPCMock).toHaveBeenCalledTimes(1);
        expect(machineRPCMock).toHaveBeenCalledWith(
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                type: 'spawn-in-directory',
                directory: '/tmp/project',
                approvedNewDirectoryCreation: true,
                agent: 'cursor',
                token: 'token-1',
                secret: 'secret-1'
            })
        );
    });
});
