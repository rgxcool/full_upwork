<template>
    <div v-if="data" class="details-container">
      <h2>{{ data.name || data.username }}</h2>
      <p v-if="data.email"><strong>Email:</strong> {{ data.email }}</p>
      <p v-if="data.studentId"><strong>Student ID:</strong> {{ data.studentId }}</p>
      <p v-if="data.description"><strong>Beskrivning:</strong> {{ data.description }}</p>
      <p v-if="data.role"><strong>Roll:</strong> {{ data.role }}</p>
      <p v-if="data.colorCode"><strong>Färgkod:</strong> {{ data.colorCode }}</p>
      <button @click="goBack" class="back-btn">Tillbaka</button>
    </div>
    <div v-else class="loading">
      <p>Laddar information...</p>
    </div>
  </template>
  
  <script>
  import { ref, onMounted } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import axios from "axios";
  
  export default {
    setup() {
      const route = useRoute();
      const router = useRouter();
      const data = ref(null);
  
    
    
      onMounted(async () => {
        const { type, id } = route.params;
        console.log("🔍 Requesting details for:", type, id); // ✅ Logga ut vad vi skickar till backend

        try {
            const response = await axios.get(`http://localhost:5001/api/details/${type}/${id}`);
            data.value = response.data;
            console.log("✅ Data received:", response.data); // ✅ Logga ut datan vi får tillbaka
        } catch (error) {
            console.error("error:", error);
        }
    });

      const goBack = () => {
        router.push("/");
      };
  
      return { data, goBack };
    },
  };
  </script>
  
  <style scoped>
  .details-container {
    max-width: 600px;
    margin: 40px auto;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #fff;
  }
  
  h2 {
    margin-bottom: 10px;
  }
  
  .loading {
    text-align: center;
    font-size: 18px;
  }
  
  .back-btn {
    background: blue;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 5px;
    cursor: pointer;
  }
  
  .back-btn:hover {
    background: darkblue;
  }
  </style>
  