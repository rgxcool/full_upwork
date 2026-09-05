<template>
  <div class="exam-generation-page">
    <div class="card">
      <div class="card-header">
        <h3>Generera exam</h3>
        <v-row>
          <v-col cols="12" sm="4">
            <v-select
              v-model="selectedCourse"
              :items="availableCourses"
              label="Kurs"
              dense
              outlined
              @change="filterQuestionsByCourse"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="selectedSubject"
              :items="['Alla', 'Matematik', 'Svenska', 'Engelska', 'Naturkunskap', 'Samhällskunskap', 'Histori', 'Geografi', 'Idrott', 'Kemi', 'Fysik', 'Biologi', 'Teknik', 'Musik', 'Slöjd', 'Konst', 'Övrig']"
              label="Ämne"
              dense
              outlined
              @change="applyFilters"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-select
              v-model="selectedType"
              :items="['Alla', 'multipleChoice', 'trueFalse', 'essay', 'shortAnswer', 'matching', 'ordering']"
              label="Frågetyp"
              dense
              outlined
              @change="applyFilters"
            />
          </v-col>
        </v-row>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Frågor ({{ availableQuestions.length }})</h3>
      </div>
      <div class="card-body p-0">
        <v-table dense>
          <thead>
            <tr>
              <th class="text-left">Fråga</th>
              <th class="text-left">Ämne</th>
              <th class="text-left">Typ</th>
              <th class="text-left">Svårighetsnivå</th>
              <th class="text-center">Markera</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="question in availableQuestions" :key="question._id">
              <td class="px-4 py-2">
                <strong>{{ question.questionText.substring(0, 40) }}{{
                  question.questionText.length > 40 ? "..." : ""
                }}</strong>
              </td>
              <td class="px-4 py-2">{{ question.subject || "Övrig" }}</td>
              <td class="px-4 py-2">
                <v-chip small>{{ typeLabel(question.questionType) }}</v-chip>
              </td>
              <td class="px-4 py-2">
                <v-chip :color="difficultyColor(question.difficulty)" small>{{ difficultyLabel(question.difficulty) }}</v-chip>
              </td>
              <td class="px-4 py-2 text-center">
                <v-checkbox
                  v-model="selectedQuestions[question._id]"
                  :true-value="question._id"
                  :false-value="null"
                />
              </td>
            </tr>
            <tr v-if="availableQuestions.length === 0">
              <td colspan="5" class="text-center text-grey">Inga frågor hittades med angivna filter</td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Exam-inställningar</h3>
      </div>
      <div class="card-body">
        <v-row>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="examTitle"
              label="Examtitel"
              dense
              outlined
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="numberOfQuestions"
              label="Antal frågor"
              type="number"
              min="1"
              dense
             outlined
            />
          </v-col>
        </v-row>

        <v-divider />

        <v-row>
          <v-col cols="12">
            <v-btn
              color="primary"
              size="large"
              :disabled="selectedQuestions.length === 0 || !examTitle"
              @click="generateExam"
            >
              <v-icon left>mdi-format-list-numbers</v-icon>
              Generera exam med {{ selectedQuestions.length }} frågor
            </v-btn>
            <v-spacer></v-spacer>
            <v-btn
              color="secondary"
              size="large"
              @click="resetSelection"
            >
              Återställ urval
            </v-btn>
          </v-col>
        </v-row>
      </div>
    </div>

    <div v-if="generatedExam" class="card">
      <div class="card-header">
        <h3>Generated exam preview</h3>
      </div>
      <div class="card-body">
        <v-list>
          <v-list-item v-for="(questionId, index) in generatedExam.questions" :key="questionId">
            <v-list-item-content>
              <v-list-item-title>
                {{ generatedExam.questionTexts[index] || "Okänd fråga" }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ generatedExam.questionTypes[index] || "Okänd typ" }}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </v-list>

        <v-divider />

        <v-row>
          <v-col cols="12">
            <v-btn color="primary" @click="saveExam">Spara exam</v-btn>
            <v-spacer></v-spacer>
            <v-btn color="secondary" @click="printExam">Skriv ut</v-btn>
          </v-col>
        </v-row>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from "vue";
import client from "@/api/client.js";
import { useToast } from "@/composables/useToast.js";

export default {
  name: "ExamGeneration",
  setup() {
    const toast = useToast();

    // State
    const selectedCourse = ref("");
    const selectedSubject = ref("Alla");
    const selectedType = ref("Alla");
    const availableCourses = ref([]);
    const availableQuestions = ref([]);
    const selectedQuestions = ref({}); // object with questionId -> true/false
    const examTitle = ref("");
    const numberOfQuestions = ref(20);
    const generatedExam = ref(null);

    // Computed
    const typeLabel = (type) => {
      const labels = {
        multipleChoice: "Multiple Choice",
        trueFalse: "Sant/Falskt",
        essay: "Essayfråga",
        shortAnswer: "Kort svar",
        matching: "Matchning",
        ordering: "Ordning",
      };
      return labels[type] || type;
    };

    const difficultyLabel = (level) => {
      const labels = { easy: "Enkel", medium: "Medel", hard: "Svår" };
      return labels[level] || level;
    };

    const difficultyColor = (level) => {
      const colors = { easy: "green", medium: "amber", hard: "red" };
      return colors[level] || "gray";
    };

    const typeColor = (type) => {
      const colors = {
        multipleChoice: "primary",
        trueFalse: "success",
        essay: "warning",
        shortAnswer: "info",
        matching: "secondary",
        ordering: "secondary",
      };
      return colors[type] || "secondary";
    };

    // Load available courses
    const loadCourses = async () => {
      try {
        const { data } = await client.get("/course-bank/courses");
        availableCourses.value = data.courses || [];
      } catch (error) {
        toast.error("Kunde inte ladda kurser");
        console.error("Error loading courses:", error);
      }
    };

    // Load questions based on filters
    const loadQuestions = async () => {
      if (!selectedCourse.value) {
        availableQuestions.value = [];
        selectedQuestions.value = {};
        return;
      }
      try {
        const { data } = await client.get(
          `/question-bank/by-course/${selectedCourse.value}?subject=${selectedSubject.value || ""}&questionType=${selectedType.value || ""}`
        );
        availableQuestions.value = data.questions || [];
        // Initialize selection
        selectedQuestions.value = {};
        availableQuestions.value.forEach((q) => {
          selectedQuestions.value[q._id] = false;
        });
      } catch (error) {
        toast.error("Kunde inte ladda frågor");
        console.error("Error loading questions:", error);
      }
    };

    const applyFilters = () => {
      loadQuestions();
    };

    const generateExam = async () => {
      const selectedIds = availableQuestions.value
        .filter((q) => selectedQuestions.value[q._id])
        .map((q) => q._id);

      if (selectedIds.length === 0) {
        toast.error("Välj minst en fråga");
        return;
      }

      try {
        const { data } = await client.post(
          "/question-bank/generate-exam",
          {
            courseId: selectedCourse.value,
            subject: selectedSubject.value,
            questionType: selectedType.value,
            numberOfQuestions: selectedIds.length,
          }
        );

        // Persist the user's exact selection onto the generated attempt.
        let examAttemptId = data.examAttemptId;
        if (examAttemptId) {
          try {
            const updateRes = await client.put(
              `/question-bank/exam-attempts/${examAttemptId}/questions`,
              { questionIds: selectedIds }
            );
            examAttemptId = updateRes.data.examAttempt?._id || examAttemptId;
          } catch (updateError) {
            console.error("Error persisting question selection:", updateError);
          }
        }

        const selectedTexts = availableQuestions.value
          .filter((q) => selectedQuestions.value[q._id])
          .map((q) => q.questionText);
        const selectedTypes = availableQuestions.value
          .filter((q) => selectedQuestions.value[q._id])
          .map((q) => q.questionType);

        generatedExam.value = {
          title: data.title || examTitle.value || "Generated Exam",
          courseId: data.courseId,
          examAttemptId,
          questions: selectedIds,
          questionTexts: selectedTexts,
          questionTypes: selectedTypes,
          selectedCount: selectedIds.length,
          totalAvailable: data.totalAvailable,
        };

        toast.success("Exam genererad och sparad i frågebanken");
      } catch (error) {
        toast.error("Kunde inte generera exam");
        console.error("Error generating exam:", error);
      }
    };

    const resetSelection = () => {
      selectedQuestions.value = {};
      availableQuestions.value.forEach((q) => {
        selectedQuestions.value[q._id] = false;
      });
    };

    const saveExam = async () => {
      if (!generatedExam.value) {
        toast.error("Ingen exam att spara");
        return;
      }

      // The exam attempt is already persisted in the question bank when it was
      // generated (POST /generate-exam), with the exact selection attached via
      // PUT /exam-attempts/:id/questions. Reset the preview flow.
      toast.success("Exam sparad i frågebanken");
      generatedExam.value = null;
      resetSelection();
    };

    const printExam = () => {
      if (!generatedExam.value) {
        return;
      }
      window.print();
    };

    // Initial load
    loadCourses();

    return {
      selectedCourse,
      selectedSubject,
      selectedType,
      availableCourses,
      availableQuestions,
      selectedQuestions,
      examTitle,
      numberOfQuestions,
      generatedExam,
      typeLabel,
      difficultyLabel,
      difficultyColor,
      typeColor,
      loadCourses,
      loadQuestions,
      applyFilters,
      generateExam,
      resetSelection,
      saveExam,
      printExam,
    };
  },
};
</script>

<style scoped>
.exam-generation-page .v-chip {
  margin: 2px;
}

.type-badge {
  font-size: 0.8rem;
}

.difficulty-badge {
  font-size: 0.75rem;
}
</style>
