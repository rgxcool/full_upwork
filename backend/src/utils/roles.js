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

/**
 * Collect known roles from a user document, lean object, JWT payload, or array.
 * Includes a legacy Mongo `role` field (`_doc.role`) that the Mongoose virtual
 * otherwise hides behind `roles[0]` (often the default `"user"`).
 */
export function collectRoles(userOrRoles) {
  if (Array.isArray(userOrRoles)) {
    return [...new Set(userOrRoles.filter((role) => roleRank[role] !== undefined))];
  }
  if (!userOrRoles || typeof userOrRoles !== "object") return [];

  const collected = [];
  if (Array.isArray(userOrRoles.roles)) collected.push(...userOrRoles.roles);
  if (typeof userOrRoles.role === "string") collected.push(userOrRoles.role);
  const stored = userOrRoles._doc?.role;
  if (typeof stored === "string") collected.push(stored);
  return [...new Set(collected.filter((role) => roleRank[role] !== undefined))];
}

/** Highest-privilege role in the list (not necessarily roles[0]). */
export function getPrimaryRole(userOrRoles) {
  const list = collectRoles(userOrRoles);
  let best = null;
  let bestRank = -1;
  for (const role of list) {
    const rank = roleRank[role];
    if (rank !== undefined && rank > bestRank) {
      bestRank = rank;
      best = role;
    }
  }
  return best || "guest";
}

export function hasCommentPermission(role) {
  return roleRank[role] >= roleRank["coordinator"];
}
