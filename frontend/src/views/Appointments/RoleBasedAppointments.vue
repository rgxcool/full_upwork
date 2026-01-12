<!-- frontend/src/views/Syv/SyvAppointments.vue -->
<template>
  <div>
    <h1>{{ pageTitle }}</h1>
    <button @click="isModalOpen = true">Boka nytt samtal</button>

    <!-- Meeting List -->
    <table>
      <thead>
        <tr>
          <th>Elev</th>
          <th>Tid</th>
          <th>Information</th>
          <th>Åtgärder</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="meeting in meetings" :key="meeting._id">
          <td>
            <router-link :to="`/student/${meeting.student.id}`">{{ meeting.student.name }}</router-link>
          </td>
          <td>{{ new Date(meeting.start).toLocaleString() }}</td>
          <td>{{ meeting.info }}</td>
          <td>
            <button @click="deleteMeeting(meeting._id)">Radera</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div v-if="pagination.totalPages > 1">
      <button @click="changePage(pagination.page - 1)" :disabled="pagination.page <= 1">Föregående</button>
      <span>Sida {{ pagination.page }} av {{ pagination.totalPages }}</span>
      <button @click="changePage(pagination.page + 1)" :disabled="pagination.page >= pagination.totalPages">Nästa</button>
    </div>

    <!-- Modal -->
    <AddMeetingModal
      v-if="isModalOpen"
      @close="isModalOpen = false"
      @event-added="fetchMeetings"
      :title="'Boka nytt ' + activeRole + '-samtal'"
      :booked-by-role="activeRole"
    />
  </div>
</template>

<script>
import { api } from '@/store/store.js';
import AddMeetingModal from '@/views/Modals/AddMeetingModal.vue';

export default {
  components: { AddMeetingModal },
  data() {
    return {
      meetings: [],
      isModalOpen: false,
      pagination: {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 1
      },
    };
  },
  computed: {
    activeRole() {
      return this.$route.meta.role;
    },
    pageTitle() {
      return this.$route.meta.title;
    }
  },
  created() {
    this.fetchMeetings();
  },
  methods: {
    async fetchMeetings() {
      try {
        const { page, limit } = this.pagination;
        // Backend automatically filters by role for syv/specped, but we can also specify bookedBy
        const response = await api.get(`/meetings?bookedBy=${this.activeRole}&sort=start:desc&page=${page}&limit=${limit}`, { withCredentials: true });
        this.meetings = response.data.data;
        this.pagination = response.data.pagination;
        this.isModalOpen = false; // Close modal on success
      } catch (error) {
        console.error(`Kunde inte hämta ${this.activeRole}-samtal:`, error);
      }
    },
    async deleteMeeting(id) {
      if (confirm('Är du säker på att du vill radera detta möte?')) {
        try {
          await api.delete(`/meetings/${id}`, { withCredentials: true });
          this.fetchMeetings(); // Refresh list
        } catch (error) {
          console.error("Kunde inte radera mötet:", error);
          alert('Kunde inte radera mötet.');
        }
      }
    },
    changePage(newPage) {
      if (newPage > 0 && newPage <= this.pagination.totalPages) {
        this.pagination.page = newPage;
        this.fetchMeetings();
      }
    }
  }
};
</script>

<style scoped>
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
}
th {
  background-color: #f2f2f2;
  text-align: left;
}
td a, td button {
  margin-right: 10px;
}
button {
  cursor: pointer;
}
</style>
