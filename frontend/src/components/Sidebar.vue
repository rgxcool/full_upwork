<template>
  <aside class="ml-sidebar" :class="{ collapsed }">
    <div class="ml-sidebar__header">
      <span v-if="!collapsed" class="ml-sidebar__title">Mindful Learning</span>
      <button class="ml-sidebar__toggle" @click="$emit('toggle')">
        {{ collapsed ? '»' : '«' }}
      </button>
    </div>
    <nav class="ml-sidebar__nav">
      <router-link v-for="item in visibleItems" :key="item.to" :to="item.to" class="ml-sidebar__item">
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
const items = [
  { to: '/dashboard', label: 'Översikt', icon: '🏠', roles: ['admin','systemadmin','teacher','syv','specped','coordinator'] },
  { to: '/admin/users', label: 'Användare', icon: '👥', roles: ['admin','systemadmin'] },
  { to: '/messages', label: 'Meddelanden', icon: '💬', roles: ['admin','systemadmin','teacher','syv','specped','coordinator','student'] },
]

const visibleItems = computed(() => {
  const role = store.getters.userRole || 'guest'
  return items.filter((i) => i.roles.includes(role))
})
</script>

<style scoped>
.ml-sidebar { width: 240px; background: var(--color-surface); border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; transition: width .2s; }
.ml-sidebar.collapsed { width: 64px; }
.ml-sidebar__header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); }
.ml-sidebar__title { font-weight: 600; color: var(--color-primary); }
.ml-sidebar__nav { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); }
.ml-sidebar__item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 6px; text-decoration: none; color: var(--color-text); }
.ml-sidebar__item.router-link-active { background: #eef2f7; color: var(--color-primary); font-weight: 600; }
</style>
