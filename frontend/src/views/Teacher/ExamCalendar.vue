<template>
  <div class="calendar-container">
    <aside class="sidebar">
      <DatePicker 
        v-model="selectedDate" 
        @update:modelValue="onDateChange"
        :auto-apply="true" 
        inline 
        :enable-time="false"
        locale="sv"
        :firstDayOfWeek="1"
      />

    </aside>

    <div class="main-calendar">
      <FullCalendar ref="fullCalendar" :options="calendarOptions" />

      <EventModal 
        v-if="selectedEvent" 
        :event="selectedEvent" 
        @close="selectedEvent = null" 
        @update="handleExamUpdate"
        />


    </div>
  </div>
</template>

<script>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import FullCalendar from '@fullcalendar/vue3';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import DatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import axios from 'axios';
import EventModal from './EventModal.vue'; 

export default {
  components: { FullCalendar, EventModal, DatePicker },
  setup() {
    const router = useRouter();
    const store = useStore();
    const userRole = computed(() => store.getters.userRole || 'guest'); // Default to 'guest' if undefined
    return { userRole };
  },
  data() {
    return {
      selectedDate: new Date(),
      selectedEvent: null,
      selectedView: "dayGridWeek", // Standard: Vecka
      calendarOptions: {
        plugins: [dayGridPlugin, interactionPlugin],
        initialView: 'dayGridWeek',
        editable: true, 
        selectable: true,
        events: [],
        eventClick: this.openEventModal, 
        eventDrop: this.handleEventDrop,
        locale: "sv",
        firstDay: 1,
        buttonText: {
          today: "Idag",
          month: "Månad",
          week: "Vecka",
          day: "Dag",
          list: "Lista"
        },
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,dayGridWeek,dayGridDay",
        },
        displayEventTime: false,
        allDaySlot: false,
      }
    };
  },
  computed: {
    isAdminOrTeacher() {
      return ["systemadmin", "teacher", "admin"].includes(this.userRole);
    }
  },
  methods: {
    changeView(view) {
      const calendarApi = this.$refs.fullCalendar.getApi();
      calendarApi.changeView(view);
    },
    onDateChange(newDate) {
      this.selectedDate = new Date(newDate);
      const calendarApi = this.$refs.fullCalendar.getApi();
      calendarApi.gotoDate(this.selectedDate);
    },
    async fetchEvents() {
      try {
        const response = await axios.get('http://localhost:5001/api/calendar-color');
        this.calendarOptions.events = response.data.map(event => ({
          id: event._id,
          title: event.title,
          start: event.start.split("T")[0],
          allDay: true,
          color: event.color || "#007bff",
          extendedProps: { ...event.extendedProps }
        }));
      } catch (error) {
        console.error("Fel vid hämtning av event:", error);
      }
    },
    openEventModal(info) {
      this.selectedEvent = {
        id: info.event.id,
        title: info.event.title,
        start: info.event.start,
        teacher: info.event.extendedProps.teacher,
        examMunicipality: info.event.extendedProps.examMunicipality,
        examLocation: info.event.extendedProps.examLocation,
        examTime: info.event.extendedProps.examTime, // 🟢 Lägg till denna rad!
        students: info.event.extendedProps.students || [],
      };
    },
      async handleExamUpdate() {
      await this.fetchEvents(); // Hämta uppdaterade data från backend
      console.log("🔄 Kalendern har uppdaterats!");
    },
  },
  async mounted() {
    await this.fetchEvents();
  }
};
</script>

<style>
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

.main-calendar {
  flex: 1;
  padding: 10px;
}

.view-selector {
  margin-top: 10px;
  padding: 5px;
  width: 100%;
}

.admin-controls {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.admin-controls button {
  padding: 8px 12px;
  border: none;
  background: #007bff;
  color: white;
  cursor: pointer;
  border-radius: 5px;
}

.admin-controls button:hover {
  background: #0056b3;
}
</style>
