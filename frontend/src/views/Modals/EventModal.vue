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
          <!-- Visa bara exam-info om type är 'exam' -->
            <h6>📝 Provuppgifter</h6>
            <div>
              <strong>Tid:</strong> {{ examInfo.time }}
              <strong>Kommun:</strong> {{ examInfo.municipality }}
              <strong>Plats:</strong> {{ examInfo.location }}
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
              <tr v-for="(student, index) in students" :key="student._id || index">
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
                    @change="markAttendance(student)"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.paidExamFee"
                    @change="markAttendance(student)"
                    :disabled="!canEdit"
                    class="form-check-input"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Form för admin/lärare -->
        <form
          v-if="canEdit"
          @submit.prevent="submitExamDetails"
          class="d-flex flex-wrap align-items-center gap-3"
        >
          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Provtid:</label>
            <input type="time" v-model="examInfoLocal.time" required class="form-control" />
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Kommun:</label>
            <select v-model="examInfoLocal.municipality" class="form-select">
              <option
                v-for="(locations, municipality) in examMunicipalities"
                :key="municipality"
                :value="municipality"
              >
                {{ municipality }}
              </option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Plats:</label>
            <select v-model="examInfoLocal.location" class="form-select">
              <option
                v-for="location in examMunicipalities[examInfoLocal.municipality]"
                :key="location"
                :value="location"
              >
                {{ location }}
              </option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary ms-auto" :disabled="isSaving">
            💾 {{ isSaving ? 'Sparar...' : 'Spara prov' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  props: {
    event: { type: Object, required: true }
  },
  emits: ['close', 'update'],
  data() {
    return {
      isSaving: false,
      examMunicipalities: {
        Sollentuna: ['308', '310', 'lilla rummet', 'Aniara', 'Kung Agnes'],
        Akalla: ['Vision', 'Hässja', 'Arkarli', '316'],
      },
      examInfoLocal: {
        time: '',
        municipality: '',
        location: ''
      },
    }
  },
  watch: {
    event: {
      immediate: true,
      handler(newEvent) {
        console.log('🟢 NEW EVENT IN MODAL:', newEvent);

        if (!newEvent || !newEvent.extendedProps) return;
        this.examInfoLocal = {
          time: newEvent.extendedProps.examTime || '',
          municipality: newEvent.extendedProps.examMunicipality || '',
          location: newEvent.extendedProps.examLocation || ''
        };
      }
    }
  },
  computed: {
    canEdit() {
      const currentUser = this.$store?.state?.user;
      if (!currentUser) return false;

      const isAdmin = ['admin', 'systemadmin'].includes(currentUser.role);
      const isEventTeacher =
        currentUser._id === (this.event.extendedProps?.teacherId || this.event.teacherId);

      return isAdmin || isEventTeacher;
    },
    students() {
      return this.event.extendedProps?.students || [];
    },
    examInfo() {
      return {
        time: this.examInfoLocal.time || 'Ej vald',
        municipality: this.examInfoLocal.municipality || 'Ej vald',
        location: this.examInfoLocal.location || 'Ej vald',
      };
    }
  },
  methods: {
    closeModal() {
      this.$emit('close');
    },
    async markAttendance(student) {
      try {
        await axios.post('/api/calendar-events/mark-attendance', {
          date: this.event.start,
          teacherId: this.event.extendedProps?.teacherId || this.event.teacherId,
          students: this.students.map(s => ({
            _id: s._id,
            attended: s.attended,
            paidExamFee: s.paidExamFee
          }))
        });
        console.log(`✅ Närvaro uppdaterad för ${student.name}`);
      } catch (error) {
        console.error('❌ Fel vid närvaro-uppdatering:', error.response?.data || error.message);
      }
    },
    async submitExamDetails() {
      const { time, municipality, location } = this.examInfoLocal;

      if (!time || !municipality || !location) {
        alert('Välj tid, kommun och plats för provet.');
        return;
      }

      const studentIds = this.students.map(s => s._id).filter(Boolean);
      if (studentIds.length === 0) {
        alert('Inga studenter kopplade till detta prov.');
        return;
      }

      this.isSaving = true;
      try {
        await axios.post(`${import.meta.env.VITE_API_URL}/api/examtime-location`, {
          studentIds,
          examTime: time,
          examMunicipality: municipality,
          examLocation: location,
        }, { withCredentials: true });

        // 🟢 Vi gör INGEN assignment till event.extendedProps här!
        // Föräldern laddar om events, så du får alltid färsk info nästa gång modalen öppnas.

        await this.$emit('update');
        this.closeModal();

        console.log('✅ Provinfo uppdaterad');
      } catch (error) {
        console.error('❌ Fel vid uppdatering:', error.response?.data || error.message);
      } finally {
        this.isSaving = false;
      }
    }
  }
}
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
</style>
