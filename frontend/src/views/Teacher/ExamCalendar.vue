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

    <!-- Huvudkalender -->
    <div class="main-calendar">
      <div class="header">
        <button @click="changeView('dayGridMonth')">Månad</button>
        <button @click="changeView('dayGridWeek')">Vecka</button>
        <button @click="changeView('dayGridDay')">Dag</button>
      </div>

      <FullCalendar ref="fullCalendar" :options="calendarOptions" />

      <!-- 🟢 EventModal visas när ett event klickas -->
      <EventModal 
        v-if="selectedEvent" 
        :event="selectedEvent" 
        @close="selectedEvent = null" 
        @update="updateEvent"
        @delete="deleteEvent"
      />
    </div>
  </div>
</template>

<script>
import FullCalendar from '@fullcalendar/vue3';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import DatePicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import axios from 'axios';
import EventModal from './EventModal.vue'; 

export default {
  components: { FullCalendar, EventModal, DatePicker },
  data() {
    return {
      selectedDate: new Date(), // 🗓️ Håller reda på valt datum
      selectedEvent: null,
      calendarOptions: {
        plugins: [dayGridPlugin, interactionPlugin],
        initialView: 'dayGridMonth', // Standardvy: Månad
        editable: true, 
        selectable: true,
        events: [],
        eventClick: this.openEventModal, 
        eventDrop: this.handleEventDrop,
        locale: "sv", // 🔥 Språk: Svenska
        firstDay: 1, // 🔥 Veckan börjar på måndag
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
          right: "dayGridMonth,dayGridWeek,dayGridDay", // 🔥 Byt ut timeGrid mot dayGrid
        },
        displayEventTime: false, // 🔥 Döljer tider i eventen
        allDaySlot: false, // 🔥 Tar bort "all-day" sektionen helt
      }
    };
  },
  methods: {
    // 🔄 Ändra vy i FullCalendar
    changeView(view) {
      const calendarApi = this.$refs.fullCalendar.getApi();
      calendarApi.changeView(view);
    },

    // 🔄 När datum ändras i DatePicker, uppdatera FullCalendar
    onDateChange(newDate) {
      this.selectedDate = new Date(newDate);
      const calendarApi = this.$refs.fullCalendar.getApi();
      calendarApi.gotoDate(this.selectedDate); // 🔥 Flytta kalendern till valt datum
    },

    // 🔄 Hämta event från backend
    async fetchEvents() {
      try {
        const response = await axios.get('http://localhost:5001/api/calendar-color');
        this.calendarOptions.events = response.data.map(event => ({
          id: event._id,
          title: event.title,
          start: event.start.split("T")[0], // 🔥 Tar bort tid från datumet
          allDay: true, // 🔥 Markerar eventen som hela dagen
          color: event.color || "#007bff",
          extendedProps: { ...event.extendedProps }
        }));
      } catch (error) {
        console.error("Fel vid hämtning av event:", error);
      }
    },

    // 🔄 Uppdatera datum när man drar ett event
    async handleEventDrop(info) {
      try {
        const updatedEvent = {
          date: info.event.start.toISOString().split("T")[0],
        };
        await axios.put(`http://localhost:5001/api/update-exam/${info.event.id}`, updatedEvent);
        console.log("Event flyttat:", info.event);
      } catch (error) {
        console.error("Kunde inte uppdatera event:", error);
      }
    },

    // 🟢 Öppna modal med event-info
    openEventModal(info) {
      console.log("📌 Event Clicked:", info.event.extendedProps);

      this.selectedEvent = {
        id: info.event.id,
        title: info.event.title,
        start: info.event.start,
        teacher: info.event.extendedProps.teacher,
        examMunicipality: info.event.extendedProps.examMunicipality,
        examLocation: info.event.extendedProps.examLocation,
        students: info.event.extendedProps.students || [],
      };
    },

    // 🟢 Uppdatera event efter modal ändring
    async updateEvent(updatedData) {
      try {
        await axios.put(`http://localhost:5001/api/update-exam/${this.selectedEvent.id}`, updatedData);
        this.fetchEvents();
        this.selectedEvent = null; 
      } catch (error) {
        console.error("Kunde inte uppdatera event:", error);
      }
    },

    // ❌ Radera event
    async deleteEvent() {
      try {
        await axios.delete(`http://localhost:5001/api/delete-exam/${this.selectedEvent.id}`);
        this.fetchEvents();
        this.selectedEvent = null; 
      } catch (error) {
        console.error("Kunde inte radera event:", error);
      }
    }
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

.header {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 10px;
}

.fc {
  max-width: 100%;
  margin: auto;
}
</style>
