<template>
  <v-card class="elevation-1" rounded="lg">
    <!-- Tabs with bottom border -->
    <v-tabs
      v-model="activeSubTab"
      color="primary"
      background-color="grey-lighten-4"
      grow
      class="border-b"
    >
      <v-tab value="student">👨‍🎓 Studentens Handlingsplan</v-tab>
      <v-tab v-if="isAdmin" value="admin">🛠️ Admin Frågor</v-tab>
    </v-tabs>

    <!-- Content with top padding and border -->
    <v-window v-model="activeSubTab" class="pa-4 border-t">
      <v-window-item value="student">
        <ActionPlanQuestions :userData="userData" />
      </v-window-item>
      <v-window-item value="admin" v-if="isAdmin">
        <AdminQuestionTab :userData="userData" />
      </v-window-item>
    </v-window>
  </v-card>
</template>

<script setup>
  import { ref, computed } from 'vue'
  import { useStore } from 'vuex'
  import ActionPlanQuestions from './ActionPlanQuestions.vue'
  import AdminQuestionTab from './ChangeActionPlan.vue'

  const store = useStore()
  const userRole = computed(() => store.getters.userRole || 'guest')
  const isAdmin = computed(() => userRole.value === 'systemadmin')

  const activeSubTab = ref('student')

  const props = defineProps(['userData'])
</script>

<style scoped>
  .border-b {
    border-bottom: 1px solid #ccc;
  }
  .border-t {
    border-top: 1px solid #ccc;
  }
</style>
