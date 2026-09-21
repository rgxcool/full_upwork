import Student from '../models/Student.js';
import Course from '../models/Course.js';
import CoursePackage from '../models/CoursePackage.js';
import Program from '../models/Program.js';
import User from '../models/User.js';
import rolesConfig from '../config/roles.js';

/**
 * Returns the user's roles as an array.
 */
const getUserRoles = (user) => {
    if (!user) return [];
    if (Array.isArray(user.roles)) return user.roles;
    if (user.role) return [user.role];
    return [];
};

/**
 * Checks if a user has a specific role.
 */
const hasRole = (user, role) => {
    const roles = getUserRoles(user);
    return roles.includes(role);
};

/**
 * Checks if a user has any of the given roles.
 */
const hasAnyRole = (user, roles) => {
    const userRoles = getUserRoles(user);
    return roles.some(r => userRoles.includes(r));
};

/**
 * Checks if a field is in the always-sensitive list.
 */
const isAlwaysSensitive = (field) => {
    const ALWAYS_SENSITIVE = [
        'lastLoginAt',
        'hashPassword',
        'salt',
        'supportNotes',
        'examAccommodations',
        'medicalNotes',
    ];
    return ALWAYS_SENSITIVE.includes(field);
};

/**
 * Project/strip student data based on user role.
 * Returns a new object with only the fields the user is authorized to see.
 * 
 * @param {Object} student - The full student document
 * @param {Object} user - The authenticated user object
 * @param {Object} [options] - Additional options
 * @returns {Object} Projected student data
 */
export const projectStudentData = (student, user, options = {}) => {
    const roles = getUserRoles(user);
    const projected = { ...student.toObject ? student.toObject() : { ...student } };
    
    // Remove internal MongoDB fields
    delete projected.__v;
    delete projected._id;
    
    // Determine user role tier
    const isStudent = hasRole(user, 'student');
    const isTeacherOrStaff = hasAnyRole(user, ['teacher', 'coordinator', 'syv', 'specped']);
    const isAdmin = hasRole(user, 'admin');
    const isSystemAdmin = hasRole(user, 'systemadmin');
    
    // Define visible fields by role tier
    let visibleFields;
    
    if (isStudent) {
        visibleFields = ['name', '_id'];
    } else if (isTeacherOrStaff) {
        visibleFields = ['name', 'personalNumber', '_id'];
    } else if (isAdmin) {
        visibleFields = ['name', 'personalNumber', 'phone', 'email', '_id'];
    } else if (isSystemAdmin) {
        visibleFields = ['name', 'personalNumber', 'phone', 'email', 'lastLoginAt', '_id'];
    } else {
        visibleFields = ['name', '_id'];
    }
    
    // Build projected object with only visible fields, excluding always-sensitive
    const result = {};
    for (const field of visibleFields) {
        if (field in projected && !isAlwaysSensitive(field)) {
            result[field] = projected[field];
        }
    }
    
    // Always include ID
    result._id = student._id;
    
    // Include enrollment stats for teachers and above
    if (isTeacherOrStaff || isAdmin || isSystemAdmin) {
        result.enrollmentCount = 0;
    }
    
    // Explicitly remove any always-sensitive fields that might leak through
    for (const sensitive of ['lastLoginAt', 'hashPassword', 'salt', 'supportNotes', 'examAccommodations', 'medicalNotes']) {
        delete result[sensitive];
    }
    
    return result;
};

/**
 * Project student data for list endpoints (lightweight).
 * Only returns essential fields.
 */
export const projectStudentListData = (student, user) => {
    const isTeacherOrStaff = hasAnyRole(user, ['teacher', 'coordinator', 'syv', 'specped']);
    const isAdmin = hasRole(user, 'admin');
    const isSystemAdmin = hasRole(user, 'systemadmin');
    
    let visibleFields;
    if (isSystemAdmin) {
        visibleFields = ['name', 'personalNumber', '_id'];
    } else if (isAdmin) {
        visibleFields = ['name', 'personalNumber', '_id'];
    } else if (isTeacherOrStaff) {
        visibleFields = ['name', 'personalNumber', '_id'];
    } else {
        visibleFields = ['name', '_id'];
    }
    
    const result = {};
    for (const field of visibleFields) {
        if (field in student) {
            result[field] = student[field];
        }
    }
    
    return result;
};

/**
 * Get sensitive fields that should NEVER be exposed to unauthorized roles.
 */
export const getSensitiveFields = () => [
    'lastLoginAt',
    'hashPassword',
    'salt',
    'supportNotes',
    'examAccommodations',
    'medicalNotes',
];

/**
 * Validate that a student object doesn't contain exposed sensitive fields
 * for the given user role.
 */
export const validateNoSensitiveFields = (student, user) => {
    const sensitive = getSensitiveFields();
    const visible = projectStudentData(student, user);
    
    for (const field of sensitive) {
        if (field in visible) {
            const roleName = hasRole(user, 'systemadmin') ? 'systemadmin' :
                           hasRole(user, 'admin') ? 'admin' :
                           hasAnyRole(user, ['teacher', 'coordinator', 'syv', 'specped']) ? 'teacher' : 'student';
            throw new Error(
                `Sensitive field '${field}' is exposed to ${roleName} role - data leak detected`
            );
        }
    }
    
    return true;
};

/**
 * Get the list of visible fields for a given role.
 */
export const getVisibleFields = (role) => {
    const FIELD_ACCESS = {
        student: ['name', '_id'],
        teacher: ['name', 'personalNumber', '_id'],
        admin: ['name', 'personalNumber', '_id'],
        systemadmin: ['name', 'personalNumber', '_id'],
    };
    return FIELD_ACCESS[role] || FIELD_ACCESS.student;
};

/**
 * Check if a field is sensitive and should be protected.
 */
export const isSensitiveField = (field) => {
    const sensitive = getSensitiveFields();
    return sensitive.includes(field);
};