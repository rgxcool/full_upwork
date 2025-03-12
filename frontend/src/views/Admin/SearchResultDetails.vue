<template>
  <section style="background: #F8F8F8;">
  <div class="container">
    <nav class="top-menu">
      <ul>
        <li v-for="tab in tabs" :key="tab" @click="activeTab = tab" :class="{ active: activeTab === tab }">
          {{ tab }}
        </li>
      </ul>
    </nav>
    <div class="content">
      <component :is="currentComponent" :userData="data" :userType="type"></component>
    </div>
  </div>
</section>
</template>

<script>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import AccountTab from "@/views/Admin/SearchTabs/AccountTab.vue";
import StudyPlan from "@/views/Admin/SearchTabs/StudyPlan.vue";
import APLSection from "@/views/Admin/SearchTabs/APLSection.vue";

export default {
  components: { AccountTab, StudyPlan, APLSection },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const data = ref(null);
    const activeTab = ref("Account");

    const tabs = ["Account", "StudyPlan", "APL"];

    onMounted(async () => {
      const { type, id } = route.params;
      console.log("🔍 Requesting details for:", type, id);

      try {
        const response = await axios.get(`http://localhost:5001/api/details/${type}/${id}`);
        data.value = response.data;
        console.log("✅ Data received:", response.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    });

    const currentComponent = computed(() => {
      switch (activeTab.value) {
        case "StudyPlan": return StudyPlan;
        case "APL": return APLSection;
        default: return AccountTab;
      }
    });

    return { data, activeTab, tabs, currentComponent, type: route.params.type };
  },
};
</script>

<style scoped>
.container {
  padding: 20px;
  height: 70vh;
}
.top-menu {
  display: flex;
  background-color: white;
  padding: 15px 10px;
  border-radius: 10px;
}
.top-menu ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}
.top-menu li {
  padding: 10px 20px;
  cursor: pointer;
  font-weight: bold;
  transition: color 0.3s ease-in-out;
}
.top-menu li:hover {
  color: #007bff;
}
.top-menu li.active {
  border-bottom: 3px solid #007bff;
  color: #007bff;
}
.content {
  margin-top: 20px;
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}
h2 {
  font-size: 22px;
  color: #333;
  border-bottom: 2px solid #007bff;
  padding-bottom: 10px;
  margin-bottom: 20px;
}
</style>