<template>
    <div class="modal">
      <div class="modal-content">
        <h3>Lägg till nytt event</h3>
  
        <label>Datum:</label>
        <DatePicker v-model="date" :auto-apply="true" />
  
        <label>Lärare:</label>
        <v-autocomplete
        v-model="selectedTeacher"
        :items="teachers"
        item-title="name"
        label="Välj lärare"
        outlined
        clearable
        :no-data-text="'Inga lärare tillgängliga'"
        :menu-props="{ maxHeight: '300px' }"
        return-object
        />



  
        <label>Typ:</label>
        <select v-model="type">
          <option value="exam">Slutprov</option>
          <option value="general">Övrigt</option>
        </select>
  
        <div class="buttons">
          <button @click="$emit('close')">Avbryt</button>
          <button @click="submitEvent">Spara</button>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import DatePicker from "@vuepic/vue-datepicker";
  import axios from "axios";
  
  export default {
    components: { DatePicker },
    props: ["teachers"],
    
    data() {
      return {
        date: new Date(),
        selectedTeacher: null,
        type: "general",
      };
    },
    methods: {
        async submitEvent() {
            if (!this.selectedTeacher) {
                alert("Välj en lärare först.");
                return;
            }

            const { data: students } = await axios.get(
                `${import.meta.env.VITE_API_URL}/api/students/by-teacher/${this.selectedTeacher.id}`
            );

            const event = {
                start: this.date,
                color: this.selectedTeacher.color || "grey",
                extendedProps: {
                teacher: this.selectedTeacher.name,
                teacherId: this.selectedTeacher.id,
                type: this.type,
                students, // 🔥 nu korrekt!
                },
            };

            await axios.post(`${import.meta.env.VITE_API_URL}/api/calendar-color`, event);

            this.$emit("event-added", event);
            this.$emit("close");
            this.$emit("update"); // så ExamCalendar kan hämta events igen

        }
    },
  };
  </script>
  
  <style scoped>
  .modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal-content {
    background: white;
    padding: 20px;
    border-radius: 12px;
    width: 400px;
  }
  .buttons {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }
  </style>
  