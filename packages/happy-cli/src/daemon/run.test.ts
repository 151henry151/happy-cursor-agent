import { describe, expect, it } from 'vitest';

import { normalizeSpawnAgent } from './run';

describe('normalizeSpawnAgent', () => {
    it('normalizes mixed-case cursor values', () => {
        expect(normalizeSpawnAgent('Cursor')).toBe('cursor');
        expect(normalizeSpawnAgent(' CURSOR ')).toBe('cursor');
    });

    it('falls back to claude for unknown values', () => {
        expect(normalizeSpawnAgent('unknown')).toBe('claude');
        expect(normalizeSpawnAgent(undefined)).toBe('claude');
    });
});
