<template>
  <div class="calendar-container">
    <aside class="sidebar">
      <div class="html-datepicker">
        <div class="mini-calendar">
          <div class="nav-buttons">
            <button @click="prevYear">&#171;</button> <!-- Föregående år -->
            <button @click="prevMonth">&#8249;</button> <!-- Föregående månad -->
            <h3>{{ selectedMonth }}</h3>
            <button @click="nextMonth">&#8250;</button> <!-- Nästa månad -->
            <button @click="nextYear">&#187;</button> <!-- Nästa år -->
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
                @dragstart="startDrag($event, event)">
              <span>{{ event.teacher }} - Slutprov</span>
            </div>
          </div>
        </div>

      </div> <!-- ✅ Stänger `.week-view` korrekt här -->
    </div> <!-- ✅ Stänger `.main-calendar` korrekt här -->

    <!-- MODAL FÖR ATT LÄGGA TILL PROV -->
    <div v-if="showModal" class="modal">
      <div class="modal-content">
        <span class="close" @click="showModal = false">&times;</span>
        <h3>Slutprov - {{ selectedExam.teacher }}</h3>
        <ul>
          <li v-for="student in selectedExam.students" :key="student.id">
            {{ student.name }} - {{ student.personalNumber }}
            <button @click="markAttendance(student)">Registrera Närvaro</button>
          </li>
        </ul>
      </div>
    </div>

  </div> 
</template>


<script>
import { ref, computed, onMounted } from 'vue';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import axios from 'axios';

dayjs.extend(isoWeek);
dayjs.extend(weekOfYear);

export default {
  setup() {
    const selectedDate = ref(dayjs().toDate());
    const events = ref([]);
    const showModal = ref(false); 
    const selectedExam = ref({}); 
    const teachers = ref([]); 
    const courses = ref([]); 
    const newExam = ref({
      teacherId: "",
      courseId: "",
      date: "",
      hour: "",
    });


    const selectedMonth = computed(() => dayjs(selectedDate.value).format('MMMM YYYY'));
    const selectedDateFormatted = computed(() => dayjs(selectedDate.value).format('YYYY-MM-DD'));
    const weekDaysShort = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];

    const calendarGrid = computed(() => {
      const startOfMonth = dayjs(selectedDate.value).startOf('month').startOf('week');
      return Array.from({ length: 6 }, (_, row) => {
        return Array.from({ length: 7 }, (_, col) => {
          const date = startOfMonth.add(row * 7 + col, 'day');
          return { date: date.format('YYYY-MM-DD'), day: date.date() };
        });
      });
    });

    const selectDate = (date) => {
      selectedDate.value = dayjs(date).toDate();
    };

    const currentWeekNumber = computed(() => dayjs(selectedDate.value).week());
    const hours = Array.from({ length: 24 }, (_, i) => i);

    const weekDays = computed(() => {
      const startOfWeek = dayjs(selectedDate.value).startOf('isoWeek');
      return Array.from({ length: 7 }, (_, i) => {
        const date = startOfWeek.add(i, 'day').format('YYYY-MM-DD');

        // Hitta events för denna dag
        const dayEvents = events.value.filter(e => e.date === date).map(e => ({
          ...e,
          color: e.color || '#CCCCCC'
        }));

        return { date, 
          label: dayjs(date).format('dddd'), 
          events: dayEvents };
      });
    });


    const prevWeek = () => selectedDate.value = dayjs(selectedDate.value).subtract(1, 'week').toDate();
    const nextWeek = () => selectedDate.value = dayjs(selectedDate.value).add(1, 'week').toDate();

    const prevMonth = () => {
      selectedDate.value = dayjs(selectedDate.value).subtract(1, 'month').toDate();
    };

    const nextMonth = () => {
      selectedDate.value = dayjs(selectedDate.value).add(1, 'month').toDate();
    };

    const prevYear = () => {
      selectedDate.value = dayjs(selectedDate.value).subtract(1, 'year').toDate();
    };

    const nextYear = () => {
      selectedDate.value = dayjs(selectedDate.value).add(1, 'year').toDate();
    };


    const addEvent = () => {
      events.value.push({ id: Date.now(), title: 'Nytt Event', date: dayjs(selectedDate.value).format('YYYY-MM-DD') });
    };
    
    const openAddExamForm = (date, hour) => {
      if (!newExam.value) {
        newExam.value = {}; // 🟢 Se till att newExam har en giltig referens
      }
      newExam.value.date = date;
      newExam.value.hour = hour;
      showModal.value = true;
    };

    const fetchExams = async () => {
        try {
          const response = await axios.get("http://localhost:5001/api/calendar-color");

          console.log("📌 API Response:", response.data); // Debug-logg

          if (!response.data || !Array.isArray(response.data)) {
            console.error("❌ API Response is not an array:", response.data);
            return;
          }

          events.value = response.data.map(exam => {
            const titleParts = exam.title ? exam.title.split(' - ') : [];
            const teacherName = titleParts.length > 1 ? titleParts[0] : "Okänd lärare";

            return {
              id: exam.id,
              teacher: teacherName, // 🟢 Tar ut lärarens namn
              date: dayjs(exam.start).format('YYYY-MM-DD'),
              color: exam.color || "#CCCCCC", // Om ingen färg finns, sätt standardgrå
              room: exam.extendedProps?.room || "Ej angivet",
              hour: exam.hour || "Hela dagen",
              students: exam.extendedProps?.students || [],
            };
          });

          console.log("✅ Events parsed:", events.value);

        } catch (error) {
          console.error("❌ Error fetching exams:", error);
        }
      };




    const openExamDetails = (exam) => {
          selectedExam.value = exam;
          showModal.value = true;
    };

    const markAttendance = (student) => {
      console.log("Närvaro registrerad för:", student.name);
    };
/*
    const updateEventDate = async (event) => {
      try {
        console.log("📌 Droppat event:", event);

        const eventId = event.item?.id || event.item?.dataset?.id;
        const newDate = event.to?.closest('.day-column')?.getAttribute('data-date');

        console.log("📌 Flyttat event:", eventId, "till", newDate);

        if (!eventId || !newDate) {
          console.error("❌ Kunde inte hitta nytt datum eller eventId");
          return;
        }

        // 🟢 Uppdatera frontend reaktivt
        const eventIndex = events.value.findIndex(e => e.id === eventId);
        if (eventIndex !== -1) {
          events.value[eventIndex] = { ...events.value[eventIndex], date: newDate };
          events.value = [...events.value]; // 🟢 Vue reaktiverar arrayen
        }

        // 🟢 Skicka PUT-request till backend
        const response = await axios.put(`http://localhost:5001/api/update-exam/${eventId}`, { date: newDate });
        console.log("✅ Slutprov uppdaterat i backend");

        // 🟢 Hämta alla events på nytt

      } catch (error) {
        console.error("❌ Error updating event date:", error.response?.data || error.message);
      }
    };
*/

    const startDrag = (event, item) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('itemID', item.id);
      event.dataTransfer.setData('oldDate', item.date);
      console.log("📌 Start drag:", item.id, "från", item.date);
    };

    const onDrop = async (event, newDate) => {
      const eventId = event.dataTransfer.getData('itemID');
      const oldDate = event.dataTransfer.getData('oldDate');

      console.log("📌 Droppat event:", eventId, "från", oldDate, "till", newDate);

      if (!eventId || !newDate) {
        console.error("❌ Kunde inte hitta nytt datum eller eventId");
        return;
      }

      // 🟢 Hitta eventet i listan och uppdatera datum
      const eventIndex = events.value.findIndex(e => e.id === eventId);
      if (eventIndex !== -1) {
        events.value[eventIndex].date = newDate;
        events.value = [...events.value]; // 🟢 Vue reaktiverar arrayen
      }

      // 🟢 Uppdatera i backend
      try {
        const response = await axios.put(`http://localhost:5001/api/update-exam/${eventId}`, { date: newDate });
        console.log("✅ Slutprov uppdaterat i backend:", response.data);
      } catch (error) {
        console.error("❌ Error updating exam:", error.response?.data || error.message);
      }
    };






    const submitExam = async () => {
      try {
        await axios.post("http://localhost:5001/api/add-exam", {
          ...newExam.value,
          date: `${newExam.value.date}T${newExam.value.hour}:00:00Z` // Formatera datum + tid
        });
        showModal.value = false;
        fetchExams(); // Uppdatera kalendern
      } catch (error) {
        console.error("Error adding exam:", error);
      }
    };

    const deleteExam = async (eventId) => {
        if (!confirm("Vill du verkligen ta bort detta prov?")) return;
        try {
          await axios.delete(`http://localhost:5001/api/delete-exam/${eventId}`);
          fetchExams();
        } catch (error) {
          console.error("Error deleting exam:", error);
        }
      };

    onMounted(() => {
      fetchExams();
    });

    
    return {
      openExamDetails, 
      markAttendance, 
      teachers, 
      courses, 
      newExam, 
      showModal, 
      openAddExamForm, 
      submitExam, 
      deleteExam, 
      prevMonth, 
      prevYear, 
      nextMonth, 
      nextYear, 
      selectedDate, 
      selectedMonth, 
      selectedDateFormatted, 
      weekDaysShort, 
      calendarGrid, 
      selectDate, 
      currentWeekNumber, 
      weekDays, 
      prevWeek, 
      nextWeek, 
      addEvent, 
      //updateEventDate, 
      hours,
    onDrop,
  startDrag };
  }
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
  cursor: grab;
  border-radius: 4px;
  font-size: 12px;
  position: relative;
}
.event:hover {
  background: #0056b3;
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
