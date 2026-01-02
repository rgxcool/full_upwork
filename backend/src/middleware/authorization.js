
import rolesConfig from '../config/roles.js';

// This function can be used to compute permissions on the user object at login
export const getEffectivePermissions = (user) => {
  const permissions = new Set(user.permissions);
  user.roles.forEach(role => {
    const rolePermissions = rolesConfig[role] || [];
    rolePermissions.forEach(p => permissions.add(p));
  });
  return [...permissions];
};

// Middleware to check for a specific permission
export const can = (permission) => {
  return (req, res, next) => {
    // Assuming user object is attached to req by a previous auth middleware
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    // The user object on the request might not be a mongoose document with methods, so we recreate it.
    const userForPerms = { roles: req.user.roles || [], permissions: req.user.permissions || [] };
    const effectivePermissions = getEffectivePermissions(userForPerms);

    if (effectivePermissions.includes(permission)) {
      return next();
    }
    
    // Also check for admin role as a superuser
    if (userForPerms.roles.includes('systemadmin') || userForPerms.roles.includes('admin')) {
      return next();
    }

    return res.status(403).json({ message: 'Forbidden: You do not have the required permission.' });
  };
};
