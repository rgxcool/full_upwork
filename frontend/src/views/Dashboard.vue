<template>
  <main class="dashboard-page">
    <section v-if="loading" class="dashboard-loading" aria-live="polite">
      <div class="skeleton skeleton-wide"></div><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-copy"></div>
    </section>
    <template v-else>
    <section v-if="loadError" class="dashboard-error" role="alert">
      <strong>Kunde inte uppdatera notifieringar.</strong><span>{{ loadError }}</span><button type="button" @click="loadDashboard">Försök igen</button>
    </section>
    <section class="dashboard-hero">
      <div>
        <p class="eyebrow">Mindful Learning · Översikt</p>
        <h1>{{ greeting }}, {{ displayName }}</h1>
        <p class="hero-copy">Samlad arbetsyta för undervisning, uppföljning och nästa steg.</p>
      </div>
      <div class="hero-actions">
        <router-link class="primary-action" :to="primaryAction.to">{{ primaryAction.label }}</router-link>
        <router-link class="secondary-action" to="/messages">Meddelanden</router-link>
        <button class="hero-refresh" type="button" :disabled="refreshing" aria-live="polite" @click="loadDashboard">{{ refreshing ? 'Uppdaterar...' : 'Uppdatera' }}</button>
      </div>
    </section>

    <section class="stat-grid" aria-label="Snabb översikt">
      <article v-for="stat in stats" :key="stat.label" class="stat-card">
        <span class="stat-label">{{ stat.label }}</span>
        <strong>{{ stat.value }}</strong>
        <span class="stat-note">{{ stat.note }}</span>
      </article>
    </section>

    <section class="workspace-grid">
      <article class="panel quick-panel">
        <div class="panel-heading"><div><p class="eyebrow">Snabb åtkomst</p><h2>Fortsätt där du slutade</h2></div></div>
        <div class="quick-links">
          <router-link v-for="item in quickLinks" :key="item.to" :to="item.to" class="quick-link">
            <span class="quick-icon" aria-hidden="true">{{ item.icon }}</span>
            <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            <span aria-hidden="true">→</span>
          </router-link>
        </div>
      </article>

      <article v-if="role === 'student' && aplStatus" class="panel today-panel">
        <div class="panel-heading"><div><p class="eyebrow">Arbetspraktik</p><h2>APL-status</h2></div><span class="status-pill" :style="{ background: aplColor, color: '#fff' }">{{ aplStatusLabel }}</span></div>
        <ul class="check-list">
          <li v-if="aplPeriod"><span class="check-dot">✓</span><span><strong>Period</strong><small>{{ aplPeriod }}</small></span></li>
          <li v-if="aplWorkplace"><span class="check-dot">✓</span><span><strong>Arbetsplats</strong><small>{{ aplWorkplace }}</small></span></li>
          <li v-if="aplSupervisor"><span class="check-dot">✓</span><span><strong>Handledare</strong><small>{{ aplSupervisor }}</small></span></li>
          <li v-if="aplStatus.hasLogbook"><span class="check-dot">✓</span><span><strong>Loggbok</strong><small>Dokumentation finns för praktiken.</small></span></li>
          <li v-if="aplStatus.hasCv"><span class="check-dot">✓</span><span><strong>CV</strong><small>CV är uppladdat.</small></span></li>
        </ul>
      </article>

      <article v-else class="panel today-panel">
        <div class="panel-heading"><div><p class="eyebrow">Idag</p><h2>Din arbetsyta</h2></div><span class="status-pill">{{ roleLabel }}</span></div>
        <ul class="check-list">
          <li><span class="check-dot">1</span><span><strong>Kontrollera meddelanden</strong><small>Håll kommunikationen samlad i inkorgen.</small></span></li>
          <li><span class="check-dot">2</span><span><strong>Följ upp ärenden</strong><small>Uppgifter, betyg, APL och studieplaner.</small></span></li>
          <li><span class="check-dot">3</span><span><strong>Planera nästa steg</strong><small>Kalender för möten, prov och deadlines.</small></span></li>
        </ul>
      </article>
    </section>

    <section v-if="role === 'admin' || role === 'systemadmin'" class="completions-panel panel">
      <div class="panel-heading">
        <div><p class="eyebrow">Kursgenomförande</p><h2>Nyligen avslutade</h2></div>
        <router-link class="panel-link" to="/admin/completions">Visa alla →</router-link>
      </div>
      <p class="panel-copy">Nyligen avklarade kurser och kurspaket.</p>
      <div v-if="completions.length === 0" class="completions-empty">Inga avslutade kurser ännu.</div>
      <ul v-else class="completion-list">
        <li v-for="event in completions" :key="event._id" class="completion-row">
          <span class="completion-type">{{ event.completionType === 'course_package' ? 'Paket' : 'Kurs' }}</span>
          <span class="completion-body">
            <strong>{{ event.completionType === 'course_package' ? event.packageName : event.courseName }}</strong>
            <small>{{ event.studentName }} · {{ formatDate(event.completionDate) }}</small>
          </span>
          <span class="completion-meta">
            <small v-if="event.teacherName || event.teacherUserId">{{ event.teacherName || 'Lärare' }}</small>
            <small>{{ event.municipality || 'Intern' }}</small>
          </span>
        </li>
      </ul>
    </section>

    <section class="role-note panel" aria-label="Rollinformation">
      <div><p class="eyebrow">Rollbaserad vy</p><h2>Allt du behöver, utan brus.</h2><p>Menyn anpassas efter behörighet. Alla befintliga flöden finns kvar.</p></div>
      <router-link class="secondary-action" to="/profile">Min profil</router-link>
    </section>
    </template>
  </main>
</template>

<script>
import { computed, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import client from '@/api/client.js'

export default {
  name: 'DashboardPage',
  setup() {
    const store = useStore()
    const user = computed(() => store.state.user || {})
    const role = computed(() => store.getters.userRole)
    const loading = ref(true)
    const refreshing = ref(false)
    const loadError = ref('')
    const unreadCount = ref(null)
    const aplStatus = ref(null)
    const completions = ref([])
    // Map the real GET /apl/my fields onto the panel. /apl/my returns
    // status (color word), placementCompany (workplace), placementContact
    // (supervisor), and internshipStartDate/EndDate (period) — NOT the old
    // color/period/workplace/supervisor keys. This makes the student APL panel
    // render actual persisted data instead of blank rows.
    const aplColor = computed(() => {
      const colors = { GRAY: '#9e9e9e', BLUE: '#2196f3', YELLOW: '#ffc107', PURPLE: '#9c27b0', RED: '#f44336', GREEN: '#4caf50' }
      return colors[aplStatus.value?.status] || '#9e9e9e'
    })
    const aplStatusLabel = computed(() => {
      const labels = { GRAY: 'Inte påbörjad', BLUE: 'Pågående', YELLOW: 'Försenad', PURPLE: 'Avslutande', RED: 'Ej godkänd', GREEN: 'Godkänd' }
      return labels[aplStatus.value?.status] || 'Okänd'
    })
    const aplPeriod = computed(() => {
      const s = aplStatus.value?.internshipStartDate
      const e = aplStatus.value?.internshipEndDate
      if (!s && !e) return ''
      const fmt = (v) => (v ? String(v).slice(0, 10) : '–')
      return `${fmt(s)} → ${fmt(e)}`
    })
    const aplWorkplace = computed(() => aplStatus.value?.placementCompany || '')
    const aplSupervisor = computed(() => aplStatus.value?.placementContact || '')
    const displayName = computed(() => user.value.name || user.value.username || user.value.email?.split('@')[0] || 'där')
    const roleLabel = computed(() => ({ student: 'Elev', teacher: 'Lärare', admin: 'Administratör', systemadmin: 'Systemadministratör', syv: 'SYV', specped: 'Specialpedagog', coordinator: 'Koordinator' }[role.value] || 'Medarbetare'))
    const greeting = computed(() => new Date().getHours() < 12 ? 'God morgon' : new Date().getHours() < 18 ? 'God eftermiddag' : 'God kväll')
    const primaryAction = computed(() => role.value === 'student' ? { label: 'Mina kurser', to: '/course-cards' } : role.value === 'teacher' ? { label: 'Lärarvy', to: '/larare/kurser' } : { label: 'Öppna elever', to: '/students' })
    const stats = computed(() => role.value === 'student' ? [
      { label: 'Mina kurser', value: 'Se aktuella', note: 'kurser och framsteg' }, { label: 'Inlämningar', value: 'Följ upp', note: 'uppgifter och feedback' }, { label: 'Meddelanden', value: unreadCount.value === null ? 'Öppna' : `${unreadCount.value} olästa`, note: 'nya besked i inkorgen' }, { label: 'Kalender', value: 'Planera', note: 'möten och deadlines' },
    ] : [
      { label: 'Elevöversikt', value: 'Öppna', note: 'studentregister och uppföljning' }, { label: 'Kurser', value: 'Hantera', note: 'mallar och kursinstanser' }, { label: 'Kommunikation', value: 'Samlat', note: 'meddelanden och notiser' }, { label: 'Rapporter', value: 'Analysera', note: 'resultat och aktivitet' },
    ])
    const loadDashboard = async () => {
      refreshing.value = true
      loadError.value = ''
      try {
        const { data } = await client.get('/notifications')
        const notifications = Array.isArray(data) ? data : data?.notifications || []
        unreadCount.value = notifications.filter((item) => !item.read && !item.isRead).length
        if (role.value === 'student') {
          try {
            const { data: apl } = await client.get('/apl/my')
            aplStatus.value = apl
          } catch { aplStatus.value = null }
        }
        if (role.value === 'admin' || role.value === 'systemadmin') {
          try {
            const { data: res } = await client.get('/completions/overview', { params: { limit: 8 } })
            completions.value = res.events || []
          } catch {
            completions.value = []
          }
        }
      } catch (error) {
        loadError.value = error.message || 'Försök igen eller kontakta skoladministrationen.'
      } finally {
        loading.value = false
        refreshing.value = false
      }
    }

    const quickLinks = computed(() => role.value === 'student' ? [
      { to: '/course-cards', label: 'Mina kurser', description: 'Progress, moduler och studieintyg', icon: '01' }, { to: '/examform', label: 'Prövningar', description: 'Anmälan och kommande examinationer', icon: '02' }, { to: '/chatbot', label: 'Studieassistent', description: 'Få hjälp att komma vidare', icon: '03' }, { to: '/messages', label: 'Meddelanden', description: 'Se dialoger och nya besked', icon: '04' },
    ] : [
      { to: '/students', label: 'Elever', description: 'Sök och följ upp studerande', icon: '01' }, { to: '/larare/kurser', label: 'Mina kurser', description: 'Undervisning och kursarbete', icon: '02' }, { to: '/betyg', label: 'Betyg', description: 'Bedöm och följ resultat', icon: '03' }, { to: '/kalender', label: 'Kalender', description: 'Planera möten och prov', icon: '04' },
    ])
    const formatDate = (value) => (value ? new Date(value).toLocaleDateString('sv-SE') : '')
    onMounted(loadDashboard)

    return { displayName, role, roleLabel, greeting, primaryAction, stats, quickLinks, loading, refreshing, loadError, loadDashboard, aplStatus, aplColor, aplStatusLabel, aplPeriod, aplWorkplace, aplSupervisor, completions, formatDate }
  },
}
</script>

<style scoped>
.dashboard-page {
  min-height: 100%;
  padding: 32px 40px 48px;
  background: var(--color-bg);
  color: var(--color-text);
}
.dashboard-hero, .panel, .role-note, .dashboard-loading, .dashboard-error, .completions-panel { background: var(--color-surface); border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
.dashboard-hero { padding: 28px 32px; display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 24px; }
.eyebrow { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--color-muted); font-weight: 600; }
h1 { margin: 0; font-size: clamp(1.75rem, 2.5vw, 2.25rem); line-height: 1.2; color: var(--color-primary); }
.hero-copy { margin: 8px 0 0; max-width: 560px; color: var(--color-muted); font-size: 15px; }
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.primary-action, .secondary-action, .hero-refresh { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; transition: all .15s; }
.primary-action { background: var(--color-primary); color: #fff; }
.primary-action:hover { background: #162d4a; }
.secondary-action, .hero-refresh { border: 1px solid #d1d5db; color: var(--color-text); background: #fff; cursor: pointer; }
.secondary-action:hover, .hero-refresh:hover { background: #f9fafb; border-color: #9ca3af; }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: var(--color-surface); border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
.stat-label { display: block; color: var(--color-muted); font-size: 13px; margin-bottom: 6px; }
.stat-card strong { display: block; font-size: 1.75rem; color: var(--color-primary); line-height: 1.2; }
.stat-note { display: block; margin-top: 4px; color: var(--color-muted); font-size: 13px; }
.workspace-grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 20px; margin-bottom: 24px; }
.panel { padding: 24px; }
.panel-heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
.panel-heading h2, .role-note h2 { margin: 0; font-size: 1.25rem; color: var(--color-text); }
.quick-links { display: grid; gap: 10px; }
.quick-link { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; padding: 14px 16px; border-radius: 10px; background: #f9fafb; border: 1px solid #f3f4f6; color: inherit; text-decoration: none; transition: all .15s; }
.quick-link:hover { background: #f3f4f6; border-color: #e5e7eb; }
.quick-link strong, .check-list strong { display: block; font-size: 14px; }
.quick-link small, .check-list small { display: block; color: var(--color-muted); margin-top: 2px; font-size: 13px; }
.quick-icon, .check-dot { width: 36px; height: 36px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: #eef2f7; color: var(--color-primary); font-weight: 700; }
.status-pill { display: inline-flex; padding: 4px 12px; border-radius: 999px; background: #eef2f7; color: var(--color-primary); font-weight: 600; font-size: 13px; }
.check-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.check-list li { display: grid; grid-template-columns: auto 1fr; gap: 12px; }
.completions-panel { margin-bottom: 24px; }
.panel-copy { color: var(--color-muted); margin: 0 0 12px; font-size: 14px; }
.panel-link { color: var(--color-secondary); text-decoration: none; font-weight: 600; font-size: 14px; }
.completion-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.completion-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; background: #f9fafb; border-radius: 8px; }
.completion-type { font-size: 12px; font-weight: 600; color: var(--color-primary); background: #eef2f7; padding: 4px 10px; border-radius: 999px; }
.completion-body strong { display: block; font-size: 14px; }
.completion-body small, .completion-meta small { color: var(--color-muted); font-size: 13px; }
.completion-meta { text-align: right; display: grid; gap: 2px; }
.completions-empty { color: var(--color-muted); font-size: 14px; padding: 8px 0; }
.role-note { padding: 24px; display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 24px; }
.role-note p:last-child { margin: 8px 0 0; color: var(--color-muted); max-width: 720px; }
.dashboard-loading, .dashboard-error { padding: 20px; margin-bottom: 20px; }
.dashboard-error { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.skeleton { height: 16px; border-radius: 4px; background: #e5e7eb; margin-bottom: 12px; }
.skeleton-wide { width: 40%; }
.skeleton-title { width: 60%; height: 24px; }
.skeleton-copy { width: 80%; }
@media (max-width: 1024px) { .dashboard-hero, .workspace-grid, .role-note { grid-template-columns: 1fr; flex-direction: column; align-items: stretch; } .stat-grid { grid-template-columns: repeat(2,1fr); } }
@media (max-width: 640px) { .dashboard-page { padding: 16px; } .stat-grid { grid-template-columns: 1fr; } .dashboard-hero { padding: 20px; } }
</style>
