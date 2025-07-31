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

    <div v-if="canBookEvent" class="admin-controls mb-3">
      <button @click="openAddEventModal">
        + {{ eventButtonText }}
      </button>
    </div>
      <FullCalendar ref="fullCalendar" :options="calendarOptions" />

      <!-- Modal based on role -->
      <AddEventModal
        v-if="showAddEventModal && isAdminOrTeacher"
        :teachers="teachers"
        @close="showAddEventModal = false"
        @event-added="addEventToCalendar"
        @update="handleExamUpdate"
      />

      <AddMeetingModal
        v-if="showAddEventModal && isSYVOrSpecped"
        @close="showAddEventModal = false"
        @event-added="addEventToCalendar"
      />

      <!-- Modal based on event -->
      <EventModal 
        v-if="selectedEvent && !selectedEvent.isMeeting" 
        :event="selectedEvent" 
        @close="selectedEvent = null" 
        @update="handleExamUpdate"
      />

      <MeetingModal
        v-if="selectedEvent && selectedEvent.isMeeting"
        :event="{ extendedProps: selectedEvent, start: selectedEvent.start }"
        @close="selectedEvent = null"
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
import EventModal from '../Modals/EventModal.vue'; 
import AddEventModal from '../Modals/AddEventModal.vue';
import AddMeetingModal from '../Modals/AddMeetingModal.vue';
import MeetingModal from '../Modals/MeetingModal.vue';

export default {
  components: { FullCalendar, EventModal, DatePicker, AddEventModal, AddMeetingModal, MeetingModal },

  data() {

    return {
      loadingUser: true,
      selectedDate: new Date(),
      selectedEvent: null,
      showAddEventModal: false,
      teachers: [],
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
    userRole() {
      return this.$store.getters.userRole || 'guest';
    },
    isAdminOrTeacher() {
      return ["systemadmin", "teacher", "admin"].includes(this.userRole);
    },
    isSYVOrSpecped() {
      return ['syv', 'specped'].includes(this.userRole);
    },
    canBookEvent() {
      return this.isAdminOrTeacher || this.isSYVOrSpecped;
    },
    eventButtonText() {
      return this.isSYVOrSpecped ? 'Lägg till möte' : 'Lägg till slutprov';
    }
  },
  methods: {
    openAddEventModal() {
      this.showAddEventModal = true;
      this.fetchTeachers(); // Hämta lärare när modal öppnas
    },
     async fetchTeachers() {
      try {
                  
        const { api } = await import('@/store/store.js')

        const res = await api.get('/teachers', { withCredentials: true })
        this.teachers = res.data
          .filter((t) => t.userId && t.userId.username) // undvik tomma
          .map((t) => ({
            id: t._id,
            name: t.userId?.username || "Okänd",
            color: t.colorCode,
            subject: t.subject
          }));
        console.log("📚 Lärare hämtade:", this.teachers);
      } catch (err) {
        console.error("❌ Kunde inte hämta lärare:", err);
      }
    },

    addEventToCalendar(event) {
      const calendarApi = this.$refs.fullCalendar.getApi();

      const isMeeting = this.isSYVOrSpecped;

      const title = isMeeting
        ? this.userRole === 'syv'
          ? 'Möte SYV & elev'
          : 'Möte Specped & elev'
        : `Slutprov: ${event.extendedProps?.teacher || 'Okänd lärare'}`;

      calendarApi.addEvent({
        ...event,
        title,
        allDay: true,
        color: '#b0b0b0',
        extendedProps: {
          ...event.extendedProps,
          isMeeting,
          role: this.userRole
        }
      });
    },
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

    const { api } = await import('@/store/store.js')
      try {
        const [savedEvents, syncedEvents, meetings] = await 
          Promise.all([
            api.get('/calendar-events'),
            api.get('/calendar-events/syncable'),
            api.get('/meetings')
          ])

        console.log("📅 Backend returned syncedEvents:", syncedEvents.data);
        console.log("📅 Backend returned savedEvents:", savedEvents.data);
        
        // Debug: Check if any events have type 'slutprov'
        const slutprovEvents = syncedEvents.data.filter(event => 
          event.extendedProps?.type === 'slutprov'
        );
        console.log("🔍 Found slutprov events:", slutprovEvents);
        
        // Debug: Check all event types
        const eventTypes = syncedEvents.data.map(event => ({
          title: event.title,
          type: event.extendedProps?.type,
          start: event.start
        }));
        console.log("🔍 All event types:", eventTypes);

        // Only use syncedEvents for Slutprov (type 'exam', 'slutprov', or title contains 'Slutprov')
        const syncedSlutprov = syncedEvents.data.filter(event => {
          return (
            event.extendedProps?.type === 'exam' ||
            event.extendedProps?.type === 'slutprov' ||
            (event.title && event.title.toLowerCase().includes('slutprov'))
          );
        }).map(event => ({
          id: `${event.extendedProps.teacherId}_${event.start}`,
          title: event.title,
          start: event.start,
          allDay: true,
          color: event.color || "#999999",
          extendedProps: event.extendedProps,
        }));

        // Only use savedEvents that are NOT Slutprov
        const nonSlutprov = savedEvents.data.filter(event => {
          return !(
            event.extendedProps?.type === 'exam' ||
            event.extendedProps?.type === 'slutprov' ||
            (event.title && event.title.toLowerCase().includes('slutprov'))
          );
        }).map(event => ({
          id: event._id,
          title: event.title,
          start: event.start,
          allDay: true,
          color: event.color || "#999999",
          extendedProps: event.extendedProps,
        }));

        console.log("📅 Filtered syncedSlutprov events:", syncedSlutprov);
        console.log("📅 Filtered nonSlutprov events:", nonSlutprov);
        
        // Debug: Check date formats
        syncedSlutprov.forEach(event => {
          console.log(`📅 Event: ${event.title}, Start: ${event.start}, Type: ${typeof event.start}`);
        });

        this.calendarOptions.events = [
          ...nonSlutprov,
          ...syncedSlutprov,
          ...meetings.data.map(meeting => ({
            id: meeting._id,
            title: meeting.title,
            start: meeting.start,
            allDay: false,
            color: '#999999',
            extendedProps: {
              isMeeting: true,
              studentName: meeting.student?.name || 'Okänd',
              personalNumber: meeting.student?.personalNumber || '',
              location: meeting.location || '',
              bookedBy: meeting.bookedBy || ''
            }
          }))

        ];

        console.log("📅 Final calendar events:", this.calendarOptions.events);
        
        // Debug: Check if calendar is properly configured
        console.log("📅 Calendar options:", {
          initialView: this.calendarOptions.initialView,
          plugins: this.calendarOptions.plugins?.length,
          events: this.calendarOptions.events?.length
        });
        
        // Debug: Check current date and event dates
        const now = new Date();
        console.log("📅 Current date:", now);
        this.calendarOptions.events.forEach(event => {
          const eventDate = new Date(event.start);
          const daysDiff = Math.floor((eventDate - now) / (1000 * 60 * 60 * 24));
          console.log(`📅 Event: ${event.title}, Date: ${eventDate}, Days from now: ${daysDiff}`);
        });
      } catch (error) {
        console.error("❌ Kunde inte ladda kalender-events:", error.message);
      }
    },


    openEventModal(info) {
      console.log('🔍 Full event info:', info.event);
      console.log('🔍 Event extendedProps:', info.event.extendedProps);
      console.log('🔍 Event keys:', Object.keys(info.event));
      
      const props = info.event.extendedProps || {};
      const isMeeting = props.isMeeting;

      if (isMeeting) {
        this.selectedEvent = {
          id: info.event.id,
          title: info.event.title,
          start: info.event.start,
          isMeeting: true,
          studentName: props.studentName,
          personalNumber: props.personalNumber,
          location: props.location,
          bookedBy: props.bookedBy
        };
      } else {
        this.selectedEvent = {
          id: info.event.id,
          title: info.event.title,
          start: info.event.start,
          isMeeting: false,
          student: props.student,
          teacher: props.teacher,
          teacherId: props.teacherId,
          examMunicipality: props.examMunicipality,
          examLocation: props.examLocation,
          examTime: props.examTime,
          students: props.students || [],
          location: props.location,
          role: props.role,
          extendedProps: info.event.extendedProps
        };
      }

      console.log("🟡 selectedEvent set:", this.selectedEvent)
    },

      async handleExamUpdate() {
      console.log("🔄 handleExamUpdate called - refreshing calendar data...");
      await this.fetchEvents(); // Hämta uppdaterade data från backend
      console.log("🔄 Kalendern har uppdaterats!");
    },
  },
  async mounted() {
    if (this.$store.dispatch) {
      try {
        await this.$store.dispatch('loadUser'); // eller motsvarande
      } catch (err) {
        console.error("❌ Kunde inte ladda användare:", err);
      }
    }

    console.log("✅ userRole efter dispatch:", this.userRole);
    this.loadingUser = false;

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

.dp__btn.dp__button.dp__button_bottom {
  display: none !important;
}
</style>
