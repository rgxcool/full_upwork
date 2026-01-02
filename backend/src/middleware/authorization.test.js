import { getEffectivePermissions } from './authorization.js';
import { describe, it, expect } from 'vitest';

// Mock rolesConfig
const rolesConfig = {
    user: ['posts:read'],
    editor: ['posts:read', 'posts:create', 'posts:update'],
    admin: ['users:manage', 'posts:delete'],
};

// Mock the import
vi.mock('../config/roles.js', () => ({
    default: rolesConfig,
}));


describe('getEffectivePermissions', () => {
    it('should return an empty array for a user with no roles or permissions', () => {
        const user = { roles: [], permissions: [] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual([]);
    });

    it('should return permissions for a single role', () => {
        const user = { roles: ['user'], permissions: [] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual(expect.arrayContaining(['posts:read']));
        expect(perms.length).toBe(1);
    });

    it('should combine permissions for multiple roles', () => {
        const user = { roles: ['user', 'admin'], permissions: [] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual(expect.arrayContaining(['posts:read', 'users:manage', 'posts:delete']));
        expect(perms.length).toBe(3);
    });

    it('should include individual permissions', () => {
        const user = { roles: ['user'], permissions: ['extra:perm'] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual(expect.arrayContaining(['posts:read', 'extra:perm']));
        expect(perms.length).toBe(2);
    });

    it('should handle overlapping permissions between roles and individual permissions', () => {
        const user = { roles: ['user', 'editor'], permissions: ['posts:read', 'extra:perm'] };
        const perms = getEffectivePermissions(user);
        // Using a Set for comparison to ignore order and duplicates
        const expectedPerms = new Set(['posts:read', 'posts:create', 'posts:update', 'extra:perm']);
        expect(new Set(perms)).toEqual(expectedPerms);
        expect(perms.length).toBe(4);
    });

    it('should handle a user with no roles but with individual permissions', () => {
        const user = { roles: [], permissions: ['isolated:perm1', 'isolated:perm2'] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual(expect.arrayContaining(['isolated:perm1', 'isolated:perm2']));
        expect(perms.length).toBe(2);
    });

    it('should handle roles that are not defined in the config', () => {
        const user = { roles: ['undefinedRole', 'user'], permissions: [] };
        const perms = getEffectivePermissions(user);
        expect(perms).toEqual(['posts:read']);
    });
});
