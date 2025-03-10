<template>
  <div class="calendar-container">
    <aside class="sidebar">
      <DatePicker 
        v-model="selectedDate" 
        @update:modelValue="onDateChange" 
        :auto-apply="true" 
        inline 
        :enable-time="false"
      />
    </aside>

    <div class="main-calendar">
      <div class="header">
        <button @click="prevWeek"><</button>
        <h2>Vecka {{ currentWeekNumber }}</h2>
        <button @click="nextWeek">></button>
      </div>

      <div class="week-header">
        <div v-for="day in weekDays" :key="day.date" class="week-day">
          <span class="day-name">{{ day.name }}</span>
          <span class="day-number">{{ day.number }}</span>
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
                <span>{{ event.teacher }}</span>
                <span>{{ event.examMunicipality }} - {{ event.examLocation }}</span>
                <span>{{ event.examTime }}</span>            
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
            <h5 class="modal-title">{{ selectedExam.teacher || 'Okänd lärare' }} </h5>
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
            <form @submit.prevent="submitExam" class="exam-form">
              <label>Choose exam time:</label>
              <input type="time" id="examTime" v-model="selectedExamTime" required />

              <label>Choose exam municipality:</label>
              <select v-model="selectedExamMunicipality">
                <option v-for="(locations, municipality) in examMunicipalities" :key="municipality" :value="municipality">
                  {{ municipality }}
                </option>
              </select>

              <label>Choose exam location:</label>
              <select v-model="selectedExamLocation">
                <option v-for="location in examMunicipalities[selectedExamMunicipality]" :key="location" :value="location">
                  {{ location }}
                </option>

              </select>

              <button type="submit" class="btn btm-primary">
                Save Exam
              </button>


            </form>
          </div>
        </div>
      </div>
    </div>

  </div> 
</template>


<script>
import DatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import axios from 'axios';



export default {
  components: {DatePicker},
  data() {
    return {
      selectedDate: new Date(),
      weekDays: [],
      events: [],
      selectedExam: null,
      teachers: [],
      courses: [],
      weekDaysShort: ['M', 'T', 'O', 'T', 'F', 'L', 'S'],
      examMunicipalities: {
        Sollentuna: ["308", "310", "lilla rummet", "Aniara", "Kung Agnes"],
        Akalla: ["Vision", "Hässja", "Arkarli", "316"],   
      },
      selectedExamMunicipality: "",
      selectedExamLocation: "",
      selectedExamTime: "",
    };
  },
  computed: {
    currentWeekNumber() {
      return this.getWeekNumber(this.selectedDate)
    }
  },
  methods: {
    generateWeekDays(baseDate) {
      const startOfWeek = new Date(baseDate);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);

      const days = [];
      const dayNames = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const formattedDate = date.toLocaleDateString("sv-SE") // 🗓️ Format YYYY-MM-DD

        const dayEvents = this.events.filter(event => event.date === formattedDate);

        days.push({
          name: dayNames[i],
          number: date.getDate(),
          date: formattedDate,
          events: dayEvents, // 🔥 Kopplar events till dagen
        });
      }

      this.weekDays = days;
      console.log("📌 Veckodagar genererade:", this.weekDays); // ✅ Loggar dagarna + events
    },


    onDateChange(newDate) {
      this.selectedDate = new Date(newDate);

      // Se till att vi alltid hamnar på rätt veckas måndag
      let day = this.selectedDate.getDay(); // Hämtar veckodagen (0 = söndag, 1 = måndag, etc.)
      
      if (day === 0) { // Om det är söndag
        this.selectedDate.setDate(this.selectedDate.getDate() - 6); // Hoppa tillbaka till måndag samma vecka
      } else {
        this.selectedDate.setDate(this.selectedDate.getDate() - day + 1); // Justera till måndag
      }

      this.generateWeekDays(this.selectedDate);
    }
    ,

    // Går till föregående vecka
    prevWeek() {
      this.selectedDate.setDate(this.selectedDate.getDate() - 7);
      this.selectedDate = new Date(this.selectedDate);
      this.generateWeekDays(this.selectedDate);
    },

    // Går till nästa vecka
    nextWeek() {
      this.selectedDate.setDate(this.selectedDate.getDate() + 7);
      this.selectedDate = new Date(this.selectedDate);
      this.generateWeekDays(this.selectedDate);
    },

    getWeekNumber(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    },

    async fetchExams() {
      try {
        const response = await axios.get("http://localhost:5001/api/calendar-color");

        console.log("📌 Server response:", response.data); // 🔥 Logga hela serverns svar


        this.events = response.data.map(event => {
          const eventDate = new Date(event.start + "T00:00:00+01:00"); // CET (UTC+1)
          const formattedDate = eventDate.toISOString().split("T")[0]; // 🗓️ Format YYYY-MM-DD

      return {
        id: event._id,
        teacher: event.extendedProps?.teacher || "Unknown Teacher",
        date: formattedDate,
        color: event.color || "#CCCCCC",
        examMunicipality: event.extendedProps?.examMunicipality || "Unknown municipality",
        examLocation: event.extendedProps?.examLocation || "Unknown location",
        examTime: event.extendedProps?.examTime || "No exam time",
        students: event.extendedProps?.students.map(s => ({
          _id: s._id,
          name: s.name,
          personalNumber: s.personalNumber,
          attended: s.attended || false,
        })) || [],
      };
    });

        console.log("✅ Events parsed:", this.events);
      } catch (error) {
        console.error("❌ Error fetching exams:", error);
      }
    },

    openExamDetails(exam) {
    console.log("📌 Clicked Exam Data:", exam);

    // ✅ Endast elever kopplade till detta event
    this.selectedExam = {
        ...exam
        
    };

    // ✅ Uppdatera modalens header
    this.selectedExamTime = exam.examTime || "No exam time";
    this.selectedExamMunicipality = exam.examMunicipality || "Unknown municipality";
    this.selectedExamLocation = exam.examLocation || "Unknown location";
}
,
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
        if (!item.id || item.id.length !== 24) {  // 🔍 Kolla att ID är korrekt
            console.error("❌ Ogiltigt eventID:", item);
            return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('eventID', item.id); 
        event.dataTransfer.setData("oldDate", item.date);
    },

    async onDrop(event, newDate) {
    event.preventDefault();

    const eventID = event.dataTransfer.getData("eventID");
    if (!eventID || eventID.length !== 24) {  
        console.error("❌ Ogiltigt eventID:", eventID);
        return;
    }

    const oldDate = event.dataTransfer.getData("oldDate");

    const eventIndex = this.events.findIndex(e => e.id === eventID);
    if (eventIndex !== -1) {
        // 🟢 Uppdatera det befintliga eventet istället för att skapa en kopia
        this.events[eventIndex].date = newDate;
        this.events = [...this.events]; // 🔥 Trigga Vue att uppdatera UI
        this.generateWeekDays(this.selectedDate);

        try {
            console.log(`📡 PUT Request till servern: /api/update-exam/${eventID}`);
            const response = await axios.put(`http://localhost:5001/api/update-exam/${eventID}`, { date: newDate });

            console.log(`✅ Exam flyttat från ${oldDate} till ${newDate}:`, response.data);

            // 🔄 Hämta uppdaterade event efter flytten
            await this.fetchExams();
        } catch (error) {
            console.error("❌ Error updating exam:", error.response?.data || error.message);
        }
    }
},



    async submitExam() {
    console.log("📌 Submitting exam data...");

    try {
        if (!this.selectedExamTime || !this.selectedExamMunicipality || !this.selectedExamLocation) {
            alert("Välj tid, kommun och plats för provet.");
            return;
        }

        if (!this.selectedExam.students || this.selectedExam.students.length === 0) {
            alert("Det finns inga studenter att skapa slutprov för.");
            return;
        }

        const studentIds = this.selectedExam.students.map(student => student._id);

        const response = await axios.post("http://localhost:5001/api/add-exam", {
            studentIds,
            examTime: this.selectedExamTime,
            examMunicipality: this.selectedExamMunicipality,
            examLocation: this.selectedExamLocation,
        });

        console.log("✅ Exams saved:", response.data);

        // 🔄 Ladda om kalendern för att visa den uppdaterade informationen
        await this.fetchExams();
        this.closeModal();
    } catch (error) {
        console.error("❌ Error adding exams:", error.response?.data || error.message);
    }
}




  },
   async mounted() {
    await this.fetchExams();

    this.generateWeekDays(this.selectedDate);
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

.exam-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f9f9f9;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  margin: 20px auto;
}

.exam-form h4 {
  text-align: center;
  margin-bottom: 15px;
}

.exam-form label {
  font-weight: bold;
  margin-bottom: 5px;
}

.exam-form input, 
.exam-form select {
  padding: 10px;
  border-radius: 5px;
  border: 1px solid #ccc;
  font-size: 16px;
}

.exam-form button {
  background: #007bff;
  color: white;
  border: none;
  padding: 10px;
  font-size: 16px;
  border-radius: 5px;
  cursor: pointer;
  transition: 0.3s;
}

.exam-form button:hover {
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
