<!-- DocumentSection.vue -->
<template>
  <div class="document-section">
    <div v-if="!isStudent" class="not-available-message">
      <p>Dokumenthantering är endast tillgänglig för elever.</p>
    </div>
    <div v-else>
      <form @submit.prevent="uploadFile">
        <input type="file" @change="handleFileChange" />
        <button type="submit" :disabled="!selectedFile">Ladda upp</button>
      </form>

      <ul v-if="documents.length">
        <li v-for="doc in documents" :key="doc._id">
          <a :href="`${baseURL}/uploads/${doc.filename}`" target="_blank">{{
            doc.originalName
          }}</a>
          <button @click="deleteFile(doc._id)">🗑️</button>
        </li>
      </ul>

      <p v-else>Inga dokument uppladdade än.</p>
    </div>
  </div>
</template>

<script>
import { ref, watch, onMounted, computed } from 'vue';
import { api } from '@/store/store.js';

export default {
  props: {
    student: {
      type: Object,
      required: false,
    },
    userData: {
      type: Object,
      required: false,
    },
    userType: {
      type: String,
      default: null,
    },
    type: {
      type: String,
      default: 'GENERAL',
    },
    enrollmentId: {
      type: String,
      default: null,
    },
  },
  setup(props) {
    const documents = ref([]);
    const selectedFile = ref(null);
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    // Determine if this is a student
    const isStudent = computed(() => {
      if (props.student) return true;
      if (props.userData && (props.userType === 'Elev' || props.userType === 'student')) return true;
      return false;
    });

    // Get the student ID
    const studentId = computed(() => {
      if (props.student?._id) return props.student._id;
      if (props.userData && (props.userType === 'Elev' || props.userType === 'student')) {
        return props.userData._id;
      }
      return null;
    });

    const fetchDocuments = async () => {
      const id = studentId.value;
      if (!id) return;
      try {
        const params = { type: props.type };
        if (props.enrollmentId) {
          params.enrollmentId = props.enrollmentId;
        }
        const res = await api.get(`/documents/${id}`, { params });
        documents.value = res.data;
      } catch (error) {
        console.error('Error fetching documents:', error);
      }
    };

    const handleFileChange = (e) => {
      selectedFile.value = e.target.files[0];
    };

    const uploadFile = async () => {
      const id = studentId.value;
      if (!selectedFile.value || !id) return;

      const formData = new FormData();
      formData.append('file', selectedFile.value);
      formData.append('studentId', id);
      formData.append('type', props.type);
      if (props.enrollmentId) {
        formData.append('enrollmentId', props.enrollmentId);
      }

      try {
        await api.post('/documents/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        selectedFile.value = null;
        // Reset file input
        const inputFile = document.querySelector('input[type="file"]');
        if(inputFile) inputFile.value = '';

        await fetchDocuments();
      } catch (error) {
        console.error('Error uploading file:', error);
      }
    };

    const deleteFile = async (id) => {
      if (!confirm('Är du säker på att du vill radera detta dokument?')) return;
      try {
        await api.delete(`/documents/${id}`);
        await fetchDocuments();
      } catch (error) {
        console.error('Error deleting document:', error);
      }
    };

    onMounted(() => {
      if (isStudent.value) {
        fetchDocuments();
      }
    });
    
    watch(() => [studentId.value, props.type, props.enrollmentId], () => {
      if (isStudent.value) {
        fetchDocuments();
      }
    });

    return {
      documents,
      selectedFile,
      isStudent,
      handleFileChange,
      uploadFile,
      deleteFile,
      baseURL,
    };
  },
};
</script>

<style scoped>
.document-section {
  padding: 20px;
}
form {
  margin-bottom: 20px;
}
button {
  margin-left: 10px;
}
.not-available-message {
  padding: 20px;
  text-align: center;
  color: #666;
}
.not-available-message p {
  margin: 0;
  font-size: 16px;
}
</style>