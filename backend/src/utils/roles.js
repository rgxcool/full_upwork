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

export function hasCommentPermission(role) {
  return roleRank[role] >= roleRank["coordinator"];
}
