# Mindful Learning — UI/UX Audit & Design System (Phase A/B)

## Scope
Etapp 1 + Etapp 2 only. No Etapp 3 features, no AI/chatbot, no student learning portal, no new backend or schema changes.

## Migration strategy
Gradual, view-by-view using shared design-system components. Each phase ends with frontend tests, lint, and responsive/accessibility checks. No big-bang rewrite.

## Terminology
Consistent Swedish UI labels; backend field names and API contracts unchanged.

## Authorization
UI visibility is cosmetic only; backend authorization remains authoritative.

## Audit summary
- Frontend: Vue 3 + Vite + Vuetify; 102 views, 18 components, 4 CSS files.
- Navigation: single NavBar.vue plus router.js (~100 routes). Role gating via meta.role and store getters.
- Styling: mixed Vuetify + custom CSS; inconsistent spacing, colors, table styles.
- Key areas: admin CRUD, teacher grading, student tabs, APL, inactivity, messaging, certificates, course templates, course cards, reports.

## Identified inconsistencies
- Multiple button styles and table layouts.
- Inconsistent empty/loading/error states.
- Mixed Swedish/English labels.
- No shared design tokens (colors/spacing).
- Mobile responsiveness uneven.

## Proposed design system (Scandinavian SaaS)
Colors:
- Primary: #1e3a5f (deep navy)
- Secondary: #3b6ea5
- Accent: #2a9d8f (teal)
- Background: #f5f7fa
- Surface: #ffffff
- Text: #1f2937
- Muted: #6b7280
- Success: #16a34a, Warning: #f59e0b, Danger: #dc2626, Info: #2563eb

Spacing tokens: 4/8/12/16/24/32/48 px.
Typography: Inter or system-ui; H1 24px, H2 20, H3 16, body 14, small 12.
Components: buttons, inputs, selects, date pickers, search, modals, tabs, cards, tables, badges, tooltips, pagination, empty/loading/error states, breadcrumbs.

## Implementation plan
Phase C: app shell (sidebar + top header) with role-based nav.
Phase D: admin dashboard + management pages.
Phase E: course templates + kurskort.
Phase F: teacher workflows.
Phase H: APL, inactivity, grading, exams, messaging, documents.
Phase I: responsive + accessibility.
Phase J: regression testing.

All changes on branch redesign/ui-ux-audit. No changes to main until approved.
