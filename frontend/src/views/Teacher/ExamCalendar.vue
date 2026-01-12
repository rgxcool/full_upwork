<template>
  <div class="scrollable-view">
    <div class="calendar-container">
      <aside class="sidebar">
        <DatePicker 
          v-model="selectedDate" 
          @update:modelValue="onDateChange"
          :auto-apply="true" 
          inline 
          :enable-time="false"
          :locale="svLocale"
          :firstDayOfWeek="1"
        />
      </aside>

      <div class="main-calendar">
        <div v-if="canBookEvent" class="admin-controls mb-3">
          <button v-if="isAdminOrTeacher" @click="openAddEventModal('exam')">
            📘 Lägg till slutprov
          </button>
          <button v-if="isSYVOrSpecped || isAdmin" @click="openAddEventModal('meeting')">
            🗓️ Lägg till möte
          </button>
        </div>

        <FullCalendar ref="fullCalendar" :options="calendarOptions" />

        <AddEventModal
          v-if="showAddEventModal && eventType === 'exam'"
          :teachers="teachers"
          @close="closeModal"
          @event-added="addEventToCalendar"
          @update="handleExamUpdate"
        />

        <AddMeetingModal
          v-if="showAddEventModal && eventType === 'meeting'"
          @close="closeModal"
          @event-added="addEventToCalendar"
          :booked-by-role="userRole"
          :title="'Boka nytt möte'"
        />

        <EventModal 
          v-if="selectedEvent && isExamEvent" 
          :event="selectedEvent" 
          @close="selectedEvent = null" 
          @update="handleExamUpdate"
        />

        <MeetingModal
          v-if="selectedEvent && isMeetingEvent"
          :event="selectedEvent"
          @close="selectedEvent = null"
          @deleted="handleExamUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script>
import FullCalendar from '@fullcalendar/vue3';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { VueDatePicker as DatePicker } from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";
import { sv } from 'date-fns/locale';
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
      eventType: null,
      teachers: [],
      currentTeacherId: null,
      svLocale: sv,
      calendarOptions: {
        plugins: [dayGridPlugin, interactionPlugin],
        initialView: 'dayGridWeek',
        editable: true,
        eventStartEditable: true,
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
    isAdmin() {
      return ["admin", "systemadmin"].includes(this.userRole);
    },
    isAdminOrTeacher() {
      return ["systemadmin", "teacher", "admin"].includes(this.userRole);
    },
    isSYVOrSpecped() {
      return ['syv', 'specped', 'systemadmin', 'admin'].includes(this.userRole);
    },
    canBookEvent() {
      return this.isAdminOrTeacher || this.isSYVOrSpecped;
    },
    isMeetingEvent() {
      return this.selectedEvent?.extendedProps?.isMeeting;
    },
    isExamEvent() {
      return this.selectedEvent?.extendedProps?.isExam || 
            this.selectedEvent?.extendedProps?.type === 'exam';
    }
  },
  methods: {
    openAddEventModal(type) {
      this.selectedEvent = null
      this.eventType = type;
      this.showAddEventModal = true;

      if (type === 'exam') {
        this.fetchTeachers();
      }
    },
    closeModal() {
      this.showAddEventModal = false;
      this.eventType = null;
    },
    async fetchTeachers() {
      try {
        const { api } = await import('@/store/store.js')
        const res = await api.get('/teachers', { withCredentials: true });
        this.teachers = res.data
          .filter(t => t.userId && t.userId.username)
          .map(t => ({
            id: t._id,
            name: t.userId?.username || "Okänd",
            color: t.colorCode,
            subject: t.subject
          }));

        // If user is a teacher, find their teacher ID
        if (this.userRole === "teacher") {
          const currentUserId = this.$store.state.user?.userId;
          const teacher = res.data.find(t => t.userId?._id?.toString() === currentUserId?.toString() || 
                                            t.userId?.toString() === currentUserId?.toString());
          if (teacher) {
            this.currentTeacherId = teacher._id.toString();
          }
        }
      } catch (err) {
        console.error("❌ Kunde inte hämta lärare:", err);
      }
    },
    addEventToCalendar(event) {
      const calendarApi = this.$refs.fullCalendar.getApi();
      const isMeeting = this.eventType === 'meeting';

      // Use the title from the event (set by AddMeetingModal) instead of overriding it
      const title = event.title || (isMeeting 
        ? (event.extendedProps?.studentName ? `Möte, ${event.extendedProps.studentName}` : 'Möte')
        : (event.extendedProps?.teacher || 'Okänd lärare'));

      calendarApi.addEvent({
        ...event,
        title,
        allDay: isMeeting ? false : true,
        color: event.extendedProps?.teacherId?.colorCode || event.color || '#999999',
        extendedProps: {
          ...event.extendedProps,
          students: event.extendedProps?.students || [],
          isMeeting: this.eventType === 'meeting',
          isExam: this.eventType === 'exam',
          role: this.userRole,
          examTime: event.extendedProps?.examTime,
          examMunicipality: event.extendedProps?.examMunicipality,
          examLocation: event.extendedProps?.examLocation,
          type: this.eventType === 'exam' ? 'exam' : 'general',
        }
      });

      this.closeModal();
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
      const { api } = await import('@/store/store.js');
      try {
        const [savedEvents, syncedEvents, meetings] = await Promise.all([
          api.get('/calendar-events'),
          api.get('/calendar-events/syncable'),
          api.get('/meetings')
        ]);

        const allEvents = [
          ...savedEvents.data.map(event => ({
            id: event._id,
            title: event.title,
            start: event.start,
            allDay: true,
            color: event.color || "#999999",
            extendedProps: { ...(event.extendedProps || {}), saved: true }
          })),
          ...syncedEvents.data.map(event => {
            // Make synced events editable for admins and the responsible teacher
            const isAdmin = ["admin", "systemadmin"].includes(this.userRole);
            const eventTeacherId = event.extendedProps?.teacherId?._id?.toString() || 
                                   event.extendedProps?.teacherId?.toString();
            const isResponsibleTeacher = eventTeacherId && 
              this.userRole === "teacher" &&
              this.currentTeacherId === eventTeacherId;
            const isEditable = isAdmin || isResponsibleTeacher;

            return {
              id: event.id, // comes from /calendar-events/syncable
              title: event.title,
              start: event.start,
              allDay: true,
              color: event.color || "#999999",
              editable: isEditable, // allow drag for admins and responsible teachers
              extendedProps: { 
                ...(event.extendedProps || {}), 
                synced: true,
                courseInstanceIds: event.extendedProps?.courseInstanceIds || [],
                teacherId: eventTeacherId
              }
            };
          }),
          ...(meetings.data?.data || []).map(meeting => {
            const studentName = meeting.student?.name || 'Okänd';
            let displayTitle = meeting.title; // Use the original title from database
            
            // Debug log
            console.log('📅 Processing meeting:', {
              title: meeting.title,
              bookedBy: meeting.bookedBy,
              createdBy: meeting.createdBy,
              studentName
            });
            
            // If title is in "Möte, Student name" format (admin/systemadmin), keep it
            // Otherwise, format as "Role, Student name" for syv/specped
            if (!displayTitle || displayTitle === 'Möte') {
              // Fallback: format based on bookedBy
              const roleLabel = meeting.bookedBy === 'syv' ? 'Syv' : 
                              meeting.bookedBy === 'specped' ? 'Specped' : '';
              displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`;
            } else if (displayTitle.startsWith('Möte,')) {
              // Already in "Möte, Student name" format - keep it
              displayTitle = displayTitle;
            } else if (!displayTitle.includes(studentName)) {
              // Title doesn't contain student name, format as "Role, Student name"
              const roleLabel = meeting.bookedBy === 'syv' ? 'Syv' : 
                              meeting.bookedBy === 'specped' ? 'Specped' : '';
              displayTitle = roleLabel ? `${roleLabel}, ${studentName}` : `Möte, ${studentName}`;
            }
            
            // Extract createdBy username
            const createdByUsername = meeting.createdBy?.username || 
                                    meeting.createdBy?.email || 
                                    (typeof meeting.createdBy === 'string' ? null : null);
            
            return {
              id: meeting._id,
              title: displayTitle,
              start: meeting.start,
              allDay: false,
              editable: true,
              color: '#999999',
              extendedProps: {
                isMeeting: true,
                studentName: studentName,
                personalNumber: meeting.student?.personalNumber || '',
                location: meeting.location || '',
                bookedBy: meeting.bookedBy || '',
                createdBy: meeting.createdBy?._id || meeting.createdBy,
                createdByUsername: createdByUsername,
                originalTitle: meeting.title // Keep original title to extract username
              }
            };
          })
        ];

        // Use FullCalendar API to ensure DnD works immediately without page refresh
        const calendarApi = this.$refs.fullCalendar.getApi();
        calendarApi.removeAllEvents();
        allEvents.forEach(e => calendarApi.addEvent(e));

        // Debug
        console.log("Alla events som skickas till kalendern:", allEvents);
        allEvents.forEach(e => {
          if (e.extendedProps && e.extendedProps.type === 'exam') {
            console.log('EXAM-EVENT:', e);
          }
        });

      } catch (error) {
        console.error("❌ Kunde inte ladda kalender-events:", error.message);
      }
    },
    openEventModal(info) {
      const fcEvent = info.event;

      // Bygg ett plain object för modalen med deep copy
      const eventObj = {
        id: fcEvent.id,
        _id: fcEvent.extendedProps?._id || fcEvent.id,
        title: fcEvent.title,
        start: fcEvent.start,
        allDay: fcEvent.allDay,
        color: fcEvent.backgroundColor || fcEvent.extendedProps?.color || '#999999',
        extendedProps: {
          ...fcEvent.extendedProps
        }
      };

      console.log("extendedProps on click:", fcEvent.extendedProps);
      this.selectedEvent = JSON.parse(JSON.stringify(eventObj));
      this.eventType = (this.selectedEvent.extendedProps?.type === 'exam') ? 'exam' : 'meeting';

      console.log("SKICKAR event till modal:", this.selectedEvent);
    },
    handleEventDrop(info) {
      const updatedEvent = {
        start: info.event.start,
      };

      const eventId = info.event.id;
      const isMeeting = info.event.extendedProps?.isMeeting;
      const isSavedCalendarEvent = info.event.extendedProps?.saved === true;
      const isSynced = info.event.extendedProps?.synced === true;

      // Handle synced events (from course instances/enrollments)
      if (isSynced && !isMeeting && !isSavedCalendarEvent) {
        const teacherId = info.event.extendedProps?.teacherId;
        // Get the original date from oldEvent or calculate from delta
        const oldStart = info.oldEvent?.start || info.event.start;
        const newStart = info.event.start;
        const fromDate = oldStart ? new Date(oldStart).toISOString().split('T')[0] : null;
        const toDate = newStart ? new Date(newStart).toISOString().split('T')[0] : null;
        const courseInstanceIds = info.event.extendedProps?.courseInstanceIds || [];

        if (!teacherId || !fromDate || !toDate) {
          console.warn('🟠 Synced event missing required data:', { teacherId, fromDate, toDate });
          info.revert();
          return;
        }

        import('@/store/store.js').then(({ api }) => {
          api
            .put('/calendar-events/move-group', {
              teacherId,
              fromDate,
              toDate,
              courseInstanceIds
            }, { withCredentials: true })
            .then(() => {
              console.log("✅ Synced event moved successfully!");
              // Don't refresh immediately - the event is already in the correct visual position
              // The backend has been updated, so the data is correct
              // Refreshing immediately can cause the event to reset to its old position
              // if the database query happens before the update is fully committed
              // The event will be in the correct position on the next natural refresh
            })
            .catch((err) => {
              console.error("❌ Kunde inte flytta synced event:", err.response?.data || err.message);
              info.revert();
            });
        });
        return;
      }

      // Guard: do not allow dragging of other synced events without a real DB id
      if (!isMeeting && !isSavedCalendarEvent) {
        console.warn('🟠 Dragging is only allowed for sparade kalender-händelser och möten.');
        info.revert();
        return;
      }

      import('@/store/store.js').then(({ api }) => {
        const endpoint = isMeeting ? `/meetings/${eventId}` : `/calendar-events/${eventId}`;
        api
          .put(endpoint, updatedEvent, { withCredentials: true })
          .then(() => {
            console.log(isMeeting ? "✅ Möte uppdaterat!" : "✅ Event uppdaterat!");          
          })
          .catch((err) => {
            console.error(
              isMeeting
                ? "❌ Kunde inte uppdatera möte:"
                : "❌ Kunde inte uppdatera event:",
              err.response?.data || err.message
            );
            info.revert();
          });
      });
    },
    async handleExamUpdate() {
      console.log("🔄 handleExamUpdate called - refreshing calendar data...");
      await this.fetchEvents();
      this.selectedEvent = null;
    }, 
  },
  async mounted() {
    await this.fetchTeachers();
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
.admin-controls {
  margin: 20px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.admin-controls button {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 6px;
  transition: background-color 0.3s ease;
}
.admin-controls button:hover {
  background-color: #0056b3;
}
.dp__btn.dp__button.dp__button_bottom {
  display: none !important;
}
@media (max-width: 768px) {
  .admin-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .admin-controls button {
    width: 100%;
  }
}
@media (max-width: 915px) {
  .sidebar {
    display: none;
  }
}
</style>
