import mongoose from "mongoose";
import { hasGlobalScope, municipalityInScope } from "./tenantScope.js";

const STAFF_ROLES = new Set([
    "systemadmin",
    "admin",
    "coordinator",
    "syv",
    "specped",
    "tester",
]);

// Exam papers (delprov/slutprov) stored in a student's Kursarkiv are staff
// material: the student the file is filed under must never be able to list or
// download them.
export const STAFF_ONLY_DOCUMENT_TYPES = Object.freeze(["DELPROV", "SLUTPROV"]);

const getModel = (name) => mongoose.models?.[name] || mongoose.model(name);

const getRoles = (user) => {
    const roles = Array.isArray(user?.roles) ? [...user.roles] : [];
    if (user?.role) roles.push(user.role);
    return new Set(
        roles
            .filter((role) => typeof role === "string")
            .map((role) => role.toLowerCase())
    );
};

const getId = (value) => value?._id ?? value;

const sameId = (first, second) => {
    const firstId = getId(first);
    const secondId = getId(second);
    return firstId !== undefined && firstId !== null && secondId !== undefined && secondId !== null &&
        String(firstId) === String(secondId);
};

const getMunicipality = (student) => {
    if (typeof student?.municipality === "string") {
        return student.municipality;
    }
    return student?.municipality?.type;
};

const selectIfSupported = async (query, fields) => {
    if (query && typeof query.select === "function") {
        return query.select(fields);
    }
    return query;
};

export function isStaffOnlyDocumentType(type) {
    return typeof type === "string" && STAFF_ONLY_DOCUMENT_TYPES.includes(type.toUpperCase());
}

// Staff = any role allowed to handle exam material: the global staff roles
// plus teachers. A pure student (or unknown role) is never staff.
export function isStaffUser(user) {
    const roles = getRoles(user);
    return roles.has("teacher") || [...roles].some((role) => STAFF_ROLES.has(role));
}

export async function canAccessStudentDocuments(user, studentId) {
    if (!user || !studentId) {
        return false;
    }

    const roles = getRoles(user);
    if ([...roles].some((role) => STAFF_ROLES.has(role)) && hasGlobalScope(user)) {
        return true;
    }

    const Student = getModel("Student");
    const student = await Student.findById(studentId);
    if (!student || !municipalityInScope(user, getMunicipality(student))) {
        return false;
    }

    if ([...roles].some((role) => STAFF_ROLES.has(role))) {
        return true;
    }

    if (roles.has("teacher")) {
        const Teacher = getModel("Teacher");
        const teacher = await selectIfSupported(
            Teacher.findOne({ userId: user.userId }),
            "_id"
        );
        return Boolean(teacher && sameId(student.teacherId, teacher));
    }

    if (roles.has("student")) {
        const ownStudent = await selectIfSupported(
            Student.findOne({ email: user.email }),
            "_id"
        );
        return sameId(student, ownStudent);
    }

    return false;
}

export async function canAccessTeacherDocuments(user, teacherId) {
    if (!user || !teacherId) {
        return false;
    }

    const roles = getRoles(user);
    if ([...roles].some((role) => STAFF_ROLES.has(role)) && hasGlobalScope(user)) {
        return true;
    }

    if (roles.has("teacher")) {
        return sameId(user.userId, teacherId);
    }

    return false;
}

export async function canAccessDocument(user, document) {
    if (!user) {
        return false;
    }

    // Checked before sharing/ownership so no path can hand an exam file to a
    // non-staff user.
    if (isStaffOnlyDocumentType(document?.type) && !isStaffUser(user)) {
        return false;
    }

    const userId = getId(user.userId) ?? getId(user._id);
    const sharedWith = Array.isArray(document?.sharedWith) ? document.sharedWith : [];
    if (
        userId !== undefined &&
        userId !== null &&
        sharedWith.some((sharedUserId) => sameId(sharedUserId, userId))
    ) {
        return true;
    }

    const studentId = getId(document?.student);
    if (studentId) {
        return canAccessStudentDocuments(user, studentId);
    }

    const teacherId = getId(document?.teacher);
    if (teacherId) {
        return canAccessTeacherDocuments(user, teacherId);
    }

    const roles = getRoles(user);
    return [...roles].some((role) => STAFF_ROLES.has(role)) && hasGlobalScope(user);
}
