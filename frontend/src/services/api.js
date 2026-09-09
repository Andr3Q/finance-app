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
// withCredentials: envia o cookie HttpOnly em todas as requisições
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true,
})

// Rotas onde 401 significa "credencial errada" (senha/código de verificação),
// não "sessão expirada" — o backend reusa o mesmo status code pros dois
// casos. Redirecionar pro login nessas rotas escondia a mensagem de erro real
// (ex: "E-mail ou senha incorretos" nunca aparecia, a página só recarregava)
// e podia até deslogar uma sessão válida por causa de um typo de senha ao
// desativar 2FA em Configurações.
const CREDENTIAL_CHECK_ROUTES = [
  '/auth/login',
  '/auth/2fa/verify-login',
  '/auth/2fa/use-backup-code',
  '/auth/2fa/disable',
  '/auth/2fa/regenerate-backup-codes',
]

// Interceptor de resposta:
// Se o backend retornar 401 ou 403 (cookie expirado),
// limpa os dados locais e redireciona para o login
api.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) return Promise.reject(error) // rede/timeout
    const status = error.response.status
    const isAuthError = (status === 401) || (status === 403 && !error.response?.data?.limitReached)
    const isCredentialCheck = CREDENTIAL_CHECK_ROUTES.some(route => error.config?.url?.includes(route))
    if (isAuthError && !isCredentialCheck) {
      sessionStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ── Funções de autenticação ─────────────────────────────
export const authAPI = {
  login:          (data)            => api.post('/auth/login', data),
  register:       (data)            => api.post('/auth/register', data),
  me:             ()                => api.get('/auth/me'),
  logout:         ()                => api.post('/auth/logout'),
  forgotPassword: (email)           => api.post('/auth/forgot-password', { email }),
  resetPassword:  (token, password) => api.post('/auth/reset-password', { token, password }),
  updateProfile:  (data)            => api.put('/auth/profile', data),
  upgradePro:     ()                => api.post('/auth/upgrade'),
  downgradeFree:  (data)            => api.post('/auth/downgrade', data),
  changePassword:      (currentPassword, newPassword) => api.put('/auth/password', { currentPassword, newPassword }),
  deleteAccount:       (password) => api.delete('/auth/account', { data: { password } }),
  completeOnboarding: ()          => api.post('/auth/complete-onboarding'),
  referralStats:      ()          => api.get('/auth/referral-stats'),
  twoFASetup:              ()                    => api.post('/auth/2fa/setup'),
  twoFAVerifySetup:        (token)               => api.post('/auth/2fa/verify-setup', { token }),
  twoFADisable:            (password)            => api.post('/auth/2fa/disable', { password }),
  twoFAVerifyLogin:        (tempToken, token)    => api.post('/auth/2fa/verify-login', { tempToken, token }),
  twoFAUseBackupCode:      (tempToken, backupCode) => api.post('/auth/2fa/use-backup-code', { tempToken, backupCode }),
  twoFABackupCodesCount:   ()                    => api.get('/auth/2fa/backup-codes-count'),
  twoFARegenerateCodes:    (password)            => api.post('/auth/2fa/regenerate-backup-codes', { password }),
  exportData:              ()                    => api.get('/auth/export-data', { responseType: 'blob' }),
  verifyEmail:             (token)               => api.post('/auth/verify-email', { token }),
  resendVerification:      ()                    => api.post('/auth/resend-verification'),
  changeEmail:             (newEmail, password)  => api.post('/auth/change-email', { newEmail, password }),
  confirmEmailChange:      (token)               => api.post('/auth/confirm-email-change', { token }),
  unlockAccount:           (token)               => api.post('/auth/unlock-account', { token }),
  updateNotifPrefs:        (prefs)               => api.put('/auth/notifications', prefs),
}

// ── Funções de transações ───────────────────────────────
export const transactionsAPI = {
  dashboard:      ()           => api.get('/transactions/dashboard'),
  list:           (params)     => api.get('/transactions', { params }),
  summary:        ()           => api.get('/transactions/summary'),
  create:         (data)       => api.post('/transactions', data),
  update:         (id, data)   => api.put(`/transactions/${id}`, data),
  remove:         (id)         => api.delete(`/transactions/${id}`),
  autoLaunch:     ()           => api.post('/transactions/auto-launch'),
  importCSV:      (formData)   => api.post('/transactions/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  monthlyHistory: (months = 6) => api.get('/transactions/monthly-history', { params: { months } }),
  subscriptions:  ()           => api.get('/transactions/subscriptions'),
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
  chat:          (message, history) => api.post('/agent/chat', { message, history }),
  predict:       ()                 => api.post('/agent/predict', {}),
  monthlyReport: (month, year)      => api.post('/agent/monthly-report', { month, year }),
  transcribe:    (formData)         => api.post('/agent/transcribe', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

// ── Funções de metas financeiras ────────────────────────
export const goalsAPI = {
  list:   ()           => api.get('/goals'),
  create: (data)       => api.post('/goals', data),
  update: (id, data)   => api.patch(`/goals/${id}`, data),
  remove: (id)         => api.delete(`/goals/${id}`),
}

export const installmentsAPI = {
  list:   ()     => api.get('/installments'),
  create: (data) => api.post('/installments', data),
  pay:    (id)   => api.patch(`/installments/${id}/pay`),
  unpay:  (id)   => api.patch(`/installments/${id}/unpay`),
  remove: (id)   => api.delete(`/installments/${id}`),
}

export const paymentsAPI = {
  createPreference: (plan, period) => api.post('/payments/create-preference', { plan, period }),
  history:          ()             => api.get('/payments/history'),
}

export default api
