<template>
    <body style="background-color: #f4f4f4; padding: 20px;">
        <h3 class="container p-4">Användare och åtkomstbehörigheter</h3>

      <div class="container bg-white p-4 rounded shadow-sm">
          <div class="mb-3 text-start">
              <router-link to="/lagg-till-anvandare" class="text-primary me-3">Lägg till ny användare</router-link>
              <router-link to="/importera-anvandare" class="text-primary">Importera användare från fil</router-link>
          </div>
          <form>
              <div class="row g-3">
                  <div class="col-md-5">
                      <label for="fornamn" class="form-label text-start">Förnamn</label>
                      <input type="text" id="fornamn" class="form-control" placeholder="Förnamn">
                  </div>
                  <div class="col-md-5">
                      <label for="efternamn" class="form-label text-start">Efternamn</label>
                      <input type="text" id="efternamn" class="form-control" placeholder="Efternamn">
                  </div>
                  <div class="col-md-5">
                      <label for="anvandarnamn" class="form-label text-start">Användarnamn</label>
                      <input type="text" id="anvandarnamn" class="form-control" placeholder="Användarnamn">
                  </div>
                  <div class="col-md-5">
                      <label for="datumperiod" class="form-label">Välj datumperiod</label>
                      <select id="datumperiod" class="form-select">
                          <option selected>Välj datumperiod</option>
                      </select>
                  </div>
                  <div class="col-md-5">
                      <label for="kurs" class="form-label">Kurs</label>
                      <select id="kurs" class="form-select">
                          <option selected>Alla kurser</option>
                      </select>
                  </div>
                  <div class="col-md-5">
                      <label for="hierarki" class="form-label">Hierarki</label>
                      <select id="hierarki" class="form-select">
                          <option selected>Alla hierarkier</option>
                      </select>
                  </div>
              </div>
              <div class="mt-3">
                  <label class="form-label">Sök efter</label>
                  <div class="d-flex flex-wrap">
                      <div class="form-check me-3">
                          <input type="checkbox" id="systemadmin" class="form-check-input">
                          <label for="systemadmin" class="form-check-label">Elev</label>
                      </div>
                      <div class="form-check me-3">
                          <input type="checkbox" id="admin" class="form-check-input">
                          <label for="admin" class="form-check-label">Lärare</label>
                      </div>
  
                  </div>
              </div>
              <div class="mt-3 text-start">
                  <button type="submit" class="btn btn-success">Sök</button>
              </div>
          </form>
      </div>
      </body>
  </template>
  
   
  <style scoped>  
  body {
      background-color: #f4f4f4;
  }
  
  /* Container för innehåll */
  .container {
      max-width: 1000px;
      padding: 20px;
      border-radius: 8px;
  }
  
  /* Rubrik */
  h3 {
      margin-bottom: 20px;
      text-align: left; /* Tvinga vänsterjustering */
  }
  
  /* Länkar */
  .action-links {
      text-align: left !important; /* Vänsterjusterade länkar */
      text-decoration: none;
  }
  
  .action-links a:hover {
      text-decoration: underline;
  }
  
  /* Etiketter (label) */
  label {
      text-align: left; /* Vänsterjustering */
      display: block; /* Gör att texten står ovanför fältet */
      margin-bottom: 5px;
  }
  
  input {
    text-align:left;
  }
  /* Formulärfält */
  .form-control,
  .form-select {
      max-width: 800px; /* Begränsa bredden */
      display: block;
      margin-bottom: 10px;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
  }
  
  /* Checkbox-grupp */
  .checkbox-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
  }
  
  .checkbox-group label {
      font-size: 0.9rem;
  }
  
  
  .btn {
      padding: 8px 15px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: white;
      font-weight: bold;
  }
  
  .btn-success {
      background-color: #28a745;
      border-color: #28a745;
  }
  
  .btn-success:hover {
      background-color: #218838;
  }
  
  </style>
  