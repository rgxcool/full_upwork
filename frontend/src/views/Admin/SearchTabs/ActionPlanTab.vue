<template>
  <div>
    <ul class="nav nav-tabs mb-3">

    <li class="nav-item">
      <button
        class="nav-link"
        :class="{active: activeSubTab === 'student'}"
        @click="activeSubTab = 'student'"
      >
        Studentens Handlingsplan
      </button>
    </li>
    <li class="nav-item" v-if="isAdmin">
      <button
        class="nav-link"
        :class="{active: activeSubTab === 'admin'}"
        @click="activeSubTab = 'admin'"
      >
        Admin Frågor
      </button>
    </li>
  </ul>

    <component :userData="userData" :is="currentSubComponent"></component>


  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import ActionPlanQuestions from './ActionPlanQuestions.vue'
import AdminQuestionTab from './ChangeActionPlan.vue' // Justera beroende på var du sparade filen

// Använd Vuex för att få användarroll
const store = useStore()
const userRole = computed(() => store.getters.userRole || 'guest')
const isAdmin = computed(() => userRole.value === 'systemadmin')

const activeSubTab = ref('student')
const currentSubComponent = computed(() => {
  return activeSubTab.value === 'admin' ? AdminQuestionTab : ActionPlanQuestions // Byt ut mot rätt komponent för studenten
})

const props = defineProps(['userData'])

</script>

<style>
nav {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

button {
  padding: 5px 10px;
  cursor: pointer;
}
</style>