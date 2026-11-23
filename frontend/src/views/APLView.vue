<template>
  <div class="scrollable-view apl-view">
    <h1>APL-status</h1>
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4">
      {{ loadError }}
      <template #append>
        <v-btn variant="text" size="small" @click="fetchStudents">Försök igen</v-btn>
      </template>
    </v-alert>
    <v-tabs v-model="activeTab" grow>
      <v-tab value="ongoing">Pågående</v-tab>
      <v-tab value="completed">Avslutad</v-tab>
      <v-tab value="archive">Avtalsarkiv</v-tab>
    </v-tabs>
    <v-window v-model="activeTab">
      <v-window-item value="ongoing">
        <APLBoard v-if="students.length" :students="students" filter-type="active" @student-updated="fetchStudents" />
        <!-- Distinguish "still loading" from "failed" and "loaded but empty",
             otherwise a failure leaves a permanent loading message. -->
        <div v-else-if="loadError" class="loading-text">
          Kunde inte visa pågående APL.
        </div>
        <div v-else-if="!loaded" class="loading-text">Laddar pågående APL...</div>
        <div v-else class="loading-text">Inga pågående APL-elever.</div>
      </v-window-item>
      <v-window-item value="completed">
        <AplCompletedTab />
      </v-window-item>
      <v-window-item value="archive">
        <APLFileArchive v-if="activeTab === 'archive'" />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import client from '@/api/client.js';
import APLBoard from '../components/APLBoard.vue';
import AplCompletedTab from './Admin/AplCompletedTab.vue';
import APLFileArchive from '../components/APLFileArchive.vue';

const activeTab = ref('ongoing');
const students = ref([]);
const loadError = ref('');
const loaded = ref(false);

const fetchStudents = async () => {
  loadError.value = '';
  try {
    const res = await client.get('/students');
    students.value = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    loadError.value = 'Kunde inte hämta APL-elever.';
  } finally {
    loaded.value = true;
  }
};

onMounted(fetchStudents);
</script>

<style scoped>
.apl-view {
  padding: 24px;
}
h1 {
  margin-bottom: 16px;
}
.loading-text {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}
</style>
