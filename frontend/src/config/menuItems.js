/**
 * Menu items for the NavBar hamburger menu.
 * Each item may have: name, link, role (array or single string), feature (optional),
 * and group (for grouping in the sidebar).
 *
 * "Översikt" has no group and stays pinned on top.
 * Students (role 'student') get a flat list — no group headings are rendered for them.
 */

export const menuItems = [
  {
    name: 'Översikt',
    link: '/dashboard',
    role: ['student', 'teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin'],
    // No group — stays pinned on top
  },
  // Elever & personal
  {
    name: 'Elever',
    link: '/students',
    role: ['admin', 'teacher'],
    group: 'Elever & personal',
  },
  {
    name: 'Inaktiva elever',
    link: '/inaktiva-elever',
    role: ['admin', 'systemadmin'],
    group: 'Elever & personal',
  },
  {
    name: 'Lägg till elev manuellt',
    link: '/manual-add-student',
    role: 'admin',
    group: 'Elever & personal',
  },
  {
    name: 'Lägg till Lärare',
    link: '/lagg-till-larare',
    role: 'admin',
    group: 'Elever & personal',
  },
  {
    name: 'Lärarhantering',
    link: '/teacher-management',
    role: 'admin',
    group: 'Elever & personal',
  },
  // Kurser
  {
    name: 'Kurser',
    link: '/programsandcourses',
    role: 'admin',
    group: 'Kurser',
  },
  {
    name: 'Kursmallar',
    link: '/course-templates',
    role: ['admin', 'teacher'],
    group: 'Kurser',
  },
  {
    name: 'Kursinstanser',
    link: '/course-instances',
    role: 'admin',
    group: 'Kurser',
  },
  {
    name: 'Kursmatchning',
    link: '/course-matching',
    role: 'admin',
    group: 'Kurser',
  },
  {
    name: 'Kurskort',
    link: '/course-cards/overview',
    role: ['teacher', 'admin', 'systemadmin'],
    group: 'Kurser',
  },
  {
    name: 'Kurser (Lärarvy)',
    link: '/larare/kurser',
    role: ['teacher', 'admin', 'systemadmin'],
    group: 'Kurser',
  },
  {
    name: 'Kurspaket',
    link: '/programsandpackages',
    role: 'admin',
    group: 'Kurser',
  },
  // Betyg & intyg
  {
    name: 'Betygsrapporter',
    link: '/admin/betygsrapporter',
    role: ['admin', 'systemadmin'],
    group: 'Betyg & intyg',
  },
  {
    name: 'Betygssignering',
    link: '/signering',
    role: ['teacher', 'admin', 'systemadmin'],
    group: 'Betyg & intyg',
  },
  {
    name: 'Betygsskalor',
    link: '/admin/betygsskala',
    role: ['admin', 'systemadmin'],
    group: 'Betyg & intyg',
  },
  {
    name: 'Intyg & Diplom',
    link: '/admin/certificates',
    role: ['admin', 'systemadmin'],
    group: 'Betyg & intyg',
  },
  {
    name: 'Betyg',
    link: '/betyg',
    role: ['teacher', 'admin', 'systemadmin'],
    group: 'Betyg & intyg',
  },
  {
    name: 'Betygsuppföljning',
    link: '/grade-lookups',
    role: 'admin',
    group: 'Betyg & intyg',
  },
  // APL
  {
    name: 'APL',
    link: '/apl',
    role: ['admin', 'teacher', 'coordinator'],
    group: 'APL',
  },
  // Prövning & slutprov
  {
    name: 'Hantera Prövningar',
    link: '/provningar',
    role: 'admin',
    group: 'Prövning & slutprov',
  },
  {
    name: 'Generera exam',
    link: '/larare/generera-exam',
    role: ['admin', 'systemadmin', 'teacher'],
    group: 'Prövning & slutprov',
  },
  {
    name: 'Kalender & Prövning Underhåll',
    link: '/admin/calendar-housekeeping',
    role: 'admin',
    group: 'Prövning & slutprov',
  },
  // Rapporter
  {
    name: 'Rapporter & Analys',
    link: '/admin/analytics',
    role: ['admin', 'systemadmin', 'teacher', 'syv', 'specped'],
    feature: 'statistics',
    group: 'Rapporter',
  },
  {
    name: 'Inaktivitetsrapport',
    link: '/admin/inactivity',
    role: ['admin', 'systemadmin', 'teacher'],
    group: 'Rapporter',
  },
  {
    name: 'Resursbesök',
    link: '/admin/resource-visits',
    role: ['admin', 'systemadmin', 'teacher', 'coordinator', 'syv', 'specped'],
    group: 'Rapporter',
  },
  {
    name: 'Kursstatistik (detalj)',
    link: '/admin/course-statistics',
    role: 'admin',
    group: 'Rapporter',
  },
  {
    name: 'Inlämningar & Deltagare',
    link: '/admin/learning-management',
    role: 'admin',
    group: 'Rapporter',
  },
  {
    name: 'Notifikationer',
    link: '/admin/notifications',
    role: 'admin',
    group: 'Rapporter',
  },
  // Kommunikation
  {
    name: 'Kalender',
    link: '/kalender',
    role: ['teacher', 'syv', 'specped', 'admin', 'systemadmin'],
    feature: 'calendar_final_exam',
    group: 'Kommunikation',
  },
  {
    name: 'SYV Samtal',
    link: '/syv/appointments',
    role: ['syv', 'admin', 'systemadmin'],
    group: 'Kommunikation',
  },
  {
    name: 'Specped Samtal',
    link: '/specped/appointments',
    role: ['specped', 'admin', 'systemadmin'],
    group: 'Kommunikation',
  },
  {
    name: 'Schemaparametrar',
    link: '/schedule-parameters',
    role: ['admin', 'systemadmin', 'teacher'],
    group: 'Kommunikation',
  },
  {
    name: 'Datumplanering',
    link: '/date-planning',
    role: ['admin', 'systemadmin'],
    group: 'Kommunikation',
  },
  {
    name: 'Vanliga frågor (Chatbot)',
    link: '/admin/chatbot-faq',
    role: ['admin', 'systemadmin'],
    group: 'Kommunikation',
  },
  {
    name: 'Vanliga frågor (Lärare)',
    link: '/larare/chatbot-faq',
    role: ['teacher'],
    group: 'Kommunikation',
  },
  {
    name: 'Meddelanden',
    link: '/messages',
    role: ['student', 'teacher', 'syv', 'specped', 'admin', 'systemadmin', 'coordinator'],
    group: 'Kommunikation',
  },
  // Student-only items (flat list, no group headings)
  {
    name: 'Frågebank',
    link: '/student/fragebank',
    role: 'student',
  },
  {
    name: 'Prövningar',
    link: '/examform',
    role: 'student',
  },
  {
    name: 'Mina kurser',
    link: '/course-cards',
    role: 'student',
  },
  {
    name: 'Studieassistent',
    link: '/chatbot',
    role: 'student',
  },
];