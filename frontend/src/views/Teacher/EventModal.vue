<template>
    <div v-if="event" class="modal fade show d-block" tabindex="-1" role="dialog"
         style="background: rgba(0, 0, 0, 0.5);">
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ event.teacher || 'Okänd lärare' }}</h5>
            <button type="button" class="btn-close" @click="closeModal"></button>
          </div>
  
          <div class="modal-body">
            <h5>Studenter kopplade till detta prov</h5>
            <table class="table table-striped">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th>Personnummer</th>
                  <th>Närvaro</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(student, index) in event.students" :key="index">
                  <td>{{ student.name }}</td>
                  <td>{{ student.personalNumber }}</td>
                  <td>
                    <input type="checkbox"
                           v-model="student.attended"
                           @change="markAttendance(student._id, student.attended)"
                           :disabled="student.attended">                
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
  
          <div class="modal-footer">
            <form @submit.prevent="submitExam" class="exam-form">
              <label>Välj provtid:</label>
              <input type="time" v-model="examTime" required />
  
              <label>Välj kommun:</label>
              <select v-model="examMunicipality">
                <option v-for="(locations, municipality) in examMunicipalities" :key="municipality" :value="municipality">
                  {{ municipality }}
                </option>
              </select>
  
              <label>Välj provplats:</label>
              <select v-model="examLocation">
                <option v-for="location in examMunicipalities[examMunicipality]" :key="location" :value="location">
                  {{ location }}
                </option>
              </select>
  
              <button type="submit" class="btn btn-primary">Spara prov</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  import axios from "axios";
  
  export default {
    props: ["event"],
    data() {
      return {
        examTime: this.event ? this.event.examTime : "",
        examMunicipality: this.event ? this.event.examMunicipality : "",
        examLocation: this.event ? this.event.examLocation : "",
        examMunicipalities: {
          Sollentuna: ["308", "310", "lilla rummet", "Aniara", "Kung Agnes"],
          Akalla: ["Vision", "Hässja", "Arkarli", "316"],
        },
      };
    },
    methods: {
      closeModal() {
        this.$emit("close");
      },
  
      async markAttendance(studentId, attended) {
        try {
          await axios.put(`http://localhost:5001/api/mark-attendance/${studentId}`, { attended });
          console.log("✅ Närvaro uppdaterad!");
        } catch (error) {
          console.error("❌ Fel vid uppdatering av närvaro:", error.response?.data || error.message);
        }
      },
  
      async submitExam() {
        try {
          if (!this.examTime || !this.examMunicipality || !this.examLocation) {
            alert("Välj tid, kommun och plats för provet.");
            return;
          }
  
          await axios.put(`http://localhost:5001/api/update-exam/${this.event.id}`, {
            date: this.event.date,
            examTime: this.examTime,
            examMunicipality: this.examMunicipality,
            examLocation: this.examLocation,
          });
  
          console.log("✅ Slutprov uppdaterat!");
          this.closeModal();
        } catch (error) {
          console.error("❌ Fel vid uppdatering av prov:", error.response?.data || error.message);
        }
      }
    }
  };
  </script>
  
  <style>
  .modal {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  </style>
  