<template>
  <v-card class="ma-4">
    <v-card-title>
      APL Kontrakt Arkiv
      <v-spacer></v-spacer>
      <v-btn icon title="Uppdatera lista" @click="fetchAllFiles">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
      <v-text-field
        v-model="search"
        append-icon="mdi-magnify"
        label="Sök student"
        single-line
        hide-details
        clearable
        class="ml-4"
      ></v-text-field>
    </v-card-title>
    <v-list>
      <v-list-group v-for="student in filteredStudents" :key="student.studentId">
        <template #activator="{ props }">
          <v-list-item v-bind="props" :title="student.studentName"></v-list-item>
        </template>
        <v-list-item v-for="file in student.files" :key="file._id">
            <v-list-item-title>{{ file.originalName }}</v-list-item-title>
            <v-list-item-subtitle>
              Uppladdad: {{ formatDate(file.createdAt) }}
            </v-list-item-subtitle>
            <template #append>
                <v-btn icon flat :title="`Ladda ner ${file.originalName}`" @click="downloadFile(file._id, file.originalName)">
                    <v-icon>mdi-download</v-icon>
                </v-btn>
            </template>
        </v-list-item>
      </v-list-group>
    </v-list>
    <div v-if="loading" class="text-center pa-4">Laddar filer...</div>
    <div v-if="!loading && !filteredStudents.length && !search" class="text-center pa-4">
      Inga APL-avtal hittades. Avtal laddas upp under fliken Avslutad.
    </div>
    <div v-if="!loading && !filteredStudents.length && search" class="text-center pa-4">
      Inga studenter matchade sökningen "{{ search }}".
    </div>
  </v-card>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

const toast = useToast();
const studentsWithFiles = ref([]);
const loading = ref(true);
const search = ref('');

// APL contracts are stored as Document records (type APL_CONTRACT) by
// AplCompletedTab; GET /documents lists the ones this user may open.
const fetchAllFiles = async () => {
  loading.value = true;
  try {
    const { data } = await client.get('/documents', { params: { type: 'APL_CONTRACT' } });
    const byStudent = new Map();
    for (const doc of Array.isArray(data) ? data : []) {
      const key = String(doc.student);
      if (!byStudent.has(key)) {
        byStudent.set(key, { studentId: key, studentName: doc.studentName || 'Okänd elev', files: [] });
      }
      byStudent.get(key).files.push(doc);
    }
    studentsWithFiles.value = [...byStudent.values()].sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'sv')
    );
  } catch (err) {
    console.error('Failed to fetch APL contracts:', err);
    toast.error('Kunde inte ladda APL-avtal.');
    studentsWithFiles.value = [];
  } finally {
    loading.value = false;
  }
};

const filteredStudents = computed(() => {
  if (!search.value || !search.value.trim()) {
    return studentsWithFiles.value;
  }
  
  const searchTerm = search.value.toLowerCase().trim();
  
  return studentsWithFiles.value.filter(s => {
    if (!s.studentName) return false;
    
    const studentName = s.studentName.toLowerCase();
    
    // Direct match
    if (studentName.includes(searchTerm)) {
      return true;
    }
    
    // Split search term into words and check if all words appear in the name
    const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
    if (searchWords.length > 1) {
      // If multiple words, check if all words appear (in any order)
      return searchWords.every(word => studentName.includes(word));
    }
    
    // Also try splitting the student name and matching individual parts
    const nameParts = studentName.split(/[\s,]+/).filter(p => p.length > 0);
    return nameParts.some(part => part.includes(searchTerm)) || 
           searchWords.some(word => nameParts.some(part => part.includes(word)));
  });
});

const downloadFile = async (fileId, filename) => {
    try {
        const res = await client.get(`/documents/download/${fileId}`, {
            responseType: 'blob',
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
        toast.error('Failed to download file.');
    }
};

const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
};

onMounted(fetchAllFiles);
</script>
