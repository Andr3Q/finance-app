import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SettingsNotifications from '../pages/SettingsNotifications.jsx'

vi.mock('../services/api.js', () => ({
  authAPI: { updateNotifPrefs: vi.fn() },
  notificationsAPI: { getVapidKey: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
}))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { authAPI, notificationsAPI } from '../services/api.js'

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage(user = {}, entries = ['/settings/notificacoes'], index) {
  const u = { id: 'u1', name: 'André', plan: 'elite', emailVerified: true, ...user }
  sessionStorage.setItem('user', JSON.stringify(u))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: u }))
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/settings/notificacoes" element={<SettingsNotifications />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const sw = (name) => screen.getByRole('switch', { name })
const stored = () => JSON.parse(sessionStorage.getItem('user'))

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear()
  authAPI.updateNotifPrefs.mockResolvedValue({ data: { ok: true } })
})

describe('Preferências', () => {
  it('título do design e as 6 linhas com descrição; padrão: cinco ligadas e o relatório por e-mail desligado', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Preferências' })).toBeInTheDocument()
    expect(screen.getByText('Alertas e lembretes')).toBeInTheDocument()
    const rows = [
      ['Lembrete de salário', 'No 5º dia útil do mês', true],
      ['Vencimento de contas', '2 dias antes de cada conta fixa', true],
      ['Alerta de limite', 'Quando passar de 80% do teto', true],
      ['Resumo mensal em stories', 'Todo dia 1º, com o mês anterior', true],
      ['Dicas da Nancy IA', 'Até 2 por semana', true],
      ['Relatório por e-mail', 'Toda segunda-feira', false],
    ]
    for (const [name, desc, on] of rows) {
      expect(screen.getByText(desc)).toBeInTheDocument()
      expect(sw(name)).toHaveAttribute('aria-checked', String(on))
    }
  })

  it('mostra o que está guardado na conta (campo falso = desligado, campo ligado do e-mail = ligado)', () => {
    renderPage({ notifSalary: false, notifTips: false, notifBudgetAlert: true, notifWeeklyEmail: true })
    expect(sw('Lembrete de salário')).toHaveAttribute('aria-checked', 'false')
    expect(sw('Dicas da Nancy IA')).toHaveAttribute('aria-checked', 'false')
    expect(sw('Alerta de limite')).toHaveAttribute('aria-checked', 'true')
    expect(sw('Relatório por e-mail')).toHaveAttribute('aria-checked', 'true')
  })

  it.each([
    ['Lembrete de salário', 'notifSalary', false],
    ['Vencimento de contas', 'notifBudgetReminder', false],
    ['Alerta de limite', 'notifBudgetAlert', false],
    ['Resumo mensal em stories', 'notifStories', false],
    ['Dicas da Nancy IA', 'notifTips', false],
    ['Relatório por e-mail', 'notifWeeklyEmail', true],
  ])('"%s" grava só %s=%s, vale na hora e fica no usuário', async (name, field, value) => {
    renderPage()
    fireEvent.click(sw(name))
    expect(sw(name)).toHaveAttribute('aria-checked', String(value))   // otimista: já mudou
    expect(stored()[field]).toBe(value)
    await waitFor(() => expect(authAPI.updateNotifPrefs).toHaveBeenCalledWith({ [field]: value }))
    expect(authAPI.updateNotifPrefs).toHaveBeenCalledTimes(1)
  })

  it('desligar e ligar de novo grava as duas mudanças', async () => {
    renderPage()
    fireEvent.click(sw('Dicas da Nancy IA'))
    await waitFor(() => expect(sw('Dicas da Nancy IA')).not.toBeDisabled())
    fireEvent.click(sw('Dicas da Nancy IA'))
    await waitFor(() => expect(authAPI.updateNotifPrefs).toHaveBeenCalledTimes(2))
    expect(authAPI.updateNotifPrefs.mock.calls.map(c => c[0])).toEqual([{ notifTips: false }, { notifTips: true }])
    expect(sw('Dicas da Nancy IA')).toHaveAttribute('aria-checked', 'true')
  })

  it('se o servidor recusar, volta ao que era e avisa', async () => {
    authAPI.updateNotifPrefs.mockRejectedValue(new Error('500'))
    renderPage()
    fireEvent.click(sw('Alerta de limite'))
    expect(await screen.findByText('Erro ao salvar preferência.')).toBeInTheDocument()
    expect(sw('Alerta de limite')).toHaveAttribute('aria-checked', 'true')
    expect(stored().notifBudgetAlert).toBe(true)
  })

  it('enquanto grava, o interruptor fica travado (toques repetidos não duplicam)', async () => {
    let release
    authAPI.updateNotifPrefs.mockReturnValue(new Promise(r => { release = r }))
    renderPage()
    fireEvent.click(sw('Lembrete de salário'))
    expect(sw('Lembrete de salário')).toBeDisabled()
    fireEvent.click(sw('Lembrete de salário'))
    release({ data: {} })
    await waitFor(() => expect(sw('Lembrete de salário')).not.toBeDisabled())
    expect(authAPI.updateNotifPrefs).toHaveBeenCalledTimes(1)
  })

  it('relatório por e-mail ligado com e-mail não verificado avisa que precisa confirmar', () => {
    renderPage({ notifWeeklyEmail: true, emailVerified: false })
    expect(screen.getByText('Toda segunda-feira · confirme seu e-mail para receber')).toBeInTheDocument()
  })

  it('e-mail verificado (ou relatório desligado): sem o aviso', () => {
    renderPage({ notifWeeklyEmail: true, emailVerified: true })
    expect(screen.queryByText(/confirme seu e-mail/)).not.toBeInTheDocument()
  })

  it('voltar retorna à tela anterior', async () => {
    renderPage({}, ['/settings', '/settings/notificacoes'], 1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/settings'))
  })
})

describe('Preferências — avisos neste aparelho (push)', () => {
  const registration = { pushManager: { subscribe: vi.fn(), getSubscription: vi.fn() } }
  const stubPush = (permission) => {
    window.Notification = { permission, requestPermission: vi.fn().mockResolvedValue('granted') }
    window.PushManager = function PushManager() {}
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration) } })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  }
  afterEach(() => { delete window.Notification; delete window.PushManager; delete navigator.serviceWorker; delete window.matchMedia })
  beforeEach(() => {
    registration.pushManager.subscribe.mockReset().mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push/e' }) })
    registration.pushManager.getSubscription.mockReset().mockResolvedValue({ endpoint: 'https://push/e', unsubscribe: vi.fn().mockResolvedValue(true) })
    notificationsAPI.getVapidKey.mockResolvedValue({ data: { key: 'BAQ' } })
    notificationsAPI.subscribe.mockResolvedValue({})
    notificationsAPI.unsubscribe.mockResolvedValue({})
  })

  it('sem suporte do navegador: explica e não mostra interruptor', () => {
    renderPage()
    expect(screen.getByText('Instale o app na tela inicial para receber avisos.')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Avisos neste aparelho' })).not.toBeInTheDocument()
  })

  it('desligado: pede a permissão, registra o aparelho no servidor e liga', async () => {
    stubPush('default')
    renderPage()
    expect(sw('Avisos neste aparelho')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw('Avisos neste aparelho'))
    await waitFor(() => expect(notificationsAPI.subscribe).toHaveBeenCalledWith({ endpoint: 'https://push/e' }))
    expect(window.Notification.requestPermission).toHaveBeenCalled()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(sw('Avisos neste aparelho')).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByText('Notificações ativadas!')).toBeInTheDocument()
  })

  it('ligado: desligar remove a assinatura do servidor', async () => {
    stubPush('granted')
    renderPage()
    expect(sw('Avisos neste aparelho')).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(sw('Avisos neste aparelho'))
    await waitFor(() => expect(notificationsAPI.unsubscribe).toHaveBeenCalledWith({ endpoint: 'https://push/e' }))
    expect(sw('Avisos neste aparelho')).toHaveAttribute('aria-checked', 'false')
  })

  it('bloqueado no navegador: avisa onde habilitar e o interruptor fica desabilitado', () => {
    stubPush('denied')
    renderPage()
    expect(screen.getByText('Bloqueado — habilite nas configurações do aparelho.')).toBeInTheDocument()
    expect(sw('Avisos neste aparelho')).toBeDisabled()
  })

  it('permissão negada na hora: mostra o aviso e não registra nada', async () => {
    stubPush('default')
    window.Notification.requestPermission.mockResolvedValue('denied')
    renderPage()
    fireEvent.click(sw('Avisos neste aparelho'))
    expect(await screen.findByText('Permissão negada. Habilite nas configurações do aparelho.')).toBeInTheDocument()
    expect(notificationsAPI.subscribe).not.toHaveBeenCalled()
  })
})
