<template>
  <v-card class="ma-4">
    <v-card-title>
      APL Kontrakt Arkiv
      <v-spacer></v-spacer>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Sök student"
        single-line
        hide-details
      ></v-text-field>
    </v-card-title>
    <v-list>
      <v-list-group v-for="student in filteredStudents" :key="student.studentId">
        <template v-slot:activator="{ props }">
          <v-list-item v-bind="props" :title="student.studentName"></v-list-item>
        </template>
        <v-list-item v-for="file in student.files" :key="file._id">
            <v-list-item-title>{{ file.filename }}</v-list-item-title>
            <v-list-item-subtitle>
              Uppladdad: {{ formatDate(file.uploadDate) }}
            </v-list-item-subtitle>
            <template v-slot:append>
                <v-btn icon flat @click="downloadFile(file._id, file.filename)">
                    <v-icon>mdi-download</v-icon>
                </v-btn>
            </template>
        </v-list-item>
      </v-list-group>
    </v-list>
    <div v-if="loading">Loading files...</div>
    <div v-if="!loading && !filteredStudents.length">No files found.</div>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';

const studentsWithFiles = ref([]);
const loading = ref(true);
const search = ref('');

const API_BASE = `${import.meta.env.VITE_API_URL?.replace(/\/$/, '') || 'http://localhost:5001'}/api/uploads`;

const fetchAllFiles = async () => {
  loading.value = true;
  try {
    const { data } = await axios.get(`${API_BASE}/all/apl`, { withCredentials: true });
    studentsWithFiles.value = data;
  } catch (err) {
    console.error('Failed to fetch all APL files', err);
  } finally {
    loading.value = false;
  }
};

const filteredStudents = computed(() => {
  if (!search.value) {
    return studentsWithFiles.value;
  }
  return studentsWithFiles.value.filter(s =>
    s.studentName.toLowerCase().includes(search.value.toLowerCase())
  );
});

const downloadFile = async (fileId, filename) => {
    try {
        const res = await axios.get(`${API_BASE}/download/${fileId}`, {
            responseType: 'blob',
            withCredentials: true,
        });
        const blobUrl = window.URL.createObjectURL(res.data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Download failed:', error);
        alert('Failed to download file.');
    }
};

const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
};

onMounted(fetchAllFiles);
</script>
