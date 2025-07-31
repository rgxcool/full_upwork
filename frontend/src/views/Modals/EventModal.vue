<template>
  <div class="scrollable-view">
    <div
      v-if="event"
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      style="background: rgba(0, 0, 0, 0.5)"
    >
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ event.teacher || 'Okänd lärare' }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>

          <div class="modal-body">
            <p>
              <strong>Provdetaljer:</strong>
              <br />
              Tid: {{ examTime || 'Ej vald' }}
              <br />
              Kommun: {{ examMunicipality || 'Ej vald' }}
              <br />
              Plats: {{ examLocation || 'Ej vald' }}
            </p>

            <h5>Studenter kopplade till detta prov</h5>
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Personnummer</th>
                  <th>Kurs</th>
                  <th>Info</th>
                  <th>Närvaro</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(student, index) in (event.extendedProps?.students || event.students || [])" :key="index">
                  <td>{{ student.name }}</td>
                  <td>{{ student.personalNumber }}</td>
                  <td>{{ student.courseName || '-' }}</td>
                  <td>{{ student.additionalInfo || '-' }}</td>
                  <td>
                    <input
                      type="checkbox"
                      v-model="student.attended"
                      @change="markAttendance(student.personalNumber, student.attended)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="modal-footer">
            <!-- Success Message -->
            <div v-if="showSuccessMessage" class="success-message">
              Prov sparat!
            </div>
            
            <form @submit.prevent="submitExam" class="exam-form">
              <label class="me-2">Välj provtid:</label>
              <div class="time-picker-container me-3">
                <select v-model="selectedHour" class="time-select" @change="updateTime">
                  <option v-for="hour in 24" :key="hour-1" :value="(hour-1).toString().padStart(2, '0')">
                    {{ (hour-1).toString().padStart(2, '0') }}
                  </option>
                </select>
                <span class="time-separator">:</span>
                <select v-model="selectedMinute" class="time-select" @change="updateTime">
                  <option v-for="minute in [0, 15, 30, 45]" :key="minute" :value="minute.toString().padStart(2, '0')">
                    {{ minute.toString().padStart(2, '0') }}
                  </option>
                </select>
              </div>

              <label class="me-2">Kommun:</label>
              <select v-model="examMunicipality" class="me-3">
                <option
                  v-for="(locations, municipality) in examMunicipalities"
                  :key="municipality"
                  :value="municipality"
                >
                  {{ municipality }}
                </option>
              </select>

              <label class="me-2">Plats:</label>
              <select v-model="examLocation" class="me-3">
                <option
                  v-for="location in examMunicipalities[examMunicipality]"
                  :key="location"
                  :value="location"
                >
                  {{ location }}
                </option>
              </select>

              <button type="submit" class="btn btn-primary" :disabled="isSaving">
                {{ isSaving ? 'Sparar...' : 'Spara prov' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'

  export default {
    props: ['event'],
    data() {
      return {
        examTime: '',
        selectedHour: '09',
        selectedMinute: '00',
        examMunicipality: '',
        examLocation: '',
        isSaving: false,
        showSuccessMessage: false,
        examMunicipalities: {
          Sollentuna: ['308', '310', 'lilla rummet', 'Aniara', 'Kung Agnes'],
          Akalla: ['Vision', 'Hässja', 'Arkarli', '316'],
        },
      }
    },
    watch: {
      event: {
        immediate: true,
        handler(newEvent) {
          if (newEvent) {
            let time = newEvent.examTime || ''
            // Ensure 24-hour format
            if (time.includes(':')) {
              this.examTime = time.slice(0, 5)
            } else if (time) {
              // Convert 12-hour to 24-hour if needed
              this.examTime = this.convertTo24Hour(time)
            } else {
              this.examTime = '09:00'
            }
            
            // Update the custom time picker values
            if (this.examTime && this.examTime.includes(':')) {
              const [hours, minutes] = this.examTime.split(':')
              this.selectedHour = hours
              this.selectedMinute = minutes
            }
            
            this.examMunicipality = newEvent.examMunicipality || ''
            this.examLocation = newEvent.examLocation || ''
          }
        },
      },
    },
    mounted() {
      // Ensure time picker is initialized with 24-hour format
      console.log('EventModal mounted, examTime:', this.examTime)
      console.log('Selected hour:', this.selectedHour)
      console.log('Selected minute:', this.selectedMinute)
      
      // Force update time if not set
      if (!this.examTime) {
        this.updateTime()
      }
    },
    methods: {
      closeModal() {
        this.$emit('close')
      },
      
      convertTo24Hour(timeStr) {
        // Convert 12-hour format to 24-hour format
        if (!timeStr) return ''
        
        // Remove any AM/PM and convert to 24-hour
        const time = timeStr.toLowerCase().replace(/\s*(am|pm)/, '')
        const isPM = timeStr.toLowerCase().includes('pm')
        
        if (time.includes(':')) {
          const [hours, minutes] = time.split(':')
          let hour24 = parseInt(hours)
          
          if (isPM && hour24 !== 12) {
            hour24 += 12
          } else if (!isPM && hour24 === 12) {
            hour24 = 0
          }
          
          return `${hour24.toString().padStart(2, '0')}:${minutes}`
        }
        
        return timeStr
      },
      
      updateTime() {
        this.examTime = `${this.selectedHour}:${this.selectedMinute}`
      },
      // Remove markAttendance API call from checkbox change
      async markAttendance(studentId, attended) {
        // No-op: handled in submitExam
      },
      async submitExam() {
        if (!this.examTime || !this.examMunicipality || !this.examLocation) {
          alert('Välj tid, kommun och plats för provet.')
          return
        }
        
        this.isSaving = true
        this.showSuccessMessage = false
        
        // Debug logging
        console.log('Event data:', this.event)
        console.log('Event extendedProps:', this.event.extendedProps)
        console.log('Event keys:', Object.keys(this.event))
        console.log('Students:', this.event.students)
        console.log('TeacherId from extendedProps:', this.event.extendedProps?.teacherId)
        console.log('TeacherId from event:', this.event.teacherId)
        console.log('Exam time:', this.examTime)
        
        try {
          // Get students from the correct location
          const students = this.event.extendedProps?.students || this.event.students || []
          console.log('Students array:', students)
        console.log('Students attendance status:', students.map(s => ({ name: s.name, attended: s.attended })))
        console.log('Raw students data:', JSON.stringify(students, null, 2))
          
          // Validate required data
          if (!students || students.length === 0) {
            throw new Error('Inga studenter hittades för detta prov.')
          }
          
          const teacherId = this.event.extendedProps?.teacherId || this.event.teacherId
          console.log('Final teacherId:', teacherId)
          if (!teacherId) {
            throw new Error('Ingen lärare hittades för detta prov.')
          }
          
          // Save attendance for all students via batch endpoint
          const attendanceData = {
            date: this.event.start,
            teacherId: teacherId,
            courseName: this.event.extendedProps?.courseName || 'Unknown Course',
            courseId: this.event.extendedProps?.courseId,
            students: students.map(s => ({ 
              _id: s._id, 
              attended: !!s.attended, 
              personalNumber: s.personalNumber,
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation
            })),
          };
          console.log('📤 Sending attendance data:', attendanceData);
          
          console.log('📤 Making attendance request to:', `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`);
          try {
            const attendanceResponse = await axios.post(
              `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`,
              attendanceData,
              { withCredentials: true }
            );
            console.log('✅ Attendance response:', attendanceResponse.data);
          } catch (error) {
            console.error('❌ Attendance request failed:', error);
            console.error('❌ Error response:', error.response?.data);
            throw error;
          }
          // Save exam time, kommun, plats
          const studentIds = students.map((s) => s._id)
          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/examtime-location`,
            {
              studentIds,
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            },
            { withCredentials: true }
          )
          this.event.examTime = this.examTime
          this.event.examMunicipality = this.examMunicipality
          this.event.examLocation = this.examLocation
          console.log('✅ Slutprov och närvaro uppdaterat för alla studenter!')
          
          // Show success message
          this.showSuccessMessage = true
          
          // Hide success message after 3 seconds and close modal
          setTimeout(() => {
            this.showSuccessMessage = false
            this.$emit('update')
            this.closeModal()
          }, 3000)
          
        } catch (error) {
          console.error('❌ Fel vid uppdatering av prov:', error.response?.data || error.message)
          alert('Ett fel uppstod vid sparande av provet. Försök igen.')
        } finally {
          this.isSaving = false
        }
      },
    },
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

  .exam-form label {
    margin-right: 8px;
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
