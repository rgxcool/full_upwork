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
  import { ref, computed } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'

  export default {
    setup() {
      const store = useStore()
      const router = useRouter()

      const email = ref('')
      const password = ref('')
      const message = ref('')

      const isVuexWorking = computed(() => typeof store.dispatch === 'function')

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
    margin-top: 20px;
    padding: 20px;
    background-color: #ffffff;
  }

  /* Login Box */
  .login-box {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
    width: 350px;
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
