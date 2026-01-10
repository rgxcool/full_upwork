<template>
  <v-container>
    <form @submit.prevent="submitForm">
      <!-- Student Selection -->
      <v-autocomplete
        v-model="selectedStudent"
        :items="students"
        item-title="name"
        item-value="_id"
        label="Välj befintlig elev"
        return-object
        :loading="loadingStudents"
        @update:search="searchStudents"
      ></v-autocomplete>

      <!-- Course Selection -->
      <v-select
        v-model="selectedCourseInstance"
        :items="courseInstances"
        item-title="courseName"
        item-value="_id"
        label="Välj kursinstans"
        :loading="loadingCourseInstances"
      ></v-select>

      <!-- Dates -->
      <v-text-field v-model="startDate" label="Startdatum" type="date"></v-text-field>
      <v-select
        v-model="studyLength"
        :items="[5, 10, 20]"
        label="Studielängd (veckor)"
        @update:modelValue="calculateEndDate"
      ></v-select>
      <v-text-field :model-value="endDate" label="Beräknat slutdatum" readonly></v-text-field>
      <v-text-field v-model="finalExamDate" label="Slutprovsdatum" type="date"></v-text-field>

      <!-- New Fields -->
      <v-checkbox v-model="needsSupport" label="Behöver extra stöd"></v-checkbox>
      <v-radio-group v-model="examMode" inline label="Examinationsform">
        <v-radio label="På plats" value="on-site"></v-radio>
        <v-radio label="Distans" value="remote"></v-radio>
      </v-radio-group>
      
      <!-- APL Status -->
      <v-select
          v-model="aplStatus"
          :items="aplStatusOptions"
          label="APL Status"
          item-title="text"
          item-value="value"
        ></v-select>

      <v-btn type="submit" color="primary" :loading="submitting">Anmäl elev</v-btn>
    </form>
  </v-container>
</template>

<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';
import debounce from 'lodash.debounce';

const props = defineProps({
  mode: {
    type: String,
    required: false,
    default: 'single',
    validator: (value) => !value || value === 'single',
  },
});

const emit = defineEmits(['submit']);

// Student selection
const selectedStudent = ref(null);
const students = ref([]);
const loadingStudents = ref(false);

const searchStudents = debounce(async (query) => {
  if (query && query.length > 2) {
    loadingStudents.value = true;
    try {
      const { data } = await axios.get(`/api/admin/users/search?role=student&q=${query}`);
      students.value = data;
    } catch (error) {
      console.error('Error searching students:', error);
    } finally {
      loadingStudents.value = false;
    }
  }
}, 300);

// Course data
const courseInstances = ref([]);
const loadingCourseInstances = ref(false);
const selectedCourseInstance = ref(null);

// Dates
const startDate = ref('');
const studyLength = ref(10);
const endDate = ref('');
const finalExamDate = ref('');

// New fields
const needsSupport = ref(false);
const examMode = ref('on-site');
const aplStatus = ref('GRAY');
const aplStatusOptions = [
    { text: 'Ej påbörjad', value: 'GRAY' },
    { text: 'Pågående', value: 'BLUE' },
    { text: 'Slutförd', value: 'GREEN' },
    { text: 'Avbruten', value: 'RED' },
];


const submitting = ref(false);

// Fetch initial data
const fetchCourseInstances = async () => {
  loadingCourseInstances.value = true;
  try {
    const { data } = await axios.get('/api/course-instances');
    courseInstances.value = data.instances;
  } catch (error) {
    console.error('Error fetching course instances:', error);
  } finally {
    loadingCourseInstances.value = false;
  }
};

// Fetch course instances on mount
fetchCourseInstances();

const calculateEndDate = () => {
    if (startDate.value && studyLength.value) {
        const start = new Date(startDate.value);
        const durationDays = studyLength.value * 7;
        const end = new Date(start.setDate(start.getDate() + durationDays - 3));
        endDate.value = end.toISOString().split('T')[0];
    }
};

watch([startDate, studyLength], calculateEndDate);

const submitForm = async () => {
  if (!selectedStudent.value) {
    // Show error
    return;
  }

  submitting.value = true;
  
  if (!selectedCourseInstance.value) {
    console.error('No course instance selected');
    submitting.value = false;
    return;
  }

  const instance = courseInstances.value.find(ci => ci._id === selectedCourseInstance.value);
  if (!instance) {
    console.error('Course instance not found');
    submitting.value = false;
    return;
  }

  const educationEntries = [{
    type: 'Course',
    refId: instance.mainCourseId._id,
    name: instance.courseName,
    startDate: startDate.value,
    endDate: endDate.value,
    slutprovDate: finalExamDate.value,
  }];

  const payload = {
    studentId: selectedStudent.value._id,
    educationEntries,
    // The backend doesn't seem to directly support these fields on process-education
    // This may need a subsequent call or a backend modification.
    // For now, we pass them for potential future use.
    needsSupport: needsSupport.value,
    examMode: examMode.value,
    aplStatus: aplStatus.value,
  };

  try {
      await axios.post('/api/course-matching/process-education', payload);
      // Handle success
      
      if (aplStatus.value !== 'GRAY') {
        await axios.patch(`/api/students/${selectedStudent.value._id}`, { aplStatus: aplStatus.value });
      }

  } catch (error) {
      console.error('Error submitting enrollment:', error);
      // Handle error
  } finally {
      submitting.value = false;
  }
};

</script>
