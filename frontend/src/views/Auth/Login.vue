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
        console.log('🛠 Checking Vuex Store:', store)
        console.log('🛠 Is Vuex Working?', isVuexWorking.value)

        if (!isVuexWorking.value) {
          console.error('❌ Vuex is NOT properly registered! Check `main.js`.')
          return
        }

        console.log('🛠 Attempting to login with:', email.value, password.value)

        if (!email.value || !password.value) {
          console.error('❌ Missing email or password!')
          message.value = 'Please enter both email and password.'
          return
        }

        console.log('🛠 Calling Vuex login action...')

        try {
          const response = await store.dispatch('login', {
            email: email.value.trim(),
            password: password.value.trim(),
          })

          console.log('✅ Vuex login response:', response)

          if (!response || typeof response !== 'object' || response.success === false) {
            console.error('❌ Invalid Vuex response:', response)
            message.value = response?.message || 'Unexpected error occurred. Please try again.'
            return
          }

          message.value = response.message || 'Login successful.'

          console.log('🔄 Redirecting to Profile...')
          router.push({ name: 'profile' }) // ✅ Redirect after successful login
        } catch (error) {
          console.error('❌ Error in `handleLogin()`:', error)
          message.value = 'An unexpected error occurred.'
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
