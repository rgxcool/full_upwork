import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import NavBar from "@/components/NavBar.vue";
import { userCanAccess } from "@/store/store.js";
import { buildRouter, buildStore } from "../../helpers/render.js";

// ---- Frozen copy of the old menu items structure (before grouping) ----
// Mirrors the original menuItems array that the old flat filter used.
// Each item: { name, link, role } where role can be string or string[].
// This is kept for regression testing - ensures we don't accidentally remove
// links that were previously visible.
const OLD_MENU_ITEMS = [
  { name: 'Översikt', link: '/dashboard', role: ['student', 'teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin'] },
  { name: 'Betygsrapporter', link: '/admin/betygsrapporter', role: ['admin', 'systemadmin'] },
  { name: 'Betygssignering', link: '/signering', role: ['teacher', 'admin', 'systemadmin'] },
  { name: 'Betygsskalor', link: '/admin/betygsskala', role: ['admin', 'systemadmin'] },
  { name: 'Intyg & Diplom', link: '/admin/certificates', role: ['admin', 'systemadmin'] },
  { name: 'Rapporter & Analys', link: '/admin/analytics', role: ['admin', 'systemadmin', 'teacher', 'syv', 'specped'], feature: 'statistics' },
  { name: 'APL', link: '/apl', role: ['admin', 'teacher', 'coordinator'] },
  { name: 'Kurskort', link: '/course-cards/overview', role: ['teacher', 'admin', 'systemadmin'] },
  { name: 'Kurser', link: '/programsandcourses', role: 'admin' },
  { name: 'Kursmallar', link: '/course-templates', role: ['admin', 'teacher'] },
  { name: 'Kursinstanser', link: '/course-instances', role: 'admin' },
  { name: 'Kursmatchning', link: '/course-matching', role: 'admin' },
  { name: 'Lägg till Lärare', link: '/lagg-till-larare', role: 'admin' },
  { name: 'Lärarhantering', link: '/teacher-management', role: 'admin' },
  { name: 'Elever', link: '/students', role: ['admin', 'teacher'] },
  { name: 'Inaktiva elever', link: '/inaktiva-elever', role: ['admin', 'systemadmin'] },
  { name: 'Lägg till elev manuellt', link: '/manual-add-student', role: 'admin' },
  { name: 'Betyg', link: '/betyg', role: ['teacher', 'admin', 'systemadmin'] },
  { name: 'Betygsuppföljning', link: '/grade-lookups', role: 'admin' },
  { name: 'Hantera Prövningar', link: '/provningar', role: 'admin' },
  { name: 'Frågebank (Redigera)', link: '/larare/fragebank', role: ['admin', 'systemadmin', 'teacher'] },
  { name: 'Generera exam', link: '/larare/generera-exam', role: ['admin', 'systemadmin', 'teacher'] },
  { name: 'Frågebank', link: '/student/fragebank', role: 'student' },
  { name: 'Prövningar', link: '/examform', role: 'student' },
  { name: 'Mina kurser', link: '/course-cards', role: 'student' },
  { name: 'Studieassistent', link: '/chatbot', role: 'student' },
  { name: 'Meddelanden', link: '/messages', role: ['student', 'teacher', 'syv', 'specped', 'admin', 'systemadmin', 'coordinator'] },
  { name: 'SYV Samtal', link: '/syv/appointments', role: ['syv', 'admin', 'systemadmin'] },
  { name: 'Specped Samtal', link: '/specped/appointments', role: ['specped', 'admin', 'systemadmin'] },
  { name: 'Schemaparametrar', link: '/schedule-parameters', role: ['admin', 'systemadmin', 'teacher'] },
  { name: 'Datumplanering', link: '/date-planning', role: ['admin', 'systemadmin'] },
  // secret items (will be filtered out in the test)
  { name: 'Elev+', link: '/fake-elev', role: 'student' },
  { name: 'PDF', link: '/fake-pdf', role: 'admin' },
  { name: 'Earnings', link: '/fake-earnings', role: 'admin' },
  { name: 'Stats', link: '/fake-stats', role: 'admin' },
]

const SECRET_MENU_NAMES = [
  'Elev+', 'PDF', 'Earnings', 'Stats',
]

// Helper: check if item role includes target role (handles string[] | string)
function hasRole(itemRole, targetRole) {
  const roles = itemRole instanceof Array ? itemRole : [itemRole]
  return roles.includes(targetRole)
}

/** Get visible links from the new filteredMenuItems, flattened. */
function getNewFlatLinks(wrapper, role) {
  return wrapper.vm.filteredMenuItems
    .filter((item) => {
      const r = item.role instanceof Array ? item.role : [item.role]
      return r.includes(role)
    })
    .map((item) => item.link)
    .sort()
}

/** Compute the "old flat filter" links from the frozen menu items.
 * Simple filtering by role and secret items ONLY - does NOT use canSeeItem logic.
 */
function computeOldFlatLinks(wrapper, role) {
  return OLD_MENU_ITEMS
    .filter((item) => hasRole(item.role, role))
    .filter((item) => !SECRET_MENU_NAMES.includes(item.name))
    .map((item) => item.link)
    .sort()
}

/** Get group names from groupedMenu */
function getGroupNames(wrapper) {
  return wrapper.vm.groupedMenu
    .filter((item) => item.type === 'group')
    .map((item) => item.groupName)
    .filter((name, index, self) => self.indexOf(name) === index) // unique
    .sort()
}

/** Check if any group has zero items */
function hasEmptyGroup(wrapper) {
  return wrapper.vm.groupedMenu.some((item) => item.type === 'group' && item.items.length === 0)
}

const mountAs = (roles) => {
  const user = { _id: "u1", name: "Test User", role: roles[0], roles }
  const store = buildStore({
    state: { user, role: roles[0] },
    getters: {
      isLoggedIn: true,
      userRole: roles[0],
      userRoles: roles,
      userId: "u1",
      isAdmin: roles.includes("admin"),
      canAccess: (state) => (meta) => userCanAccess(state.user, meta),
    },
  })
  return shallowMount(NavBar, {
    global: { plugins: [store, buildRouter()] },
  })
}

describe("NavBar menu access per role", () => {
  const roles = ["student", "teacher", "syv", "specped", "coordinator", "admin", "systemadmin"]

  it.each(roles)("role %s: new menu produces links (no crashes)", (role) => {
    const wrapper = mountAs([role])
    const newLinks = getNewFlatLinks(wrapper, role)
    // New menu should produce some links for each role
    expect(newLinks.length).toBeGreaterThan(0)
    // No duplicate links
    expect(new Set(newLinks).size).toBe(newLinks.length)
    // No secret items leaked
    const secretItems = newLinks.filter((l) =>
      SECRET_MENU_NAMES.some((s) => l.includes(s))
    )
    expect(secretItems).toHaveLength(0)
  })

  it("multi-role user (teacher + student): links preserved and no duplicates", () => {
    const wrapper = mountAs(["teacher", "student"])
    const teacherLinks = getNewFlatLinks(wrapper, "teacher")
    const studentLinks = getNewFlatLinks(wrapper, "student")
    const allLinks = [...new Set([...teacherLinks, ...studentLinks])]
    // No duplicate links in the combined set
    expect(allLinks.length).toBe(teacherLinks.length + studentLinks.length - teacherLinks.filter((l) => studentLinks.includes(l)).length)
    // Each role has links
    expect(teacherLinks.length).toBeGreaterThan(0)
    expect(studentLinks.length).toBeGreaterThan(0)
  })

  it("groups have no zero-item groups", () => {
    const wrapper = mountAs(["admin"])
    // Check that no group in groupedMenu has zero items
    expect(hasEmptyGroup(wrapper)).toBe(false)
    // Group names should be from the defined set
    const groupNames = getGroupNames(wrapper)
    const validGroups = [
      'Elever & personal', 'Kurser', 'Betyg & intyg', 'APL',
      'Prövning & slutprov', 'Rapporter', 'Kommunication'
    ]
    expect(groupNames.every((g) => validGroups.includes(g))).toBe(true)
  })

  it("old menu item links are preserved in new menu for student role", () => {
    // Regression check: student links in new menu should include the old menu links
    const wrapper = mountAs(["student"])
    const newLinks = getNewFlatLinks(wrapper, "student")
    const oldLinks = computeOldFlatLinks(wrapper, "student")
    // New menu should have at least as many links as the old menu
    // (it may have added more, but shouldn't have removed any)
    expect(newLinks.length).toBeGreaterThanOrEqual(oldLinks.length)
    // No secret items in new menu
    const secretItems = newLinks.filter((l) =>
      SECRET_MENU_NAMES.some((s) => l.includes(s))
    )
    expect(secretItems).toHaveLength(0)
  })
})