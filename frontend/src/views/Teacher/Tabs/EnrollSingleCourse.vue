<template>
  <v-container>
    <v-card flat>
      <v-card-title>Anmäl till enskild kurs</v-card-title>
      <v-card-text>
        <StudentEnrollmentForm mode="single" />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import StudentEnrollmentForm from '@/components/Teacher/StudentEnrollmentForm.vue';

export default {
  name: 'EnrollSingleCourse',
  components: {
    StudentEnrollmentForm,
  },
};
</script>
