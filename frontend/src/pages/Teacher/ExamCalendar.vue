<template>
  <div class="container mt-4">
    <div class="card p-3 shadow-sm">
      <FullCalendar class="demo-app-calendar" :options="calendarOptions" />
    </div>

    <div v-if="eventDetails" class="modal fade show d-block" tabindex="-1" role="dialog" style="background: rgba(0, 0, 0, 0.5)">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ eventDetails.course }} - {{ eventDetails.teacher }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
          <div class="modal-body">
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Personnummer</th>
                  <th>Kurs</th>
                  <th>Redigera</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(student, index) in eventDetails.students" :key="index">
                  <td>{{ student.name }}</td>
                  <td>{{ student.id }}</td>
                  <td>{{ student.course }}</td>
                  <td>
                    <router-link :to="`/students/${student.id}`" class="btn btn-primary btn-sm">Visa mer</router-link>
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
          weekNumbers: true, // Aktiverar veckonummer
          weekNumberCalculation: 'ISO', // Använder ISO-standard för veckonummer
          weekNumberContent: (args) => `V. ${args.num}`, // Anpassa prefix för veckonummer
        },
        eventDetails: null,
      }
    },
    methods: {
      async fetchEvents() {
        try {
          const response = await axios.get('`${process.env.VUE_APP_API_URL}/api/calender-color')
          this.calendarOptions.events = response.data
        } catch (error) {
          console.error('Error fetching events:', error)
        }
      },
      handleEventClick(info) {
        this.eventDetails = info.event.extendedProps
      },
      closeModal() {
        this.eventDetails = null
      },
    },
    mounted() {
      this.fetchEvents()
    },
  })
</script>

<style scoped>
  .modal {
    z-index: 1050;
  }

  .modal-backdrop {
    background-color: rgba(0, 0, 0, 0.5);
  }
</style>
