<!-- DocumentSection.vue -->
<template>
    <div class="document-section">  
      <form @submit.prevent="uploadFile">
        <input type="file" @change="handleFileChange" />
        <button type="submit" :disabled="!selectedFile">Ladda upp</button>
      </form>
  
      <ul v-if="documents.length">
        <li v-for="doc in documents" :key="doc._id">
          <a :href="`${baseURL}/uploads/${doc.filename}`" target="_blank">{{ doc.filename }}</a>
          <button @click="deleteFile(doc._id)">🗑️</button>
        </li>
      </ul>
  
      <p v-else>Inga dokument uppladdade än.</p>
    </div>
  </template>
  
  <script>
  import axios from 'axios';
  import { ref, watch, onMounted } from 'vue';
  
  export default {
    props: ['userData', 'userType'],
    setup(props) {
      const documents = ref([]);
      const selectedFile = ref(null);
      const baseURL = import.meta.env.VITE_API_URL;

  
      const fetchDocuments = async () => {
        const res = await axios.get(`/api/documents/${props.userData._id}`);
        documents.value = res.data;
        console.log('Fetched documents:', documents.value);
      };
  
      const handleFileChange = (e) => {
        selectedFile.value = e.target.files[0];
      };
  
      const uploadFile = async () => {
        const formData = new FormData();
        formData.append('file', selectedFile.value);
        formData.append('studentId', props.userData._id);
  
        await axios.post('/api/documents/upload', formData);
        selectedFile.value = null;
        await fetchDocuments();
      };
  
      const deleteFile = async (id) => {
        await axios.delete(`/api/documents/${id}`);
        await fetchDocuments();
      };
  
      onMounted(fetchDocuments);
      watch(() => props.userData._id, fetchDocuments);
  
      return { documents, selectedFile, handleFileChange, uploadFile, deleteFile, baseURL };
    }
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
  </style>