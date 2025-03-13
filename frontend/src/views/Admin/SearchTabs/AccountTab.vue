<template>
    <div class="account-info">
        
      <h3>
        Användarinformation
      </h3>
      <section v-if="userType === 'Elev'">
      <div class="info-item">
        <strong>Namn:</strong> {{ userData?.name || "Ej tillgänglig" }}
      </div>
      <div class="info-item">
        <strong>Personnummer:</strong> {{ userData?.personalNumber || "Ej tillgänglig" }}
      </div>
      <div class="info-item" v-if="userData?.email">
        <strong>Email:</strong> {{ userData.email }}
      </div>
      <div class="info-item" v-if="userData?.phone">
        <strong>Telefon:</strong> {{ userData.phone }}
      </div>
      <div class="info-item" v-if="userData?.municipality">
        <strong>Folkbokföringskommun:</strong> {{ userData.municipality }}
      </div>
    </section>

      <!-- För Lärare och Övrig Personal -->
      <section v-else>
        <div class="info-item">
          <strong>Namn:</strong> {{ userData?.username || "Ej tillgänglig" }}
        </div>
        <div class="info-item">
          <strong>Email:</strong> {{ userData?.email || "Ej tillgänglig" }}
        </div>
      </section>   
    </div>
  </template>
  
  <script>
  export default {
    props: {
      userData: Object, // Tar emot userData som prop
      userType: String // Tar emot userType som prop
    },
    mounted() {
      console.log(this.userType)
    }
  };
  </script>
  
  <style scoped>
  .account-info {
    padding: 20px;
  }
  .info-item {
    margin-bottom: 10px;
    font-size: 16px;
    color: #333;
  }
  h3 {
    padding-bottom: 10px;
    margin-bottom: 15px;
    font-size: 20px;
  }
  </style>
  