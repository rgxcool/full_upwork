/**
 * Helpers shared by the APL kit (logbook) UI.
 *
 * Kits are staff-managed: the backend only allows admin/systemadmin/teacher to
 * read or write `/students/:id/logbook`. The student detail page therefore has
 * to gate the Loggbok tab with the same role list, otherwise other roles get a
 * tab that only ever shows a 403 error.
 */

export const LOGBOOK_ROLES = ['admin', 'systemadmin', 'teacher'];

export const canManageAplKits = (role) => LOGBOOK_ROLES.includes(role);

export const hasLogbookEntries = (student) =>
  Array.isArray(student?.logbook) && student.logbook.length > 0;

/** A teacher/admin/staff profile is never an APL student. */
export const isStaffProfile = (student) =>
  ['teacher', 'staff', 'admin', 'systemadmin'].includes(
    String(student?.role || student?.userRole || '').toLowerCase()
  );

const isManuallyAdded = (studentId, manualAplIds) => {
  if (!studentId || !manualAplIds) return false;
  if (manualAplIds instanceof Set) return manualAplIds.has(studentId);
  if (Array.isArray(manualAplIds)) {
    return manualAplIds.map(String).includes(studentId);
  }
  return false;
};

/**
 * Mirrors the APL tab's eligibility rules (see StudentDetails.vue) so both tabs
 * appear for the same students.
 */
export const isAplManagedStudent = (student, manualAplIds = new Set()) => {
  if (!student) return false;

  const education = Array.isArray(student.education) ? student.education : [];
  const hasCoursePackage = education.some(
    (entry) =>
      entry &&
      (entry.type === 'CoursePackage' ||
        (entry.refId &&
          (entry.refId.coursePackageName || entry.refId.coursePackageCode)) ||
        entry.coursePackageId)
  );

  const hasAplHistory =
    Array.isArray(student.aplStatusHistory) && student.aplStatusHistory.length > 0;
  const hasActiveAplStatus = Boolean(
    student.aplStatus && student.aplStatus !== 'GRAY' && !student.dropout
  );

  return (
    hasCoursePackage ||
    hasAplHistory ||
    hasActiveAplStatus ||
    isManuallyAdded(String(student._id || ''), manualAplIds)
  );
};

/**
 * Should the "Loggbok" (APL kits) tab be offered?
 *
 * Visible to the roles allowed by the API, for students that already have kits
 * or are APL-managed (so staff can create the first kit).
 */
export const shouldShowLogbookTab = ({
  student,
  role,
  manualAplIds = new Set(),
} = {}) => {
  if (!student || isStaffProfile(student)) return false;
  if (!canManageAplKits(role)) return false;
  return hasLogbookEntries(student) || isAplManagedStudent(student, manualAplIds);
};
