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
        <button class="btn btn-primary" style="width: 100%; color: white" type="submit">
          LOGGA IN
        </button>
      </form>
      <p v-if="message" class="error-message">{{ message }}</p>
    </div>
  </div>
</template>

<script>
  import { ref } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'

  export default {
    setup() {
      const store = useStore()
      const router = useRouter()

      const email = ref('')
      const password = ref('')
      const message = ref('')
      const showLoginDialog = ref(true) // ✅ must be here

      const handleLogin = async () => {
        const result = await store.dispatch('login', {
          email: email.value,
          password: password.value,
        })

        console.log('🎯 Login result:', result)

        if (result.success) {
          router.push('/profile')
        } else {
          message.value = result.message
        }
      }
      return {
        email,
        password,
        message,
        handleLogin,
        showLoginDialog,
      }
    },
  }
</script>

<style scoped>
  /* Error Message */
  .error-message {
    color: red;
    margin-top: 10px;
  }

  /* Login Container */
  .login-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center; /* vertical center of login box */
    height: 100vh;
    padding-top: 80px; /* gives space for logo */
    position: relative;
  }

  .logo-container {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
  }

  .logo {
    margin-top: 30px;
    height: 122px; /* or whatever size you want */
  }

  /* Login Box */
  .login-box {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  /* Input Fields */
  input {
    width: 100%;
    padding: 10px;
    margin: 10px 0;
    border: 1px solid #ccc;
    border-radius: 5px;
    font-size: 1rem;
  }

  /* Login Button */
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

  /* Mobile Optimization */
  @media (max-width: 768px) {
    .login-container {
      flex-direction: column;
      text-align: center;
    }
  }
</style>
