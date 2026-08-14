import client from './client.js'

export function getInactivityReport() {
  return client.get('/inactivity/report')
}

export function runInactivityAutomation() {
  return client.post('/inactivity/run')
}

export function sendInactivityWarning(studentId) {
  return client.post(`/inactivity/${studentId}/warning-email`)
}
