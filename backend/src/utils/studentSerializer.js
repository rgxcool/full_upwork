const PERSONAL_FIELDS = ["personalNumber", "personnummer", "email", "phone"];
const SUPPORT_FIELDS = ["supportInfo", "specialNeeds", "examAccommodations"];

const getRoles = (user) => {
    const roles = Array.isArray(user?.roles)
        ? [...user.roles]
        : user?.roles
            ? [user.roles]
            : [];
    if (user?.role) roles.push(user.role);
    return [...new Set(
        roles
            .filter((role) => typeof role === "string")
            .map((role) => role.toLowerCase())
    )];
};

const hasRole = (user, ...expected) => {
    const roles = getRoles(user);
    return expected.some((role) => roles.includes(role));
};

const asObject = (value) => {
    if (value && typeof value.toObject === "function") {
        return value.toObject();
    }
    return value;
};

const removeUserPasswords = (user) => {
    if (!user || typeof user !== "object") {
        return user;
    }

    const plainUser = asObject(user);
    if (!plainUser || typeof plainUser !== "object") {
        return plainUser;
    }

    const result = { ...plainUser };
    delete result.password;
    delete result.passwordHash;
    delete result.hashedPassword;
    return result;
};

const matchesEmail = (first, second) => {
    if (typeof first !== "string" || typeof second !== "string") {
        return false;
    }
    return first.trim().toLowerCase() === second.trim().toLowerCase();
};

export function maskPersonalNumber(pnr) {
    if (typeof pnr !== "string" || pnr.length === 0) {
        return pnr;
    }

    const visibleLength = Math.min(4, pnr.length);
    return `${"*".repeat(Math.max(0, pnr.length - visibleLength))}${pnr.slice(-visibleLength)}`;
}

export function projectStudentForViewer(student, user, { isOwner } = {}) {
    if (student === null || student === undefined) {
        return student;
    }

    const source = asObject(student);
    if (!source || typeof source !== "object") {
        return source;
    }

    const projected = { ...source };
    const roles = getRoles(user);
    const owner = roles.includes("student") && (
        isOwner === true || (
            isOwner === undefined &&
            matchesEmail(user?.email, source.email)
        )
    );

    if (hasRole(user, "systemadmin", "admin")) {
        if (projected.user) {
            projected.user = removeUserPasswords(projected.user);
        }
        delete projected.password;
        delete projected.passwordHash;
        return projected;
    }

    if (hasRole(user, "syv", "specped")) {
        delete projected.changeHistory;
    } else if (hasRole(user, "teacher")) {
        delete projected.supportInfo;
        delete projected.deviations;
        delete projected.changeHistory;
    } else if (hasRole(user, "coordinator")) {
        delete projected.personalNumber;
        delete projected.personnummer;
        delete projected.supportInfo;
        delete projected.specialNeeds;
        delete projected.examAccommodations;
        delete projected.deviations;
        delete projected.commentHistory;
        delete projected.changeHistory;
    } else if (owner) {
        delete projected.changeHistory;
    } else {
        for (const field of [...PERSONAL_FIELDS, ...SUPPORT_FIELDS]) {
            delete projected[field];
        }
        delete projected.personnummer;
        delete projected.deviations;
        delete projected.commentHistory;
        delete projected.changeHistory;
        delete projected.user;
    }

    if (projected.user) {
        projected.user = removeUserPasswords(projected.user);
    }
    delete projected.password;
    delete projected.passwordHash;
    delete projected.hashedPassword;

    return projected;
}

export function projectStudentsForViewer(students, user) {
    if (!Array.isArray(students)) {
        return students;
    }

    return students.map((student) => projectStudentForViewer(student, user));
}
