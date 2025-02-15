<template>
  <div class="calendar-wrapper">
    <div class="calendar-container">
      <FullCalendar class="demo-app-calendar" :options="calendarOptions" />
    </div>
  </div>
</template>

<script>
  import { defineComponent } from 'vue'
  import FullCalendar from '@fullcalendar/vue3'
  import dayGridPlugin from '@fullcalendar/daygrid'
  import interactionPlugin from '@fullcalendar/interaction'
  import axios from 'axios'

  export default defineComponent({
    components: { FullCalendar },
    data() {
      return {
        calendarOptions: {
          plugins: [dayGridPlugin, interactionPlugin],
          initialView: 'dayGridMonth',
          locale: 'sv',
          events: [],
          eventClick: this.handleEventClick,
          weekNumbers: true,
          weekNumberCalculation: 'ISO',
          weekNumberContent: (args) => `V. ${args.num}`,
        },
      }
    },
    methods: {
      async fetchEvents() {
        try {
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/calender-color`)
          this.calendarOptions.events = response.data
        } catch (error) {
          console.error('Error fetching events:', error)
        }
      },
    },
    mounted() {
      this.fetchEvents()
    },
  })
</script>

<style scoped>
  /* ✅ Completely reset margin, padding, and fix viewport behavior */
  * {
    margin: 0 !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  }

  /* ✅ Fix viewport and remove all scrolling */
  html,
  body {
    width: 100vw !important;
    height: 100vh !important;
    overflow: hidden !important;
    position: fixed !important;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* ✅ Create a wrapper that centers the calendar */
  .calendar-wrapper {
    width: 100vw;
    height: calc(100vh - 80px); /* 🔥 Adjust for navbar */
    display: flex;
    justify-content: center; /* ✅ Center horizontally */
    align-items: center; /* ✅ Center vertically */
  }

  /* ✅ Ensure calendar takes up full height but remains centered */
  .calendar-container {
    width: 90vw; /* Adjust width to fit the screen */
    max-width: 1200px; /* Prevent it from becoming too wide */
    height: calc(100vh - 100px); /* Adjust for navbar */
    max-height: calc(100vh - 100px); /* Ensure no overflow */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    overflow: hidden !important;
    background: white;
    border-radius: 10px;
    box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.2); /* Subtle shadow effect */
  }

  /* ✅ Ensure FullCalendar behaves properly */
  .demo-app-calendar {
    width: 100% !important;
    height: 100% !important;
    min-height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
  }
</style>
