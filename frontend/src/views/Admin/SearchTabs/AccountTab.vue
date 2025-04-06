<template>
  <div class="account-info">
    <h3>
      Användarinformation
    </h3>
    <section v-if="userType === 'Elev'">
      <div class="info-item">
        <strong>Personnummer:</strong> {{ userData?.personalNumber || 'Ej tillgänglig' }}
      </div>
      <div class="info-item">
        <strong>Namn:</strong> {{ userData?.name || 'Ej tillgänglig' }}
      </div>
      <div v-for="(value, key) in editableStudentData" :key="key">
        <div class="info-item" v-if="key !== 'personalNumber'">
          <strong>{{ fieldStudentLabels[key] }}:</strong>
          <span v-if="!editFields[key]">{{ value || 'Ej tillgänglig' }}</span>
          <textarea v-else-if="['syvNotes', 'examAdaptations', 'studyPlan', 'additionalInfo'].includes(key)" v-model="editableStudentData[key]" />
          <input v-else v-model="editableStudentData[key]" />
          <button v-if="canEditField(key)" @click="toggleEdit(key)">
            <i :class="editFields[key] ? 'fas fa-save' : 'fas fa-edit'"></i>
          </button>
        </div>
      </div>


      <button
        v-if="['syv', 'specialpedagog'].includes(userRole)"
        class="btn btn-secondary"
        @click="openMeetingModal"
      >
        Boka möte med eleven
      </button>
      <MeetingModal
        v-if="showMeetingModal"
        :studentId="userData._id"
        :studentName="userData.name"
        @close="showMeetingModal = false"
      />


    </section>

    <section v-else>
      <div class="info-item" v-for="(value, key) in editablePersonalData" :key="key">
        <strong>{{ fieldPersonalLabels[key] }}:</strong>
        <span v-if="!editFields[key]">{{ value || '-' }}</span>
        <input v-else v-model="editablePersonalData[key]" />
        <button @click="toggleEdit(key)">
          <i :class="editFields[key] ? 'fas fa-save' : 'fas fa-edit'"></i>
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { useStore } from 'vuex';
import axios from 'axios';
import MeetingModal from '../MeetingModal.vue'; // Importera din MeetingModal komponent

export default {
  props: {
    userData: Object,
    userType: String
  },
  components: {
    MeetingModal
  },
  setup(props) {
    const store = useStore();
    const userRole = computed(() => store.getters.userRole || 'guest');
    const isAdminOrTeacher = computed(() => ["admin", "systemadmin"].includes(userRole.value));

    const editableStudentData = ref({});
    const editablePersonalData = ref({});
    const showMeetingModal = ref(false);

    const fieldStudentLabels = {
      email: "Email",
      phone: "Telefon",
      municipality: "Folkbokföringskommun",
      syvNotes: "SYV Anteckningar",
      examAdaptations: "Anpassningar vid prov",
      additionalInfo: "Övrig information"
    };

    const fieldPersonalLabels = {
      username: "Användarnamn",
      email: "Email"
    };
    
    const editFields = ref({});

    const updateEditableData = () => {
      editableStudentData.value = {
        email: props.userData?.email || '',
        phone: props.userData?.phone || '',
        municipality: props.userData?.municipality || '',
        syvNotes: props.userData?.syvNotes || '',
        examAdaptations: props.userData?.examAdaptations || '',
        additionalInfo: props.userData?.additionalInfo || ''  
      };

      editablePersonalData.value = {
        username: props.userData?.username || "",
        email: props.userData?.email || ""
      };
      
    };

    const canEditField = (key) => {
      if (userRole.value === 'syv') return ['syvNotes', 'studyPlan', 'additionalInfo'].includes(key);
      if (userRole.value === 'specialpedagog') return ['examAdaptations', 'additionalInfo'].includes(key);
      return isAdminOrTeacher.value;
    };

    watch(() => props.userData, updateEditableData, { immediate: true });
    
    const toggleEdit = async (key) => {
  if (editFields.value[key]) {
    try {
      const endpoint = props.userType === 'Elev' 
        ? `/api/update-student/${props.userData._id}` 
        : `/api/update-user/${props.userData._id}`;

      console.log("🔄 Skickar PUT-förfrågan till:", endpoint);
      console.log("📦 Data som skickas:", { [key]: props.userType === 'Elev' ? editableStudentData.value[key] : editablePersonalData.value[key] });

      const response = await axios.put(endpoint, {
        [key]: props.userType === 'Elev' ? editableStudentData.value[key] : editablePersonalData.value[key]
      });

      console.log("✅ Uppdatering lyckades:", response.data);
    } catch (error) {
      console.error("❌ Fel vid uppdatering av fält:", error.response ? error.response.data : error.message);
    }
  }
  editFields.value[key] = !editFields.value[key];
};

  const openMeetingModal = () => {
      showMeetingModal.value = true;
    };


    return { openMeetingModal, showMeetingModal, isAdminOrTeacher, editableStudentData, canEditField, editablePersonalData, editFields, toggleEdit, fieldStudentLabels, fieldPersonalLabels };
  }
};
</script>

<style scoped>
.account-info {
  padding: 20px;
}
.info-item {
  margin-bottom: 10px;
  font-size: 16px;
  color: #333;
  display: flex;
  align-items: center;
}
.info-item input {
  padding: 5px;
  font-size: 16px;
  margin-left: 5px;
  flex: 1;
}
button {
  margin-left: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
}
button i {
  color: #007bff;
}
button:hover i {
  color: #0056b3;
}
h3 {
  padding-bottom: 10px;
  margin-bottom: 15px;
  font-size: 20px;
}
</style>
