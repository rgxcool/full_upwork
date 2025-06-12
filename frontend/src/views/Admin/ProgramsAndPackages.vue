<template>
  <v-container class="py-5">
    <!-- Title -->
    <v-card class="pa-5 text-center">
      <v-card-title class="text-h4 font-weight-bold">Programs and Course Packages</v-card-title>
    </v-card>

    <!-- Loading State -->
    <v-progress-linear
      v-if="loading"
      indeterminate
      color="primary"
      class="my-5"
    ></v-progress-linear>

    <v-container v-else>
      <v-card v-for="program in programs" :key="program._id" class="mb-6 elevation-2">
        <v-card-title class="text-h5 font-weight-bold text-primary">
          {{ program.programName }}
        </v-card-title>
        <v-card-text>
          <v-table dense class="unified-table">
            <thead>
              <tr>
                <th class="text-left w-25">Course Package</th>
                <th class="text-left w-15">Code</th>
                <th class="text-left w-15">Extent</th>
                <th class="text-left w-45">Courses</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="coursePackage in program.programCoursePackages" :key="coursePackage._id">
                <td>
                  <strong>{{ coursePackage.coursePackageName }}</strong>
                </td>
                <td>{{ coursePackage.coursePackageCode }}</td>
                <td>{{ coursePackage.coursePackageExtent }}</td>
                <td>
                  <v-table dense class="nested-table">
                    <thead>
                      <tr>
                        <th class="text-left w-50">Course Name</th>
                        <th class="text-left w-25">Course Code</th>
                        <th class="text-left w-25">Extent</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="course in coursePackage.coursePackageCourses" :key="course._id">
                        <td>{{ course.courseName }}</td>
                        <td>{{ course.courseCode }}</td>
                        <td>{{ course.courseExtent }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
      </v-card>
    </v-container>
  </v-container>
</template>

<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        programs: [],
        loading: true,
      }
    },
    async mounted() {
      try {
        console.log('Calling URL: ', `${import.meta.env.VITE_API_URL}/api/programs`)
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/programs`)

        console.log('API response:', response)
        let fetchedPrograms = response.data

        // Populate Course Packages with their courses
        for (let program of fetchedPrograms) {
          if (!Array.isArray(program.programCoursePackages)) {
            program.programCoursePackages = []
          }

          const packagePromises = program.programCoursePackages.map(async (coursePackage) => {
            const packageId = typeof coursePackage === 'string' ? coursePackage : coursePackage._id
            if (!packageId) {
              console.error('⚠️ Invalid Course Package ID:', coursePackage)
              return null
            }

            try {
              const packageRes = await axios.get(
                `${import.meta.env.VITE_API_URL}/api/coursepackages/${packageId}`
              )
              return packageRes.data
            } catch (err) {
              console.error('🚨 Failed to fetch package:', packageId, err)
              return null
            }
          })

          program.programCoursePackages = (await Promise.all(packagePromises)).filter(Boolean)

          // Populate Courses inside Course Packages
          for (let coursePackage of program.programCoursePackages) {
            if (!coursePackage || !coursePackage.coursePackageCourses) continue

            const coursePromises = coursePackage.coursePackageCourses.map(async (course) => {
              const courseId = typeof course === 'string' ? course : course._id
              if (!courseId) {
                console.error('⚠️ Invalid Course ID:', course)
                return null
              }

              try {
                const courseRes = await axios.get(
                  `${import.meta.env.VITE_API_URL}/api/courses/${courseId}`
                )
                return courseRes.data
              } catch (err) {
                console.error('🚨 Failed to fetch course:', courseId, err)
                return null
              }
            })

            coursePackage.coursePackageCourses = (await Promise.all(coursePromises)).filter(Boolean)
          }
        }

        this.programs = fetchedPrograms.filter(
          (program) =>
            Array.isArray(program.programCoursePackages) && program.programCoursePackages.length > 0
        )

        console.log('Programs after filtering:', this.programs)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        this.loading = false
      }
    },
  }
</script>

<style scoped>
  /* Ensure Full-Width Consistency */
  .unified-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .nested-table {
    width: 100%;
    table-layout: fixed;
  }

  /* Column Width Consistency */
  .w-25 {
    width: 25%;
  }

  .w-15 {
    width: 15%;
  }

  .w-45 {
    width: 45%;
  }

  .w-50 {
    width: 50%;
  }

  /* Styling for Table Headers */
  .v-table thead {
    background: #1e1e1e;
    color: white;
  }

  /* Ensure Inner Tables Fit */
  .v-table tbody td {
    vertical-align: top;
    padding: 8px;
  }
</style>
