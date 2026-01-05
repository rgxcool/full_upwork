<template>
  <v-container>
    <v-card flat>
      <v-card-title>Anmäl till kurspaket</v-card-title>
      <v-card-text>
        <StudentEnrollmentForm mode="package" />
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import StudentEnrollmentForm from '@/components/Teacher/StudentEnrollmentForm.vue';

export default {
  name: 'EnrollCoursePackage',
  components: {
    StudentEnrollmentForm,
  },
};
</script>
