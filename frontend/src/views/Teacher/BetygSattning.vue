<template>
  <div class="betyg-container scrollable-view py-4 px-4 px-md-6">
    <!-- 1. PAGE HEADER -->
    <div class="page-header mb-6">
      <div class="d-flex flex-wrap align-center justify-space-between gap-3 mb-2">
        <div>
          <h1 class="text-h4 font-weight-bold text-slate-800">Betygssättning</h1>
          <p class="text-body-1 text-medium-emphasis mb-0">Enter and manage student grades</p>
        </div>

        <!-- Selectors: Term (filter), Course, and Batch/Omgång (CourseInstance) -->
        <div class="d-flex flex-wrap align-center gap-3 selectors-bar">
          <v-select
            v-model="selectedTerm"
            :items="termOptions"
            label="Termin"
            variant="outlined"
            density="compact"
            hide-details
            class="selector-field term-select"
            @update:model-value="onTermChange"
          />

          <v-select
            v-model="selectedCourseId"
            :items="courseOptions"
            item-title="title"
            item-value="value"
            label="Kurs"
            variant="outlined"
            density="compact"
            hide-details
            class="selector-field course-select"
            placeholder="Välj kurs..."
            @update:model-value="onCourseChange"
          />

          <v-select
            v-model="selectedBatchId"
            :items="batchOptions"
            item-title="title"
            item-value="value"
            label="Batch / Omgång"
            variant="outlined"
            density="compact"
            hide-details
            class="selector-field batch-select"
            placeholder="Välj omgång..."
            @update:model-value="onBatchChange"
          />
        </div>
      </div>

      <!-- 22.3 Completed / Past batch notice (read-only view) -->
      <v-alert
        v-if="selectedBatch && batchIsCompleted"
        type="info"
        variant="tonal"
        density="compact"
        class="mt-3"
        icon="mdi-history"
      >
        Denna batch/omgång är avslutad. Resultaten visas skrivskyddade per befintliga låsregler.
      </v-alert>

      <!-- Summary Cards (Visible when a course + batch is selected) -->
      <v-row v-if="selectedCourse && selectedBatch" class="summary-cards mt-3" dense>
        <v-col cols="6" sm="3">
          <v-card variant="flat" class="summary-card pa-3 border">
            <div class="text-caption text-medium-emphasis">Kurs</div>
            <div class="text-subtitle-1 font-weight-bold text-truncate" :title="selectedCourse.courseName">
              {{ selectedCourse.courseName }}
            </div>
            <div class="text-caption text-grey">{{ selectedCourse.courseCode }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card variant="flat" class="summary-card pa-3 border">
            <div class="text-caption text-medium-emphasis">Elever</div>
            <div class="text-h6 font-weight-bold text-slate-800">{{ summary.total }}</div>
            <div class="text-caption text-grey">Inskrivna elever</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card variant="flat" class="summary-card pa-3 border">
            <div class="text-caption text-medium-emphasis">Betygsatta</div>
            <div class="text-h6 font-weight-bold text-success">{{ summary.graded }}</div>
            <div class="text-caption text-grey">{{ summary.percentGraded }}% klara</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card variant="flat" class="summary-card pa-3 border">
            <div class="text-caption text-medium-emphasis">Kvar</div>
            <div class="text-h6 font-weight-bold" :class="summary.remaining > 0 ? 'text-warning' : 'text-success'">
              {{ summary.remaining }}
            </div>
            <div class="text-caption text-grey">Att betygsätta</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- All graded banner -->
      <v-alert
        v-if="selectedCourse && selectedBatch && summary.total > 0 && summary.remaining === 0"
        type="success"
        variant="tonal"
        density="compact"
        class="mt-3"
        icon="mdi-check-circle"
      >
        ✓ Alla elever har betygsatts i denna kurs.
      </v-alert>
    </div>

    <!-- 18. COURSE-SPECIFIC RESULT TYPES TABS -->
    <div v-if="selectedCourse && selectedBatch && availableResultTypes.length > 1" class="result-tabs-container mb-4">
      <div class="text-caption text-medium-emphasis mb-1 font-weight-medium">Resultattyp att mata in:</div>
      <v-slide-group v-model="activeResultTypeId" mandatory show-arrows class="result-type-tabs">
        <v-slide-group-item
          v-for="rt in availableResultTypes"
          :key="rt.id"
          v-slot="{ isSelected, toggle }"
          :value="rt.id"
        >
          <v-btn
            :variant="isSelected ? 'flat' : 'outlined'"
            :color="isSelected ? 'primary' : 'default'"
            size="small"
            rounded="lg"
            class="mr-2 text-capitalize"
            @click="toggle"
          >
            <v-icon start size="16">
              {{ rt.id === 'final_grade' ? 'mdi-school' : rt.id === 'national_test' ? 'mdi-file-document-outline' : 'mdi-format-list-checks' }}
            </v-icon>
            {{ rt.label }}
          </v-btn>
        </v-slide-group-item>
      </v-slide-group>
    </div>

    <!-- 14. TOP STICKY ACTION BAR -->
    <div v-if="selectedCourse && selectedBatch" class="sticky-action-bar pa-3 mb-4 rounded-lg elevation-1 bg-surface border">
      <div class="d-flex flex-wrap align-center justify-space-between gap-3">
        <!-- Search & Filters -->
        <div class="d-flex flex-wrap align-center gap-2 flex-grow-1">
          <v-text-field
            v-model="searchQuery"
            placeholder="Sök elev..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="search-field"
          />

          <!-- 6. FILTERS -->
          <v-chip-group v-model="activeFilter" mandatory class="filter-chips">
            <v-chip filter value="all" size="small" variant="outlined">Alla</v-chip>
            <v-chip filter value="ungraded" size="small" variant="outlined">Ej betygsatta</v-chip>
            <v-chip filter value="graded" size="small" variant="outlined">Betygsatta</v-chip>
            <v-chip filter value="failing" size="small" variant="outlined">Underkända (F)</v-chip>
            <v-chip filter value="locked" size="small" variant="outlined">Låsta 🔒</v-chip>
          </v-chip-group>

          <!-- 7. SORTING -->
          <v-select
            v-model="sortBy"
            :items="sortOptions"
            label="Sortera"
            variant="outlined"
            density="compact"
            hide-details
            class="sort-select"
          />
        </div>

        <!-- 5. BULK SAVE BUTTON -->
        <div class="d-flex align-center gap-2">
          <v-chip v-if="unsavedCount > 0" color="amber-darken-3" variant="tonal" size="small">
            ● {{ unsavedCount }} osparade
          </v-chip>
          <v-btn
            color="primary"
            variant="flat"
            size="default"
            prepend-icon="mdi-content-save-all"
            :loading="bulkSaving"
            :disabled="unsavedCount === 0 || bulkSaving || batchIsCompleted"
            @click="saveAllChanges"
          >
            Spara alla ändringar {{ unsavedCount > 0 ? `(${unsavedCount})` : '' }}
          </v-btn>
        </div>
      </div>
    </div>

    <!-- 17. DATA STATES -->
    <!-- State 1: Loading Skeleton -->
    <div v-if="loading" class="py-6">
      <v-skeleton-loader type="table-row@6" />
    </div>

    <!-- State 2: No Course Selected -->
    <div v-else-if="!selectedCourseId" class="empty-state pa-12 text-center border rounded-lg bg-surface">
      <v-icon size="64" color="primary" class="mb-3">mdi-book-education-outline</v-icon>
      <h2 class="text-h5 font-weight-medium mb-1">Välj en kurs för att börja sätta betyg</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Välj kurs, termin och batch/omgång i listorna ovan för att visa och betygsätta elever.
      </p>
    </div>

    <!-- State 2b: Course selected but no batch -->
    <div v-else-if="!selectedBatchId" class="empty-state pa-12 text-center border rounded-lg bg-surface">
      <v-icon size="64" color="primary" class="mb-3">mdi-account-group-outline</v-icon>
      <h2 class="text-h5 font-weight-medium mb-1">Välj en batch/omgång</h2>
      <p class="text-body-2 text-medium-emphasis mb-4">
        Välj vilken batch/omgång av denna kurs du vill betygsätta.
      </p>
    </div>

    <!-- State 3: Course selected but no students -->
    <div v-else-if="filteredRows.length === 0 && studentsToGrade.length === 0" class="empty-state pa-12 text-center border rounded-lg bg-surface">
      <v-icon size="64" color="grey" class="mb-3">mdi-account-off-outline</v-icon>
      <h2 class="text-h5 font-weight-medium mb-1">Inga elever hittades för denna kurs</h2>
      <p class="text-body-2 text-medium-emphasis">
        Det finns inga inskrivna elever i den valda kursens batch/omgång.
      </p>
    </div>

    <!-- State 4: Filter gave 0 results -->
    <div v-else-if="filteredRows.length === 0" class="empty-state pa-8 text-center border rounded-lg bg-surface">
      <v-icon size="48" color="grey" class="mb-2">mdi-filter-remove-outline</v-icon>
      <div class="text-subtitle-1 font-weight-medium">Inga elever matchar sökningen eller filtret</div>
      <v-btn variant="text" size="small" color="primary" class="mt-2" @click="resetFilters">
        Återställ filter
      </v-btn>
    </div>

    <!-- 2. COMPACT GRADING TABLE (Desktop & Tablet) -->
    <div v-else class="grading-content">
      <!-- Desktop Table -->
      <div class="d-none d-md-block table-responsive border rounded-lg bg-surface elevation-1">
        <table class="grading-table w-100">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-student">Elev</th>
              <th class="col-input">
                {{ activeResultType.label }}
              </th>
              <th v-if="shouldShowNpColumn" class="col-np">
                NP-poäng
              </th>
              <th class="col-status">Status</th>
              <th class="col-actions text-right">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in filteredRows"
              :key="row.id"
              :class="{
                'row-locked': row.course.locked,
                'row-dirty': row.isDirty,
                'row-failing': row.course.grade === 'F' && activeResultTypeId === 'final_grade',
              }"
            >
              <!-- Number -->
              <td class="col-num text-caption text-medium-emphasis">{{ index + 1 }}</td>

              <!-- Student -->
              <td class="col-student">
                <div class="d-flex align-center gap-2">
                  <router-link
                    :to="`/student/${row.student._id}`"
                    class="student-link font-weight-medium text-decoration-none"
                    @click.stop
                  >
                    {{ row.student.name }}
                  </router-link>
                  <span v-if="row.student.personalNumber" class="text-caption text-grey">
                    ({{ row.student.personalNumber }})
                  </span>
                </div>
                <div v-if="row.errorMessage" class="text-caption text-error mt-1 font-weight-medium">
                  ✕ {{ row.errorMessage }}
                </div>
              </td>

              <!-- Result / Grade Input Column -->
              <td class="col-input">
                <!-- If Locked or completed batch (read-only) -->
                <div v-if="row.course.locked || batchReadOnly" class="locked-indicator d-flex align-center gap-1">
                  <v-tooltip v-if="row.course.locked" text="Detta betyg är låst och kan inte ändras." location="top">
                    <template #activator="{ props }">
                      <span v-bind="props" class="locked-badge px-2 py-1 rounded border text-grey-darken-2">
                        {{ getDisplayValue(row) || '–' }} 🔒
                      </span>
                    </template>
                  </v-tooltip>
                  <span v-else class="locked-badge px-2 py-1 rounded border text-grey-darken-2">
                    {{ getDisplayValue(row) || '–' }}
                  </span>
                </div>

                <!-- Unauthorized Teacher Fallback -->
                <div v-else-if="row.unauthorized" class="text-caption text-error">
                  Ej behörig
                </div>

                <!-- Final Grade (A-F dropdown) -->
                <div v-else-if="activeResultTypeId === 'final_grade'" class="grade-input-wrap">
                  <v-select
                    :id="`input-grade-${index}`"
                    v-model="row.course.grade"
                    :items="gradeOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    placeholder="–"
                    class="compact-grade-select"
                    :class="{ 'border-f': row.course.grade === 'F' }"
                    @update:model-value="(val) => handleGradeChange(row, val)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />
                </div>

                <!-- Custom / Assessment Result Types -->
                <div v-else class="custom-result-input-wrap">
                  <!-- Numeric -->
                  <v-text-field
                    v-if="activeResultType.type === 'numeric'"
                    :id="`input-res-${index}`"
                    v-model.number="row.assessmentValues[activeResultTypeId]"
                    type="number"
                    :min="activeResultType.min ?? 0"
                    :max="activeResultType.max ?? 100"
                    placeholder="Poäng"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="compact-numeric-input"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />

                  <!-- Grade Scale -->
                  <v-select
                    v-else-if="activeResultType.type === 'grade'"
                    :id="`input-res-${index}`"
                    v-model="row.assessmentValues[activeResultTypeId]"
                    :items="gradeOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    placeholder="–"
                    class="compact-grade-select"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />

                  <!-- Pass/Fail -->
                  <v-select
                    v-else-if="activeResultType.type === 'pass_fail'"
                    :id="`input-res-${index}`"
                    v-model="row.assessmentValues[activeResultTypeId]"
                    :items="passFailOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    placeholder="–"
                    class="compact-grade-select"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />

                  <!-- Percentage -->
                  <v-text-field
                    v-else-if="activeResultType.type === 'percentage'"
                    :id="`input-res-${index}`"
                    v-model.number="row.assessmentValues[activeResultTypeId]"
                    type="number"
                    min="0"
                    max="100"
                    suffix="%"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="compact-numeric-input"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />

                  <!-- Date -->
                  <v-text-field
                    v-else-if="activeResultType.type === 'date'"
                    :id="`input-res-${index}`"
                    v-model="row.assessmentValues[activeResultTypeId]"
                    type="date"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="compact-date-input"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />

                  <!-- Text -->
                  <v-text-field
                    v-else
                    :id="`input-res-${index}`"
                    v-model="row.assessmentValues[activeResultTypeId]"
                    placeholder="Värde"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="compact-text-input"
                    @update:model-value="markRowDirty(row)"
                    @keydown.enter.prevent="handleEnterKey(row, index)"
                  />
                </div>
              </td>

              <!-- 11. National Test Points (NP) Column -->
              <td v-if="shouldShowNpColumn" class="col-np">
                <div v-if="isNationalCourse(row.course.courseCode)" class="np-score-cell">
                  <v-text-field
                    v-model.number="row.course.npScore"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="NP"
                    variant="outlined"
                    density="compact"
                    hide-details
                    :disabled="row.course.locked"
                    class="compact-np-input"
                    @update:model-value="onNpScoreChange(row)"
                    @blur="suggestGrade(row.course)"
                  />
                  <div v-if="row.course.npScore !== null && row.course.npScore !== undefined" class="suggested-grade-hint">
                    <span v-if="row.course.suggestedGrade">
                      Skalan ger: <strong>{{ row.course.suggestedGrade }}</strong>
                    </span>
                    <span v-else-if="row.course.suggestChecked">Ingen skala satt</span>
                  </div>
                </div>
                <span v-else class="text-muted">–</span>
              </td>

              <!-- 13 & 19. Status Badge -->
              <td class="col-status">
                <v-chip
                  :color="getStatusColor(row)"
                  size="small"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  {{ getStatusLabel(row) }}
                </v-chip>
              </td>

              <!-- Actions -->
              <td class="col-actions text-right">
                <div class="d-flex align-center justify-end gap-1">
                  <!-- Row save button when dirty -->
                  <v-btn
                    v-if="row.isDirty && !row.course.locked"
                    color="primary"
                    variant="text"
                    size="small"
                    :loading="savingRowId === row.id"
                    @click="saveSingleRow(row)"
                  >
                    Spara
                  </v-btn>

                  <!-- 8. Student Details / Edit button -->
                  <v-btn
                    variant="text"
                    size="small"
                    icon="mdi-pencil-outline"
                    title="Visa detaljer / motivering"
                    @click="openStudentDetail(row)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 12. RESPONSIVE CARDS (Mobile < 768px) -->
      <div class="d-md-none mobile-cards-list">
        <v-card
          v-for="row in filteredRows"
          :key="`m-${row.id}`"
          variant="flat"
          class="mobile-student-card mb-3 pa-3 border"
          :class="{
            'row-locked': row.course.locked,
            'row-dirty': row.isDirty,
          }"
        >
          <div class="d-flex align-center justify-space-between mb-2">
            <div>
              <router-link
                :to="`/student/${row.student._id}`"
                class="student-link font-weight-bold text-decoration-none"
              >
                {{ row.student.name }}
              </router-link>
              <div v-if="row.student.personalNumber" class="text-caption text-grey">
                {{ row.student.personalNumber }}
              </div>
            </div>
            <v-chip :color="getStatusColor(row)" size="x-small" variant="tonal">
              {{ getStatusLabel(row) }}
            </v-chip>
          </div>

          <v-row dense class="align-center">
            <v-col cols="7">
              <div v-if="row.course.locked || batchReadOnly" class="locked-badge px-2 py-1 rounded border text-grey-darken-2">
                {{ getDisplayValue(row) || '–' }}<span v-if="row.course.locked"> 🔒</span>
              </div>
              <v-select
                v-else-if="activeResultTypeId === 'final_grade'"
                v-model="row.course.grade"
                :items="gradeOptions"
                label="Betyg"
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="(val) => handleGradeChange(row, val)"
              />
              <v-text-field
                v-else-if="activeResultType.type === 'numeric'"
                v-model.number="row.assessmentValues[activeResultTypeId]"
                type="number"
                :label="activeResultType.label"
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="markRowDirty(row)"
              />
              <v-select
                v-else-if="activeResultType.type === 'pass_fail'"
                v-model="row.assessmentValues[activeResultTypeId]"
                :items="passFailOptions"
                :label="activeResultType.label"
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="markRowDirty(row)"
              />
              <v-text-field
                v-else
                v-model="row.assessmentValues[activeResultTypeId]"
                :label="activeResultType.label"
                variant="outlined"
                density="compact"
                hide-details
                @update:model-value="markRowDirty(row)"
              />
            </v-col>

            <v-col v-if="shouldShowNpColumn && isNationalCourse(row.course.courseCode)" cols="5">
              <div class="np-score-cell">
                <v-text-field
                  v-model.number="row.course.npScore"
                  type="number"
                  label="NP-poäng"
                  variant="outlined"
                  density="compact"
                  hide-details
                  :disabled="row.course.locked"
                  @update:model-value="onNpScoreChange(row)"
                  @blur="suggestGrade(row.course)"
                />
              </div>
            </v-col>
          </v-row>

          <div class="d-flex align-center justify-space-between mt-2 pt-2 border-t">
            <v-btn variant="text" size="x-small" prepend-icon="mdi-information-outline" @click="openStudentDetail(row)">
              Detaljer
            </v-btn>
            <v-btn
              v-if="row.isDirty && !row.course.locked && !batchReadOnly"
              color="primary"
              variant="flat"
              size="x-small"
              :loading="savingRowId === row.id"
              @click="saveSingleRow(row)"
            >
              Spara
            </v-btn>
          </div>
        </v-card>
      </div>
    </div>

    <!-- 3. INLINE / MODAL GRADE F MOTIVATION SECTION -->
    <v-dialog v-model="fModalOpen" max-width="480" persistent>
      <v-card v-if="currentFRow">
        <v-card-item class="bg-red-lighten-5 py-3">
          <div class="d-flex align-center gap-2">
            <v-icon color="error">mdi-alert-circle</v-icon>
            <div>
              <div class="text-subtitle-1 font-weight-bold text-error">Betyg F kräver motivering</div>
              <div class="text-caption text-medium-emphasis">
                Elev: <strong>{{ currentFRow.student.name }}</strong>
              </div>
            </div>
          </div>
        </v-card-item>

        <v-card-text class="pt-4">
          <p class="text-body-2 mb-3">
            Enligt Skolverkets och skolans regler måste ett underkänt betyg (F) motiveras skriftligt.
          </p>

          <v-textarea
            v-model="currentFMotivation"
            label="Motivering *"
            placeholder="Beskriv varför eleven inte uppnår kunskapskraven..."
            rows="3"
            variant="outlined"
            density="compact"
            :error-messages="fModalError"
            autofocus
            class="mb-3"
          />

          <v-textarea
            v-model="currentFComments"
            label="Kommentar (valfritt)"
            placeholder="Intern anteckning eller kommentar..."
            rows="2"
            variant="outlined"
            density="compact"
            hide-details
          />
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="cancelFModal">Avbryt</v-btn>
          <v-btn color="error" variant="flat" @click="confirmFModal">
            Bekräfta & Sätt F
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 8. STUDENT DETAIL / SECONDARY INFORMATION MODAL -->
    <v-dialog
      v-model="detailDrawerOpen"
      max-width="500"
      scrollable
    >
      <v-card v-if="activeDetailRow">
        <!-- Dialog Header -->
        <v-card-title class="d-flex align-center justify-space-between pb-3 border-b">
          <div>
            <div class="text-h6 font-weight-bold">{{ activeDetailRow.student.name }}</div>
            <div class="text-caption text-grey">
              {{ activeDetailRow.student.personalNumber || activeDetailRow.student.email }}
            </div>
          </div>
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeDetailDrawer" />
        </v-card-title>

        <!-- Details Content -->
        <v-card-text class="pt-4">
          <!-- Status & Lock Info -->
          <div class="d-flex align-center justify-space-between mb-4 pa-2 rounded bg-grey-lighten-4">
            <span class="text-body-2 font-weight-medium">Status:</span>
            <v-chip :color="getStatusColor(activeDetailRow)" size="small" variant="tonal">
              {{ getStatusLabel(activeDetailRow) }}
            </v-chip>
          </div>

          <!-- Grade Selector in drawer -->
          <div class="mb-4">
            <label class="text-caption font-weight-bold text-medium-emphasis">Betyg (Slutbetyg)</label>
            <v-select
              v-model="activeDetailRow.course.grade"
              :items="gradeOptions"
              variant="outlined"
              density="compact"
              :disabled="activeDetailRow.course.locked || batchReadOnly"
              hide-details
              class="mt-1"
              @update:model-value="(val) => handleGradeChange(activeDetailRow, val)"
            />
          </div>

          <!-- NP Points -->
          <div v-if="isNationalCourse(activeDetailRow.course.courseCode)" class="mb-4">
            <label class="text-caption font-weight-bold text-medium-emphasis">NP-poäng</label>
            <v-text-field
              v-model.number="activeDetailRow.course.npScore"
              type="number"
              min="0"
              max="100"
              variant="outlined"
              density="compact"
              :disabled="activeDetailRow.course.locked || batchReadOnly"
              hide-details
              class="mt-1"
              @update:model-value="onNpScoreChange(activeDetailRow)"
              @blur="suggestGrade(activeDetailRow.course)"
            />
            <div v-if="activeDetailRow.course.suggestedGrade" class="text-caption text-primary mt-1">
              Skalan ger förslag: <strong>{{ activeDetailRow.course.suggestedGrade }}</strong>
            </div>
          </div>

          <!-- Motivation -->
          <div class="mb-4">
            <label class="text-caption font-weight-bold text-medium-emphasis">
              Motivering {{ activeDetailRow.course.grade === 'F' ? '*' : '(valfritt)' }}
            </label>
            <v-textarea
              v-model="activeDetailRow.course.reason"
              rows="3"
              variant="outlined"
              density="compact"
              :disabled="activeDetailRow.course.locked || batchReadOnly"
              hide-details
              placeholder="Skriv motivering här..."
              class="mt-1"
              @update:model-value="markRowDirty(activeDetailRow)"
            />
          </div>

          <!-- Comment -->
          <div class="mb-4">
            <label class="text-caption font-weight-bold text-medium-emphasis">Kommentar</label>
            <v-textarea
              v-model="activeDetailRow.course.comments"
              rows="2"
              variant="outlined"
              density="compact"
              :disabled="activeDetailRow.course.locked || batchReadOnly"
              hide-details
              placeholder="Intern kommentar..."
              class="mt-1"
              @update:model-value="markRowDirty(activeDetailRow)"
            />
          </div>

          <!-- Metadata: Date & Graded By -->
          <div class="metadata-section pa-3 rounded border text-caption text-medium-emphasis mb-4">
            <div class="d-flex justify-space-between mb-1">
              <span>Betygsatt datum:</span>
              <span class="font-weight-medium text-slate-800">
                {{ formatDateTime(activeDetailRow.course.gradeDate) }}
              </span>
            </div>
            <div class="d-flex justify-space-between mb-1">
              <span>Betygsatt av:</span>
              <span class="font-weight-medium text-slate-800">
                {{ getTeacherDisplay(activeDetailRow) }}
              </span>
            </div>
            <div v-if="activeDetailRow.course.locked" class="d-flex justify-space-between text-grey-darken-2">
              <span>Låst av:</span>
              <span class="font-weight-medium">Låst betyg 🔒</span>
            </div>
          </div>

          <!-- Quick Navigation Link -->
          <div class="mb-2">
            <router-link
              :to="`/student/${activeDetailRow.student._id}`"
              class="text-caption text-primary text-decoration-none d-flex align-center gap-1"
            >
              <v-icon size="14">mdi-open-in-new</v-icon>
              Gå till elevkort
            </router-link>
          </div>
        </v-card-text>

        <!-- Drawer Footer Actions -->
        <v-card-actions class="px-4 pb-4 border-t d-flex flex-column gap-2">
          <v-btn
            v-if="!activeDetailRow.course.locked && !batchReadOnly"
            color="primary"
            variant="flat"
            block
            :loading="savingRowId === activeDetailRow.id"
            @click="saveSingleRow(activeDetailRow)"
          >
            Spara betyg
          </v-btn>

          <!-- 9. Lock Grade Button -->
          <v-btn
            v-if="!activeDetailRow.course.locked && !batchReadOnly"
            color="grey-darken-1"
            variant="outlined"
            block
            size="small"
            prepend-icon="mdi-lock"
            @click="toggleLock(activeDetailRow.student._id, activeDetailRow.course.refId, false, activeDetailRow.course.enrollmentId, activeDetailRow)"
          >
            Lås betyg 🔒
          </v-btn>

          <!-- Unlock button (Admin only) -->
          <v-btn
            v-else-if="isAdmin"
            color="warning"
            variant="outlined"
            block
            size="small"
            prepend-icon="mdi-lock-open"
            @click="toggleLock(activeDetailRow.student._id, activeDetailRow.course.refId, true, activeDetailRow.course.enrollmentId, activeDetailRow)"
          >
            Lås upp betyg
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
  import * as vueRouter from 'vue-router'
  import { useStore } from 'vuex'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()
  const store = useStore()
  const isAdmin = computed(() => store?.getters?.isAdmin || false)

  // State
  const loading = ref(true)
  const bulkSaving = ref(false)
  const savingRowId = ref(null)
  const searchQuery = ref('')
  const activeFilter = ref('all')
  const sortBy = ref('name-asc')
  const selectedTerm = ref('all')
  const selectedCourseId = ref(null)
  const selectedBatchId = ref(null)
  // Last committed batch (used to restore selection if an unsaved-changes confirm is declined)
  const previousBatchId = ref(null)

  // Keep previousBatchId in sync with every selection change
  watch(selectedBatchId, (newVal, oldVal) => {
    previousBatchId.value = oldVal
  })

  // Available items
  const rawEnrollmentItems = ref([])
  const studentsToGrade = ref([]) // Maintained for backward compatibility with tests
  const rows = ref([]) // Structured internal rows for the selected course

  // Active Result Type
  const activeResultTypeId = ref('final_grade')

  // F Motivation Modal
  const fModalOpen = ref(false)
  const currentFRow = ref(null)
  const currentFMotivation = ref('')
  const currentFComments = ref('')
  const fModalError = ref('')
  const previousGradeBeforeF = ref('')

  // Detail Drawer
  const detailDrawerOpen = ref(false)
  const activeDetailRow = ref(null)

  // Standard grading options
  const gradeOptions = ['A', 'B', 'C', 'D', 'E', 'F']
  const passFailOptions = ['G', 'IG']

  const sortOptions = [
    { title: 'Elev (A–Ö)', value: 'name-asc' },
    { title: 'Elev (Ö–A)', value: 'name-desc' },
    { title: 'Betyg (A–F)', value: 'grade-asc' },
    { title: 'Status', value: 'status' },
  ]

  // Swedish term label helper
  function termFromDate(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    return month >= 8 ? `HT${String(year).slice(2)}` : `VT${String(year).slice(2)}`
  }

  // National course subject helper
  function nationalSubject(courseCode) {
    const code = String(courseCode || '').toUpperCase().trim()
    if (code.startsWith('SVE')) return 'Svenska'
    if (code.startsWith('ENG')) return 'Engelska'
    if (code.startsWith('MAT') || code.startsWith('MA')) return 'Matematik'
    return null
  }

  const isNationalCourse = (courseCode) => nationalSubject(courseCode) !== null

  // Format date time helper
  function formatDateTime(dateStr) {
    if (!dateStr) return '–'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('sv-SE')
    } catch {
      return '–'
    }
  }

  // Teacher display helper
  function getTeacherDisplay(row) {
    if (row?.course?.teacherName && row.course.teacherName !== 'Ej tilldelad') {
      return row.course.teacherName
    }
    if (row?.course?.responsibleTeacher?.userId?.username) {
      return row.course.responsibleTeacher.userId.username
    }
    if (row?.student?.teacherId?.userId?.username) {
      return row.student.teacherId.userId.username
    }
    return 'Lärare'
  }

  // Available Terms
  const termOptions = computed(() => {
    const terms = new Set()
    for (const item of rawEnrollmentItems.value) {
      const term = termFromDate(item.endDate || item.startDate)
      if (term) terms.add(term)
    }
    const list = Array.from(terms).sort()
    return [{ title: 'Alla terminer', value: 'all' }, ...list.map((t) => ({ title: t, value: t }))]
  })

  // A batch == a CourseInstance (the existing session/cohort concept).
  // Helper to read an instance's end-of-term range.
  function instanceTerm(ci) {
    return termFromDate(ci?.endDate || ci?.startDate) || 'Okänd'
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '–'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return '–'
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

// Whether a batch is "completed / past" per existing rules.
//   - The CourseInstance is explicitly deactivated (isActive false), or
//   - every enrollment in the batch has status === 'completed'
// (Deliberately NOT endDate < now: instances often get a grace period after
// their end date, and checked fixtures/legacy rows would otherwise be
// treated as read-only prematurely.)
  function isBatchCompleted(batch) {
    if (!batch) return false
    if (batch.isActive === false) return true

    const batchRows = rawEnrollmentItems.value.filter((item) => {
      const ci = item.courseInstance
      const instId = ci?._id?.toString() || ci?._id
      return instId === batch.value
    })
    if (batchRows.length === 0) return false
    return batchRows.every((item) => item.status === 'completed')
  }

  // Available Courses (distinct main courses a teacher can grade).
  const courseOptions = computed(() => {
    const map = new Map()

    for (const item of rawEnrollmentItems.value) {
      const ci = item.courseInstance
      const mainCourseId = ci?.mainCourseId?._id?.toString() || ci?.mainCourseId?.toString()

      // Legacy student.education rows have no CourseInstance; key them by courseRefId.
      const id = mainCourseId || item.courseRefId?.toString() || ci?._id?.toString() || item.enrollmentId
      if (!id) continue

      const term = termFromDate(item.endDate || item.startDate) || 'Okänd'
      if (selectedTerm.value !== 'all' && term !== selectedTerm.value) continue
      if (map.has(id)) continue

      const name = ci?.courseName || ci?.mainCourseId?.courseName || item.courseName || 'Kurs'
      const code = ci?.courseCode || ci?.mainCourseId?.courseCode || item.courseCode || ''
      const resultTypes = ci?.mainCourseId?.resultTypes || item.resultTypes || []

      map.set(id, {
        id,
        courseName: name,
        courseCode: code,
        term,
        instanceId: ci ? id : null,
        resultTypes,
        title: `${name} (${code})`,
        value: id,
      })
    }

    const list = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, 'sv'))
    if (list.length > 1) {
      return [{ id: 'all', courseName: 'Alla kurser', courseCode: 'ALLA', term: 'all', title: 'Alla kurser', value: 'all' }, ...list]
    }
    return list
  })

  // Selected Course Object
  const selectedCourse = computed(() => {
    if (!selectedCourseId.value || selectedCourseId.value === 'all') {
      if (courseOptions.value.length === 0) return null
      return { id: 'all', courseName: 'Alla kurser', courseCode: 'ALLA' }
    }
    return courseOptions.value.find((c) => c.value === selectedCourseId.value) || null
  })

  // Batches (CourseInstances) for the selected course.
  // One batch = one CourseInstance (a distinct intake/cohort of that course).
  const batchOptions = computed(() => {
    if (!selectedCourse.value || selectedCourse.value.id === 'all') return []
    const batches = new Map()

    for (const item of rawEnrollmentItems.value) {
      const ci = item.courseInstance
      const instId = ci?._id?.toString() || ci?._id
      const mainCourseId = ci?.mainCourseId?._id?.toString() || ci?.mainCourseId?.toString()
      const isCourseMatch = mainCourseId
        ? mainCourseId === selectedCourse.value.id
        : instId === selectedCourse.value.id
      if (!isCourseMatch) continue

      let ciId = instId
      if (!ciId) {
        // Legacy row without instance: group under the course id as a synthetic batch
        ciId = item.courseRefId?.toString() || item.enrollmentId
      }
      if (!ciId || batches.has(ciId)) continue

      const term = instanceTerm(ci) || termFromDate(item.endDate || item.startDate) || 'Okänd'
      if (selectedTerm.value !== 'all' && term !== selectedTerm.value) continue

      batches.set(ciId, {
        id: ciId,
        value: ciId,
        term,
        title: `${term} - ${formatDateShort(ci?.startDate || item.startDate)} → ${formatDateShort(ci?.endDate || item.endDate)}`,
        startDate: ci?.startDate || item.startDate,
        endDate: ci?.endDate || item.endDate,
        isActive: ci?.isActive !== false,
      })
    }

    const list = Array.from(batches.values()).sort((a, b) => (a.startDate || 0) - (b.startDate || 0))

    // Legacy student.education rows have no CourseInstance; offer a synthetic
    // single batch scoped to the course so they remain viewable/gradeable.
    if (list.length === 0) {
      const legacyItem = rawEnrollmentItems.value.find(
        (item) => !item.courseInstance &&
          (item.courseRefId === selectedCourse.value.id || item.courseRefId?._id?.toString() === selectedCourse.value.id),
      )
      if (legacyItem) {
        const term = termFromDate(legacyItem.endDate || legacyItem.startDate) || 'Okänd'
        if (selectedTerm.value === 'all' || term === selectedTerm.value) {
          list.push({
            id: selectedCourse.value.id,
            value: selectedCourse.value.id,
            term,
            title: `${term} - (kursomgång saknas)`,
            startDate: legacyItem.startDate || null,
            endDate: legacyItem.endDate || null,
            isActive: true,
          })
        }
      }
    }

    return list
  })

  // The currently selected batch object
  const selectedBatch = computed(() => {
    const batches = batchOptions.value
    if (!selectedBatchId.value || !batches || batches.length === 0) return null
    return batches.find((b) => b.value === selectedBatchId.value) || null
  })

  // 22.3 Completed / past batch → read-only
  const batchIsCompleted = computed(() => isBatchCompleted(selectedBatch.value))
  // Convenience alias used to disable editing/saving across the UI
  const batchReadOnly = computed(() => batchIsCompleted.value)

  // 22.5 Batch switch: reset re-scoped state (search/filter/sort/result type).
  function onBatchChange() {
    const previous = previousBatchId.value || selectedBatchId.value
    if (hasUnsavedChanges.value) {
      const ok = window.confirm('Du har osparade ändringar. Vill du byta batch ändå?')
      if (!ok) {
        // Restore the previous selection after the v-model already updated.
        if (previous) selectedBatchId.value = previous
        return
      }
    }
    activeResultTypeId.value = 'final_grade'
    searchQuery.value = ''
    activeFilter.value = 'all'
    sortBy.value = 'name-asc'
    buildRowsForSelectedCourse()
  }

  // 18. Available Result Types for the Selected Course
  const availableResultTypes = computed(() => {
    if (!selectedCourse.value) return [{ id: 'final_grade', label: 'Slutbetyg', type: 'grade' }]
    const customTypes = selectedCourse.value.resultTypes || []
    if (customTypes.length > 0) {
      return customTypes
    }
    // Default: Final Grade (+ National test if national course)
    const list = [{ id: 'final_grade', label: 'Slutbetyg', type: 'grade' }]
    if (isNationalCourse(selectedCourse.value.courseCode) || rows.value.some((r) => isNationalCourse(r.course?.courseCode))) {
      list.push({ id: 'national_test', label: 'Nationellt prov', type: 'numeric', min: 0, max: 100 })
    }
    return list
  })

  const activeResultType = computed(() => {
    const found = availableResultTypes.value.find((rt) => rt.id === activeResultTypeId.value)
    return found || availableResultTypes.value[0] || { id: 'final_grade', label: 'Slutbetyg', type: 'grade' }
  })

  const shouldShowNpColumn = computed(() => {
    if (activeResultTypeId.value === 'national_test') return false
    if (selectedCourse.value && selectedCourse.value.id !== 'all') {
      return isNationalCourse(selectedCourse.value.courseCode)
    }
    return rows.value.some((r) => isNationalCourse(r.course?.courseCode))
  })

  // Filtered & Sorted Rows
  const filteredRows = computed(() => {
    let result = [...rows.value]

    // Search query
    const q = searchQuery.value.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (r) =>
          r.student.name?.toLowerCase().includes(q) ||
          r.student.email?.toLowerCase().includes(q) ||
          r.student.personalNumber?.toLowerCase().includes(q)
      )
    }

    // Filter status
    if (activeFilter.value === 'ungraded') {
      result = result.filter((r) => !r.course.grade && !r.course.locked)
    } else if (activeFilter.value === 'graded') {
      result = result.filter((r) => !!r.course.grade)
    } else if (activeFilter.value === 'failing') {
      result = result.filter((r) => r.course.grade === 'F')
    } else if (activeFilter.value === 'locked') {
      result = result.filter((r) => r.course.locked)
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy.value === 'name-asc') {
        return (a.student.name || '').localeCompare(b.student.name || '', 'sv')
      } else if (sortBy.value === 'name-desc') {
        return (b.student.name || '').localeCompare(a.student.name || '', 'sv')
      } else if (sortBy.value === 'grade-asc') {
        return (a.course.grade || 'Z').localeCompare(b.course.grade || 'Z')
      } else if (sortBy.value === 'status') {
        return getStatusLabel(a).localeCompare(getStatusLabel(b), 'sv')
      }
      return 0
    })

    return result
  })

  // Summary Metrics
  const summary = computed(() => {
    const total = rows.value.length
    const graded = rows.value.filter((r) => !!r.course.grade).length
    const remaining = total - graded
    const percentGraded = total > 0 ? Math.round((graded / total) * 100) : 0
    return { total, graded, remaining, percentGraded }
  })

  // Unsaved Count
  const unsavedCount = computed(() => rows.value.filter((r) => r.isDirty).length)

  // Track Unsaved Changes for Navigation Guard
  const hasUnsavedChanges = computed(() => unsavedCount.value > 0)

  // Status computation for rows
  function getStatusLabel(row) {
    if (row.course.locked) return '🔒 Låst'
    if (row.isDirty) return '● Osparad'
    if (row.course.grade) return '✓ Sparat'
    return 'Saknas'
  }

  function getStatusColor(row) {
    if (row.course.locked) return 'grey-darken-1'
    if (row.isDirty) return 'amber-darken-3'
    if (row.course.grade === 'F') return 'error'
    if (row.course.grade) return 'success'
    return 'default'
  }

  function getDisplayValue(row) {
    if (activeResultTypeId.value === 'final_grade') {
      return row.course.grade || ''
    }
    return row.assessmentValues[activeResultTypeId.value] ?? ''
  }

  // Mark Row Dirty
  function markRowDirty(row) {
    row.isDirty = true
    row.errorMessage = null
  }

  function onNpScoreChange(row) {
    markRowDirty(row)
    if (row.course.npScore !== null && row.course.npScore !== undefined) {
      suggestGrade(row.course)
    }
  }

  // Handle Grade Change (with F special handling)
  function handleGradeChange(row, newGrade) {
    if (batchReadOnly.value) return
    if (newGrade === 'F') {
      // Open F modal
      previousGradeBeforeF.value = row.course.grade || ''
      currentFRow.value = row
      currentFMotivation.value = row.course.reason || ''
      currentFComments.value = row.course.comments || ''
      fModalError.value = ''
      fModalOpen.value = true
    } else {
      row.course.grade = newGrade
      markRowDirty(row)
    }
  }

  function cancelFModal() {
    if (currentFRow.value) {
      currentFRow.value.course.grade = previousGradeBeforeF.value
    }
    fModalOpen.value = false
    currentFRow.value = null
  }

  function confirmFModal() {
    if (!currentFMotivation.value || !currentFMotivation.value.trim()) {
      fModalError.value = 'Motivering är obligatorisk vid betyg F.'
      return
    }
    if (currentFRow.value) {
      currentFRow.value.course.grade = 'F'
      currentFRow.value.course.reason = currentFMotivation.value.trim()
      if (currentFComments.value) {
        currentFRow.value.course.comments = currentFComments.value.trim()
      }
      markRowDirty(currentFRow.value)
    }
    fModalOpen.value = false
    currentFRow.value = null
  }

  // Fast Keyboard Entry: Enter key moves to next student's field
  function handleEnterKey(row, index) {
    const nextIndex = index + 1
    if (nextIndex < filteredRows.value.length) {
      const nextInput = document.getElementById(`input-grade-${nextIndex}`) ||
                         document.getElementById(`input-res-${nextIndex}`)
      if (nextInput) {
        nextInput.focus()
      }
    }
  }

  // 10. Grade Suggestion
  const suggestGrade = async (course) => {
    course.suggestedGrade = null
    course.suggestChecked = false
    const subject = nationalSubject(course.courseCode)
    const term = termFromDate(course.endDate)
    if (subject === null || term === null) return
    if (typeof course.npScore !== 'number' || course.npScore < 0) return
    try {
      const { data } = await client.get('/grading-scale/suggest', {
        params: { term, subject, points: course.npScore },
      })
      course.suggestedGrade = data.grade
      course.suggestChecked = true
    } catch {
      // Suggestion helper fails gracefully without blocking grading
    }
  }

  // Open Student Detail Drawer
  function openStudentDetail(row) {
    activeDetailRow.value = row
    detailDrawerOpen.value = true
  }

  function closeDetailDrawer() {
    detailDrawerOpen.value = false
    activeDetailRow.value = null
  }

  // Reset Filters
  function resetFilters() {
    searchQuery.value = ''
    activeFilter.value = 'all'
  }

  function onTermChange() {
    if (selectedCourseId.value && selectedCourseId.value !== 'all' && !courseOptions.value.some((c) => c.value === selectedCourseId.value)) {
      const firstRealCourse = courseOptions.value.find((c) => c.id !== 'all')
      selectedCourseId.value = firstRealCourse?.value || null
    }
    if (selectedBatchId.value && !batchOptions.value.some((b) => b.value === selectedBatchId.value)) {
      selectedBatchId.value = batchOptions.value[0]?.value || null
    }
    buildRowsForSelectedCourse()
  }

  // 22.4 Course switch: re-scope to the course's first batch and reset
  // term/search/filter/sort/result-type.
  function onCourseChange() {
    activeResultTypeId.value = 'final_grade'
    searchQuery.value = ''
    activeFilter.value = 'all'
    sortBy.value = 'name-asc'
    selectedBatchId.value = batchOptions.value[0]?.value || null
    buildRowsForSelectedCourse()
  }

  // Load Data
  const loadStudents = async () => {
    loading.value = true
    try {
      // includeGraded=true returns graded *and* ungraded students for every
      // batch, so previously saved results persist and active/past batches
      // are viewable (batch scoping happens locally per selection).
      const { data } = await client.get('/students-to-grade', {
        params: { includeGraded: 'true' },
      })
      const rawStudents = Array.isArray(data) ? data : []
      rawEnrollmentItems.value = rawStudents

      // Build backward compatible studentsToGrade map for tests
      const studentMap = new Map()
      rawStudents.forEach((item) => {
        const studentId = item.student?._id?.toString() || item.student?._id
        if (!studentId) return

        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            _id: studentId,
            name: item.student?.name || 'Okänd elev',
            email: item.student?.email || '',
            personalNumber: item.student?.personalNumber || '',
            teacherId: item.student?.teacherId || null,
            coursesToGrade: [],
          })
        }

        const student = studentMap.get(studentId)
        let courseData = null

        if (item.courseInstance) {
          const ci = item.courseInstance
          const mainCourse = ci.mainCourseId
          const courseId = mainCourse?._id?.toString() || mainCourse?._id || ci._id?.toString() || ci._id
          courseData = {
            refId: courseId,
            courseCode: ci.courseCode || mainCourse?.courseCode || '-',
            courseName: ci.courseName || mainCourse?.courseName || 'Okänd kurs',
            courseInstanceId: ci._id?.toString() || ci._id,
            responsibleTeacher: ci.responsibleTeacher,
            teacherName: ci.responsibleTeacher?.userId?.username || 'Ej tilldelad',
            grade: item.grade || '',
            reason: item.reason || '',
            comments: item.comments || '',
            npScore: item.npScore ?? null,
            assessmentResults: item.assessmentResults || {},
            locked: item.locked || false,
            type: 'Course',
            endDate: item.endDate,
            enrollmentId: item.enrollmentId,
            source: 'enrollment',
          }
        } else if (item.source === 'student_education') {
          courseData = {
            refId: item.courseRefId || item.enrollmentId,
            courseCode: item.courseCode || '-',
            courseName: item.courseName || 'Kurs (från utbildning)',
            grade: item.grade || '',
            reason: item.reason || '',
            comments: item.comments || '',
            npScore: item.npScore ?? null,
            assessmentResults: item.assessmentResults || {},
            locked: item.locked || false,
            type: 'Course',
            endDate: item.endDate,
            enrollmentId: item.enrollmentId,
            source: 'student_education',
          }
        }

        if (courseData) {
          student.coursesToGrade.push(courseData)
        }
      })

      studentsToGrade.value = Array.from(studentMap.values()).filter((s) => s.coursesToGrade.length > 0)

      // 22.1 Default: first course (its first batch) is pre-selected so a
      // teacher lands directly on a scoped grading list. "Alla kurser" is no
      // longer a grading mode (mixing batches is explicitly out of scope).
      const firstRealCourse = courseOptions.value.find((c) => c.id !== 'all')
      if (firstRealCourse) {
        selectedCourseId.value = firstRealCourse.value
      }

      if (selectedCourseId.value && batchOptions.value.length > 0) {
        selectedBatchId.value = batchOptions.value[0].value
      }

      buildRowsForSelectedCourse()
    } catch (err) {
      toast.error('Kunde inte ladda elever.')
    } finally {
      loading.value = false
    }
  }

  // Build rows for the selected course + batch
  function buildRowsForSelectedCourse() {
    const rawItems = rawEnrollmentItems.value
    if (!rawItems || rawItems.length === 0) {
      rows.value = []
      return
    }

    const currentCourse = selectedCourse.value
    const currentBatchId = selectedBatchId.value
    const isAll = !selectedCourseId.value || selectedCourseId.value === 'all'

    const matchedRows = []

    for (const item of rawItems) {
      const ci = item.courseInstance
      const instId = ci?._id?.toString() || ci?._id
      const mainCourseId = ci?.mainCourseId?._id?.toString() || ci?.mainCourseId?._id

      // Strict scope: the row must belong to the selected COURSE *and* BATCH.
      //   - Course match: mainCourseId equals the selected course, or (legacy
      //     rows) item.courseRefId/enrollmentId matches.
      //   - Batch match: instance/_id equals the selected batch. Rows without
      //     an instance (legacy student.education) fall back to the course
      //     scope so they remain visible for the single-course selection.
      const batchMatches =
        !currentBatchId || (instId && instId === currentBatchId) || (!instId && !isAll)

      const courseMatches =
        isAll ||
        (mainCourseId && mainCourseId === selectedCourseId.value) ||
        (!mainCourseId && instId && instId === selectedCourseId.value) ||
        (!mainCourseId && item.courseRefId?.toString() === selectedCourseId.value) ||
        selectedCourseId.value === item.enrollmentId

      if (!courseMatches || !batchMatches) continue

      const student = item.student || { _id: 'unknown', name: 'Okänd elev' }
      const course = {
        refId: mainCourseId || item.courseRefId || item.enrollmentId,
        courseCode: ci?.courseCode || ci?.mainCourseId?.courseCode || item.courseCode || currentCourse?.courseCode || '-',
        courseName: ci?.courseName || ci?.mainCourseId?.courseName || item.courseName || currentCourse?.courseName || 'Okänd kurs',
        courseInstanceId: instId,
        grade: item.grade || '',
        reason: item.reason || '',
        comments: item.comments || '',
        npScore: item.npScore ?? null,
        locked: item.locked || false,
        enrollmentId: item.enrollmentId,
        source: item.source || 'enrollment',
        gradeDate: item.gradeDate,
        gradeBy: item.gradeBy,
        status: item.status || null,
        teacherName: ci?.responsibleTeacher?.userId?.username || 'Ej tilldelad',
        endDate: item.endDate,
      }

      const assessmentValues = { ...(item.assessmentResults || {}) }

      matchedRows.push({
        id: `${student._id}-${course.refId || course.enrollmentId}`,
        student,
        course,
        assessmentValues,
        isDirty: false,
        errorMessage: null,
        unauthorized: false,
      })
    }

    rows.value = matchedRows
  }

  // 16. Save Single Row
  const saveGrade = async (studentId, course, rowId) => {
    // Kept for backward compatibility with existing tests
    if (!course.grade) {
      toast.error('Välj ett betyg innan du sparar.')
      return
    }
    if (!course.reason || course.reason.trim() === '') {
      toast.error('Betygsättning måste ha en motivering.')
      return
    }

    savingRowId.value = rowId || course.enrollmentId
    try {
      if (course.enrollmentId && course.source === 'enrollment') {
        await client.put(`/update-grade/${course.enrollmentId}`, {
          grade: course.grade,
          motivation: course.reason || '',
          comments: course.comments || '',
          nationalTestPoints: course.npScore || null,
        })
      } else {
        await client.post('/teacher/save-grade/', {
          studentId,
          courseId: course.refId,
          grade: course.grade,
          reason: course.reason,
          comments: course.comments,
          npScore: course.npScore,
          type: course.type || 'Course',
        })
      }
      toast.success('✓ Betyg sparat!')
      await loadStudents()
    } catch (err) {
      toast.error('Kunde inte spara betyg: ' + (err.response?.data?.error || err.message || 'Okänt fel'))
      throw err
    } finally {
      savingRowId.value = null
    }
  }

  const saveSingleRow = async (row) => {
    // Completed / past batch is read-only
    if (batchReadOnly.value) return

    // Validate F motivation
    if (activeResultTypeId.value === 'final_grade' && row.course.grade === 'F' && (!row.course.reason || !row.course.reason.trim())) {
      row.errorMessage = 'Motivering krävs vid betyg F.'
      toast.error(`${row.student.name}: Motivering krävs vid betyg F.`)
      return
    }

    savingRowId.value = row.id
    row.errorMessage = null
    try {
      if (row.course.enrollmentId && row.course.source === 'enrollment') {
        const payload = {
          grade: row.course.grade || undefined,
          motivation: row.course.reason || '',
          comments: row.course.comments || '',
          nationalTestPoints: row.course.npScore ?? null,
        }
        if (activeResultTypeId.value !== 'final_grade') {
          payload.resultType = activeResultTypeId.value
          payload.value = row.assessmentValues[activeResultTypeId.value]
        }
        await client.put(`/update-grade/${row.course.enrollmentId}`, payload)
      } else {
        await client.post('/teacher/save-grade/', {
          studentId: row.student._id,
          courseId: row.course.refId,
          grade: row.course.grade,
          reason: row.course.reason,
          comments: row.course.comments,
          npScore: row.course.npScore,
          type: 'Course',
        })
      }
      row.isDirty = false
      toast.success('✓ Betyg sparat!')
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Okänt fel'
      row.errorMessage = msg
      toast.error(`${row.student.name}: ${msg}`)
    } finally {
      savingRowId.value = null
    }
  }

  // 5. Bulk Save All Changes
  const saveAllChanges = async () => {
    // Completed / past batch is read-only
    if (batchReadOnly.value) return

    const dirtyRows = rows.value.filter((r) => r.isDirty && !r.course.locked)
    if (dirtyRows.length === 0) return

    bulkSaving.value = true
    let savedCount = 0
    const failures = []

    for (const row of dirtyRows) {
      // Validate F motivation
      if (activeResultTypeId.value === 'final_grade' && row.course.grade === 'F' && (!row.course.reason || !row.course.reason.trim())) {
        row.errorMessage = 'Motivering krävs vid betyg F.'
        failures.push(`${row.student.name}: Motivering krävs vid betyg F.`)
        continue
      }

      try {
        if (row.course.enrollmentId && row.course.source === 'enrollment') {
          const payload = {
            grade: row.course.grade || undefined,
            motivation: row.course.reason || '',
            comments: row.course.comments || '',
            nationalTestPoints: row.course.npScore ?? null,
          }
          if (activeResultTypeId.value !== 'final_grade') {
            payload.resultType = activeResultTypeId.value
            payload.value = row.assessmentValues[activeResultTypeId.value]
          }
          await client.put(`/update-grade/${row.course.enrollmentId}`, payload)
        } else {
          await client.post('/teacher/save-grade/', {
            studentId: row.student._id,
            courseId: row.course.refId,
            grade: row.course.grade,
            reason: row.course.reason,
            comments: row.course.comments,
            npScore: row.course.npScore,
            type: 'Course',
          })
        }
        row.isDirty = false
        row.errorMessage = null
        savedCount++
      } catch (err) {
        const errorMsg = err.response?.data?.error || err.message || 'Okänt fel'
        row.errorMessage = errorMsg
        failures.push(`${row.student.name}: ${errorMsg}`)
      }
    }

    bulkSaving.value = false

    if (savedCount > 0) {
      toast.success(savedCount === 1 ? '✓ Betyg sparat!' : `✓ ${savedCount} betyg sparade`)
    }
    if (failures.length > 0) {
      toast.error(`Kunde inte spara ${failures.length} betyg: ${failures.join(' | ')}`)
    }
  }

  // 9. Toggle Grade Lock
  const toggleLock = async (studentId, courseId, isCurrentlyLocked, enrollmentId, row) => {
    try {
      if (!isCurrentlyLocked) {
        await client.post('/teacher/lock-grade', {
          studentId,
          courseId,
          enrollmentId,
        })
        toast.success('Betyg låst! Meddelande skickat till administratörer.')
        if (row) row.course.locked = true
      } else {
        if (!isAdmin.value) {
          toast.error('Endast administratörer kan låsa upp ett låst betyg.')
          return
        }
        await client.put('/admin/unlock-grade', {
          studentId,
          courseId,
          enrollmentId,
        })
        toast.success('Betyg upplåst!')
        if (row) row.course.locked = false
      }
      await loadStudents()
    } catch (err) {
      toast.error('Kunde inte ändra låsstatus: ' + (err.response?.data?.error || err.message || 'Okänt fel'))
    }
  }

  // Navigation Guard: Warn if unsaved changes exist
  try {
    const routeLeaveGuard = vueRouter?.onBeforeRouteLeave
    if (typeof routeLeaveGuard === 'function') {
      routeLeaveGuard((to, from, next) => {
        if (hasUnsavedChanges.value) {
          const confirmLeave = window.confirm('Du har osparade ändringar. Vill du lämna sidan ändå?')
          if (confirmLeave) {
            next()
          } else {
            next(false)
          }
        } else {
          next()
        }
      })
    }
  } catch {
    // vue-router mock in unit tests may not export onBeforeRouteLeave
  }

  const handleBeforeUnload = (e) => {
    if (hasUnsavedChanges.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  onMounted(() => {
    loadStudents()
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  // Watch selectedCourseId to rebuild rows
  watch(selectedCourseId, () => {
    buildRowsForSelectedCourse()
  })

  defineExpose({
    studentsToGrade,
    loadStudents,
    saveGrade,
    suggestGrade,
    saveAllChanges,
    toggleLock,
  })
</script>

<style scoped>
  .betyg-container {
    max-width: 1320px;
    margin: 0 auto;
    font-family: inherit;
  }

  .text-slate-800 {
    color: #1e293b;
  }

  .selectors-bar {
    min-width: 320px;
  }

  .selector-field {
    min-width: 170px;
  }

  .summary-card {
    background-color: #ffffff;
    border-color: #e2e8f0 !important;
    border-radius: 8px;
  }

  .sticky-action-bar {
    position: sticky;
    top: 64px;
    z-index: 10;
    border-color: #e2e8f0 !important;
    background-color: #ffffff;
  }

  .search-field {
    max-width: 240px;
    min-width: 160px;
  }

  .sort-select {
    max-width: 180px;
    min-width: 140px;
  }

  /* Table styling */
  .table-responsive {
    overflow-x: auto;
    border-color: #e2e8f0 !important;
  }

  .grading-table {
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .grading-table th {
    background-color: #f8fafc;
    color: #475569;
    font-weight: 600;
    padding: 12px 16px;
    text-align: left;
    border-bottom: 2px solid #e2e8f0;
    white-space: nowrap;
  }

  .grading-table td {
    padding: 10px 16px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }

  .grading-table tbody tr:hover {
    background-color: #f8fafc;
  }

  .row-locked {
    background-color: #f8fafc;
  }

  .row-dirty {
    background-color: #fffbeb;
  }

  .row-failing {
    background-color: #fef2f2;
  }

  .col-num {
    width: 48px;
    text-align: center;
  }

  .col-student {
    min-width: 220px;
  }

  .col-input {
    min-width: 140px;
    width: 160px;
  }

  .col-np {
    min-width: 140px;
    width: 160px;
  }

  .col-status {
    min-width: 120px;
    width: 130px;
  }

  .col-actions {
    min-width: 120px;
  }

  .compact-grade-select,
  .compact-numeric-input,
  .compact-np-input,
  .compact-date-input,
  .compact-text-input {
    max-width: 130px;
  }

  .student-link {
    color: #0f172a;
    transition: color 0.15s;
  }

  .student-link:hover {
    color: #2563eb;
  }

  .locked-badge {
    background-color: #f1f5f9;
    font-size: 0.85rem;
    display: inline-block;
  }

  .suggested-grade-hint {
    margin-top: 2px;
    font-size: 0.75rem;
    color: #64748b;
  }

  .suggested-grade-hint strong {
    color: #2563eb;
  }

  .empty-state {
    border-color: #e2e8f0 !important;
  }

  .border-t {
    border-top: 1px solid #e2e8f0;
  }

  .border-b {
    border-bottom: 1px solid #e2e8f0;
  }

  .gap-1 {
    gap: 4px;
  }
  .gap-2 {
    gap: 8px;
  }
  .gap-3 {
    gap: 12px;
  }

  .mobile-student-card {
    border-color: #e2e8f0 !important;
    border-radius: 8px;
  }
</style>
