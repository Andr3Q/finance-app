// ═══════════════════════════════════════════════════════
// 🔌 src/services/api.js — Comunicação com o Backend
//
// Centraliza todas as chamadas HTTP para a API.
// Usa axios com interceptor para adicionar o token JWT
// automaticamente em cada requisição autenticada.
//
// Por que centralizar? Se a URL da API mudar, você altera
// só aqui, não em 10 arquivos diferentes.
// ═══════════════════════════════════════════════════════

import axios from 'axios'

// URL base da API — usa o proxy do Vite (/api → http://backend:3001)
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Interceptor de requisição:
// Antes de CADA chamada, pega o token do localStorage
// e coloca no cabeçalho Authorization automaticamente
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de resposta:
// Se o backend retornar 401 ou 403 (token expirado),
// desloga o usuário e redireciona para o login
api.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) return Promise.reject(error) // rede/timeout
    const status = error.response.status
    const isAuthError = (status === 401) || (status === 403 && !error.response?.data?.limitReached)
    if (isAuthError) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Funções de autenticação ─────────────────────────────
export const authAPI = {
  login:         (data)            => api.post('/auth/login', data),
  register:      (data)            => api.post('/auth/register', data),
  me:            ()                => api.get('/auth/me'),
  forgotPassword: (email)           => api.post('/auth/forgot-password', { email }),
  resetPassword:  (token, password) => api.post('/auth/reset-password', { token, password }),
  upgradePro:     ()                => api.post('/auth/upgrade'),
  downgradeFree:  ()                => api.post('/auth/downgrade'),
}

// ── Funções de transações ───────────────────────────────
export const transactionsAPI = {
  dashboard:  ()     => api.get('/transactions/dashboard'),
  list:       (params) => api.get('/transactions', { params }),
  summary:    ()     => api.get('/transactions/summary'),
  create:     (data) => api.post('/transactions', data),
  remove:     (id)   => api.delete(`/transactions/${id}`),
  autoLaunch: ()     => api.post('/transactions/auto-launch'),
  importCSV:  (formData) => api.post('/transactions/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
}

// ── Funções de orçamento (contas fixas) ─────────────────
export const budgetAPI = {
  list:          ()           => api.get('/budget'),
  create:        (data)       => api.post('/budget', data),
  update:        (id, data)   => api.put(`/budget/${id}`, data),
  remove:        (id)         => api.delete(`/budget/${id}`),
  updateSalary:  (salary)     => api.put('/budget/salary', { salary }),
  // Limites por categoria
  getLimits:     ()           => api.get('/budget/category-limits'),
  setLimit:      (data)       => api.post('/budget/category-limits', data),
  removeLimit:   (category)   => api.delete(`/budget/category-limits/${category}`)
}

// ── Funções de relatórios ───────────────────────────────
export const reportsAPI = {
  monthlyClose: () => api.post('/reports/monthly-close'),
  history:      () => api.get('/reports/history')
}

// ── Funções de notificações push ────────────────────────
export const notificationsAPI = {
  getVapidKey: ()     => api.get('/notifications/vapid-public-key'),
  subscribe:   (data) => api.post('/notifications/subscribe', data),
  unsubscribe: (data) => api.post('/notifications/unsubscribe', data),
}

// ── Agente IA ───────────────────────────────────────────
export const agentAPI = {
  chat: (message, history) => api.post('/agent/chat', { message, history }),
}

export default api
