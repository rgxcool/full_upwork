<template>
  <aside class="ml-sidebar" :class="{ collapsed }">
    <div class="ml-sidebar__header">
      <span v-if="!collapsed" class="ml-sidebar__title">Mindful Learning</span>
      <button class="ml-sidebar__toggle" :aria-label="collapsed ? 'Expandera' : 'Minimera'" @click="$emit('toggle')">
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>
    <nav class="ml-sidebar__nav">
      <template v-for="group in visibleGroups" :key="group.label">
        <div v-if="!collapsed" class="ml-sidebar__group-label">{{ group.label }}</div>
        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="ml-sidebar__item"
          :title="collapsed ? item.label : ''"
        >
          <span class="ml-sidebar__icon">{{ item.icon }}</span>
          <span v-if="!collapsed" class="ml-sidebar__label">{{ item.label }}</span>
        </router-link>
      </template>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'

defineProps({ collapsed: { type: Boolean, default: false } })
defineEmits(['toggle'])

const store = useStore()

const ADMIN = ['admin']
const SYS = ['systemadmin']
const ADMIN_SYS = ['admin', 'systemadmin']
const TEACHER = ['teacher']
const SYV = ['syv']
const SPECPED = ['specped']
const COORD = ['coordinator']

const groups = [
  {
    label: 'Översikt',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: '🏠', roles: [...ADMIN_SYS, ...TEACHER, ...SYV, ...SPECPED, ...COORD] },
      { to: '/profile', label: 'Min profil', icon: '👤', roles: [...ADMIN_SYS, ...TEACHER, ...SYV, ...SPECPED, ...COORD] },
    ],
  },
  {
    label: 'Elever',
    items: [
      { to: '/admin/users', label: 'Sök användare', icon: '🔎', roles: ADMIN },
      { to: '/addstudent', label: 'Lägg till elev', icon: '➕', roles: ADMIN },
      { to: '/manual-add-student', label: 'Manuell registrering', icon: '📝', roles: ADMIN },
      { to: '/students', label: 'Elevlista', icon: '👥', roles: [...ADMIN, ...TEACHER] },
      { to: '/student-enrollments', label: 'Elevregistreringar', icon: '📋', roles: ADMIN },
      { to: '/inaktiva-elever', label: 'Inaktiva elever', icon: '⏸️', roles: ADMIN_SYS },
      { to: '/admin/inactivity', label: 'Inaktivitetsrapport', icon: '⚠️', roles: [...ADMIN_SYS, ...TEACHER] },
    ],
  },
  {
    label: 'Personal',
    items: [
      { to: '/lagg-till-anvandare', label: 'Lägg till användare', icon: '👤', roles: ADMIN },
      { to: '/lagg-till-larare', label: 'Lägg till lärare', icon: '🧑‍🏫', roles: ADMIN },
      { to: '/teacher-management', label: 'Lärarhantering', icon: '👨‍🏫', roles: ADMIN },
      { to: '/admin/permissions', label: 'Behörigheter', icon: '🔐', roles: ADMIN_SYS },
    ],
  },
  {
    label: 'Utbildning',
    items: [
      { to: '/education', label: 'Utbildningsredigerare', icon: '🏫', roles: ADMIN },
      { to: '/programsandcourses', label: 'Program & kurser', icon: '📚', roles: ADMIN },
      { to: '/programsandpackages', label: 'Program & paket', icon: '📦', roles: ADMIN },
      { to: '/course-instances', label: 'Kursinstanser', icon: '📘', roles: ADMIN },
      { to: '/course-templates', label: 'Kursmallar', icon: '🧩', roles: [...ADMIN, ...TEACHER] },
      { to: '/course-matching', label: 'Kursmatchning', icon: '🔗', roles: ADMIN },
      { to: '/schedule-parameters', label: 'Schemaparametrar', icon: '⏱️', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/date-planning', label: 'Datumplanering', icon: '📅', roles: ADMIN_SYS },
      { to: '/larare/kurser', label: 'Mina kurser', icon: '📖', roles: TEACHER },
    ],
  },
  {
    label: 'Kurskort & innehåll',
    items: [
      { to: '/admin/course-content', label: 'Kursinnehåll', icon: '📝', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/admin/student-course-cards', label: 'Elevens kurskort', icon: '🗂️', roles: ADMIN },
      { to: '/admin/course-statistics', label: 'Kursstatistik', icon: '📈', roles: ADMIN },
      { to: '/stats/courses', label: 'Kursöversikt', icon: '📊', roles: ADMIN },
    ],
  },
  {
    label: 'APL',
    items: [
      { to: '/apl', label: 'APL-lista', icon: '🏭', roles: [...ADMIN, ...TEACHER, ...COORD] },
    ],
  },
  {
    label: 'Bedömning',
    items: [
      { to: '/betyg', label: 'Betygssättning', icon: '✅', roles: TEACHER },
      { to: '/submissions', label: 'Inlämningar', icon: '📥', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/signering', label: 'Betygssignering', icon: '✍️', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/admin/betygsrapporter', label: 'Betygsrapporter', icon: '📄', roles: ADMIN_SYS },
      { to: '/admin/betygsskala', label: 'Betygsskalor', icon: '⚖️', roles: ADMIN_SYS },
      { to: '/admin/completions', label: 'Kursgenomförande', icon: '🏁', roles: ADMIN_SYS },
      { to: '/admin/reports', label: 'Kompletionsrapporter', icon: '📑', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/grade-lookups', label: 'Betygsuppföljning', icon: '🔍', roles: ADMIN },
      { to: '/provningar', label: 'Prövningar', icon: '🧪', roles: ADMIN_SYS },
      { to: '/larare/fragebank', label: 'Frågebank', icon: '❓', roles: [...ADMIN_SYS, ...TEACHER] },
      { to: '/larare/generera-exam', label: 'Generera prov', icon: '🧾', roles: [...ADMIN_SYS, ...TEACHER] },
    ],
  },
  {
    label: 'Kommunikation',
    items: [
      { to: '/messages', label: 'Meddelanden', icon: '💬', roles: [...ADMIN_SYS, ...TEACHER, ...SYV, ...SPECPED, ...COORD] },
      { to: '/admin/notifications', label: 'Notifikationer', icon: '🔔', roles: ADMIN },
      { to: '/admin/activity-feed', label: 'Aktivitetsflöde', icon: '📰', roles: ADMIN },
    ],
  },
  {
    label: 'Dokument & rapporter',
    items: [
      { to: '/admin/certificates', label: 'Intyg & diplom', icon: '🎓', roles: ADMIN_SYS },
      { to: '/admin/resource-visits', label: 'Besöksrapport', icon: '📊', roles: [...ADMIN_SYS, ...TEACHER, ...COORD, ...SYV, ...SPECPED] },
      { to: '/admin/analytics', label: 'Rapporter & analys', icon: '📉', roles: ADMIN_SYS },
      { to: '/earnings', label: 'Ekonomiöversikt', icon: '💰', roles: ADMIN },
    ],
  },
  {
    label: 'Kalender & möten',
    items: [
      { to: '/kalender', label: 'Kalender', icon: '🗓️', roles: [...ADMIN_SYS, ...TEACHER, ...SYV, ...SPECPED] },
      { to: '/syv/appointments', label: 'SYV-samtal', icon: '🗣️', roles: [...ADMIN_SYS, ...SYV] },
      { to: '/specped/appointments', label: 'Specped-samtal', icon: '🤝', roles: [...ADMIN_SYS, ...SPECPED] },
      { to: '/admin/calendar-housekeeping', label: 'Kalenderunderhåll', icon: '🧹', roles: ADMIN },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/action-plans', label: 'Handlingsplaner', icon: '🗺️', roles: ADMIN },
      { to: '/admin/learning-management', label: 'Inlämningar & deltagare', icon: '⚙️', roles: ADMIN },
    ],
  },
]

const visibleGroups = computed(() => {
  const role = store.getters.userRole || 'guest'
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0)
})
</script>

<style scoped>
.ml-sidebar {
  width: 260px;
  min-height: 100vh;
  background: var(--color-surface);
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  overflow-y: auto;
  flex-shrink: 0;
}
.ml-sidebar.collapsed { width: 64px; }
.ml-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  background: var(--color-surface);
  z-index: 1;
}
.ml-sidebar__title { font-weight: 600; color: var(--color-primary); font-size: 14px; }
.ml-sidebar__toggle {
  border: none; background: transparent; cursor: pointer; color: var(--color-muted);
  font-size: 14px; padding: 4px 8px; border-radius: 4px;
}
.ml-sidebar__toggle:hover { background: #f3f4f6; }
.ml-sidebar__nav { display: flex; flex-direction: column; padding: var(--space-2); }
.ml-sidebar__group-label {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--color-muted); padding: 12px 12px 4px; margin-top: 4px;
}
.ml-sidebar__item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 8px 12px; border-radius: 6px;
  text-decoration: none; color: var(--color-text); font-size: 14px;
}
.ml-sidebar__item:hover { background: #f3f4f6; }
.ml-sidebar__item.router-link-active { background: #eef2f7; color: var(--color-primary); font-weight: 600; }
.ml-sidebar__icon { width: 20px; text-align: center; flex-shrink: 0; }
.ml-sidebar.collapsed .ml-sidebar__item { justify-content: center; padding: 10px; }

@media (max-width: 768px) {
  .ml-sidebar {
    width: 100%;
    min-height: auto;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }
  .ml-sidebar.collapsed { width: 100%; }
  .ml-sidebar__nav { flex-direction: row; flex-wrap: wrap; gap: 4px; }
  .ml-sidebar__group-label { width: 100%; padding-top: 8px; }
  .ml-sidebar__item { padding: 8px 10px; }
}
</style>
