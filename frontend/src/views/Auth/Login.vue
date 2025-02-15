<template>
  <div class="login-container">
    <div class="logo-container">
      <img src="@/assets/mindful_transparent.png" alt="Mindful Logo" class="logo" />
    </div>

    <div class="login-box">
      <form @submit.prevent="handleLogin">
        <input
          type="text"
          placeholder="Ex. mail@gmail.com"
          v-model="email"
          required
          autocomplete="username"
        />
        <input
          type="password"
          placeholder="Lösenord"
          v-model="password"
          required
          autocomplete="current-password"
        />
        <button type="submit" class="login-btn">LOGGA IN</button>
      </form>
      <p v-if="message" class="error-message">{{ message }}</p>
    </div>
  </div>
</template>

<script>
  import { mapActions } from 'vuex'

  export default {
    data() {
      return {
        email: '',
        password: '',
        message: '',
      }
    },
    computed: {
      isVuexWorking() {
        return typeof this.$store.dispatch === 'function'
      },
    },
    methods: {
      ...mapActions(['login']),

      async handleLogin() {
        console.log('🛠 Checking Vuex Store:', this.$store)
        console.log('🛠 Is Vuex Working?', this.isVuexWorking)

        if (!this.isVuexWorking) {
          console.error('❌ Vuex is NOT properly registered! Check `main.js`.')
          return
        }

        console.log('🛠 Attempting to login with:', this.email, this.password)

        if (!this.email || !this.password) {
          console.error('❌ Missing email or password!')
          this.message = 'Please enter both email and password.'
          return
        }

        console.log('🛠 Calling Vuex login action...')

        try {
          const response = await this.login({ email: this.email, password: this.password })

          console.log(' Vuex login response:', response)

          if (!response || typeof response !== 'object') {
            console.error('❌ Invalid Vuex response:', response)
            this.message = 'Unexpected error occurred. Please try again.'
            return
          }

          this.message = response.message

          if (response.success) {
            console.log('🔄 Redirecting to Profile...')
            this.$router.push({ name: 'profile' })
          }
        } catch (error) {
          console.error('❌ Error in `handleLogin()`:', error)
          this.message = 'An unexpected error occurred.'
        }
      },
    },
  }
</script>

<style scoped>
  .error-message {
    color: red;
    margin-top: 10px;
  }
</style>

<style scoped>
  /* 🌟 Huvudlayout */
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 60vh;
    background-color: #f0f2f5;
    padding: 20px;
  }

  /* 🏠 Vänster sektion */
  .left-section {
    flex: 1;
    text-align: left;
    padding: 20px;
  }

  .logo {
    width: 250px;
    margin-bottom: 10px;
  }

  .left-section h2 {
    font-size: 1.5rem;
    font-weight: 400;
    color: #333;
  }

  /* 📦 Höger sektion */
  .right-section {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  /* 📋 Login-box */
  .login-box {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
    width: 350px;
  }

  /* 🔲 Input-fält */
  input {
    width: 100%;
    padding: 10px;
    margin: 10px 0;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 1rem;
  }

  /* 🔵 Login-knapp */
  .login-btn {
    width: 100%;
    background-color: #007dc3;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 5px;
    font-size: 1rem;
    cursor: pointer;
    transition: 0.3s;
  }

  .login-btn:hover {
    background-color: #005f9e;
  }

  /* 🔗 Glömt lösenord */
  .forgot-password {
    display: block;
    margin: 10px 0;
    color: #007dc3;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .forgot-password:hover {
    text-decoration: underline;
  }

  /* 🔳 Divider */
  .divider {
    margin: 15px 0;
    height: 1px;
    background: #ddd;
  }

  /* 🟢 Skapa konto-knapp */
  .create-account-btn {
    width: 100%;
    background-color: #42b72a;
    color: white;
    border: none;
    padding: 10px;
    border-radius: 5px;
    font-size: 1rem;
    cursor: pointer;
    transition: 0.3s;
  }

  .create-account-btn:hover {
    background-color: #36a420;
  }

  /* 📱 Mobilanpassning */
  @media (max-width: 768px) {
    .login-container {
      flex-direction: column;
      text-align: center;
    }

    .left-section {
      margin-bottom: 20px;
    }
  }

  .login-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 20px;
    /* Space from the top */
    padding: 20px;
    background-color: #ffffff;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 300px;
  }

  .input-field {
    width: 100%;
    padding: 10px;
    margin: 10px 0;
    font-size: 16px;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
  }

  .login-button {
    width: 100%;
    padding: 10px;
    font-size: 16px;
    color: #fff;
    background-color: #007bff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .login-button:hover {
    background-color: #0056b3;
  }

  .message {
    margin-top: 20px;
    color: #d9534f;
    /* Red for error messages */
  }

  body {
    background-color: #f8f9fa;
  }
</style>
