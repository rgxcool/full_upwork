/**
 * Teacher display helpers (#102).
 *
 * Since #102 a teacher is a User with `teacherProfile`, and every teacher
 * reference (responsibleTeacher, teacherId, …) is that User's id. A populated
 * reference is therefore the User itself (`{ _id, username, name, email }`),
 * while the /teachers API DTO also repeats the account as `userId` for older
 * code. These helpers accept either shape.
 */

const account = (teacher) =>
  teacher && typeof teacher.userId === 'object' && teacher.userId !== null ? teacher.userId : teacher

/** Display name of a teacher (populated User or /teachers DTO). */
export function teacherDisplayName(teacher, fallback = '') {
  if (!teacher || typeof teacher !== 'object') return fallback
  const a = account(teacher)
  return a.username || a.name || teacher.username || teacher.name || a.email || fallback
}

/** E-mail of a teacher (populated User or /teachers DTO). */
export function teacherEmail(teacher, fallback = '') {
  if (!teacher || typeof teacher !== 'object') return fallback
  return account(teacher).email || teacher.email || fallback
}

/** Calendar / kurskort colour of a teacher (populated User or /teachers DTO). */
export function teacherColor(teacher, fallback = null) {
  if (!teacher || typeof teacher !== 'object') return fallback
  return teacher.teacherProfile?.colorCode || teacher.colorCode || fallback
}
