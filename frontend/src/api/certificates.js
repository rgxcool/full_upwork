import client from './client'

export const certificatesApi = {
  getSettings: () => client.get('/certificates/settings'),
  updateSettings: (data) => client.put('/certificates/settings', data),
  uploadSignature: (formData) => client.post('/certificates/settings/signature', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadLogo: (formData) => client.post('/certificates/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteSignature: () => client.delete('/certificates/settings/signature'),
  deleteLogo: () => client.delete('/certificates/settings/logo'),
  getTemplates: () => client.get('/certificates/templates'),
  getTemplate: (key) => client.get(`/certificates/templates/${key}`),
  updateTemplate: (key, data) => client.put(`/certificates/templates/${key}`, data),
  getCandidates: (params) => client.get('/certificates/candidates', { params }),
  list: (params) => client.get('/certificates', { params }),
  listMine: () => client.get('/certificates/mine'),
  get: (id) => client.get(`/certificates/${id}`),
  create: (data) => client.post('/certificates', data),
  update: (id, data) => client.put(`/certificates/${id}`, data),
  approve: (id) => client.post(`/certificates/${id}/approve`),
  generate: (id) => client.post(`/certificates/${id}/generate`),
  revoke: (id, reason) => client.post(`/certificates/${id}/revoke`, { reason }),
  history: (id) => client.get(`/certificates/${id}/history`),
  download: (id) => client.get(`/certificates/${id}/download`, { responseType: 'blob' }),
}
