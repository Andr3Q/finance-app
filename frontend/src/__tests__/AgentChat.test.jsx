import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AgentChat from '../components/features/AgentChat.jsx'

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn() },
}))

vi.mock('../services/api.js', () => ({
  agentAPI: {
    chat:       vi.fn(),
    transcribe: vi.fn(),
  },
}))

import { agentAPI } from '../services/api.js'

// ── Mock de MediaRecorder — jsdom não implementa a API de gravação ────────
class MockMediaRecorder {
  constructor(stream, opts) {
    this.stream   = stream
    this.mimeType = opts?.mimeType || ''
    this.state    = 'inactive'
    MockMediaRecorder.instances.push(this)
  }
  start() { this.state = 'recording'; this.onstart?.() }
  // stop() simula 1 chunk de áudio (2000 bytes — acima do limiar de "silêncio"
  // que o componente descarta) antes de disparar onstop, como o browser real faz.
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)], { type: this.mimeType || 'audio/webm' }) })
    this.onstop?.()
  }
}
MockMediaRecorder.isTypeSupported = () => true

function setUser(overrides = {}) {
  const user = { id: 'u1', plan: 'elite', ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return user
}

function stubMic({ getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] }), permissionState = null } = {}) {
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  MockMediaRecorder.instances = []
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
  if (permissionState) {
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue({ state: permissionState, onchange: null }) },
      configurable: true,
    })
  } else {
    Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true })
  }
  return getUserMedia
}

function setup(userOverrides = {}) {
  setUser(userOverrides)
  const utils = render(<MemoryRouter><AgentChat /></MemoryRouter>)
  // Abre o painel e vai direto pro campo de mensagem (mic só aparece lá)
  fireEvent.click(screen.getByLabelText('Assistente IA'))
  return utils
}

const ORIGINAL_USER_AGENT = navigator.userAgent

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'userAgent', { value: ORIGINAL_USER_AGENT, configurable: true })
})

describe('AgentChat — botão de microfone', () => {
  it('não aparece quando o navegador não suporta MediaRecorder/getUserMedia', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    vi.stubGlobal('MediaRecorder', undefined)
    setup()
    expect(screen.queryByLabelText('Falar mensagem')).not.toBeInTheDocument()
  })

  it('aparece quando o navegador suporta gravação', () => {
    stubMic()
    setup()
    expect(screen.getByLabelText('Falar mensagem')).toBeInTheDocument()
  })
})

describe('AgentChat — fluxo de gravação e transcrição', () => {
  it('grava, transcreve e preenche o campo de mensagem com o texto retornado', async () => {
    stubMic()
    agentAPI.transcribe.mockResolvedValue({ data: { text: 'Gastei 50 reais no mercado' } })
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))

    // Enquanto grava, o botão de parar deve aparecer
    await waitFor(() => expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument())

    // Usuário clica de novo pra parar — dispara onstop → transcreve
    fireEvent.click(screen.getByLabelText('Parar gravação'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Pergunte algo sobre suas finanças…')).toHaveValue('Gastei 50 reais no mercado')
    })
    expect(agentAPI.transcribe).toHaveBeenCalledTimes(1)
    // Confere que o áudio foi enviado como multipart com o campo "audio"
    const formData = agentAPI.transcribe.mock.calls[0][0]
    expect(formData.get('audio')).toBeInstanceOf(Blob)
  })

  it('permissão negada pelo navegador mostra instrução e não chama a API de transcrição', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubMic({ getUserMedia })
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))

    await waitFor(() => {
      expect(screen.getByText(/Permissão de microfone negada/)).toBeInTheDocument()
    })
    expect(agentAPI.transcribe).not.toHaveBeenCalled()
  })

  it('permissão já sabidamente negada (Permissions API) nem tenta abrir o getUserMedia', async () => {
    const getUserMedia = vi.fn()
    stubMic({ getUserMedia, permissionState: 'denied' })
    setup()

    // Espera o efeito de montagem consultar a Permissions API
    await waitFor(() => expect(screen.getByLabelText(/Microfone bloqueado/)).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText(/Microfone bloqueado/))

    expect(screen.getByText(/Microfone bloqueado/)).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('mensagem de ajuda menciona Safari/iPhone quando o userAgent é iOS (não "Android")', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
      configurable: true,
    })
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubMic({ getUserMedia })
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))

    await waitFor(() => {
      expect(screen.getByText(/Safari/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Android/)).not.toBeInTheDocument()
  })

  it('erro 429 da transcrição mostra mensagem de limite atingido', async () => {
    stubMic()
    agentAPI.transcribe.mockRejectedValue({ response: { status: 429 } })
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await waitFor(() => expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Parar gravação'))

    await waitFor(() => {
      expect(screen.getByText(/Muitas transcrições seguidas/)).toBeInTheDocument()
    })
  })

  it('gravação muito curta (sem áudio real) não chama a API de transcrição', async () => {
    // MediaRecorder que nunca entrega dados (simula clique acidental/silêncio total)
    class SilentRecorder extends MockMediaRecorder {
      stop() {
        this.state = 'inactive'
        this.onstop?.() // sem ondataavailable — blob resultante fica vazio
      }
    }
    stubMic() // define getUserMedia/permissions; troca MediaRecorder de novo abaixo
    vi.stubGlobal('MediaRecorder', SilentRecorder)
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await waitFor(() => expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Parar gravação'))

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma fala detectada/)).toBeInTheDocument()
    })
    expect(agentAPI.transcribe).not.toHaveBeenCalled()
  })

  // Regressão: o painel esconde o botão de "parar gravação" ao fechar, mas o
  // componente <AgentChat> continua montado — sem parar a gravação ao fechar
  // o painel, o microfone ficaria gravando em segundo plano indefinidamente,
  // sem nenhuma forma de interromper pela interface.
  it('fechar o painel durante a gravação para o microfone automaticamente', async () => {
    stubMic()
    agentAPI.transcribe.mockResolvedValue({ data: { text: 'texto transcrito' } })
    setup()

    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await waitFor(() => expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument())

    // Fecha o painel (mesmo botão flutuante que abriu)
    fireEvent.click(screen.getByLabelText('Assistente IA'))

    // A gravação foi parada (dispara onstop → chama a transcrição) mesmo com
    // o painel fechado, em vez de ficar gravando pra sempre em segundo plano.
    await waitFor(() => expect(agentAPI.transcribe).toHaveBeenCalledTimes(1))
  })
})

describe('AgentChat — envio de mensagem de texto', () => {
  function sendText(text) {
    const input = screen.getByPlaceholderText('Pergunte algo sobre suas finanças…')
    fireEvent.change(input, { target: { value: text } })
    fireEvent.click(screen.getByLabelText('Enviar'))
  }

  it('envia a mensagem e renderiza a resposta da IA', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Seu saldo é R$ 1.000,00.' } })
    setup()

    sendText('Qual meu saldo?')

    await waitFor(() => {
      expect(screen.getByText('Seu saldo é R$ 1.000,00.')).toBeInTheDocument()
    })
    expect(agentAPI.chat).toHaveBeenCalledWith('Qual meu saldo?', [])
  })

  // Regressão: um 403 de plano insuficiente (limitReached:true, de requirePlan()
  // no backend) não é sessão expirada — antes desse fix, QUALQUER 401/403 virava
  // "Sessão expirada. Faça login novamente." mesmo quando a causa real era o
  // trial/plano Elite ter expirado, mascarando o problema real do usuário.
  it('403 de plano insuficiente (limitReached) mostra mensagem de plano, não "sessão expirada"', async () => {
    agentAPI.chat.mockRejectedValue({
      response: { status: 403, data: { error: 'Esta funcionalidade requer o plano Elite.', limitReached: true } },
    })
    setup()

    sendText('Qual meu saldo?')

    await waitFor(() => {
      expect(screen.getByText('Esta funcionalidade requer o plano Elite.')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Sessão expirada/)).not.toBeInTheDocument()
  })

  it('401/403 real (sem limitReached) continua mostrando "sessão expirada"', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 401, data: { error: 'Token inválido ou expirado. Faça login novamente.' } } })
    setup()

    sendText('Qual meu saldo?')

    await waitFor(() => {
      expect(screen.getByText(/Sessão expirada\. Faça login novamente\./)).toBeInTheDocument()
    })
  })

  it('429 mostra mensagem de limite de mensagens, sem tocar no gate de plano', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 429 } })
    setup()

    sendText('Qual meu saldo?')

    await waitFor(() => {
      expect(screen.getByText(/Muitas mensagens seguidas/)).toBeInTheDocument()
    })
  })

  // Regressão: o chat pode criar/editar/excluir transação via tool-calling no
  // backend — sem invalidar o cache, Dashboard/Transações continuavam
  // mostrando dado velho até o usuário forçar um refresh manual.
  it('dataChanged:true dispara budget-updated (Dashboard/Transações invalidam o cache)', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Registrei o gasto de R$ 50,00.', dataChanged: true } })
    const onBudgetUpdated = vi.fn()
    window.addEventListener('budget-updated', onBudgetUpdated)
    setup()

    sendText('Registrar gasto de 50 em alimentação')

    await waitFor(() => {
      expect(screen.getByText('Registrei o gasto de R$ 50,00.')).toBeInTheDocument()
    })
    expect(onBudgetUpdated).toHaveBeenCalledTimes(1)
    window.removeEventListener('budget-updated', onBudgetUpdated)
  })

  it('dataChanged ausente (resposta só de leitura) não dispara budget-updated', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Seu saldo é R$ 1.000,00.' } })
    const onBudgetUpdated = vi.fn()
    window.addEventListener('budget-updated', onBudgetUpdated)
    setup()

    sendText('Qual meu saldo?')

    await waitFor(() => {
      expect(screen.getByText('Seu saldo é R$ 1.000,00.')).toBeInTheDocument()
    })
    expect(onBudgetUpdated).not.toHaveBeenCalled()
    window.removeEventListener('budget-updated', onBudgetUpdated)
  })
})
