<template>
  <div class="modal-backdrop">
    <div class="modal-content">
      <h2>Boka möte</h2>

      <label>Datum:</label>
      <DatePicker
        v-model="form.date"
        :enable-time="true"
        :locale="svLocale"
        :auto-apply="true"
      />

    <label>Elev:</label>
    <v-autocomplete
      v-model="form.student"
      :items="students"
      item-title="name"
      item-value="_id"
      label="Välj elev"
      outlined
      clearable
      return-object
      :no-data-text="'Inga elever tillgängliga'"
      :menu-props="{ maxHeight: '300px' }"
      :item-props="true"
      :item-title="item => `${item.name} (${item.personalNumber})`"
    />

      <label>Plats:</label>
      <input v-model="form.location" placeholder="T.ex. Samtalsrum A" />

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
import axios from 'axios'

export default {
  components: { DatePicker },
  data() {
    return {
      svLocale: sv,
      form: {
        date: new Date(),
        student: '',
        location: '',
      },
      students: [], // Här lagras eleverna
    };
  },
  computed: {
    userRole() {
      return this.$store.getters.userRole || 'guest';
    },
    eventTitle() {
      return this.userRole === 'syv'
        ? 'Möte SYV & elev'
        : 'Möte Specped & elev';
    }
  },
  mounted() {
    this.fetchStudents();
  },
  methods: {
    async fetchStudents() {
      try {
        const response = await axios.get('/api/students');
            console.log('📦 Elever hämtade:', response.data); // 👈 Lägg till detta

        const data = response.data;

        this.students = (Array.isArray(data) ? data : [])
          .filter(s => !s.dropout) // uteslut avhoppade elever
          .map(s => ({
            _id: s._id,
            name: s.name,
            personalNumber: s.personalNumber || "",
          }));
      } catch (error) {
        console.error("Kunde inte hämta elever:", error);
      }
    },
    async submit() {
      if (!this.form.student) {
        alert("Fyll i elevens namn eller personnummer.");
        return;
      }

      const payload = {
        title: this.eventTitle,
        start: this.form.date, // Date inklusive tid
        location: this.form.location,
        studentId: this.form.student._id,
        studentName: this.form.student.name,
        personalNumber: this.form.student.personalNumber,
        bookedBy: this.userRole
      };

      try {
        const response = await axios.post('/api/meetings', payload);
        console.log('✅ Möte sparat:', response.data);

        this.$emit('event-added', {
          title: payload.title,
          start: payload.start,
          allDay: false,
          color: '#999999',
          extendedProps: {
            ...payload
          }
        });

        this.$emit('close');
      } catch (err) {
        console.error('❌ Kunde inte spara mötet:', err);
        alert("Kunde inte spara mötet. Försök igen.");
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
.modal-content input {
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
