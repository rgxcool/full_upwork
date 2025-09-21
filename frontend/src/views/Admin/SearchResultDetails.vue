<template>
  <div class="scrollable-view">
    <div class="name-container">  
      Användarinformation: {{ data?.name }}
    </div>
    <section class="tab-container">
      <div class="tab-menu">

        <ul>
          <li 
            v-for="tab in tabs" 
            :key="tab" 
            @click="activeTab = tab" 
            :class="{ active: activeTab === tab }"
          >
            {{ tab }}
          </li>
        </ul>
      </div>
      <div class="content">
        <component :is="currentComponent" :userData="data" :userType="type"></component>
      </div>
    </section>
  </div>
</template>

<script>
import { ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import AccountTab from "@/views/Admin/SearchTabs/AccountTab.vue";
import StudyPlan from "@/views/Admin/SearchTabs/StudyPlan.vue";
import DocumentSection from "@/views/Admin/SearchTabs/DocumentSection.vue";
import ActionPlanTab from "@/views/Admin/SearchTabs/ActionPlanTab.vue";


export default {
  components: { AccountTab, StudyPlan, DocumentSection },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref(null);
    const activeTab = ref("Användare");

    const tabs = computed(() => {
      const baseTabs = ["Användare", "Studieplan", "Dokument"];
      const hasLockedF = data.value?.education?.some(
        edu => edu.grade === 'F' && edu.locked === true
      );

      if (hasLockedF) {
        baseTabs.push("Handlingsplan");
      }

      return baseTabs;
    });
    const fetchData = async () => {
      const { type, id } = route.params;
      console.log("🔍 Requesting details for:", type, id);
      console.log("🌐 API URL:", import.meta.env.VITE_API_URL);
      console.log("📍 Full URL:", `${import.meta.env.VITE_API_URL}/api/details/${type}/${id}`);

      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/details/${type}/${id}`, {
          withCredentials: true
        });
        data.value = response.data;
        console.log("✅ Data received:", response.data);
      } catch (error) {
        console.error("❌ Error fetching data:", error);
        console.error("❌ Error response:", error.response?.data);
        console.error("❌ Error status:", error.response?.status);
      }
    };

    onMounted(() => {
      fetchData().then(() => {
        if (route.query.showActionPlan === 'true') {
          activeTab.value = "Handlingsplan"
        }
      });
    });

    // Watch för att uppdatera datan när route ändras
    watch(() => route.params, fetchData, { deep: true });



    const currentComponent = computed(() => {
      switch (activeTab.value) {
        case "Studieplan": return StudyPlan;
        case "Dokument": return DocumentSection;
        case "Handlingsplan": return ActionPlanTab;
        default: return AccountTab;
      }
    });


    return { data, activeTab, tabs, currentComponent, type: route.params.type };
  },
};
</script>

<style scoped>
.tab-container {
  padding: 20px;
  height: 70vh;
}

.tab-menu {
  display: flex;
  gap: 20px;
  padding-bottom: 10px;
}

.tab-menu ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tab-menu li {
  font-size: 18px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  color: gray;
  transition: color 0.3s ease-in-out;
}

.tab-menu li.active {
  color: black;
  border-bottom: 3px solid black;
}

.content {
  margin-top: 20px;
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.name-container {
  font-size: 24px;
  font-weight: 600;
  padding: 40px;
  margin: 10px 0;
}

</style>