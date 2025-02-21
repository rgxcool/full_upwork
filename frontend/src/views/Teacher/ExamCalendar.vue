<template>
  <div class="calendar-container">
    <aside class="sidebar">
      <div class="html-datepicker">
        <div class="mini-calendar">
          <div class="nav-buttons">
            <button @click="prevYear">&#171;</button>
            <button @click="prevMonth">&#8249;</button>
            <h3>{{ selectedMonth }}</h3>
            <button @click="nextMonth">&#8250;</button>
            <button @click="nextYear">&#187;</button>
          </div>
        </div>        
        <table>
          <thead>
            <tr>
              <th v-for="day in weekDaysShort" :key="day">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="week in calendarGrid" :key="week">
              <td v-for="day in week" :key="day.date" 
                  @click="selectDate(day.date)" 
                  :class="{ 'selected': day.date === selectedDateFormatted }">
                {{ day.day }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </aside>

    <div class="main-calendar">
      <div class="header">
        <button @click="prevWeek"><</button>
        <h2>Vecka {{ currentWeekNumber }}</h2>
        <button @click="nextWeek">></button>
      </div>

      <div class="week-header">
        <div v-for="day in weekDays" :key="day.date" class="week-day">
          <span class="day-name">{{ day.label.substring(0, 3).toUpperCase() }}</span>
          <span class="day-number">{{ day.date.split('-')[2] }}</span>
        </div>
      </div>

      <div class="week-view">
        <div class="days-container">
          <div v-for="day in weekDays" :key="day.date" class="day-column"
              :data-date="day.date"
              @dragover.prevent
              @drop="onDrop($event, day.date)">
            
            <div v-for="event in day.events" :key="event.id"
                class="event"
                :style="{ backgroundColor: event.color || '#CCCCCC' }"
                draggable="true"
                @dragstart="startDrag($event, event)"
                @click="openExamDetails(event)">
              <span>{{ event.teacher }} - Slutprov</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- Modal för Exam Details -->
    <div v-if="selectedExam" class="modal fade show d-block" tabindex="-1" role="dialog"
      style="background: rgba(0, 0, 0, 0.5);">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ selectedExam.teacher || 'Okänd lärare' }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Personalnumber</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(student, index) in selectedExam.students" :key="index">
                  <td>{{ student.name }}</td>
                  <td>{{ student.personalNumber }}</td>
                  <td>
                    <input type="checkbox" 
                      v-model="student.attended" 
                      @change="markAttendance(student.personalNumber, student.attended)" 
                      :disabled="student.attended">                
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="closeModal">Stäng</button>
          </div>
        </div>
      </div>
    </div>

  </div> 
</template>


<script>
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import axios from 'axios';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);

export default {
  data() {
    return {
      selectedDate: dayjs().toDate(),
      events: [],
      selectedExam: null,
      teachers: [],
      courses: [],
      weekDaysShort: ['M', 'T', 'O', 'T', 'F', 'L', 'S'],
    };
  },
  computed: {
    selectedMonth() {
      return dayjs(this.selectedDate).format('MMMM YYYY');
    },
    selectedDateFormatted() {
      return dayjs(this.selectedDate).format('YYYY-MM-DD');
    },
    currentWeekNumber() {
      return dayjs(this.selectedDate).week();
    },
    calendarGrid() {
      const startOfMonth = dayjs(this.selectedDate).startOf('month').startOf('week');
      return Array.from({ length: 6 }, (_, row) => {
        return Array.from({ length: 7 }, (_, col) => {
          const date = startOfMonth.add(row * 7 + col, 'day');
          return { date: date.format('YYYY-MM-DD'), day: date.date() };
        });
      });
    },
    weekDays() {
      const startOfWeek = dayjs(this.selectedDate).startOf('isoWeek');
      return Array.from({ length: 7 }, (_, i) => {
        const date = startOfWeek.add(i, 'day').format('YYYY-MM-DD');
        const dayEvents = this.events.filter(e => e.date === date);
        return { date, label: dayjs(date).format('dddd'), events: dayEvents };
      });
    },
  },
  methods: {
    selectDate(date) {
      this.selectedDate = dayjs(date).toDate();
    },
    prevWeek() {
      this.selectedDate = dayjs(this.selectedDate).subtract(1, 'week').toDate();
    },
    nextWeek() {
      this.selectedDate = dayjs(this.selectedDate).add(1, 'week').toDate();
    },
    prevMonth() {
      this.selectedDate = dayjs(this.selectedDate).subtract(1, 'month').toDate();
    },
    nextMonth() {
      this.selectedDate = dayjs(this.selectedDate).add(1, 'month').toDate();
    },
    prevYear() {
      this.selectedDate = dayjs(this.selectedDate).subtract(1, 'year').toDate();
    },
    nextYear() {
      this.selectedDate = dayjs(this.selectedDate).add(1, 'year').toDate();
    },
    async fetchExams() {
      try {
        const response = await axios.get("http://localhost:5001/api/calendar-color");
        console.log("📌 API Response:", response.data); // 🔍 Logga API-responsen

        if (!Array.isArray(response.data) || response.data.length === 0) {
          console.warn("⚠️ API returnerade ingen data eller ett felaktigt format!");
          return;
        }

        this.events = response.data.map(event => ({
          id: event.id || Math.random().toString(36).substr(2, 9), // ✅ Se till att varje event har unikt ID
          teacher: event.extendedProps?.teacher || "Okänd lärare",
          date: dayjs(event.start).format('YYYY-MM-DD'),
          color: event.color || "#CCCCCC",
          students: event.extendedProps?.students.map(s => ({
            _id: s._id, // ✅ Ensure we're using MongoDB's ObjectId
            name: s.name,
            personalNumber: s.personalNumber,
            attended: s.attended || false,
          })) || [],
        }));

        console.log("✅ Events parsed:", this.events);
      } catch (error) {
        console.error("❌ Error fetching exams:", error);
      }
    },

    openExamDetails(exam) {
      console.log("📌 Clicked Exam Data:", exam);
      this.selectedExam = { ...exam };
    },
    closeModal() {
      this.selectedExam = null;
    },
    async markAttendance(personalNumber, attended) {
    try {
      const response = await axios.put(`http://localhost:5001/api/mark-attendance/${personalNumber}`, { attended });

      this.events = this.events.map(event => {
      if (event.students) {
        event.students = event.students.map(student => 
          student.personalNumber === personalNumber ? { ...student, attended } : student
        );
      }
      return event;
    });

      console.log("✅ Attendance updated:", response.data);
    } catch (error) {
      console.error("❌ Error marking attendance:", error.response?.data || error.message);
    }
    },

    startDrag(event, item) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('itemID', item.id);
      event.dataTransfer.setData('oldDate', item.date);
    },
    async onDrop(event, newDate) {
      const eventId = event.dataTransfer.getData('itemID');
      const eventIndex = this.events.findIndex(e => e.id === eventId);
      if (eventIndex !== -1) {
        this.events[eventIndex].date = newDate;
        try {
          await axios.put(`http://localhost:5001/api/update-exam/${eventId}`, { date: newDate });
        } catch (error) {
          console.error("❌ Error updating exam:", error.response?.data || error.message);
        }
      }
    }
  },
  mounted() {
    this.fetchExams();
  },
};
</script>


<style>
.calendar-cell {
  height: 60px;
  border-bottom: 1px solid #ddd;
  cursor: pointer;
  background-color: white;
}
.calendar-cell:hover {
  background-color: rgba(0, 123, 255, 0.2);
}
.calendar-container { 
  display: flex; 
}
.sidebar { 
  width: 300px; 
  padding: 10px; 
  border-right: 1px solid #ccc; 
  background: #f8f9fa; 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
}
.html-datepicker { 
  text-align: center; 
}
table { 
  width: 100%; 
  border-collapse: collapse; 
}
th, td { 
  padding: 10px; 
  text-align: center; 
  cursor: pointer; 
}
th { 
  background: #f1f3f4; 
}
td.selected { 
  background: #007bff; 
  color: white; 
  border-radius: 50%; 
}
.main-calendar { 
  flex: 1; 
  padding: 10px; 
}
.header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px; 
}
.week-view { 
  display: flex;
  height: 100%;
  border-top: 1px solid #ccc;
}
.time-column { 
  width: 60px; 
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  text-align: center;
}
.time-slot {
  height: 60px; /* Samma höjd som kalendercellerna */
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #ddd;
  font-size: 12px;
}
.time-label { 
  height: 50px; 
  text-align: center; 
  border-bottom: 1px solid #ddd; 
  background: #f1f3f4; 
  font-size: 12px; 
}
.day-column { 
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ccc;
}
.events { 
  position: relative; 
  min-height: 100px; 
}
.event { 
  background: #007bff; 
  color: #fff; 
  padding: 5px; 
  margin: 5px 0; 
  cursor: pointer; 
  border-radius: 4px; 
  font-size: 12px; 
  position: relative; 
}
.event:hover { 
  background: #0056b3; 
}
.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  padding: 10px 0;
}
.week-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 14px;
  color: #666;
}
.day-name {
  font-size: 12px;
  text-transform: uppercase;
}
.day-number {
  font-size: 18px;
  font-weight: bold;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
}
.mini-calendar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.mini-calendar .nav-buttons {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 5px;
}
.mini-calendar table {
  width: 100%;
  border-collapse: collapse;
}
.mini-calendar th, .mini-calendar td {
  padding: 10px;
  text-align: center;
  font-size: 14px;
  color: #333;
}
.mini-calendar th {
  font-weight: bold;
  color: #666;
}
.mini-calendar td.selected {
  background: #007bff;
  color: white;
  border-radius: 50%;
}
.draggable-container {
  display: flex;
  flex-direction: column;
  min-height: 100px;
}
.days-container {
  display: flex;
  flex: 1;
  border-left: 1px solid #ccc;
}
.event {
  background: #007bff;
  color: #fff;
  padding: 5px;
  margin: 5px 0;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  position: relative;
}
.event:hover {
  background: #0056b3;
}



.attendance-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 5px 10px;
  margin-left: 10px;
  cursor: pointer;
  border-radius: 5px;
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
}

.close {
  font-size: 24px;
  cursor: pointer;
}

@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  .mobile-datepicker {
    display: block;
  }
}

@media (min-width: 769px) {
  .mobile-datepicker {
    display: none;
  }
}
</style>
