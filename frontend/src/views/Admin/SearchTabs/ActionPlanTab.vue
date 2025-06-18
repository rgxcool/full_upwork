<template>
    <section class="action-plan-container">  
      <form @submit.prevent="submitPlan" ref="formRef" class="form-card">

        <h2 class="title">Handlingsplan</h2>

        <div class="form-group">
          <label>Ansvarig lärare</label>
          <input v-model="plan.teacherName" type="text" required />
        </div>
  
        <div class="form-group">
          <label>Datum</label>
          <input v-model="plan.date" type="date" required />
        </div>
  
        <div class="form-group">
          <label>Orsak till handlingsplan</label>
          <textarea v-model="plan.reason" rows="2" required />
        </div>
  
        <div class="form-section">
          <h3>Skolans / Lärarens insatser</h3>
          <div v-for="(option, index) in schoolEfforts" :key="index">
            <label><input type="checkbox" :value="option" v-model="plan.schoolEfforts" /> {{ option }}</label>
          </div>
        </div>
  
        <div class="form-section">
          <h3>Elevens insatser</h3>
          <div v-for="(option, index) in studentEfforts" :key="index">
            <label><input type="checkbox" :value="option" v-model="plan.studentEfforts" /> {{ option }}</label>
          </div>
        </div>
  
        <div class="form-group">
          <label>Rekommenderad studietid</label>
          <input v-model="plan.studyTime" type="text" />
        </div>
  
        <div class="form-section">
          <h3>Möte med</h3>
          <label><input type="checkbox" value="Specialpedagog" v-model="plan.meetings" /> Specialpedagog</label>
          <label><input type="checkbox" value="Studie- och yrkesvägledare" v-model="plan.meetings" /> Studie- och yrkesvägledare</label>
          <label><input type="checkbox" value="Elevhälsoteam" v-model="plan.meetings" /> Elevhälsoteam</label>
        </div>
  
        <div class="form-section">
          <h3>Eleven har meddelats</h3>
          <label><input type="checkbox" value="Skriftligt" v-model="plan.notified" /> Skriftligt</label>
          <label><input type="checkbox" value="Muntligt" v-model="plan.notified" /> Muntligt</label>
        </div>

        <button class="btn btn-primary" type="submit">Spara & Ladda ner PDF</button>

      </form>

    </section>
  </template>
  
  <script setup>
  import { ref, computed } from 'vue'
  import html2pdf from 'html2pdf.js'
  import axios from 'axios'
  
  const props = defineProps(['userData']);

  const fEducationArray = computed(() =>
    props.userData.education.filter(edu => edu.grade === 'F' && edu.locked === true)
  );

  const selectedEducation = computed(() => fEducationArray.value[0]);


  const plan = ref({
    teacherName: '',
    date: '',
    reason: '',
    schoolEfforts: [],
    studentEfforts: [],
    studyTime: '',
    meetings: [],
    notified: []
  })
  
  const schoolEfforts = [
    'Tydliggöra lektionsmål och förväntningar.',
    'Erbjuda extra handledning och stöd vid behov.',
    'Implementera olika undervisningsmetoder för att möta elevens inlärningsstil.',
    'Regelbunden uppföljning av elevens framsteg.',
    'Anpassa undervisningen för att inkludera visualisering eller interaktiva verktyg.',
    'Erbjuda möjligheter till grupparbete och samarbete för ökad engagemang.'
  ]
  
  const studentEfforts = [
    'Förkunskaper: Identifiera och arbeta med eventuella kunskapsluckor.',
    'Närvaro: Sträva efter att förbättra närvaron på lektionerna.',
    'Fokusera på uppgifter: Träna på att behålla fokus under arbetspass.',
    'Starta upp nya arbetsmoment: Utveckla strategier för att komma igång med nya ämnen.',
    'Avsluta/lämna in uppgifter: Arbeta på att organisera och slutföra uppgifter i tid.',
    'Struktur/planering/organisation: Utveckla en personlig studieplan.',
    'Be om hjälp: Aktivt söka stöd från lärare vid behov.',
    'Arbeta koncentrerat längre stunder: Gradvis öka arbetsperioderna med ökad koncentration.',
    'Läs- och skrivförmåga: Träna på att förbättra läs- och skrivfärdigheter.',
    'Övrigt: Identifiera och arbeta med eventuella specifika utmaningar. T.ex., stresshantering, tidsstyrning, etc.'
  ]
  
  const formRef = ref(null)
  
  const submitPlan = async () => {
    // Här kan du lägga till axios.post för att spara till servern
  
    // Generera PDF

    try {

      await axios.post(
      `${import.meta.env.VITE_API_URL}/api/save-actionplan`,
      {
        ...plan.value,
        studentId: props.userData._id,
        educationId: selectedEducation.value._id, // om du har unikt id på education
        refId: selectedEducation.value.refId,
        type: selectedEducation.value.type, 
      }
    );

    const options = {
      margin: 10,
      filename: `handlingsplan-${plan.value.teacherName || 'elev'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }
  
    html2pdf().set(options).from(formRef.value).save()
      } catch (error) {
          console.error('Error generating PDF:', error)
      }
  }
  </script>
  
  <style scoped>
  .action-plan-container {
    padding: 2rem;
    max-width: 900px;
    margin: auto;
  }
  
  .title {
    font-size: 1.8rem;
    margin-bottom: 1.5rem;
    font-weight: 600;
    text-align: center;
  }
  
  .form-card {
    background: #fff;
    padding: 2rem;
    border-radius: 1rem;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
  }
  
  .form-group input,
  .form-group textarea {
    padding: 0.5rem;
    border-radius: 0.4rem;
    border: 1px solid #ccc;
  }
  
  .form-section {
    margin-top: 1.5rem;
    border-top: 1px solid #eee;
    padding-top: 1rem;
  }
  
  .form-section h3 {
    margin-bottom: 0.5rem;
    font-size: 1.1rem;
  }
  
  .form-section label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  
  .btn-primary {
    background-color: #007bff;
    color: white;
    padding: 0.6rem 1.2rem;
    font-weight: bold;
    border: none;
    border-radius: 0.4rem;
    cursor: pointer;
    margin-top: 1rem;
  }


  </style>
  