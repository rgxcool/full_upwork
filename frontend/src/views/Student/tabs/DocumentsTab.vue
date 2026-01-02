<template>
  <DocumentSection :student="student" type="GENERAL" />
</template>

<script>
import DocumentSection from '../../Admin/SearchTabs/DocumentSection.vue';

export default {
  name: 'DocumentsTab',
  components: {
    DocumentSection,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
};
</script>