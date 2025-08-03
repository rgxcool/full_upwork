<template>
  <div v-if="event" class="modal fade show d-block" tabindex="-1" role="dialog" style="background: rgba(0, 0, 0, 0.5)">
    <div class="modal-dialog modal-xl" role="document">
      <div class="modal-content p-4 rounded-lg shadow">
        <div class="d-flex justify-content-between align-items-start mb-4">
          <div>
            <h5 class="modal-title fw-bold">{{ event.extendedProps?.teacher || event.teacher || 'Okänd lärare' }}</h5>
            <p class="text-muted mb-1">Provdetaljer för alla studenter i detta prov:</p>
          </div>
          <button type="button" class="btn-close" @click="closeModal"></button>
        </div>

        <!-- Provdetaljer sektion -->
        <div class="bg-white border rounded p-3 mb-4 shadow-sm">
          <h6>📝 Provuppgifter</h6>
          <div>
            <strong>Tid:</strong> {{ examTime || 'Ej vald' }}
            <strong>Kommun:</strong> {{ examMunicipality || 'Ej vald' }}
            <strong>Plats:</strong> {{ examLocation || 'Ej vald' }}
          </div>
        </div>

        <!-- Tabell -->
        <h6 class="fw-semibold">Studenter kopplade till detta prov</h6>
        <div class="table-responsive mb-4">
          <table class="table table-striped align-middle">
            <thead class="table-light">
              <tr>
                <th>Namn</th>
                <th>Personnummer</th>
                <th>Kurs</th>
                <th>Info</th>
                <th>Närvaro</th>
                <th>Prövning</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, index) in studentsData" :key="student._id || index">
                <td>{{ student.name }}</td>
                <td>{{ student.personalNumber }}</td>
                <td>{{ student.courseName || '-' }}</td>
                <td>{{ student.additionalInfo || '-' }}</td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.attended"
                    :disabled="!canEdit"
                    class="form-check-input"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.paidExamFee"
                    :disabled="!canEdit"
                    class="form-check-input"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Form för admin/lärare -->
        <form v-if="canEdit" @submit.prevent="submitExam" class="d-flex flex-wrap align-items-center gap-3">
          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Provtid:</label>
            <select v-model="selectedHour" class="time-select" @change="updateTime">
              <option v-for="hour in 24" :key="hour" :value="hour.toString().padStart(2, '0')">{{ hour.toString().padStart(2, '0') }}</option>
            </select>
            <span class="time-separator">:</span>
            <select v-model="selectedMinute" class="time-select" @change="updateTime">
              <option v-for="minute in [0, 15, 30, 45]" :key="minute" :value="minute.toString().padStart(2, '0')">{{ minute.toString().padStart(2, '0') }}</option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Kommun:</label>
            <select v-model="examMunicipality" class="form-select">
              <option v-for="(locations, municipality) in examMunicipalities" :key="municipality" :value="municipality">{{ municipality }}</option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Plats:</label>
            <select v-model="examLocation" class="form-select">
              <option v-for="location in examMunicipalities[examMunicipality]" :key="location" :value="location">{{ location }}</option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary ms-auto" :disabled="isSaving">{{ isSaving ? 'Sparar...' : 'Spara prov' }}</button>
        </form>
        <div v-if="showSuccessMessage" class="success-message">Prov sparat!</div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
export default {
  props: { event: { type: Object, required: true } },
  emits: ['close', 'update'],
  data() {
    return {
      isSaving: false,
      studentsData: [],
      showSuccessMessage: false,
      examMunicipalities: {
        Sollentuna: ['308', '310', 'lilla rummet', 'Aniara', 'Kung Agnes'],
        Akalla: ['Vision', 'Hässja', 'Arkarli', '316'],
      },
      selectedHour: '09',
      selectedMinute: '00',
      examTime: '',
      examMunicipality: '',
      examLocation: ''
    };
  },
  computed: {
    canEdit() {
      const currentUser = this.$store?.state?.user;
      if (!currentUser) return false;
      const isAdmin = ['admin', 'systemadmin'].includes(currentUser.role);
      const isEventTeacher =
        currentUser._id === (this.event.extendedProps?.teacherId || this.event.teacherId);
      return isAdmin || isEventTeacher;
    }
  },
  watch: {
    event: {
      immediate: true,
      async handler(newEvent) {
        const exProps = newEvent.extendedProps || {};

        if (exProps.students && Array.isArray(exProps.students)) {
          this.setStudentsFromProps(exProps);
        } else {
          console.warn("🟠 Inga students i extendedProps – försöker hämta manuellt...");
          try {
            const response = await axios.get("/api/calendar-events/syncable");
            const allEvents = response.data;
            const match = allEvents.find(e => e._id === newEvent.id || e.id === newEvent.id);

            if (match?.extendedProps?.students) {
              this.setStudentsFromProps(match.extendedProps);
            } else {
              console.error("❌ Ingen matchande event hittades för ID:", newEvent.id);
              this.studentsData = [];
            }
          } catch (err) {
            console.error("❌ Kunde inte hämta event från API:", err);
          }
        }
      }
    }
  },
  methods: {
    setStudentsFromProps(exProps) {
      this.studentsData = (exProps.students || []).map(s => ({
        _id: s._id,
        name: s.name,
        personalNumber: s.personalNumber,
        additionalInfo: s.additionalInfo || '',
        courseName: s.courseName || '',
        attended: s.attended ?? false,
        paidExamFee: s.paidExamFee ?? false,
        examTime: s.examTime || '',
        examMunicipality: s.examMunicipality || '',
        examLocation: s.examLocation || ''
      }));

      this.examTime = exProps.examTime || `${this.selectedHour}:${this.selectedMinute}`;
      this.examMunicipality = exProps.examMunicipality || '';
      this.examLocation = exProps.examLocation || '';

      console.log("✅ FINAL studentsData med attended:", this.studentsData);
    },
    updateTime() {
      this.examTime = `${this.selectedHour}:${this.selectedMinute}`;
    },
    closeModal() {
      this.$emit('close');
    },
    async saveAttendance(student) {
      try {
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`,
          {
            date: this.event.start,
            teacherId: this.event.extendedProps?.teacherId || this.event.teacherId,
            students: [{
              _id: student._id,
              attended: !!student.attended,
              paidExamFee: !!student.paidExamFee,
              personalNumber: student.personalNumber,
              examTime: student.examTime || '',
              examMunicipality: student.examMunicipality || '',
              examLocation: student.examLocation || '',
            }]
          },
          { withCredentials: true }
        );
        this.$emit('update');
      } catch (error) {
        console.error("❌ Kunde inte spara närvaro:", error.response?.data || error.message);
        alert("Kunde inte spara närvaro, försök igen.");
      }
    },
    async submitExam() {
      if (!this.examTime || !this.examMunicipality || !this.examLocation) {
        alert('Välj tid, kommun och plats för provet.');
        return;
      }

      this.isSaving = true;
      try {
        const students = this.studentsData;
        const teacherId = this.event.extendedProps?.teacherId || this.event.teacherId;

        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`,
          {
            date: this.event.start,
            teacherId,
            students: students.map(s => ({
              _id: s._id,
              attended: !!s.attended,
              paidExamFee: !!s.paidExamFee,
              personalNumber: s.personalNumber,
              examTime: s.examTime || '',
              examMunicipality: s.examMunicipality || '',
              examLocation: s.examLocation || '',
            })),
          },
          { withCredentials: true }
        );

        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/examtime-location`,
          {
            studentIds: students.map(s => s._id),
            examTime: this.examTime,
            examMunicipality: this.examMunicipality,
            examLocation: this.examLocation,
          },
          { withCredentials: true }
        );

        this.showSuccessMessage = true;
        setTimeout(() => {
          this.showSuccessMessage = false;
          this.$emit('update');
          this.closeModal();
        }, 2000);
      } catch (error) {
        console.error('❌ Fel vid uppdatering:', error.response?.data || error.message);
        alert('Ett fel uppstod vid sparande av provet. Försök igen.');
      } finally {
        this.isSaving = false;
      }
    }
  }
};
</script>


<style scoped>
.modal {
  display: flex;
  align-items: center;
  justify-content: center;
}
.table td {
  vertical-align: middle;
  white-space: pre-line;
}
.modal-footer .form-select
.modal-footer .form-control {
  min-width: 120px;
}

.time-picker-container {
  display: inline-flex;
  align-items: center;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
  min-width: 120px;
  height: 38px;
}

.time-select {
  border: none;
  background: transparent;
  padding: 6px 8px;
  font-size: 14px;
  cursor: pointer;
  outline: none;
  min-width: 50px;
  text-align: center;
}

.time-select:first-child {
  border-radius: 4px 0 0 4px;
}

.time-select:last-child {
  border-radius: 0 4px 4px 0;
}

.time-select:hover {
  background-color: #f8f9fa;
}

.time-select:focus {
  background-color: #e9ecef;
}

.time-separator {
  padding: 0 4px;
  font-weight: bold;
  color: #495057;
  font-size: 16px;
}

.success-message {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: #28a745;
  color: white;
  padding: 15px 25px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 16px;
  z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: flash 0.5s ease-in-out 3;
}

@keyframes flash {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05);
  }
}
</style>
