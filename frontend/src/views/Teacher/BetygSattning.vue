<template>
  <div class="container mt-4">
    <h2 class="mb-4">Betygshantering</h2>

    <!-- Fliknavigation -->
    <ul class="nav nav-tabs">
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'betygsattning' }" @click="activeTab = 'betygsattning'">Betygsättning</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'eleverMedBetyg' }" @click="activeTab = 'eleverMedBetyg'">Elever med betyg</button>
      </li>
      <li class="nav-item">
        <button class="nav-link" :class="{ active: activeTab === 'lastaBetyg' }" @click="activeTab = 'lastaBetyg'">Låsta betyg</button>
      </li>
    </ul>

    <!-- Flikinnehåll -->
    <div v-if="activeTab === 'betygsattning'" class="tab-content">
      <h4>Betygsättning</h4>
      <table class="table table-bordered" v-if="eleverAttBetygsatta.length > 0">
        <thead class="table-light">
          <tr>
            <th>Namn</th>
            <th>Personnummer</th>
            <th>Kurs</th>
            <th>Slutdatum</th>
            <th>Betyg</th>
            <th>Kommentar</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="elev in eleverAttBetygsatta" :key="elev._id">
            <td>{{ elev.namn }}</td>
            <td>{{ elev.personnummer }}</td>
            <td>{{ elev.kurspaket }}</td>
            <td>{{ new Date(elev.slutDatum).toLocaleDateString() }}</td>
            <td>
              <select v-model="elev.betyg.grade" class="form-select">
                <option value="">Välj betyg</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
                <option value="F">F</option>
              </select>
            </td>
            <td>
              <input v-model="elev.betyg.comments" placeholder="Kommentar" class="form-control" />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else>
        <p class="text-muted">Det finns inga elever att betygsätta just nu.</p>
      </div>
    </div>

    <div v-if="activeTab === 'eleverMedBetyg'" class="tab-content">
      <h4>Elever med betyg</h4>
      <table class="table table-bordered">
        <thead class="table-light">
          <tr>
            <th>Namn</th>
            <th>Personnummer</th>
            <th>Kurs</th>
            <th>Betyg</th>
            <th>Lås betyg</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="elev in eleverMedBetyg" :key="elev._id">
            <td>{{ elev.namn }}</td>
            <td>{{ elev.personnummer }}</td>
            <td>{{ elev.kurspaket }}</td>
            <td>{{ elev.betyg.grade }}</td>
            <td>
              <button class="btn btn-warning btn-sm" @click="lasaBetyg(elev)">Lås</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="activeTab === 'lastaBetyg'" class="tab-content">
      <h4>Låsta betyg</h4>
      <table class="table table-bordered">
        <thead class="table-light">
          <tr>
            <th>Namn</th>
            <th>Personnummer</th>
            <th>Kurs</th>
            <th>Betyg</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="elev in lastaBetyg" :key="elev._id">
            <td>{{ elev.namn }}</td>
            <td>{{ elev.personnummer }}</td>
            <td>{{ elev.kurspaket }}</td>
            <td>{{ elev.betyg.grade }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        activeTab: 'betygsattning', // Aktuell flik
        eleverAttBetygsatta: [],
        eleverMedBetyg: [],
        lastaBetyg: [],
      }
    },
    async mounted() {
      await this.hämtaData()
    },
    methods: {
      async hämtaData() {
        try {
          // Hämta elever att betygsätta
          const betygsattningResponse = await axios.get(`${import.meta.env.VITE_API_URL}/api/betygsattning`)
          this.eleverAttBetygsatta = betygsattningResponse.data

          // Hämta elever med betyg
          const eleverMedBetygResponse = await axios.get(`${import.meta.env.VITE_API_URL}/api/eleverMedBetyg`)
          this.eleverMedBetyg = eleverMedBetygResponse.data

          // Hämta låsta betyg
          const lastaBetygResponse = await axios.get(`${import.meta.env.VITE_API_URL}/api/lastaBetyg`)
          this.lastaBetyg = lastaBetygResponse.data
        } catch (error) {
          console.error('Error fetching data:', error)
        }
      },
      async sparaBetyg() {
        try {
          await axios.post(`${import.meta.env.VITE_API_URL}/api/betygsattning`, {
            elever: this.eleverAttBetygsatta,
          })
          alert('Betyg sparade!')
          await this.hämtaData() // Uppdatera data efter sparande
        } catch (error) {
          console.error('Error saving grades:', error)
        }
      },
      async lasaBetyg(elev) {
        try {
          await axios.post(`${import.meta.env.VITE_API_URL}/api/lasaBetyg`, {
            _id: elev._id,
          })
          alert('Betyg låst!')
          await this.hämtaData() // Uppdatera data efter låsning
        } catch (error) {
          console.error('Error locking grade:', error)
        }
      },
    },
  }
</script>

<style scoped>
  .nav-tabs .nav-link.active {
    background-color: #d9d9d9;
    color: white;
  }

  .nav-tabs .nav-link {
    cursor: pointer;
  }

  .table {
    text-align: center;
    vertical-align: middle;
  }
</style>
