import { PERMISSION_FEATURES, PERMISSION_MATRIX, ROLES, getPermission, getFeaturesForRole } from '../config/permissions.js';
import User from '../models/User.js';

/**
 * Get the effective permissions for a user.
 * This checks both role-based permissions and any per-user overrides.
 * 
 * @param {Object} user - The user object (from req.user)
 * @param {String} feature - The permission feature to check
 * @returns {Boolean} - Whether the user has access to this feature
 */
export const checkPermission = (user, feature) => {
    if (!user) return false;
    
    // Check per-user overrides first
    const overrides = user.permissions;
    if (overrides && typeof overrides === 'object') {
        if (overrides[feature] !== undefined) {
            return overrides[feature] === true;
        }
    }
    
    // Fall back to role-based permissions
    const role = user.roles ? user.roles[0] : (user.role || '');
    return hasPermissionFromMatrix(role, feature);
};

/**
 * Check if a user has a specific permission/feature.
 * This is the main function to use in controllers and routes.
 * 
 * @param {Object} user - The user object (from req.user)
 * @param {String} feature - The permission feature key (e.g., 'CALENDAR_FINAL_EXAM')
 * @returns {Boolean} - Whether the user has access
 */
export const hasPermission = (user, feature) => {
    return checkPermission(user, feature);
};

/**
 * Get all features and their effective status for a user.
 * Returns an object mapping feature keys to boolean values.
 * 
 * @param {Object} user - The user object (from req.user)
 * @returns {Object} - Mapping of feature keys to boolean access values
 */
export const getUserFeatures = (user) => {
    if (!user) return {};
    
    const features = {};
    const allFeatures = getFeaturesForRole('student'); // Get all defined features
    
    for (const [featureKey] of Object.entries(allFeatures)) {
        features[featureKey] = checkPermission(user, featureKey);
    }
    
    return features;
};

/**
 * Get human-readable permission summary for a user.
 * 
 * @param {Object} user - The user object (from req.user)
 * @returns {Object} - Summary of permissions with feature labels
 */
export const getPermissionSummary = (user) => {
    if (!user) return {};
    
    const features = getUserFeatures(user);
    const summary = {};
    
    for (const [featureKey, hasAccess] of Object.entries(features)) {
        summary[featureKey] = {
            allowed: hasAccess,
            label: PERMISSION_FEATURES[featureKey] || featureKey,
            roleBased: !user.permissions || typeof user.permissions !== 'object'
        };
    }
    
    return summary;
};

/**
 * Validate that a user can perform an action on a resource.
 * This checks both the feature permission and any resource-specific constraints.
 * 
 * @param {Object} user - The user object (from req.user)
 * @param {String} feature - The permission feature key
 * @param {Object} [resource] - Optional resource object (e.g., student, course, document)
 * @returns {Object} - Validation result with allowed boolean and reason
 */
export const canAction = (user, feature) => {
    const hasFeatureAccess = checkPermission(user, feature);
    
    if (!hasFeatureAccess) {
        return {
            allowed: false,
            reason: 'Insufficient permissions for this feature'
        };
    }
    
    // Resource-specific checks can be added here
    // For example: checking if the user owns the resource, etc.
    
    return {
        allowed: true,
        reason: 'Permission granted'
    };
};

/**
 * Get a permission value from the matrix (internal helper).
 */
const hasPermissionFromMatrix = (role, feature) => {
    if (!role || !feature) return false;
    return getPermission(role, feature) !== 'Nej';
};

module.exports = {
    checkPermission,
    hasPermission,
    getUserFeatures,
    getPermissionSummary,
    canAction
};
