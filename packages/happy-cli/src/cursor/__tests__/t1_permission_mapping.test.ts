/**
 * T1: Permission mode mapping unit test
 *
 * Verifies that every Happy PermissionMode value maps to the correct
 * Cursor Agent CLI flags via mapToCursorPermissionArgs().
 */

import { describe, it, expect } from 'vitest';
import { mapToCursorPermissionArgs } from '../utils/cursorPath';

describe('mapToCursorPermissionArgs', () => {
    it('maps bypassPermissions to --force', () => {
        expect(mapToCursorPermissionArgs('bypassPermissions')).toEqual(['--force']);
    });

    it('maps yolo to --force', () => {
        expect(mapToCursorPermissionArgs('yolo')).toEqual(['--force']);
    });

    it('maps plan to --mode plan', () => {
        expect(mapToCursorPermissionArgs('plan')).toEqual(['--mode', 'plan']);
    });

    it('maps read-only to --mode ask', () => {
        expect(mapToCursorPermissionArgs('read-only')).toEqual(['--mode', 'ask']);
    });

    it('maps default to empty array', () => {
        expect(mapToCursorPermissionArgs('default')).toEqual([]);
    });

    it('maps acceptEdits to empty array (no Cursor equivalent)', () => {
        expect(mapToCursorPermissionArgs('acceptEdits')).toEqual([]);
    });

    it('maps undefined to empty array', () => {
        expect(mapToCursorPermissionArgs(undefined)).toEqual([]);
    });

    it('maps safe-yolo to empty array (no exact Cursor equivalent)', () => {
        expect(mapToCursorPermissionArgs('safe-yolo')).toEqual([]);
    });
});
