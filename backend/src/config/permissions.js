/**
 * Permission Matrix Configuration
 * Based on the permission matrix requirements
 */

export const PERMISSION_FEATURES = {
  CALENDAR_FINAL_EXAM: 'calendar_final_exam',
  SEARCH_CONTENT: 'search_content',
  SEARCH_USERS: 'search_users',
  STATISTICS: 'statistics',
  MANAGE_USERS_PERMISSIONS: 'manage_users_permissions',
  HIERARCHY_MANAGEMENT: 'hierarchy_management',
  OWN_SETTINGS: 'own_settings',
  ADD_MUNICIPALITIES_COURSES: 'add_municipalities_courses',
  COURSE_TEMPLATES: 'course_templates',
  MESSAGING: 'messaging',
  MASS_MESSAGING: 'mass_messaging',
  EVALUATIONS: 'evaluations',
  COURSE_MANAGEMENT: 'course_management',
  STUDENT_DOCUMENTS: 'student_documents',
};

export const ROLES = {
  SYSTEMADMIN: 'systemadmin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  SYV: 'syv',
  SPECPED: 'specped',
  COORDINATOR: 'coordinator',
  STUDENT: 'student',
};

/** Staff roles that may use internal messaging (students may message staff too). */
export const MESSAGING_STAFF_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.SYSTEMADMIN,
  ROLES.TEACHER,
  ROLES.SYV,
  ROLES.SPECPED,
  ROLES.COORDINATOR,
]);

/**
 * Permission matrix based on the requirements
 * Key: feature, Value: array of roles that have access
 */
export const PERMISSION_MATRIX = {
  [PERMISSION_FEATURES.CALENDAR_FINAL_EXAM]: {
    [ROLES.SYSTEMADMIN]: 'Skapa, redigera, ändra till tidigare version',
    [ROLES.ADMIN]: 'Skapa, redigera',
    [ROLES.TEACHER]: 'Endast titta',
    [ROLES.SYV]: 'Lägga in mö',
    [ROLES.SPECPED]: 'Lägga in mö',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Endast deras egna inbokade slutprov',
  },
  [PERMISSION_FEATURES.SEARCH_CONTENT]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.SEARCH_USERS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.STATISTICS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.MANAGE_USERS_PERMISSIONS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.HIERARCHY_MANAGEMENT]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Nej',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.OWN_SETTINGS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Ja',
  },
  [PERMISSION_FEATURES.ADD_MUNICIPALITIES_COURSES]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Nej',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.COURSE_TEMPLATES]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Skapa (utvalda lärare)',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.MESSAGING]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Ja',
    [ROLES.STUDENT]: 'Ja',
  },
  [PERMISSION_FEATURES.MASS_MESSAGING]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Nej',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.EVALUATIONS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Ja',
    [ROLES.SYV]: 'Ja',
    [ROLES.SPECPED]: 'Ja',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.COURSE_MANAGEMENT]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Utvalda lärare',
    [ROLES.SYV]: 'Nej',
    [ROLES.SPECPED]: 'Nej',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Nej',
  },
  [PERMISSION_FEATURES.STUDENT_DOCUMENTS]: {
    [ROLES.SYSTEMADMIN]: 'Ja',
    [ROLES.ADMIN]: 'Ja',
    [ROLES.TEACHER]: 'Utvalda dokument',
    [ROLES.SYV]: 'Utvalda dokument',
    [ROLES.SPECPED]: 'Utvalda dokument',
    [ROLES.COORDINATOR]: 'Nej',
    [ROLES.STUDENT]: 'Egna dokument',
  },
};

/**
 * Get permission for a role and feature
 */
export function getPermission(role, feature) {
  return PERMISSION_MATRIX[feature]?.[role] || 'Nej';
}

/**
 * Check if a role has access to a feature
 */
export function hasPermission(role, feature) {
  const permission = getPermission(role, feature);
  return permission !== 'Nej' && permission !== null && permission !== undefined;
}

// Roles that implicitly have every feature unless explicitly overridden.
export const FEATURE_SUPERUSER_ROLES = ['systemadmin', 'admin', 'tester'];

/**
 * Effective feature access for a (request) user, without any DB access:
 * an explicit per-user override (`user.permissions[feature]` true/false)
 * wins, otherwise superusers pass and other roles use PERMISSION_MATRIX.
 * Callers must refresh `req.user` first (hasRole()/canFeature() do).
 */
export function userHasFeature(user, feature) {
  if (!user) return false;
  const overrides = user.permissions && typeof user.permissions === 'object' && !Array.isArray(user.permissions)
    ? user.permissions
    : {};
  const override = overrides[feature];
  if (override === true || override === false) return override;
  const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [];
  if (roles.some((r) => FEATURE_SUPERUSER_ROLES.includes(r))) return true;
  return roles.some((r) => hasPermission(r, feature));
}

/**
 * Get all features for a role
 */
export function getFeaturesForRole(role) {
  const features = {};
  for (const [feature, roles] of Object.entries(PERMISSION_MATRIX)) {
    features[feature] = roles[role] || 'Nej';
  }
  return features;
}

/**
 * Feature labels in Swedish
 */
export const FEATURE_LABELS = {
  [PERMISSION_FEATURES.CALENDAR_FINAL_EXAM]: 'Kalender (slutprov)',
  [PERMISSION_FEATURES.SEARCH_CONTENT]: 'Söka efter innehåll',
  [PERMISSION_FEATURES.SEARCH_USERS]: 'Söka efter användare',
  [PERMISSION_FEATURES.STATISTICS]: 'Statistik',
  [PERMISSION_FEATURES.MANAGE_USERS_PERMISSIONS]: 'Hantering av användar och åtkomstbehörigheter',
  [PERMISSION_FEATURES.HIERARCHY_MANAGEMENT]: 'Hierarkihantering?',
  [PERMISSION_FEATURES.OWN_SETTINGS]: 'Egna inställningar (ex profilbild)',
  [PERMISSION_FEATURES.ADD_MUNICIPALITIES_COURSES]: 'Lägga till kommuner, kurser etc',
  [PERMISSION_FEATURES.COURSE_TEMPLATES]: 'Kursmallar (kursmoduler)',
  [PERMISSION_FEATURES.MESSAGING]: 'Meddelanden',
  [PERMISSION_FEATURES.MASS_MESSAGING]: 'Massutskick',
  [PERMISSION_FEATURES.EVALUATIONS]: 'Utvärderingar',
  [PERMISSION_FEATURES.COURSE_MANAGEMENT]: 'Kurshantering',
  [PERMISSION_FEATURES.STUDENT_DOCUMENTS]: 'Elevdokument',
};

/**
 * Role labels in Swedish
 */
export const ROLE_LABELS = {
  [ROLES.SYSTEMADMIN]: 'Systemadministratör',
  [ROLES.ADMIN]: 'Administratör',
  [ROLES.TEACHER]: 'Lärare',
  [ROLES.SYV]: 'SYV',
  [ROLES.SPECPED]: 'Specped.',
  [ROLES.COORDINATOR]: 'Praktiksamordnar',
  [ROLES.STUDENT]: 'Elev',
};

