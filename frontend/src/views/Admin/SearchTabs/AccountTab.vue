<template>
  <div class="account-info">
    <h3>
      Användarinformation
    </h3>
    <section v-if="userType === 'Elev'">
      <div class="info-item">
        <strong>Personnummer:</strong> {{ userData?.personalNumber || "Ej tillgänglig" }}
      </div>
      <div v-for="(value, key) in editableStudentData" :key="key">
        <div class="info-item" v-if="key !== 'personalNumber'">
          <strong>{{ fieldStudentLabels[key] }}:</strong>
          <span v-if="!editFields[key]">{{ value || 'Ej tillgänglig' }}</span>
          <input v-else v-model="editableStudentData[key]" />
          <button @click="toggleEdit(key)">
            <i :class="editFields[key] ? 'fas fa-save' : 'fas fa-edit'"></i>
          </button>
        </div>
      </div>

    </section>

    <section v-else>
      <div class="info-item" v-for="(value, key) in editablePersonalData" :key="key">
        <strong>{{ fieldPersonalLabels[key] }}:</strong>
        <span v-if="!editFields[key]">{{ value || 'Ej tillgänglig' }}</span>
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

export default {
  props: {
    userData: Object,
    userType: String
  },
  setup(props) {
    const store = useStore();
    const userRole = computed(() => store.getters.userRole || 'guest');
    const isAdminOrTeacher = computed(() => ["admin", "systemadmin"].includes(userRole.value));

    const editableStudentData = ref({});
    const editablePersonalData = ref({});

    const fieldStudentLabels = {
      name: "Namn",
      email: "Email",
      phone: "Telefon",
      municipality: "Folkbokföringskommun"
    };

    const fieldPersonalLabels = {
      username: "Användarnamn",
      email: "Email"
    };
    
    const editFields = ref({});

    const updateEditableData = () => {
      editableStudentData.value = {
        name: props.userData?.name || "",
        email: props.userData?.email || "",
        phone: props.userData?.phone || "",
        municipality: props.userData?.municipality || ""
      };

      editablePersonalData.value = {
        username: props.userData?.username || "",
        email: props.userData?.email || ""
      };
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


    return { isAdminOrTeacher, editableStudentData, editablePersonalData, editFields, toggleEdit, fieldStudentLabels, fieldPersonalLabels };
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
