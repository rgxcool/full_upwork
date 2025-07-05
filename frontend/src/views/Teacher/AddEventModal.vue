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
          <button type="button" @click="$emit('close')">Avbryt</button>
          <button type="button" @click="submitEvent">Spara</button>
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
            try {
                console.log("🚀 submitEvent körs");

                if (!this.selectedTeacher?.id) {
                console.warn("⚠️ Ingen lärare vald");
                return;
                }

                const { data: students } = await axios.get(
                `${import.meta.env.VITE_API_URL}/api/students/by-teacher/${this.selectedTeacher.id}`
                );

                const formattedStudents = students.map((s) => ({
                _id: s._id,
                name: s.name,
                personalNumber: s.personalNumber,
                additionalInfo: s.additionalInfo || "",
                attended: false,
                }));

                const event = {
                title: this.selectedTeacher?.name || "Okänd lärare",
                start: this.date,
                color: this.selectedTeacher?.color || "grey",
                extendedProps: {
                    teacher: this.selectedTeacher?.name,
                    teacherId: this.selectedTeacher?.id,
                    type: this.type,
                    examMunicipality: "",
                    examLocation: "",
                    examTime: "",
                    students: formattedStudents,
                },
                };

                console.log("📤 Skickar event:", event);

                console.log("🧾 Event att skicka:", JSON.stringify(event, null, 2));

                await axios.post(`${import.meta.env.VITE_API_URL}/api/calendar-events`, event);

                console.log("✅ Event skickat!");
                this.$emit("event-added", event);
                this.$emit("close");
            } catch (err) {
                console.error("❌ Fel vid sparning av event:", err.response?.data || err.message);
                alert("Kunde inte spara event. Kontrollera konsolen för mer info.");
            }
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
  