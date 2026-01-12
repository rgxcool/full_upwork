<template>
  <div class="modal">
    <div class="modal-content">
      <h3>Lägg till nytt slutprov</h3>

      <label>Datum:</label>
      <DatePicker v-model="date" :auto-apply="true" format="yyyy-MM-dd" />

      <label>Lärare:</label>
      <v-autocomplete
        v-model="selectedTeacher"
        :items="teachers"
        item-title="name"
        label="Välj lärare"
        outlined
        clearable
        :no-data-text="'Inga lärare tillgängliga'"
        :menu-props="{ maxHeight: '300px', zIndex: 10000 }"
        attach
        return-object
      />

      <label>Lägg till elev:</label>
      <v-autocomplete
        v-model="studentSearch"
        :items="availableStudents"
        item-title="displayName"
        item-value="_id"
        label="Sök och välj elev"
        outlined
        clearable
        return-object
        :no-data-text="'Inga elever tillgängliga'"
        :menu-props="{ maxHeight: '300px', zIndex: 10000 }"
        attach
        :custom-filter="filterStudents"
        @update:model-value="addStudent"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props" :title="item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})`" />
        </template>
        <template #selection="{ item }">
          {{ item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})` }}
        </template>
      </v-autocomplete>

      <!-- Selected Students List -->
      <div v-if="selectedStudents.length > 0" class="students-list">
        <h4>Valda elever:</h4>
        <div v-for="(student, index) in selectedStudents" :key="student._id || index" class="student-item">
          <div class="student-info">
            <strong>{{ student.name }}</strong>
            <span class="personal-number">{{ student.personalNumber }}</span>
          </div>
          <div class="course-selection">
            <label>Kurs:</label>
            <v-select
              v-model="student.selectedCourse"
              :items="student.availableCourses"
              item-title="displayName"
              item-value="id"
              label="Välj kurs"
              outlined
              dense
              :disabled="loadingCourses[student._id]"
              :menu-props="{ zIndex: 10000 }"
              attach
            />
          </div>
          <div class="info-selection">
            <label>Info:</label>
            <v-textarea
              v-model="student.additionalInfo"
              label="Information"
              outlined
              dense
              hide-details
              rows="3"
              auto-grow
            />
          </div>
          <button @click="removeStudent(index)" class="remove-btn" title="Ta bort elev">✕</button>
        </div>
      </div>

      <div class="buttons">
        <button type="button" @click="$emit('close')">Avbryt</button>
        <button type="button" @click="submitEvent" :disabled="selectedStudents.length === 0 || !selectedTeacher">Spara</button>
      </div>
    </div>
  </div>
</template>

<script>
import { VueDatePicker as DatePicker } from "@vuepic/vue-datepicker";
import { api } from '@/store/store.js';

export default {
  components: { DatePicker },
  props: ["teachers"],
  data() {
    return {
      date: new Date(),
      selectedTeacher: null,
      studentSearch: null,
      students: [],
      selectedStudents: [],
      loadingCourses: {},
    };
  },
  computed: {
    availableStudents() {
      // Filter out students that are already selected
      const selectedIds = new Set(this.selectedStudents.map(s => s._id?.toString()));
      return this.students
        .filter(s => !selectedIds.has(s._id?.toString()))
        .map(s => ({
          ...s,
          displayName: `${s.name} (${s.personalNumber || ''})`,
          searchText: `${s.name} ${s.personalNumber || ''}`.toLowerCase()
        }));
    }
  },
  mounted() {
    this.fetchStudents();
  },
  methods: {
    filterStudents(value, query, item) {
      if (!query || !query.trim()) return true;
      
      const searchQuery = query.toLowerCase().trim();
      const student = item?.raw || item?.value || item || value;
      
      if (!student || !student.name) return false;
      
      if (student.searchText) {
        return student.searchText.includes(searchQuery);
      }
      
      const name = (student.name || '').toLowerCase();
      const personalNumber = (student.personalNumber || '').toLowerCase();
      return name.includes(searchQuery) || personalNumber.includes(searchQuery);
    },
    async fetchStudents() {
      try {
        const response = await api.get('/students', { withCredentials: true });
        const data = response.data;
        this.students = (Array.isArray(data) ? data : [])
          .filter(s => !s.dropout);
      } catch (error) {
        console.error("Kunde inte hämta elever:", error);
      }
    },
    async addStudent(student) {
      if (!student || !student._id) return;
      
      // Check if student is already added
      if (this.selectedStudents.some(s => s._id?.toString() === student._id?.toString())) {
        this.studentSearch = null;
        return;
      }

      // Fetch student's education/courses
      this.loadingCourses[student._id] = true;
      try {
        const studentDetails = await api.get(`/student-details/${student._id}`, { withCredentials: true });
        const education = studentDetails.data?.education || [];
        
        // Format courses for dropdown
        const courses = education
          .filter(edu => edu.type === 'Course' && edu.refId)
          .map(edu => ({
            id: edu.refId?._id || edu.refId,
            courseName: edu.refId?.courseName || edu.name || 'Okänd kurs',
            courseCode: edu.refId?.courseCode || '',
            enrollmentId: edu.enrollmentId,
            displayName: `${edu.refId?.courseName || edu.name || 'Okänd kurs'}${edu.refId?.courseCode ? ` (${edu.refId.courseCode})` : ''}`
          }));

        // Add student to selected list
        this.selectedStudents.push({
          _id: student._id,
          name: student.name,
          personalNumber: student.personalNumber,
          additionalInfo: student.additionalInfo || "",
          attended: false,
          availableCourses: courses,
          selectedCourse: courses.length > 0 ? courses[0].id : null,
          courseName: courses.length > 0 ? courses[0].courseName : '',
          enrollmentId: courses.length > 0 ? courses[0].enrollmentId : null
        });

        this.studentSearch = null; // Clear search
      } catch (error) {
        console.error("Kunde inte hämta elevens kurser:", error);
        // Add student anyway without courses
        this.selectedStudents.push({
          _id: student._id,
          name: student.name,
          personalNumber: student.personalNumber,
          additionalInfo: student.additionalInfo || "",
          attended: false,
          availableCourses: [],
          selectedCourse: null,
          courseName: '',
          enrollmentId: null
        });
      } finally {
        this.loadingCourses[student._id] = false;
      }
    },
    removeStudent(index) {
      this.selectedStudents.splice(index, 1);
    },
    async submitEvent() {
      try {
        if (!this.selectedTeacher?.id) {
          alert("Välj lärare!");
          return;
        }
        if (this.selectedStudents.length === 0) {
          alert("Lägg till minst en elev!");
          return;
        }

        // Format students with their selected courses
        const formattedStudents = this.selectedStudents.map((s) => {
          const selectedCourse = s.availableCourses.find(c => c.id?.toString() === s.selectedCourse?.toString());
          return {
            _id: s._id,
            name: s.name,
            personalNumber: s.personalNumber,
            additionalInfo: s.additionalInfo || "",
            attended: false,
            courseName: selectedCourse?.courseName || s.courseName || '',
            courseId: selectedCourse?.id || null,
            enrollmentId: selectedCourse?.enrollmentId || s.enrollmentId || null
          };
        });

        const payload = {
          title: this.selectedTeacher?.name || "Okänd lärare",
          start: this.date,
          color: this.selectedTeacher?.color || "grey",
          extendedProps: {
            teacher: this.selectedTeacher?.name,
            teacherId: this.selectedTeacher?.id,
            type: "exam",
            examMunicipality: "",
            examLocation: "",
            examTime: "",
            students: formattedStudents,
          },
        };
        
        const { data } = await api.post('/calendar-events', payload, { withCredentials: true });
        const saved = data?.event || {};
        const emittedEvent = {
          id: saved._id,
          title: saved.title || payload.title,
          start: saved.start || payload.start,
          color: saved.color || payload.color,
          extendedProps: { ...(saved.extendedProps || payload.extendedProps), saved: true, isExam: true, type: 'exam' },
        };
        this.$emit("event-added", emittedEvent);
        this.$emit("close");
      } catch (err) {
        alert("Kunde inte spara event. Kontrollera konsolen för mer info.");
        console.error("❌ Fel vid sparning av event:", err.response?.data || err.message);
      }
    }
  }
}
</script>

  
  <style scoped>
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  
  /* Ensure Vuetify menus appear above modal */
  :deep(.v-overlay__content) {
    z-index: 10000 !important;
  }
  
  :deep(.v-menu__content) {
    z-index: 10000 !important;
  }
  .modal-content {
    background: white;
    padding: 20px;
    border-radius: 12px;
    width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-content label {
    display: block;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .students-list {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }
  .students-list h4 {
    margin-bottom: 1rem;
    font-size: 1rem;
  }
  .student-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #f9f9f9;
    position: relative;
  }
  .student-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .student-info strong {
    font-size: 1rem;
  }
  .personal-number {
    font-size: 0.9rem;
    color: #666;
  }
  .course-selection {
    flex: 1;
  }
  .course-selection label {
    margin-top: 0;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
  }
  .info-selection {
    flex: 1;
    margin-top: 0.5rem;
  }
  .info-selection label {
    margin-top: 0;
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
  }
  .remove-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .remove-btn:hover {
    background: #c82333;
  }
  .buttons {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }
  .buttons button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .buttons button:first-child {
    background: #6c757d;
    color: white;
  }
  .buttons button:last-child {
    background: #007bff;
    color: white;
  }
  .buttons button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  </style>