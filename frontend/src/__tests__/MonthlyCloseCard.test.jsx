import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MonthlyCloseCard from '../components/features/settings/MonthlyCloseCard.jsx'

vi.mock('../services/api.js', () => ({
  reportsAPI: { monthlyClose: vi.fn() },
}))

import { reportsAPI } from '../services/api.js'

const proUser  = { id: 'u1', plan: 'pro',  email: 'ana@test.com', reportEmail: null, name: 'Ana' }
const freeUser = { id: 'u2', plan: 'free', email: 'free@test.com', reportEmail: null, name: 'Zé' }

function setup({ user = proUser, isPro = true, onMessage = vi.fn(), onUpgrade = vi.fn() } = {}) {
  return {
    onMessage,
    onUpgrade,
    ...render(
      <MonthlyCloseCard user={user} isPro={isPro} onMessage={onMessage} onUpgrade={onUpgrade} />
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Visibilidade ──────────────────────────────────────────────────

describe('MonthlyCloseCard — visibilidade', () => {
  it('renderiza título "Fechar o mês"', () => {
    setup()
    expect(screen.getByText(/fechar o mês/i)).toBeInTheDocument()
  })

  it('exibe badge PRO quando usuário não é pro', () => {
    setup({ isPro: false })
    expect(screen.getByText('PRO')).toBeInTheDocument()
  })

  it('não exibe badge PRO quando usuário é pro', () => {
    setup({ isPro: true })
    expect(screen.queryByText('PRO')).not.toBeInTheDocument()
  })

  it('mostra botão "Fechar mês e enviar relatório" para usuário pro', () => {
    setup()
    expect(screen.getByRole('button', { name: /fechar mês e enviar relatório/i })).toBeInTheDocument()
  })

  it('mostra lock para usuário free (não exibe botão de fechar mês)', () => {
    setup({ isPro: false })
    expect(screen.queryByRole('button', { name: /fechar mês/i })).not.toBeInTheDocument()
    expect(screen.getByText(/recurso pro/i)).toBeInTheDocument()
  })
})

// ── E-mail de destino ─────────────────────────────────────────────

describe('MonthlyCloseCard — e-mail de destino', () => {
  it('exibe o e-mail padrão do usuário', () => {
    setup({ user: proUser })
    expect(screen.getByText('ana@test.com')).toBeInTheDocument()
  })

  it('exibe reportEmail quando configurado', () => {
    const user = { ...proUser, reportEmail: 'relatorio@outro.com' }
    setup({ user })
    expect(screen.getByText('relatorio@outro.com')).toBeInTheDocument()
  })
})

// ── Lock / upgrade ────────────────────────────────────────────────

describe('MonthlyCloseCard — lock de upgrade', () => {
  it('chama onUpgrade ao clicar no lock', () => {
    const { onUpgrade } = setup({ isPro: false })
    fireEvent.click(screen.getByText(/recurso pro/i))
    expect(onUpgrade).toHaveBeenCalledWith(expect.stringMatching(/pdf/i))
  })
})

// ── Fechar mês ────────────────────────────────────────────────────

describe('MonthlyCloseCard — fechar mês', () => {
  it('exibe confirm antes de chamar a API', async () => {
    reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'Mês fechado!' } })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('não chama API se o usuário cancela o confirm', async () => {
    window.confirm.mockReturnValue(false)
    setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    expect(reportsAPI.monthlyClose).not.toHaveBeenCalled()
  })

  it('chama onMessage com mensagem de sucesso da API', async () => {
    reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'Relatório enviado para ana@test.com' } })
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('Relatório enviado para ana@test.com')
    })
  })

  it('desabilita o botão enquanto está fechando', async () => {
    let resolve
    reportsAPI.monthlyClose.mockReturnValue(new Promise(r => { resolve = r }))
    setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /gerando relatório/i })).toBeDisabled()
    })
    resolve({ data: { message: 'ok' } })
  })

  it('chama onMessage com erro quando API falha', async () => {
    reportsAPI.monthlyClose.mockRejectedValue({
      response: { data: { error: 'Quota excedida.' } },
    })
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('Quota excedida.', 'error')
    })
  })

  it('usa mensagem fallback quando erro não tem response', async () => {
    reportsAPI.monthlyClose.mockRejectedValue(new Error('network'))
    const { onMessage } = setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith('Erro ao fechar o mês.', 'error')
    })
  })

  it('re-habilita o botão após conclusão (sucesso)', async () => {
    reportsAPI.monthlyClose.mockResolvedValue({ data: { message: 'ok' } })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fechar mês e enviar relatório/i })).not.toBeDisabled()
    })
  })

  it('re-habilita o botão após conclusão (erro)', async () => {
    reportsAPI.monthlyClose.mockRejectedValue(new Error('fail'))
    setup()
    fireEvent.click(screen.getByRole('button', { name: /fechar mês/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /fechar mês e enviar relatório/i })).not.toBeDisabled()
    })
  })
})
