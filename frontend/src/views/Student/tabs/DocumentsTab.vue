<template>
  <div class="documents-tab">
    <div class="documents-header">
      <div>
        <h4>Dokument</h4>
        <p class="documents-subtitle">
          Alla dokument som hör till {{ studentName }}.
        </p>
      </div>
      <span v-if="documents.length" class="doc-count">
        {{ documents.length }} dokument
      </span>
    </div>

    <div v-if="canUpload" class="upload-card">
      <h5>Ladda upp dokument</h5>
      <form class="upload-form" @submit.prevent="uploadFile">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          :accept="acceptedExtensions"
          :disabled="uploading"
          aria-label="Välj dokument att ladda upp"
          @change="handleFileChange"
        />
        <select
          v-model="selectedType"
          class="type-select"
          :disabled="uploading"
          aria-label="Dokumenttyp"
        >
          <option v-for="option in typeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button type="submit" class="primary-btn" :disabled="!selectedFile || uploading">
          {{ uploading ? 'Laddar upp...' : 'Ladda upp' }}
        </button>
      </form>
      <p class="upload-hint">
        Tillåtna format: PDF, Word, Excel, PowerPoint, text, CSV och bilder. Max 10 MB.
      </p>
      <p v-if="uploadError" class="upload-error" role="alert">{{ uploadError }}</p>
      <p v-if="successMessage" class="upload-success" role="status">{{ successMessage }}</p>
    </div>

    <div v-if="loading" class="state-card" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <p>Laddar dokument...</p>
    </div>

    <div v-else-if="loadError" class="state-card error-state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="secondary-btn" @click="fetchDocuments">Försök igen</button>
    </div>

    <div v-else-if="!documents.length" class="state-card empty-state">
      <p>Inga dokument uppladdade än.</p>
      <p v-if="canUpload" class="empty-hint">Använd formuläret ovan för att ladda upp det första dokumentet.</p>
    </div>

    <ul v-else class="document-list">
      <li v-for="doc in documents" :key="doc._id" class="document-item">
        <span class="file-badge" aria-hidden="true">{{ fileTypeLabel(doc) }}</span>

        <div class="document-main">
          <button
            type="button"
            class="document-name"
            :disabled="downloadingId === doc._id"
            @click="downloadDocument(doc)"
          >
            {{ doc.originalName || 'Namnlös fil' }}
          </button>
          <div class="document-meta">
            <span>{{ formatDate(doc.createdAt) }}</span>
            <span class="meta-separator">•</span>
            <span>{{ uploaderLabel(doc) }}</span>
            <span class="meta-separator">•</span>
            <span>{{ fileTypeLabel(doc) }}</span>
            <span v-if="doc.size" class="meta-separator">•</span>
            <span v-if="doc.size">{{ formatSize(doc.size) }}</span>
          </div>
        </div>

        <button
          type="button"
          class="secondary-btn download-btn"
          :disabled="downloadingId === doc._id"
          @click="downloadDocument(doc)"
        >
          {{ downloadingId === doc._id ? 'Hämtar...' : 'Ladda ner' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script>
import { computed, onMounted, ref, watch } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'rtf', 'odt', 'ods', 'odp', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic',
];
const ALLOWED_EXTENSION_LOOKUP = new Set(ALLOWED_EXTENSIONS.map((ext) => `.${ext}`));
const STAFF_UPLOAD_ROLES = ['systemadmin', 'admin', 'coordinator', 'tester'];

const TYPE_OPTIONS = [
  { value: 'GENERAL', label: 'Allmänt dokument' },
  { value: 'CV', label: 'CV' },
  { value: 'APL_CONTRACT', label: 'APL-kontrakt' },
  { value: 'APL_CV', label: 'APL-CV' },
  { value: 'COURSE_ARCHIVE', label: 'Praktikintyg / kursarkiv' },
  { value: 'REPORT', label: 'Rapport' },
];

const getExtension = (filename) => {
  const match = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

export default {
  name: 'DocumentsTab',
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const store = useStore();
    const toast = useToast();

    const documents = ref([]);
    const loading = ref(true);
    const loadError = ref(null);
    const accessGranted = ref(null);

    const selectedFile = ref(null);
    const selectedType = ref('GENERAL');
    const uploading = ref(false);
    const uploadError = ref(null);
    const successMessage = ref(null);
    const downloadingId = ref(null);
    const fileInput = ref(null);

    const studentId = computed(() => props.student?._id || null);
    const studentName = computed(() => props.student?.name || 'eleven');
    const currentUser = computed(() => store.state.user || {});
    const currentUserId = computed(
      () => currentUser.value?.userId || currentUser.value?._id || ''
    );
    const userRoles = computed(() => {
      const roles = new Set();
      const raw = currentUser.value?.roles;
      if (Array.isArray(raw)) raw.forEach((role) => roles.add(String(role).toLowerCase()));
      if (currentUser.value?.role) roles.add(String(currentUser.value.role).toLowerCase());
      if (store.getters.userRole) roles.add(String(store.getters.userRole).toLowerCase());
      return roles;
    });

    const canUpload = computed(() => {
      // The backend decides, but only offer the form once the list request
      // proved this user may access the student's documents.
      if (accessGranted.value !== true) return false;

      if (STAFF_UPLOAD_ROLES.some((role) => userRoles.value.has(role))) return true;

      if (userRoles.value.has('teacher')) return true;

      if (userRoles.value.has('student')) {
        const userEmail = String(currentUser.value?.email || '').trim().toLowerCase();
        const studentEmail = String(props.student?.email || '').trim().toLowerCase();
        return Boolean(userEmail && studentEmail && userEmail === studentEmail);
      }

      return false;
    });

    const acceptedExtensions = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

    const fetchDocuments = async () => {
      if (!studentId.value) {
        documents.value = [];
        loading.value = false;
        accessGranted.value = false;
        return;
      }

      loading.value = true;
      loadError.value = null;

      try {
        const response = await client.get(`/documents/${studentId.value}`);
        documents.value = Array.isArray(response.data) ? response.data : [];
        accessGranted.value = true;
      } catch (error) {
        documents.value = [];
        accessGranted.value = false;
        loadError.value = error.response?.status === 403
          ? 'Du har inte behörighet att se dokumenten för den här eleven.'
          : 'Kunde inte hämta dokumenten. Försök igen.';
      } finally {
        loading.value = false;
      }
    };

    const resetFileInput = () => {
      if (fileInput.value) fileInput.value.value = '';
    };

    const handleFileChange = (event) => {
      uploadError.value = null;
      successMessage.value = null;

      const file = event.target.files?.[0] || null;
      if (!file) {
        selectedFile.value = null;
        return;
      }

      const extension = `.${getExtension(file.name)}`;
      if (!ALLOWED_EXTENSION_LOOKUP.has(extension)) {
        selectedFile.value = null;
        uploadError.value = 'Filtypen stöds inte. Välj en PDF, Word-, Excel-, PowerPoint-, text- eller bildfil.';
        resetFileInput();
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        selectedFile.value = null;
        uploadError.value = 'Filen är för stor. Max storlek är 10 MB.';
        resetFileInput();
        return;
      }

      selectedFile.value = file;
    };

    const uploadFile = async () => {
      if (!selectedFile.value || !studentId.value) {
        uploadError.value = 'Välj en fil att ladda upp.';
        return;
      }

      uploading.value = true;
      uploadError.value = null;
      successMessage.value = null;

      try {
        const formData = new FormData();
        formData.append('file', selectedFile.value);
        formData.append('studentId', studentId.value);
        formData.append('type', selectedType.value);

        await client.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        successMessage.value = 'Dokumentet laddades upp.';
        toast.success('Dokumentet laddades upp.');
        selectedFile.value = null;
        resetFileInput();
        await fetchDocuments();
      } catch (error) {
        const message = error.response?.data?.message || 'Kunde inte ladda upp dokumentet. Försök igen.';
        uploadError.value = message;
        toast.error(message);
      } finally {
        uploading.value = false;
      }
    };

    const downloadDocument = async (doc) => {
      if (!doc?._id) return;
      downloadingId.value = doc._id;

      try {
        const response = await client.get(`/documents/download/${doc._id}`, {
          responseType: 'blob',
        });

        const blob = response.data instanceof Blob
          ? response.data
          : new Blob([response.data]);

        if (typeof URL.createObjectURL !== 'function') {
          throw new Error('Blob download is not supported');
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.originalName || 'dokument';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Kunde inte hämta dokumentet.');
      } finally {
        downloadingId.value = null;
      }
    };

    const fileTypeLabel = (doc) => {
      const extension = doc?.fileType || getExtension(doc?.originalName);
      return extension ? String(extension).toUpperCase() : 'FIL';
    };

    const uploaderLabel = (doc) => {
      const name = doc?.uploader?.name || doc?.uploader?.email;
      if (name) return `Uppladdad av ${name}`;
      if (doc?.uploadedBy) {
        if (String(doc.uploadedBy) === String(currentUserId.value)) {
          return 'Uppladdad av dig';
        }
        return 'Uppladdad av annan användare';
      }
      return 'Uppladdare okänd';
    };

    const formatDate = (value) => {
      if (!value) return 'Datum saknas';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Datum saknas';
      return date.toLocaleString('sv-SE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const formatSize = (bytes) => {
      if (!Number.isFinite(bytes) || bytes <= 0) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    onMounted(fetchDocuments);
    watch(studentId, fetchDocuments);

    return {
      documents,
      loading,
      loadError,
      canUpload,
      selectedFile,
      selectedType,
      uploading,
      uploadError,
      successMessage,
      downloadingId,
      fileInput,
      typeOptions: TYPE_OPTIONS,
      acceptedExtensions,
      studentName,
      fetchDocuments,
      handleFileChange,
      uploadFile,
      downloadDocument,
      fileTypeLabel,
      uploaderLabel,
      formatDate,
      formatSize,
    };
  },
};
</script>

<style scoped>
.documents-tab {
  padding: 8px 0;
}

.documents-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.documents-header h4 {
  margin: 0;
  color: #2c3e50;
}

.documents-subtitle {
  margin: 4px 0 0;
  color: #6c757d;
  font-size: 0.9rem;
}

.doc-count {
  background: #e9f2fb;
  color: #1565c0;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.85rem;
  white-space: nowrap;
}

.upload-card {
  background: #f8f9fa;
  border: 1px solid #e3e6ea;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
}

.upload-card h5 {
  margin: 0 0 12px;
  color: #2c3e50;
}

.upload-form {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.file-input {
  flex: 1 1 240px;
  min-width: 0;
  padding: 8px;
  background: #fff;
  border: 1px solid #ced4da;
  border-radius: 6px;
}

.type-select {
  flex: 0 1 210px;
  padding: 9px;
  background: #fff;
  border: 1px solid #ced4da;
  border-radius: 6px;
}

.primary-btn,
.secondary-btn {
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  padding: 9px 16px;
}

.primary-btn {
  background: #1976d2;
  border: 1px solid #1976d2;
  color: #fff;
}

.primary-btn:hover:not(:disabled) {
  background: #1565c0;
}

.secondary-btn {
  background: #fff;
  border: 1px solid #1976d2;
  color: #1976d2;
}

.secondary-btn:hover:not(:disabled) {
  background: #e9f2fb;
}

.primary-btn:disabled,
.secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.upload-hint {
  margin: 10px 0 0;
  color: #6c757d;
  font-size: 0.82rem;
}

.upload-error {
  margin: 10px 0 0;
  color: #c62828;
  font-size: 0.9rem;
}

.upload-success {
  margin: 10px 0 0;
  color: #2e7d32;
  font-size: 0.9rem;
}

.state-card {
  padding: 28px 16px;
  text-align: center;
  color: #6c757d;
  background: #fff;
  border: 1px dashed #d6d9dd;
  border-radius: 8px;
}

.state-card p {
  margin: 6px 0;
}

.error-state {
  color: #c62828;
  border-color: #f0b8b8;
  background: #fff6f6;
}

.empty-hint {
  font-size: 0.88rem;
}

.spinner {
  display: inline-block;
  width: 26px;
  height: 26px;
  border: 3px solid #e3e6ea;
  border-top-color: #1976d2;
  border-radius: 50%;
  animation: doc-spin 0.9s linear infinite;
}

@keyframes doc-spin {
  to {
    transform: rotate(360deg);
  }
}

.document-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.document-item:hover {
  border-color: #90caf9;
  box-shadow: 0 1px 4px rgba(25, 118, 210, 0.12);
}

.file-badge {
  flex: 0 0 auto;
  min-width: 46px;
  padding: 7px 6px;
  text-align: center;
  background: #e9f2fb;
  color: #1565c0;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.document-main {
  flex: 1 1 auto;
  min-width: 0;
}

.document-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  background: none;
  border: none;
  color: #1976d2;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.document-name:hover:not(:disabled) {
  text-decoration: underline;
}

.document-name:disabled {
  color: #6c757d;
  cursor: wait;
}

.document-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  color: #6c757d;
  font-size: 0.82rem;
}

.meta-separator {
  color: #adb5bd;
}

.download-btn {
  flex: 0 0 auto;
}

@media (max-width: 640px) {
  .documents-header {
    flex-direction: column;
  }

  .upload-form {
    align-items: stretch;
    flex-direction: column;
  }

  .file-input,
  .type-select {
    flex: 1 1 auto;
    width: 100%;
  }

  .document-item {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .document-main {
    flex: 1 1 calc(100% - 60px);
  }

  .download-btn {
    width: 100%;
  }
}
</style>
