export const roleRank = {
  guest: 0,
  user: 1,
  student: 2,
  coordinator: 3,
  specped: 4,
  syv: 5,
  teacher: 6,
  admin: 7,
  systemadmin: 8,
};

/** Highest-privilege role in the list (not necessarily roles[0]). */
export function getPrimaryRole(userOrRoles) {
  const roles = Array.isArray(userOrRoles)
    ? userOrRoles
    : userOrRoles?.roles;
  const list = Array.isArray(roles) && roles.length ? roles : [];
  let best = null;
  let bestRank = -1;
  for (const role of list) {
    const rank = roleRank[role];
    if (rank !== undefined && rank > bestRank) {
      bestRank = rank;
      best = role;
    }
  }
  if (best) return best;
  const fallback = Array.isArray(userOrRoles) ? null : userOrRoles?.role;
  return fallback && roleRank[fallback] !== undefined ? fallback : "guest";
}

export function hasCommentPermission(role) {
  return roleRank[role] >= roleRank["coordinator"];
}
