<template>
  <div class="scrollable-view">
    <div class="container mt-4">
      <h1 class="page-title">Min profil</h1>
      <div class="profile-layout">
        <aside class="profile-sidebar">
          <ul class="sidebar-menu">
            <li
              v-for="item in menuItems"
              :key="item.key"
              :class="{ active: activeSection === item.key }"
              @click="activeSection = item.key"
            >
              <span class="sidebar-icon" v-html="item.icon"></span>
              {{ item.label }}
            </li>
          </ul>
        </aside>

        <main class="profile-content">
          <!-- Min profil -->
          <div v-if="activeSection === 'info'" class="card">
            <div class="card-header"><h3>Kontouppgififter</h3></div>
            <div class="card-body">
              <div class="info-grid">
                <div class="info-item">
                  <label>Namn</label>
                  <span>{{ user?.name || user?.userId || 'Ej angivet' }}</span>
                </div>
                <div class="info-item">
                  <label>E-post</label>
                  <span>{{ user?.email || 'Ej angivet' }}</span>
                </div>
                <div class="info-item">
                  <label>Roll</label>
                  <span>{{ roleLabel }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Byt lösenord -->
          <div v-if="activeSection === 'password'" class="card">
            <div class="card-header"><h3>Byt lösenord</h3></div>
            <div class="card-body">
              <form class="password-form" @submit.prevent="handleChangePassword">
                <div class="form-group">
                  <label for="currentPassword">Nuvarande lösenord</label>
                  <input
                    id="currentPassword"
                    v-model="currentPassword"
                    type="password"
                    required
                    autocomplete="current-password"
                    class="form-control"
                  />
                </div>

                <div class="form-group">
                  <label for="newPassword">Nytt lösenord</label>
                  <input
                    id="newPassword"
                    v-model="newPassword"
                    type="password"
                    placeholder="Minst 8 tecken, med stor/små bokstav, siffra och specialtecken"
                    required
                    autocomplete="new-password"
                    class="form-control"
                    :class="{ 'input-error': newPasswordError }"
                    @input="newPasswordError = validatePassword(newPassword)"
                  />
                  <span v-if="newPasswordError" class="field-error">{{ newPasswordError }}</span>
                </div>

                <div class="form-group">
                  <label for="confirmPassword">Bekräfta nytt lösenord</label>
                  <input
                    id="confirmPassword"
                    v-model="confirmPassword"
                    type="password"
                    required
                    autocomplete="new-password"
                    class="form-control"
                  />
                  <span v-if="confirmPassword && confirmPassword !== newPassword" class="field-error">
                    Lösenorden matchar inte.
                  </span>
                </div>

                <div v-if="message" class="alert" :class="messageType === 'success' ? 'alert-success' : 'alert-danger'">
                  {{ message }}
                </div>

                <button
                  type="submit"
                  class="btn btn-primary"
                  :disabled="isLoading"
                >
                  {{ isLoading ? 'Byter...' : 'Byt lösenord' }}
                </button>
              </form>
            </div>
          </div>

          <!-- Att göra -->
          <div v-if="activeSection === 'tasks'" class="card">
            <div class="card-header"><h3>Att göra</h3></div>
            <div class="card-body">
              <ul class="task-list">
                <li
                  v-for="task in tasks"
                  :key="task._id"
                  class="task-item"
                  :class="{ done: task.isDone }"
                >
                  <div class="task-left">
                    <input
                      type="checkbox"
                      class="task-check"
                      :checked="task.isDone"
                      @change="toggleTaskCompletion(task)"
                    />
                    <div class="task-info">
                      <span class="task-text">{{ task.description }}</span>
                      <div v-if="task.dueDate || task.dueTime" class="task-schedule">
                        <input
                          v-model="task.dueDate"
                          type="date"
                          class="task-schedule-input"
                          @change="updateTaskSchedule(task)"
                        />
                        <input
                          v-model="task.dueTime"
                          type="time"
                          class="task-schedule-input"
                          @change="updateTaskSchedule(task)"
                        />
                      </div>
                    </div>
                  </div>
                  <div v-if="task.dueDate || task.dueTime" class="task-countdown" :class="{ overdue: isTaskOverdueFor(task) }">
                    {{ remainingLabelFor(task) }}
                  </div>
                  <button class="btn-delete" @click="deleteTask(task._id)">Ta bort</button>
                </li>
              </ul>
              <div class="task-input-row">
                <input
                  v-model="newTask"
                  type="text"
                  class="form-control"
                  placeholder="Lägg till en uppgift..."
                  @keyup.enter="addTask"
                />
                <input v-model="taskDate" type="date" class="form-control task-schedule-input" />
                <input v-model="taskTime" type="time" class="form-control task-schedule-input" />
                <button class="btn btn-primary" @click="addTask">Lägg till</button>
              </div>
              <div v-if="tasks.length" class="task-footer">
                <button class="btn btn-outline-danger btn-sm" @click="deleteAllTasks">Rensa alla</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import { useToast } from '@/composables/useToast.js';
import client from '@/api/client.js';
import { remainingLabel, isTaskOverdue } from '@/utils/taskTime.js';

const ROLE_LABELS = {
  admin: 'Administratör',
  systemadmin: 'Systemadministratör',
  teacher: 'Lärare',
  coordinator: 'Samordnare',
  syv: 'SYV',
  specped: 'Specialpedagog',
  student: 'Elev',
  user: 'Användare',
};

export default {
  name: 'ProfilePage',
  setup() {
    const store = useStore();
    const router = useRouter();
    const toast = useToast();

    const user = computed(() => store.getters.userRole ? store.state.user : null);
    const isLoggedIn = computed(() => store.getters.isLoggedIn);
    onMounted(() => { if (!isLoggedIn.value) router.push('/login'); });
    onMounted(() => { store.dispatch('fetchTasks'); });

    const roleLabel = computed(() => {
      const role = user.value?.role || (user.value?.roles && user.value.roles[0]) || '';
      return ROLE_LABELS[role] || role;
    });

    const menuItems = [
      { key: 'info',     label: 'Min profil',  icon: '👤' },
      { key: 'password', label: 'Byt lösenord', icon: '🔒' },
      { key: 'tasks',    label: 'Att göra',     icon: '📋' },
    ];
    const activeSection = ref('info');

    const currentPassword = ref('');
    const newPassword = ref('');
    const confirmPassword = ref('');
    const newPasswordError = ref('');
    const message = ref('');
    const messageType = ref('error');
    const isLoading = ref(false);

    const newTask = ref('');
    const taskDate = ref('');
    const taskTime = ref('');
    const tasks = computed(() => store.getters.tasks);
    const now = ref(new Date());

    onMounted(() => {
      const tick = () => { now.value = new Date(); };
      tick();
      const interval = setInterval(tick, 30000);
      onBeforeUnmount(() => clearInterval(interval));
    });

    const remainingLabelFor = (task) =>
      remainingLabel(task.dueDate, task.dueTime, now.value);
    const isTaskOverdueFor = (task) =>
      isTaskOverdue(task.dueDate, task.dueTime, now.value);

    const addTask = () => {
      if (!newTask.value.trim()) return;
      store.dispatch('addTask', {
        description: newTask.value,
        dueDate: taskDate.value || null,
        dueTime: taskTime.value || null,
      });
      newTask.value = '';
      taskDate.value = '';
      taskTime.value = '';
    };

    const updateTaskSchedule = (task) => {
      store.dispatch('updateTask', {
        ...task,
        dueDate: task.dueDate || null,
        dueTime: task.dueTime || null,
      });
    };

    const toggleTaskCompletion = (task) => {
      store.dispatch('updateTask', { ...task, isDone: !task.isDone });
    };

    const deleteTask = (taskId) => {
      store.dispatch('deleteTask', taskId);
    };

    const deleteAllTasks = () => {
      store.dispatch('deleteAllTasks');
    };

    const validatePassword = (password) => {
      if (!password) return 'Ange ett nytt lösenord.';
      const checks = [
        { ok: password.length >= 8, msg: 'Lösenordet måste vara minst 8 tecken långt.' },
        { ok: /[A-Z]/.test(password), msg: 'Lösenordet måste innehålla minst en stor bokstav (A–Z).' },
        { ok: /[a-z]/.test(password), msg: 'Lösenordet måste innehålla minst en liten bokstav (a–z).' },
        { ok: /\d/.test(password), msg: 'Lösenordet måste innehålla minst en siffra (0–9).' },
        { ok: /[!@#$%^&*(),.?":{}|<>]/.test(password), msg: 'Lösenordet måste innehålla ett specialtecken, t.ex. ! @ # $ % ^ & * ( ) , . ? " : { } | < >' },
      ];
      return checks.find((c) => !c.ok)?.msg || '';
    };

    const handleChangePassword = async () => {
      if (isLoading.value) return;
      message.value = '';
      newPasswordError.value = '';

      const validationError = validatePassword(newPassword.value);
      if (validationError) {
        newPasswordError.value = validationError;
        message.value = validationError;
        messageType.value = 'error';
        return;
      }
      if (newPassword.value !== confirmPassword.value) {
        message.value = 'De nya lösenorden matchar inte.';
        messageType.value = 'error';
        return;
      }

      isLoading.value = true;
      try {
        const result = await store.dispatch('changePassword', {
          currentPassword: currentPassword.value,
          newPassword: newPassword.value,
        });
        if (result.success) {
          toast.success('Lösenordet har ändrats!');
          message.value = 'Lösenordet har ändrats.';
          messageType.value = 'success';
          currentPassword.value = '';
          newPassword.value = '';
          confirmPassword.value = '';
        } else {
          message.value = result.message || 'Lösenordsändringen misslyckades.';
          messageType.value = 'error';
        }
      } catch {
        message.value = 'Ett fel uppstod. Försök igen.';
        messageType.value = 'error';
      } finally {
        isLoading.value = false;
      }
    };

    return {
      user,
      roleLabel,
      menuItems,
      activeSection,
      currentPassword,
      newPassword,
      confirmPassword,
      newPasswordError,
      message,
      messageType,
      isLoading,
      validatePassword,
      handleChangePassword,
      newTask,
      taskDate,
      taskTime,
      tasks,
      addTask,
      updateTaskSchedule,
      remainingLabelFor,
      isTaskOverdueFor,
      toggleTaskCompletion,
      deleteTask,
      deleteAllTasks,
    };
  },
};
</script>

<style scoped>
.page-title {
  font-size: 1.6rem;
  color: #2c3e50;
  margin-bottom: 16px;
}

.profile-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.profile-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow: hidden;
}

.sidebar-menu {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sidebar-menu li {
  padding: 14px 20px;
  cursor: pointer;
  color: #495057;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.15s, color 0.15s;
}

.sidebar-menu li:last-child {
  border-bottom: none;
}

.sidebar-menu li:hover {
  background: #f8f9fa;
}

.sidebar-menu li.active {
  background: #007bff;
  color: white;
}

.sidebar-icon {
  font-size: 1.1rem;
}

.profile-content {
  flex: 1;
  min-width: 0;
}

.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card-header {
  background: #f8f9fa;
  padding: 14px 20px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.card-body {
  padding: 20px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.info-item label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6c757d;
  margin-bottom: 4px;
}

.info-item span {
  font-size: 1rem;
  color: #212529;
}

.password-form {
  max-width: 480px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #495057;
  margin-bottom: 6px;
}

.form-control {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #dee2e6;
  border-radius: 6px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-control:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0,123,255,0.15);
}

.form-control.input-error {
  border-color: #dc3545;
}

.field-error {
  display: block;
  color: #dc3545;
  font-size: 0.8125rem;
  margin-top: 4px;
}

.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.alert-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.alert-danger {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.task-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.task-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.task-schedule {
  display: flex;
  gap: 8px;
}

.task-schedule-input {
  width: auto;
  padding: 4px 6px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 0.8rem;
}

.task-countdown {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #667eea;
  background: #eef2ff;
  padding: 3px 8px;
  border-radius: 12px;
  white-space: nowrap;
}

.task-countdown.overdue {
  color: #dc3545;
  background: #fde8e8;
}

.task-check {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.task-text {
  font-size: 0.95rem;
  color: #212529;
  word-break: break-word;
}

.task-item.done .task-text {
  text-decoration: line-through;
  color: #6c757d;
}

.btn-delete {
  background: none;
  border: none;
  color: #dc3545;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
}

.btn-delete:hover {
  text-decoration: underline;
}

.task-input-row {
  display: flex;
  gap: 10px;
}

.task-input-row .form-control {
  flex: 1;
}

.task-footer {
  margin-top: 12px;
  text-align: right;
}

.btn-outline-danger {
  border: 1px solid #dc3545;
  color: #dc3545;
  background: transparent;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}

.btn-outline-danger:hover {
  background: #dc3545;
  color: white;
}
</style>
