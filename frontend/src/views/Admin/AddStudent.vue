<template>
  <div>
    <br />
    <h1>Lägg till ny elev</h1>
    <br />

    <!-- Form Selection -->
    <div class="btn-group" role="group" aria-label="Form Selection">
      <button class="btn btn-primary" @click="formType = 'Kurs'" :disabled="formType === 'Kurs'">Kurs</button>
      <button class="btn btn-primary" @click="formType = 'Kurspaket'" :disabled="formType === 'Kurspaket'">
        Kurspaket
      </button>
    </div>

    <br />
    <br />
    <!-- Kurs Form -->
    <form v-if="formType === 'Kurs'" @submit.prevent="submitKursForm" @keydown.enter="handleEnterKey">
      <!-- Name -->
      <div class="mb-3">
        <label for="name" class="form-label">Namn:</label>
        <input type="text" id="name" v-model="kursForm.namn" class="form-control" required />
      </div>

      <!-- Personnummer -->
      <div class="mb-3">
        <label for="personnummer" class="form-label">Personnummer:</label>
        <input type="text" id="personnummer" v-model="kursForm.personnummer" class="form-control" required />
      </div>

      <!-- Kurspaket -->
      <div class="mb-3">
        <label for="kurspaket" class="form-label">Kurspaket:</label>
        <input type="text" id="kurspaket" v-model="kursForm.kurspaket" class="form-control" />
      </div>

      <!-- Start Date -->
      <!-- <div class="mb-3">
        <label for="startDatum" class="form-label">Start Date:</label>
        <input
          type="text"
          id="startDatum"
          v-model="kursForm.startDatum"
          placeholder="yyyy-mm-dd"
          class="form-control"
          @input="calculateEndDate"
          required
        />
      </div> -->

      <!-- Startdatum -->
      <div class="mb-3 position-relative">
        <label for="startDatum" class="form-label">Startdatum:</label>

        <div class="datepicker-container">
          <Datepicker
            v-model="kursForm.startDatum"
            :text-input="textInputOptions"
            :format="'yyyy-MM-dd'"
            class="form-control-datepicker"
            placeholder="yyyy-mm-dd"
            :teleport="false"
            :position="'bottom-start'"
            :enable-time-picker="false"
            ref="startDatepickerRef"
            @keydown.enter.prevent="handleDatepickerEnter"
            @input="calculateEndDate"
          />

          <!-- Clickable Calendar Icon -->
          <span class="calendar-icon" @click="openDatepicker('startDatepickerRef')"> 📅 </span>
        </div>
      </div>

      <!-- Duration -->
      <label class="form-label">Studietakt:</label>
      <div class="mb-3">
        <label>
          <input
            type="radio"
            value="5"
            v-model="kursForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          5 v (100%)
        </label>
        <br />
        <label>
          <input
            type="radio"
            value="10"
            v-model="kursForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          10 v (50%)
        </label>
        <br />
        <label>
          <input
            type="radio"
            value="20"
            v-model="kursForm.duration"
            class="form-check-input"
            @change="calculateEndDate"
            required
          />
          20 v (25%)
        </label>
      </div>

      <!-- End Date -->
      <div class="mb-3">
        <p>Slutdatum: {{ kursForm.slutDatum.split('T')[0] }}</p>
      </div>

      <!-- Municipality -->
      <div class="mb-3">
        <label for="kommun" class="form-label">Kommun:</label>
        <input type="text" id="kommun" v-model="kursForm.kommun" class="form-control" required />
      </div>

      <!-- Phone Number -->
      <div class="mb-3">
        <label for="telefon" class="form-label">Tel:</label>
        <input type="text" id="telefon" v-model="kursForm.telefon" class="form-control" required />
      </div>

      <!-- Email -->
      <div class="mb-3">
        <label for="mail" class="form-label">Email:</label>
        <input type="email" id="mail" v-model="kursForm.mail" class="form-control" required />
      </div>

      <!-- Final Test Date -->
      <div class="mb-3 position-relative">
        <label for="slutprovDatum" class="form-label">Slutprov:</label>

        <div class="datepicker-container">
          <Datepicker
            v-model="formattedFinalTestDate"
            :text-input="textInputOptions"
            :format="'yyyy-MM-dd HH:mm'"
            class="form-control-datepicker"
            placeholder="yyyy-mm-dd HH:MM"
            :teleport="false"
            :position="'bottom-start'"
            time-picker-inline
            ref="finalTestDatepickerRef"
            @keydown.enter.prevent="handleDatepickerEnter"
          />

          <!-- Clickable Calendar Icon -->
          <span class="calendar-icon" @click="openDatepicker('finalTestDatepickerRef')"> 📅 </span>
        </div>
      </div>

      <!-- Exam -->
      <div class="mb-3">
        <label for="prov" class="form-label">Prov:</label>
        <input type="text" id="prov" v-model="kursForm.prov" class="form-control" />
      </div>

      <!-- Other Details -->
      <div class="mb-3">
        <label for="ovrigt" class="form-label">Annat:</label>
        <textarea id="ovrigt" v-model="kursForm.ovrigt" class="form-control"></textarea>
      </div>

      <!-- Teacher -->
      <div class="mb-3">
        <label for="teacher" class="form-label">Lärare:</label>
        <input type="text" id="teacher" v-model="kursForm.teacher" class="form-control" />
      </div>

      <!-- Dropout -->
      <!-- <div class="mb-3">
        <label>
          <input type="checkbox" v-model="kursForm.dropOut" class="form-check-input" />
          Drop Out
        </label>
      </div> -->

      <!-- Submit Button -->
      <button type="submit" class="btn btn-success">Lägg till elev</button>
    </form>
  </div>
</template>

<script>
  import axios from 'axios'
  import Datepicker from '@vuepic/vue-datepicker'
  import '@vuepic/vue-datepicker/dist/main.css'

  export default {
    components: {
      Datepicker,
    },
    data() {
      return {
        formType: 'Kurs',
        kursForm: {
          namn: '',
          personnummer: '',
          kurspaket: '',
          startDatum: '',
          duration: null,
          slutDatum: '',
          kommun: '',
          telefon: '',
          mail: '',
          prov: '',
          ovrigt: '',
          slutprovDatum: '',
          dropout: false,
          teacher: '',
        },
        formattedFinalTestDate: null,
        textInputOptions: {
          enterSubmit: true,
          tabSubmit: true,
          openMenu: true,
        },
      }
    },
    watch: {
      formattedFinalTestDate(newVal) {
        if (newVal && !isNaN(new Date(newVal).getTime())) {
          this.kursForm.slutprovDatum = new Date(newVal).toISOString()
        }
      },
    },
    methods: {
      handleDatepickerEnter(event) {
        event.stopPropagation() // Prevent Enter from propagating to the form
        event.preventDefault() // Prevent default form submission behavior
      },
      openDatepicker(refName) {
        if (this.$refs[refName]) {
          this.$refs[refName].openMenu() // Opens the correct Datepicker
        }
      },
      handleEnterKey(event) {
        const insideDatepicker = event.target.closest('.dp__input') !== null
        if (!insideDatepicker) {
          event.preventDefault()
        }
      },
      calculateEndDate() {
        if (!this.kursForm.startDatum || isNaN(new Date(this.kursForm.startDatum).getTime())) {
          this.kursForm.slutDatum = ''
          this.kursForm.slutprovDatum = ''
          return // Stop execution if start date is empty or invalid
        }

        if (!this.kursForm.duration) {
          return // Stop execution if study duration is not selected
        }

        const startDate = new Date(this.kursForm.startDatum)
        const durationDays = this.kursForm.duration * 7
        const endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + durationDays - 3)
        this.kursForm.slutDatum = endDate.toISOString()
      },
      async submitKursForm() {
        if (!this.kursForm.namn || !this.kursForm.personnummer || !this.kursForm.startDatum || !this.kursForm.mail) {
          alert('Please fill in all required fields!')
          return
        }

        try {
          await axios.post(`${import.meta.env.VITE_API_URL}/api/student`, this.kursForm)
          alert('Eleven blev tillagd!')

          //  Reset form fields after successful submission
          this.kursForm = {
            namn: '',
            personnummer: '',
            kurspaket: '',
            startDatum: '',
            duration: null,
            slutDatum: '',
            kommun: '',
            telefon: '',
            mail: '',
            prov: '',
            ovrigt: '',
            slutprovDatum: '',
            dropout: false,
            teacher: '',
          }

          this.formattedFinalTestDate = null //  Reset the final test date
        } catch (error) {
          alert('Kunde inte lägga till Elev. Något gick fel. Försök igen.')
        }
      },
    },
  }
</script>

<style scoped>
  form {
    max-width: 400px;
    margin: 0 auto;
  }

  .form-control,
  .form-control-datepicker {
    max-width: 400px;
    width: 100%;
  }

  .datepicker-container {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 400px;
  }

  .calendar-icon {
    position: absolute;
    right: 10px;
    cursor: pointer;
    font-size: 1.2rem;
  }
</style>
