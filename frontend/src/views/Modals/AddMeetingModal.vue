<template>
  <div class="modal-backdrop">
    <div class="modal-content">
      <h2>{{ title }}</h2> <!-- Use prop for title -->

      <label>Datum:</label>
      <DatePicker
        v-model="form.date"
        :enable-time="false"
        :locale="svLocale"
        :auto-apply="true"
        format="yyyy-MM-dd"
      />

      <label>Tid:</label>
      <input type="time" v-model="form.time" class="time-input"/>

    <label>Elev:</label>
    <v-autocomplete
      v-model="form.student"
      :items="students"
      item-title="displayName"
      item-value="_id"
      label="Välj elev"
      outlined
      clearable
      return-object
      :no-data-text="'Inga elever tillgängliga'"
      :menu-props="{ maxHeight: '300px' }"
      :custom-filter="filterStudents"
      auto-select-first
    >
      <template #item="{ props, item }">
        <v-list-item v-bind="props" :title="item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})`" />
      </template>
      <template #selection="{ item }">
        {{ item.raw.displayName || `${item.raw.name} (${item.raw.personalNumber || ''})` }}
      </template>
    </v-autocomplete>

      <label>Plats:</label>
      <input v-model="form.location" placeholder="T.ex. Samtalsrum A" />

      <!-- 🔽 ADD TEXTAREA FOR INFO 🔽 -->
      <label>Information:</label>
      <textarea v-model="form.info" placeholder="Anteckningar om mötet..."></textarea>

      <div class="modal-buttons">
        <button @click="submit">Spara</button>
        <button @click="$emit('close')">Avbryt</button>
      </div>
    </div>
  </div>
</template>

<script>
import { VueDatePicker as DatePicker } from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
import { sv } from 'date-fns/locale'
import { api } from '@/store/store.js'

export default {
  components: { DatePicker },
  props: { // 👈 Add title prop
    title: {
      type: String,
      default: 'Boka möte'
    },
    bookedByRole: {
      type: String,
      required: false,
      default: null
    }
  },
  data() {
    return {
      svLocale: sv,
      form: {
        date: new Date(),
        time: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }), // Default to current time
        student: null,
        location: '',
        info: '' // 👈 Add info to form data
      },
      students: [], // Här lagras eleverna
    };
  },
  computed: {
    userRole() {
      return this.$store.getters.userRole || 'guest';
    },
    username() {
      return this.$store.state.user?.username || this.$store.state.user?.email || 'Okänd';
    },
    eventTitle() {
      // Format: "Username, Role"
      if (this.userRole === 'syv') {
        return `${this.username}, Syv`;
      } else if (this.userRole === 'specped') {
        return `${this.username}, Special Pedagog`;
      } else if (this.userRole === 'admin' || this.userRole === 'systemadmin') {
        // For admins, use the bookedByRole prop if available, otherwise use role
        const roleLabel = this.bookedByRole === 'syv' ? 'Syv' : 
                         this.bookedByRole === 'specped' ? 'Special Pedagog' : 
                         this.userRole === 'systemadmin' ? 'Systemadmin' : 'Admin';
        return `${this.username}, ${roleLabel}`;
      }
      // Fallback: use bookedByRole if provided
      if (this.bookedByRole) {
        const roleLabel = this.bookedByRole === 'syv' ? 'Syv' : 
                         this.bookedByRole === 'specped' ? 'Special Pedagog' : 
                         this.bookedByRole;
        return `${this.username}, ${roleLabel}`;
      }
      return 'Möte';
    },
    bookedByValue() {
      // ALWAYS prioritize bookedByRole prop if provided (for route-based booking context)
      // This ensures that when booking from specped/appointments, it's treated as specped
      // and when booking from syv/appointments, it's treated as syv, regardless of who books it
      if (this.bookedByRole) {
        return this.bookedByRole;
      }
      // For admins creating meetings without context, default to their role
      if (this.userRole === 'admin' || this.userRole === 'systemadmin') {
        return this.userRole;
      }
      // For syv/specped, use their role
      if (this.userRole === 'syv' || this.userRole === 'specped') {
        return this.userRole;
      }
      // Fallback
      return this.userRole;
    }
  },
  mounted() {
    this.fetchStudents();
  },
  methods: {
    filterStudents(value, query, item) {
      if (!query || !query.trim()) return true;
      
      const searchQuery = query.toLowerCase().trim();
      
      // Debug: log what we're receiving
      console.log('🔍 Filter called:', { value, query, item, itemRaw: item?.raw });
      
      // In Vuetify 3 with return-object, try different ways to access the student
      let student = item?.raw || item?.value || item || value;
      
      // If value is an object with name property, it might be the student itself
      if (value && typeof value === 'object' && value.name && !student?.name) {
        student = value;
      }
      
      if (!student || !student.name) {
        console.log('❌ No student found in filter');
        return false;
      }
      
      // Use searchText if available
      if (student.searchText) {
        const matches = student.searchText.includes(searchQuery);
        console.log('✅ Using searchText:', student.searchText, 'matches:', matches);
        return matches;
      }
      
      // Fallback: search in individual fields
      const name = (student.name || '').toLowerCase();
      const personalNumber = (student.personalNumber || '').toLowerCase();
      const displayName = (student.displayName || '').toLowerCase();
      
      const matches = name.includes(searchQuery) || 
             personalNumber.includes(searchQuery) || 
             displayName.includes(searchQuery);
      
      console.log('✅ Search result:', { name, searchQuery, matches });
      return matches;
    },
    async fetchStudents() {
      try {
        const response = await api.get('/students');
        console.log('📦 Elever hämtade:', response.data); // 👈 Lägg till detta

        const data = response.data;

        this.students = (Array.isArray(data) ? data : [])
          .filter(s => !s.dropout) // uteslut avhoppade elever
          .map(s => ({
            _id: s._id,
            name: s.name,
            personalNumber: s.personalNumber || "",
            // Include both name and personalNumber in displayName for better search
            displayName: `${s.name} (${s.personalNumber || ''})`,
            // Add searchable text that includes name parts for partial matching
            searchText: `${s.name} ${s.personalNumber || ''}`.toLowerCase()
          }));
      } catch (error) {
        console.error("Kunde inte hämta elever:", error);
      }
    },
    async submit() {
      if (!this.form.student || !this.form.student._id) {
        alert("Välj en elev.");
        return;
      }

      // Combine date and time
      const [hours, minutes] = this.form.time.split(':');
      const combinedDateTime = new Date(this.form.date);
      combinedDateTime.setHours(parseInt(hours), parseInt(minutes));

      // Determine title based on role and context
      let meetingTitle = this.eventTitle;
      
      // For admin/systemadmin booking from calendar (no specific bookedByRole), use "Möte, Student name"
      if ((this.userRole === 'admin' || this.userRole === 'systemadmin') && 
          !this.bookedByRole) {
        meetingTitle = `Möte, ${this.form.student.name}`;
      }

      const bookedBy = this.bookedByValue;
      console.log('🔍 Booking context:', {
        userRole: this.userRole,
        bookedByRole: this.bookedByRole,
        bookedByValue: bookedBy,
        context: this.bookedByRole ? `Booking from ${this.bookedByRole} view` : 'Booking from calendar'
      });

      const payload = {
        title: meetingTitle,
        start: combinedDateTime.toISOString(), // Convert to ISO string for backend
        location: this.form.location || '',
        studentId: this.form.student._id,
        studentName: this.form.student.name,
        personalNumber: this.form.student.personalNumber || '',
        bookedBy: bookedBy, // Use the computed value which prioritizes bookedByRole
        info: this.form.info || '' // 👈 Add info to payload
      };

      console.log('📤 Sending payload:', payload);

      try {
        const response = await api.post('/meetings', payload, { withCredentials: true });
        const savedMeeting = response.data;
        console.log('✅ Möte sparat:', savedMeeting);

        // Use the saved meeting data from backend to ensure proper formatting
        this.$emit('event-added', savedMeeting);

        this.$emit('close');
      } catch (err) {
        console.error('❌ Kunde inte spara mötet:', err);
        const errorMessage = err.response?.data?.error || err.message || 'Okänt fel';
        alert(`Kunde inte spara mötet: ${errorMessage}`);
      }
    }
  }
};
</script>


<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  min-width: 300px;
}
.modal-content label {
  display: block;
  margin-top: 1rem;
}
.modal-content input, .modal-content textarea, .modal-content .time-input {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.25rem;
  box-sizing: border-box; /* Ensures padding doesn't affect width */
  border: 1px solid #ccc; /* Example border */
  border-radius: 4px; /* Example border radius */
}
.modal-content input, .modal-content textarea {
  width: 100%;
  padding: 0.5rem;
  margin-top: 0.25rem;
}
.modal-buttons {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.modal-buttons button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  background: #007bff;
  color: white;
  cursor: pointer;
}
.modal-buttons button:hover {
  background: #0056b3;
}
</style>
