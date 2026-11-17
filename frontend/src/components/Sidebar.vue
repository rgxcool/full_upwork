<template>
  <aside class="ml-sidebar" :class="{ collapsed }">
    <div class="ml-sidebar__header">
      <span v-if="!collapsed" class="ml-sidebar__title">Mindful Learning</span>
      <button class="ml-sidebar__toggle" :aria-label="collapsed ? 'Expandera' : 'Minimera'" @click="$emit('toggle')">
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>
    <nav class="ml-sidebar__nav">
      <router-link
        v-for="item in visibleItems"
        :key="item.to"
        :to="item.to"
        class="ml-sidebar__item"
        :title="collapsed ? item.label : ''"
      >
        <span class="ml-sidebar__icon">{{ item.icon }}</span>
        <span v-if="!collapsed" class="ml-sidebar__label">{{ item.label }}</span>
      </router-link>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useStore } from 'vuex'

const props = defineProps({ collapsed: { type: Boolean, default: false } })
defineEmits(['toggle'])

const store = useStore()

const ALL = ['admin', 'systemadmin']
const STAFF = ['admin', 'systemadmin', 'teacher', 'syv', 'specped', 'coordinator']

const items = [
  { to: '/dashboard', label: 'Översikt', icon: '🏠', roles: STAFF },
  { to: '/admin/users', label: 'Användare', icon: '👥', roles: ALL },
  { to: '/admin/permissions', label: 'Behörigheter', icon: '🔐', roles: ALL },
  { to: '/admin/inactivity-report', label: 'Inaktivitetsrapport', icon: '⚠️', roles: ALL },
  { to: '/admin/date-planning', label: 'Datumplanering', icon: '📅', roles: ALL },
  { to: '/admin/course-templates', label: 'Kursmallar', icon: '🧩', roles: ALL },
  { to: '/admin/course-instances', label: 'Kursinstanser', icon: '📘', roles: ALL },
  { to: '/admin/course-content', label: 'Kursinnehåll', icon: '📝', roles: ALL },
  { to: '/admin/resource-visits', label: 'Besöksrapport', icon: '📊', roles: ALL },
  { to: '/admin/certificates', label: 'Intyg', icon: '🎓', roles: ALL },
  { to: '/apl', label: 'APL', icon: '🏫', roles: STAFF },
  { to: '/messages', label: 'Meddelanden', icon: '💬', roles: [...STAFF, 'student'] },
]

const visibleItems = computed(() => {
  const role = store.getters.userRole || 'guest'
  return items.filter((i) => i.roles.includes(role))
})
</script>

<style scoped>
.ml-sidebar {
  width: 240px;
  min-height: 100vh;
  background: var(--color-surface);
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}
.ml-sidebar.collapsed { width: 64px; }
.ml-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid #f0f0f0;
}
.ml-sidebar__title { font-weight: 600; color: var(--color-primary); font-size: 14px; }
.ml-sidebar__toggle {
  border: none; background: transparent; cursor: pointer; color: var(--color-muted);
  font-size: 14px; padding: 4px 8px;
}
.ml-sidebar__nav { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2); }
.ml-sidebar__item {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 10px 12px; border-radius: 6px;
  text-decoration: none; color: var(--color-text); font-size: 14px;
}
.ml-sidebar__item:hover { background: #f3f4f6; }
.ml-sidebar__item.router-link-active { background: #eef2f7; color: var(--color-primary); font-weight: 600; }
.ml-sidebar__icon { width: 20px; text-align: center; }
</style>
