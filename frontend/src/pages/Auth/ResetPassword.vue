<template>
  <div>
    <h2>Återställ Lösenord</h2>
    <form @submit.prevent="handleResetPassword">
      <label for="password">Nytt lösenord:</label>
      <input type="password" id="password" v-model="newPassword" required />
      <button type="submit">Återställ lösenord</button>
    </form>
    <p v-if="message">{{ message }}</p>
  </div>
</template>

<script>
import axios from "axios";

export default {
  data() {
    return {
      newPassword: "",
      message: "",
      token: new URLSearchParams(window.location.search).get("token"),
    };
  },
  methods: {
    async handleResetPassword() {
      if (!this.token) {
        this.message = "Ogiltig eller saknad token.";
        return;
      } else {
        console.log(this.token);
      }

      try {
        const response = await axios.post("http://localhost:5001/api/reset-password", {
          token: this.token,
          newPassword: this.newPassword,
        });
        this.message = response.data.message;
      } catch (error) {
        this.message = error;
      }
    },
  },
};
</script>
