// Shared route-role metadata for the two detail routes. Kept in a small module
// so the role decision can be tested without importing every lazy view in
// router.js.
export const SEARCH_DETAIL_ROLES = ['teacher', 'syv', 'specped', 'admin', 'systemadmin']
export const EDUCATION_DETAILS_ROLES = ['admin', 'systemadmin', 'teacher', 'syv', 'specped']

export const detailRouteMeta = {
  title: 'Search Result Details',
  role: SEARCH_DETAIL_ROLES,
}

export const educationRouteMeta = {
  title: 'Education Details',
  role: EDUCATION_DETAILS_ROLES,
}
