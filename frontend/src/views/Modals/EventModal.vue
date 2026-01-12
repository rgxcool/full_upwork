<template>
  <div
    v-if="event"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="background: rgba(0, 0, 0, 0.5)"
  >
    <div class="modal-dialog modal-xl" role="document">
      <div class="modal-content p-4 rounded-lg shadow">
        <div class="d-flex justify-content-between align-items-start mb-4">
          <div>
            <h5 class="modal-title fw-bold">
              {{ event.extendedProps?.teacher || event.teacher || 'Okänd lärare' }}
            </h5>
            <p class="text-muted mb-1">Provdetaljer för alla studenter i detta prov:</p>
          </div>
          <button type="button" class="btn-close" @click="closeModal"></button>
        </div>

        <!-- Provdetaljer sektion -->
        <div class="bg-white border rounded p-3 mb-4 shadow-sm">
          <h6>📝 Provuppgifter</h6>
          <div v-if="examTime && examMunicipality && examLocation">
            <strong>Tid:</strong>
            {{ examTime }}
            <strong>Kommun:</strong>
            {{ examMunicipality }}
            <strong>Plats:</strong>
            {{ examLocation }}
          </div>
          <div v-else class="text-muted">
            <em>
              Inga provuppgifter satta ännu. Använd formuläret nedan för att sätta tid, kommun och
              plats.
            </em>
          </div>
        </div>

        <!-- Tabell -->
        <h6 class="fw-semibold">Studenter kopplade till detta prov</h6>
        
        <!-- Add Student Section (only if canEdit) -->
        <div v-if="canEdit" class="mb-3 p-3 border rounded bg-light">
          <label class="fw-semibold mb-2">Lägg till elev:</label>
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
            dense
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" :title="item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})`" />
            </template>
            <template #selection="{ item }">
              {{ item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})` }}
            </template>
          </v-autocomplete>
        </div>

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
                <th v-if="canEdit">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(student, index) in studentsData" :key="student._id || index">
                <td>
                  <router-link :to="`/student/${student._id}`">{{ student.name }}</router-link>
                </td>
                <td>{{ student.personalNumber }}</td>
                <td>
                  <v-select
                    v-if="canEdit && student.availableCourses && student.availableCourses.length > 0"
                    v-model="student.selectedCourse"
                    :items="student.availableCourses"
                    item-title="displayName"
                    item-value="id"
                    label="Välj kurs"
                    outlined
                    dense
                    hide-details
                    :menu-props="{ zIndex: 10000 }"
                    attach
                    @update:model-value="updateStudentCourse(student)"
                  />
                  <span v-else>{{ student.courseName || '-' }}</span>
                </td>
                <td>
                  <v-textarea
                    v-if="canEdit"
                    v-model="student.additionalInfo"
                    label="Information"
                    outlined
                    dense
                    hide-details
                    rows="2"
                    auto-grow
                    @blur="updateStudentInfo(student)"
                  />
                  <span v-else style="white-space: pre-wrap;">{{ student.additionalInfo || '-' }}</span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.attended"
                    :disabled="!canEdit"
                    class="form-check-input"
                    @change="saveAttendance(student)"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    v-model="student.paidExamFee"
                    :disabled="!canEdit"
                    class="form-check-input"
                    @change="saveAttendance(student)"
                  />
                </td>
                <td v-if="canEdit">
                  <button @click="removeStudent(index)" class="btn btn-sm btn-danger" title="Ta bort elev">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Form för admin/lärare -->
        <form
          v-if="canEdit"
          @submit.prevent="submitExam"
          class="d-flex flex-wrap align-items-center gap-3"
        >
          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Provtid:</label>
            <select v-model="selectedHour" class="time-select" @change="updateTime">
              <option v-for="hour in 24" :key="hour" :value="hour.toString().padStart(2, '0')">
                {{ hour.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">:</span>
            <select v-model="selectedMinute" class="time-select" @change="updateTime">
              <option
                v-for="minute in [0, 15, 30, 45]"
                :key="minute"
                :value="minute.toString().padStart(2, '0')"
              >
                {{ minute.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">–</span>
            <label class="mb-0">Slut:</label>
            <select v-model="selectedEndHour" class="time-select" @change="updateTime">
              <option
                v-for="hour in 24"
                :key="'end-' + hour"
                :value="hour.toString().padStart(2, '0')"
              >
                {{ hour.toString().padStart(2, '0') }}
              </option>
            </select>
            <span class="time-separator">:</span>
            <select v-model="selectedEndMinute" class="time-select" @change="updateTime">
              <option
                v-for="minute in [0, 15, 30, 45]"
                :key="'endm-' + minute"
                :value="minute.toString().padStart(2, '0')"
              >
                {{ minute.toString().padStart(2, '0') }}
              </option>
            </select>
          </div>

          <div class="d-flex align-items-center gap-2">
            <label class="mb-0 fw-semibold">Kommun:</label>
            <select v-model="examMunicipality" class="form-select">
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
            <select v-model="examLocation" class="form-select">
              <option
                v-for="location in examMunicipalities[examMunicipality]"
                :key="location"
                :value="location"
              >
                {{ location }}
              </option>
            </select>
          </div>

          <button type="submit" class="btn btn-primary ms-auto" :disabled="isSaving">
            {{ isSaving ? 'Sparar...' : 'Spara prov' }}
          </button>
        </form>
        <div v-if="showSuccessMessage" class="success-message">Prov sparat!</div>
      </div>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'
  import { api } from '@/store/store.js'
  
  export default {
    props: { event: { type: Object, required: true } },
    emits: ['close', 'update'],
    data() {
      return {
        isSaving: false,
        studentsData: [],
        showSuccessMessage: false,
        studentSearch: null,
        allStudents: [],
        loadingCourses: {},
        examMunicipalities: {
          Sollentuna: ['308', '310', 'lilla rummet', 'Aniara', 'Kung Agnes'],
          Akalla: ['Vision', 'Hässja', 'Arkarli', '316'],
        },
        selectedHour: '09',
        selectedMinute: '00',
        selectedEndHour: '12',
        selectedEndMinute: '00',
        examTime: '',
        examMunicipality: '',
        examLocation: '',
      }
    },
    computed: {
      availableStudents() {
        // Filter out students that are already selected
        const selectedIds = new Set(this.studentsData.map(s => s._id?.toString()));
        return this.allStudents
          .filter(s => !selectedIds.has(s._id?.toString()))
          .map(s => ({
            ...s,
            displayName: `${s.name} (${s.personalNumber || ''})`,
            searchText: `${s.name} ${s.personalNumber || ''}`.toLowerCase()
          }));
      }
    },
    computed: {
      canEdit() {
        const currentUser = this.$store?.state?.user
        if (!currentUser) return false
        const isAdmin = ['admin', 'systemadmin'].includes(currentUser.role)
        const isEventTeacher =
          currentUser._id === (this.event.extendedProps?.teacherId || this.event.teacherId)
        return isAdmin || isEventTeacher
      },
    },
    watch: {
      event: {
        immediate: true,
        async handler(newEvent) {
          if (!newEvent) return

          const exProps = newEvent.extendedProps || {}

          if (exProps.students && Array.isArray(exProps.students) && exProps.students.length > 0) {
            await this.setStudentsFromProps(exProps)
          } else {
            console.warn('🟠 Inga students i extendedProps – försöker hämta manuellt...')
            try {
              const response = await axios.get('/api/calendar-events/syncable')
              const allEvents = response.data
              const match = allEvents.find((e) => e._id === newEvent.id || e.id === newEvent.id)

              if (match?.extendedProps?.students) {
                await this.setStudentsFromProps(match.extendedProps)
              } else {
                console.error('❌ Ingen matchande event hittades för ID:', newEvent.id)
                this.studentsData = []
              }
            } catch (err) {
              console.error('❌ Kunde inte hämta event från API:', err)
              this.studentsData = []
            }
          }
        },
      },
    },
    mounted() {
      this.refreshEventData()
      this.fetchAllStudents()
    },
    methods: {
      async refreshEventData() {
        if (!this.event) return

        try {
          const response = await axios.get('/api/calendar-events/syncable')
          const allEvents = response.data

          const teacherId = (
            this.event.extendedProps?.teacherId || this.event.teacherId
          )?.toString?.()
          const eventDate = new Date(this.event.start).toISOString().split('T')[0]

          console.log('🔍 refreshEventData – searching for match:')
          console.log('  TeacherId:', teacherId)
          console.log('  EventDate:', eventDate)

          const match = allEvents.find((e) => {
            const ep = e.extendedProps || {}
            const matchTeacherId = ep.teacherId?.toString?.()
            const matchDate = new Date(e.start).toISOString().split('T')[0]
            return matchTeacherId === teacherId && matchDate === eventDate
          })

          if (match?.extendedProps?.students) {
            await this.setStudentsFromProps(match.extendedProps)
          } else {
            console.warn(
              '⚠️ Ingen matchande event hittades i syncable – använder originaldata istället'
            )
            const exProps = this.event.extendedProps || {}
            if (exProps.students && Array.isArray(exProps.students)) {
              await this.setStudentsFromProps(exProps)
            } else {
              this.studentsData = []
            }
          }
        } catch (error) {
          console.error('❌ Fel vid refreshEventData:', error)
          const exProps = this.event.extendedProps || {}
          if (exProps.students && Array.isArray(exProps.students)) {
            await this.setStudentsFromProps(exProps)
          } else {
            this.studentsData = []
          }
        }
      },
      async fetchAllStudents() {
        try {
          const response = await api.get('/students', { withCredentials: true });
          const data = response.data;
          this.allStudents = (Array.isArray(data) ? data : [])
            .filter(s => !s.dropout);
        } catch (error) {
          console.error("Kunde inte hämta elever:", error);
        }
      },
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
      async loadStudentCourses(student) {
        if (this.loadingCourses[student._id]) return;
        
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

          // Find current course in the list
          const currentCourseId = student.courseId || 
            (student.courseName ? courses.find(c => c.courseName === student.courseName)?.id : null);

          student.availableCourses = courses;
          student.selectedCourse = currentCourseId || (courses.length > 0 ? courses[0].id : null);
          
          // Update courseName if course is selected
          if (student.selectedCourse) {
            const selectedCourse = courses.find(c => c.id?.toString() === student.selectedCourse?.toString());
            if (selectedCourse) {
              student.courseName = selectedCourse.courseName;
              student.courseId = selectedCourse.id;
              student.enrollmentId = selectedCourse.enrollmentId;
            }
          }
        } catch (error) {
          console.error("Kunde inte hämta elevens kurser:", error);
          student.availableCourses = [];
          student.selectedCourse = null;
        } finally {
          this.loadingCourses[student._id] = false;
        }
      },
      async addStudent(student) {
        if (!student || !student._id) return;
        
        // Check if student is already added
        if (this.studentsData.some(s => s._id?.toString() === student._id?.toString())) {
          this.studentSearch = null;
          return;
        }

        // Create student entry
        const newStudent = {
          _id: student._id,
          name: student.name,
          personalNumber: student.personalNumber,
          additionalInfo: student.additionalInfo || "",
          attended: false,
          paidExamFee: false,
          examTime: this.examTime || '',
          examMunicipality: this.examMunicipality || '',
          examLocation: this.examLocation || '',
          finalExamDate: null,
          availableCourses: [],
          selectedCourse: null,
          courseName: '',
          courseId: null,
          enrollmentId: null
        };

        // Load courses for this student
        await this.loadStudentCourses(newStudent);
        
        // Add to list
        this.studentsData.push(newStudent);
        this.studentSearch = null;

        // Save the updated event
        await this.saveEventStudents();
      },
      removeStudent(index) {
        this.studentsData.splice(index, 1);
        this.saveEventStudents();
      },
      updateStudentCourse(student) {
        const selectedCourse = student.availableCourses.find(c => c.id?.toString() === student.selectedCourse?.toString());
        if (selectedCourse) {
          student.courseName = selectedCourse.courseName;
          student.courseId = selectedCourse.id;
          student.enrollmentId = selectedCourse.enrollmentId;
          this.saveEventStudents();
        }
      },
      updateStudentInfo(student) {
        // Save the updated info field
        this.saveEventStudents();
      },
      async saveEventStudents() {
        if (!this.event.id) return;
        
        try {
          // Format students for saving
          const formattedStudents = this.studentsData.map((s) => {
            const selectedCourse = s.availableCourses?.find(c => c.id?.toString() === s.selectedCourse?.toString());
            return {
              _id: s._id,
              name: s.name,
              personalNumber: s.personalNumber,
              additionalInfo: s.additionalInfo || "",
              attended: s.attended ?? false,
              courseName: selectedCourse?.courseName || s.courseName || '',
              courseId: selectedCourse?.id || s.courseId || null,
              enrollmentId: selectedCourse?.enrollmentId || s.enrollmentId || null
            };
          });

          // Update the calendar event
          await api.put(`/calendar-events/${this.event.id}`, {
            extendedProps: {
              ...this.event.extendedProps,
              students: formattedStudents
            }
          }, { withCredentials: true });

          // Update local event
          this.event.extendedProps.students = formattedStudents;
        } catch (error) {
          console.error("Kunde inte spara studenter:", error);
        }
      },
      async setStudentsFromProps(exProps) {
        // First, get the base student data from extendedProps
        const baseStudents = (exProps.students || []).map((s) => ({
          _id: s._id,
          name: s.name,
          personalNumber: s.personalNumber,
          additionalInfo: s.additionalInfo || '',
          courseName: s.courseName || '',
          courseId: s.courseId || null,
          enrollmentId: s.enrollmentId || null,
          attended: s.attended ?? false,
          paidExamFee: s.paidExamFee ?? false,
          examTime: s.examTime || '',
          examMunicipality: s.examMunicipality || '',
          examLocation: s.examLocation || '',
          finalExamDate: s.finalExamDate || null,
          availableCourses: [],
          selectedCourse: null
        }))

        // Load courses for each student
        for (const student of baseStudents) {
          await this.loadStudentCourses(student);
        }

        // Fetch the latest attendance data for this event
        try {
          const eventDate = this.event.start
          const teacherId = exProps.teacherId

          if (eventDate && teacherId && baseStudents.length > 0) {
            const response = await axios.get(
              `/api/calendar-events/attendance/${encodeURIComponent(eventDate)}/${teacherId}`
            )
            const attendanceData = response.data

            // Merge attendance data with base student data
            this.studentsData = baseStudents.map((student) => {
              const attendance = attendanceData.find(
                (a) =>
                  (a.studentId?._id || a.studentId)?.toString() === (student._id || '').toString()
              )
              if (attendance) {
                return {
                  ...student,
                  attended: attendance.attended ?? student.attended,
                  paidExamFee: attendance.paidExamFee ?? student.paidExamFee,
                  examTime: attendance.examTime || student.examTime,
                  examMunicipality: attendance.examMunicipality || student.examMunicipality,
                  examLocation: attendance.examLocation || student.examLocation,
                  finalExamDate: student.finalExamDate, // Preserve the finalExamDate
                }
              }
              return student
            })
          } else {
            this.studentsData = baseStudents
          }
        } catch (error) {
          console.warn('Could not fetch attendance data, using base data:', error)
          this.studentsData = baseStudents
        }

        // Set exam info from extendedProps or from the first student with exam info
        this.examTime =
          exProps.examTime ||
          this.studentsData.find((s) => s.examTime)?.examTime ||
          `${this.selectedHour}:${this.selectedMinute}`
        this.examMunicipality =
          exProps.examMunicipality ||
          this.studentsData.find((s) => s.examMunicipality)?.examMunicipality ||
          ''
        this.examLocation =
          exProps.examLocation || this.studentsData.find((s) => s.examLocation)?.examLocation || ''

        // Debug logging
        console.log('🔍 Frontend - ExtendedProps exam info:', {
          examTime: exProps.examTime,
          examMunicipality: exProps.examMunicipality,
          examLocation: exProps.examLocation,
        })
        console.log('🔍 Frontend - Final exam info:', {
          examTime: this.examTime,
          examMunicipality: this.examMunicipality,
          examLocation: this.examLocation,
        })

        // Debug logging for students and finalExamDate
        console.log(
          '🔍 Frontend - Students data:',
          this.studentsData.map((s) => ({
            name: s.name,
            finalExamDate: s.finalExamDate,
            attended: s.attended,
            paidExamFee: s.paidExamFee,
          }))
        )

        // If no exam info exists yet, set default time
        if (!this.examTime || this.examTime === '') {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}`
        }

        // Update time selectors if examTime is set
        if (this.examTime && this.examTime.includes(':')) {
          if (this.examTime.includes('-')) {
            // format: HH:MM-HH:MM
            const [start, end] = this.examTime.split('-')
            const [sh, sm] = start.split(':')
            const [eh, em] = end.split(':')
            this.selectedHour = sh
            this.selectedMinute = sm
            this.selectedEndHour = eh
            this.selectedEndMinute = (em || '00').toString().padStart(2, '0')
          } else {
            const [hour, minute] = this.examTime.split(':')
            this.selectedHour = hour
            this.selectedMinute = minute
            // heuristic default end: +3 hours
            const endH = (parseInt(hour, 10) + 3) % 24
            this.selectedEndHour = endH.toString().padStart(2, '0')
            this.selectedEndMinute = '00'
          }
        }
      },
      updateTime() {
        const endMinutes = this.selectedEndMinute || '00'
        if (this.selectedEndHour && this.selectedEndHour !== '') {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}-${this.selectedEndHour}:${endMinutes}`
        } else {
          this.examTime = `${this.selectedHour}:${this.selectedMinute}`
        }
      },
      closeModal() {
        this.$emit('close')
      },
      async saveAttendance(student) {
        try {
          // Use the student's exam date if available, otherwise use the event date
          const examDate = student.finalExamDate || this.event.start

          console.log('🔍 Frontend - saveAttendance called for student:', {
            name: student.name,
            finalExamDate: student.finalExamDate,
            eventStart: this.event.start,
            examDate: examDate,
          })

          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`,
            {
              date: examDate,
              teacherId: this.event.extendedProps?.teacherId || this.event.teacherId,
              students: [
                {
                  _id: student._id,
                  attended: !!student.attended,
                  paidExamFee: !!student.paidExamFee,
                  personalNumber: student.personalNumber,
                  examTime: student.examTime || this.examTime || '',
                  examMunicipality: student.examMunicipality || this.examMunicipality || '',
                  examLocation: student.examLocation || this.examLocation || '',
                },
              ],
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            },
            { withCredentials: true }
          )
          // Refresh the event data to show the updated information
          await this.refreshEventData()
        } catch (error) {
          console.error('❌ Kunde inte spara närvaro:', error.response?.data || error.message)
          alert('Kunde inte spara närvaro, försök igen.')
        }
      },
      async submitExam() {
        if (!this.examTime || !this.examMunicipality || !this.examLocation) {
          alert('Välj tid, kommun och plats för provet.')
          return
        }

        this.isSaving = true
        try {
          // Prefer locally loaded students; fallback to event props
          const students =
            this.studentsData && this.studentsData.length > 0
              ? this.studentsData
              : Array.isArray(this.event?.extendedProps?.students)
              ? this.event.extendedProps.students
              : []

          const studentIds = students.map((s) => s?._id).filter((id) => !!id)

          if (studentIds.length === 0) {
            this.isSaving = false
            console.error('❌ Inga student-ID:n tillgängliga för uppdatering.')
            alert(
              'Inga studenter kopplade till detta prov kunde hittas. Försök ladda om sidan eller öppna eventet igen.'
            )
            return
          }
          const teacherId = this.event.extendedProps?.teacherId || this.event.teacherId

          // Use the first student's exam date if available, otherwise use the event date
          const examDate = students[0]?.finalExamDate || this.event.start

          console.log('🔍 Frontend - submitExam called with:', {
            firstStudentName: students[0]?.name,
            firstStudentFinalExamDate: students[0]?.finalExamDate,
            eventStart: this.event.start,
            examDate: examDate,
          })

          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/calendar-events/mark-attendance`,
            {
              date: examDate,
              teacherId,
              students: students.map((s) => ({
                _id: s._id,
                attended: !!s.attended,
                paidExamFee: !!s.paidExamFee,
                personalNumber: s.personalNumber,
                examTime: this.examTime,
                examMunicipality: this.examMunicipality,
                examLocation: this.examLocation,
              })),
              examTime: this.examTime,
              examMunicipality: this.examMunicipality,
              examLocation: this.examLocation,
            },
            { withCredentials: true }
          )

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
          this.event.extendedProps.examTime = this.examTime
          this.event.extendedProps.examMunicipality = this.examMunicipality
          this.event.extendedProps.examLocation = this.examLocation

          this.showSuccessMessage = true
          await this.refreshEventData()

          setTimeout(() => {
            this.showSuccessMessage = false
            this.$emit('update')
            this.closeModal()
          }, 2000)
        } catch (error) {
          console.error('❌ Fel vid uppdatering:', error.response?.data || error.message)
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
  
  /* Ensure Vuetify menus appear above modal */
  :deep(.v-overlay__content) {
    z-index: 10000 !important;
  }
  
  :deep(.v-menu__content) {
    z-index: 10000 !important;
  }
  
  :deep(.v-select__menu) {
    z-index: 10000 !important;
  }
  .table td {
    vertical-align: middle;
    white-space: pre-line;
  }
  .modal-footer .form-select .modal-footer .form-control {
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
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.8;
      transform: scale(1.05);
    }
  }
</style>
