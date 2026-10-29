import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AgentChat from '../components/features/AgentChat.jsx'

vi.mock('../services/analytics.js', () => ({
  analytics: { track: vi.fn() },
}))

vi.mock('../services/api.js', () => ({
  agentAPI: {
    chat:       vi.fn(),
    confirm:    vi.fn(),
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
      expect(screen.getByPlaceholderText('Pergunte à Nancy…')).toHaveValue('Gastei 50 reais no mercado')
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
    const input = screen.getByPlaceholderText('Pergunte à Nancy…')
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


// ── Tela 12 (Nancy IA): chat azul, saudação, sugestões e fechar ─────────────
describe('AgentChat — Nancy IA (tela 12)', () => {
  const MONTH_NOW = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][new Date().getMonth()]

  it('cabeçalho "Nancy IA" com o indicador online', () => {
    setup()
    const panel = screen.getByRole('dialog', { name: 'Nancy IA' })
    expect(panel).toHaveTextContent('Nancy IA')
    expect(panel).toHaveTextContent('online')
  })

  it('saudação com o primeiro nome do usuário', () => {
    setup({ name: 'André Elias' })
    expect(screen.getByText(/^Oi, André! Sou a Nancy\. Pergunte sobre seus gastos/)).toBeInTheDocument()
    expect(screen.getByText(/Pode digitar ou mandar um áudio\./)).toBeInTheDocument()
  })

  it('sem nome cadastrado a saudação continua natural', () => {
    setup()
    expect(screen.getByText(/^Oi! Sou a Nancy\./)).toBeInTheDocument()
  })

  it('as 4 sugestões do design, com o mês atual na terceira', () => {
    setup()
    const chips = [...document.querySelectorAll('.nia-suggestion')].map(c => c.textContent)
    expect(chips).toEqual([
      'Quanto gastei esse mês?',
      'Onde estou gastando mais?',
      `Vou conseguir guardar em ${MONTH_NOW}?`,
      'Registrar gasto de R$ 50 em alimentação',
    ])
  })

  it('tocar numa sugestão envia aquela mensagem; depois disso as sugestões somem e a saudação fica', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Você gastou R$ 7.300,00.' } })
    setup({ name: 'André Elias' })
    fireEvent.click(screen.getByText('Quanto gastei esse mês?', { selector: '.nia-suggestion' }))

    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledWith('Quanto gastei esse mês?', []))
    expect(await screen.findByText('Você gastou R$ 7.300,00.')).toBeInTheDocument()
    expect(document.querySelectorAll('.nia-suggestion')).toHaveLength(0)
    expect(screen.getByText(/^Oi, André! Sou a Nancy\./)).toBeInTheDocument()
    // a saudação é só da tela: não vai pro histórico enviado à IA
    fireEvent.change(screen.getByPlaceholderText('Pergunte à Nancy…'), { target: { value: 'e no mês passado?' } })
    agentAPI.chat.mockResolvedValue({ data: { reply: 'ok' } })
    fireEvent.click(screen.getByLabelText('Enviar'))
    await waitFor(() => expect(agentAPI.chat).toHaveBeenLastCalledWith('e no mês passado?', [
      { role: 'user', content: 'Quanto gastei esse mês?' },
      { role: 'assistant', content: 'Você gastou R$ 7.300,00.' },
    ]))
  })

  it('mensagem do usuário e da Nancy ficam em lados e estilos diferentes; erro tem estilo próprio', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 429, data: {} } })
    setup()
    fireEvent.change(screen.getByPlaceholderText('Pergunte à Nancy…'), { target: { value: 'oi' } })
    fireEvent.click(screen.getByLabelText('Enviar'))
    expect(await screen.findByText(/Muitas mensagens seguidas/)).toBeInTheDocument()
    expect(screen.getByText('oi').closest('.nia-msg')).toHaveClass('user')
    expect(screen.getByText(/Muitas mensagens seguidas/).closest('.nia-msg')).toHaveClass('bot', 'err')
  })

  it('o X do cabeçalho fecha o chat', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Fechar chat'))
    expect(screen.queryByRole('dialog', { name: 'Nancy IA' })).not.toBeInTheDocument()
  })

  it('Esc fecha o chat', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Nancy IA' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Nancy IA' })).not.toBeInTheDocument()
  })

  it('fechar pelo X durante a gravação também para o microfone', async () => {
    stubMic()
    setup()
    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await waitFor(() => expect(screen.getByLabelText('Parar gravação')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Fechar chat'))
    await waitFor(() => expect(MockMediaRecorder.instances[0].state).toBe('inactive'))
  })

  it('o evento do app (Perguntar à Nancy, Nancy IA, menu do +) abre o chat', async () => {
    setUser()
    render(<MemoryRouter><AgentChat /></MemoryRouter>)
    expect(screen.queryByRole('dialog', { name: 'Nancy IA' })).not.toBeInTheDocument()
    window.dispatchEvent(new Event('nancy:open-agent-chat'))
    expect(await screen.findByRole('dialog', { name: 'Nancy IA' })).toBeInTheDocument()
  })

  it('o evento com uma pergunta pronta abre o chat e já envia a pergunta (Elite)', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Corte R$ 100 em delivery.' } })
    setUser()
    render(<MemoryRouter><AgentChat /></MemoryRouter>)
    window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: 'Onde posso cortar R$ 300 este mês?' } }))
    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledWith('Onde posso cortar R$ 300 este mês?', []))
    expect(await screen.findByText('Corte R$ 100 em delivery.')).toBeInTheDocument()
    expect(agentAPI.chat).toHaveBeenCalledTimes(1) // não reenvia sozinha em novas renderizações
  })

  it('quem não é Elite: a pergunta pronta é descartada (nada vai pra IA nem fica guardado pra depois)', async () => {
    setUser({ plan: 'free' })
    render(<MemoryRouter><AgentChat /></MemoryRouter>)
    window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: 'Onde posso cortar?' } }))
    expect(await screen.findByText(/disponível no plano Elite/)).toBeInTheDocument()
    expect(agentAPI.chat).not.toHaveBeenCalled()
  })

  it('quem não é Elite vê o convite do plano e nenhum campo de mensagem', () => {
    setup({ plan: 'free', name: 'Ana Souza' })
    expect(screen.getByText(/^Oi, Ana! A Nancy IA analisa seus gastos/)).toBeInTheDocument()
    expect(screen.getByText(/disponível no plano Elite/)).toBeInTheDocument()
    // o cabeçalho não diz "online" (isso sugeria que o chat funciona): diz que é do Elite, sem o pontinho verde
    const status = screen.getByRole('dialog', { name: 'Nancy IA' }).querySelector('.nia-status')
    expect(status).toHaveTextContent('disponível no Elite')
    expect(status).not.toHaveTextContent('online')
    expect(status.querySelector('.nia-dot')).toBeNull()
    expect(screen.queryByPlaceholderText('Pergunte à Nancy…')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Enviar')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.nia-suggestion')).toHaveLength(0)
  })

  it('"Ver planos" fecha o chat e leva para /planos', () => {
    setUser({ plan: 'free' })
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AgentChat />} />
          <Route path="/planos" element={<div>Página de planos</div>} />
        </Routes>
      </MemoryRouter>
    )
    fireEvent.click(screen.getByLabelText('Assistente IA'))
    fireEvent.click(screen.getByRole('button', { name: /ver planos/i }))
    expect(screen.getByText('Página de planos')).toBeInTheDocument()
  })
})

// ── Rodada de QA N2-7 (2026-10-28): confirmação, texto formatado, erro em português, aviso do microfone ────────────
function typeAndSend(text) {
  fireEvent.change(screen.getByPlaceholderText('Pergunte à Nancy…'), { target: { value: text } })
  fireEvent.click(screen.getByLabelText('Enviar'))
}

describe('AgentChat — resposta formatada (sem markdown cru)', () => {
  it('negrito, lista e tabela aparecem formatados, sem ** nem | na tela', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: '**Resumo de outubro**\n\n| Categoria | Valor |\n|---|---|\n| Casa | R$ 3.500,00 |\n\n- **Saldo:** R$ 8.822,20' } })
    setup()
    typeAndSend('Onde estou gastando mais?')

    expect(await screen.findByText('Resumo de outubro')).toBeInTheDocument()
    expect(screen.getByText('Resumo de outubro').tagName).toBe('STRONG')
    const table = screen.getByRole('table')
    expect(table).toHaveTextContent('CategoriaValor')
    expect(table).toHaveTextContent('CasaR$ 3.500,00')
    expect(screen.getByRole('listitem')).toHaveTextContent('Saldo: R$ 8.822,20')
    const panel = screen.getByRole('dialog', { name: 'Nancy IA' })
    expect(panel.textContent).not.toContain('**')
    expect(panel.textContent).not.toContain('|---')
  })

  it('HTML que vier na resposta aparece como texto (nada é injetado na página)', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: '<img src="x" onerror="window.__xss=1"> e <b>negrito html</b>' } })
    setup()
    typeAndSend('oi')

    expect(await screen.findByText(/<img src="x"/)).toBeInTheDocument()
    expect(document.querySelector('.nia-bubble img')).toBeNull()
    expect(document.querySelector('.nia-bubble b')).toBeNull()
    expect(window.__xss).toBeUndefined()
  })

  it('a mensagem do próprio usuário não é reinterpretada (aparece exatamente como digitada)', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'ok' } })
    setup()
    typeAndSend('gastei **50** em - mercado')

    const mine = await screen.findByText('gastei **50** em - mercado')
    expect(mine.closest('.nia-msg')).toHaveClass('user')
    expect(mine.querySelector('strong')).toBeNull()
  })
})

describe('AgentChat — excluir/editar só depois do Confirmar', () => {
  const pendingReply = { data: { reply: 'Excluir “Netflix” de R$ 55,90 em 03/10/2026?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.', pendingAction: { token: 'tok-1', kind: 'delete', summary: 'Excluir “Netflix”' }, dataChanged: false } }

  it('a IA prepara: aparecem Confirmar e Cancelar e NADA é executado antes do toque', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')

    expect(await screen.findByText(/Ainda não fiz nada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(agentAPI.confirm).not.toHaveBeenCalled()
  })

  it('Confirmar executa uma vez, mostra o resultado, atualiza o app e some com os botões', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    agentAPI.confirm.mockResolvedValue({ data: { message: 'Pronto, excluí a transação “Netflix” de R$ 55,90 em 03/10/2026.', dataChanged: true } })
    const updated = vi.fn()
    window.addEventListener('budget-updated', updated)
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText(/Pronto, excluí a transação/)).toBeInTheDocument()
    expect(agentAPI.confirm).toHaveBeenCalledTimes(1)
    expect(agentAPI.confirm).toHaveBeenCalledWith('tok-1')
    expect(updated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    window.removeEventListener('budget-updated', updated)
  })

  it('Cancelar não chama o servidor, não altera nada e some com os botões', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    const updated = vi.fn()
    window.addEventListener('budget-updated', updated)
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(await screen.findByText('Tudo bem, não mexi em nada.')).toBeInTheDocument()
    expect(agentAPI.confirm).not.toHaveBeenCalled()
    expect(updated).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    window.removeEventListener('budget-updated', updated)
  })

  it('o Confirmar fica desabilitado enquanto a confirmação está em andamento (sem toque duplo)', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    let finish
    agentAPI.confirm.mockReturnValue(new Promise(resolve => { finish = resolve }))
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')
    const yes = await screen.findByRole('button', { name: 'Confirmar' })
    fireEvent.click(yes)
    fireEvent.click(yes)

    expect(agentAPI.confirm).toHaveBeenCalledTimes(1)
    expect(yes).toBeDisabled()
    finish({ data: { message: 'Pronto.', dataChanged: true } })
    expect(await screen.findByText('Pronto.')).toBeInTheDocument()
  })

  it('confirmação recusada (expirou ou a transação mudou): mostra o motivo e fecha os botões', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    agentAPI.confirm.mockRejectedValue({ response: { status: 400, data: { error: 'Essa confirmação expirou. Peça de novo à Nancy.', expired: true } } })
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    const msg = await screen.findByText('Essa confirmação expirou. Peça de novo à Nancy.')
    expect(msg.closest('.nia-msg')).toHaveClass('err')
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
  })

  it('falha de rede ao confirmar: avisa e deixa os botões para tentar de novo', async () => {
    agentAPI.chat.mockResolvedValue(pendingReply)
    agentAPI.confirm.mockRejectedValueOnce({ message: 'Network Error' }).mockResolvedValueOnce({ data: { message: 'Pronto, excluí.', dataChanged: true } })
    setup()
    typeAndSend('Exclui a transação Netflix de R$ 55,90')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Pronto, excluí.')).toBeInTheDocument()
    expect(agentAPI.confirm).toHaveBeenCalledTimes(2)
  })

  it('a conversa seguinte leva o pedido e o resultado como contexto (o modelo sabe o que foi decidido)', async () => {
    agentAPI.chat.mockResolvedValueOnce(pendingReply).mockResolvedValueOnce({ data: { reply: 'De nada!' } })
    agentAPI.confirm.mockResolvedValue({ data: { message: 'Pronto, excluí a transação “Netflix”.', dataChanged: true } })
    setup()
    typeAndSend('Exclui a transação Netflix')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))
    await screen.findByText(/Pronto, excluí a transação/)
    typeAndSend('Valeu')

    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledTimes(2))
    expect(agentAPI.chat.mock.calls[1][1].map(m => m.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(agentAPI.chat.mock.calls[1][1][2].content).toBe('Pronto, excluí a transação “Netflix”.')
  })
})

describe('AgentChat — erros em português e "Tentar de novo"', () => {
  it('erro 500 nunca mostra o texto cru do servidor (já apareceu "internal")', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 500, data: { error: 'internal' } } })
    setup()
    typeAndSend('oi')

    expect(await screen.findByText('Não consegui falar com a Nancy agora. Tente de novo em instantes.')).toBeInTheDocument()
    expect(screen.queryByText('internal')).not.toBeInTheDocument()
  })

  it.each([502, 503, 504])('erro %i (inclusive HTML do balanceador, sem corpo) vira a mesma frase em português', async (status) => {
    agentAPI.chat.mockRejectedValue({ response: { status, data: '<html>Bad Gateway</html>' } })
    setup()
    typeAndSend('oi')

    expect(await screen.findByText('Não consegui falar com a Nancy agora. Tente de novo em instantes.')).toBeInTheDocument()
  })

  it('erro de validação (400) mostra a mensagem do servidor', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 400, data: { error: 'Mensagem muito longa.' } } })
    setup()
    typeAndSend('oi')

    expect(await screen.findByText('Mensagem muito longa.')).toBeInTheDocument()
  })

  it('"Tentar de novo" reenvia a mesma pergunta sem duplicá-la na conversa nem no contexto da IA', async () => {
    agentAPI.chat
      .mockResolvedValueOnce({ data: { reply: 'Resposta 1' } })
      .mockRejectedValueOnce({ response: { status: 500, data: { error: 'internal' } } })
      .mockResolvedValueOnce({ data: { reply: 'Resposta 2' } })
    setup()
    typeAndSend('primeira')
    await screen.findByText('Resposta 1')
    typeAndSend('segunda')
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('Resposta 2')).toBeInTheDocument()
    expect(agentAPI.chat).toHaveBeenCalledTimes(3)
    expect(agentAPI.chat.mock.calls[2][0]).toBe('segunda')
    expect(agentAPI.chat.mock.calls[2][1]).toEqual([{ role: 'user', content: 'primeira' }, { role: 'assistant', content: 'Resposta 1' }])
    expect(screen.getAllByText('segunda')).toHaveLength(1)
    expect(screen.queryByText(/Não consegui falar com a Nancy/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('"Tentar de novo" só existe no último erro (some depois de uma nova mensagem)', async () => {
    agentAPI.chat.mockRejectedValueOnce({ message: 'Network Error' }).mockResolvedValueOnce({ data: { reply: 'ok' } })
    setup()
    typeAndSend('primeira')
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    typeAndSend('segunda')
    await screen.findByText('ok')

    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })
})

describe('AgentChat — aviso de microfone não fica preso na tela', () => {
  async function denyMic() {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubMic({ getUserMedia })
    setup()
    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await screen.findByText(/Permissão de microfone negada/)
  }

  it('tem um botão para fechar o aviso', async () => {
    await denyMic()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText(/Permissão de microfone negada/)).not.toBeInTheDocument()
  })

  it('fechar e reabrir o chat não traz o aviso de volta', async () => {
    await denyMic()
    fireEvent.click(screen.getByLabelText('Fechar chat'))
    fireEvent.click(screen.getByLabelText('Assistente IA'))
    expect(screen.queryByText(/Permissão de microfone negada/)).not.toBeInTheDocument()
  })

  it('liberar o microfone nas configurações do navegador tira o aviso sozinho', async () => {
    const status = { state: 'prompt', onchange: null }
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    stubMic({ getUserMedia })
    Object.defineProperty(navigator, 'permissions', { value: { query: vi.fn().mockResolvedValue(status) }, configurable: true })
    setup()
    await waitFor(() => expect(status.onchange).toBeTypeOf('function'))
    fireEvent.click(screen.getByLabelText('Falar mensagem'))
    await screen.findByText(/Permissão de microfone negada/)

    act(() => { status.state = 'granted'; status.onchange() })

    expect(screen.queryByText(/Permissão de microfone negada/)).not.toBeInTheDocument()
  })
})

describe('AgentChat — um só cartão de confirmação ativo (QA N2-7, rodada 2)', () => {
  const pending = (token, summary = 'Excluir “Spotify” de R$ 21,90 em 04/10/2026') => ({ data: {
    reply: `${summary}?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.`,
    pendingAction: { token, kind: 'delete', summary, expiresAt: Date.now() + 10 * 60 * 1000 }, dataChanged: false,
  } })
  const confirmButtons = () => screen.queryAllByRole('button', { name: 'Confirmar' })

  it('o bug do QA: dois cartões, "Cancelar" no novo e o "Confirmar" antigo ainda executava — agora só o último vale e nada executa', async () => {
    agentAPI.chat.mockResolvedValueOnce(pending('tok-A')).mockResolvedValueOnce(pending('tok-B'))
    setup()
    typeAndSend('Exclui a transação Spotify')
    await screen.findAllByRole('button', { name: 'Confirmar' })
    typeAndSend('Exclui o Spotify de novo, por favor')   // outra mensagem: o cartão A é encerrado
    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(confirmButtons()).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(await screen.findByText('Tudo bem, não mexi em nada.')).toBeInTheDocument()
    expect(confirmButtons()).toHaveLength(0)             // não sobrou nenhum "Confirmar" na tela
    expect(agentAPI.confirm).not.toHaveBeenCalled()
  })

  it('ao mandar outra mensagem o cartão aberto perde os botões NA HORA (não fica ativo enquanto a IA responde)', async () => {
    agentAPI.chat.mockResolvedValueOnce(pending('tok-A')).mockReturnValueOnce(new Promise(() => {})) // a 2ª resposta nunca chega
    setup()
    typeAndSend('Exclui a transação Spotify')
    await screen.findByRole('button', { name: 'Confirmar' })
    typeAndSend('Quanto gastei esse mês?')

    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledTimes(2))
    expect(confirmButtons()).toHaveLength(0)
    expect(agentAPI.confirm).not.toHaveBeenCalled()
  })

  it('"sim" digitado com um cartão aberto NÃO vai para a IA (não duplica o cartão): só lembra de tocar no botão', async () => {
    agentAPI.chat.mockResolvedValueOnce(pending('tok-A'))
    setup()
    typeAndSend('Exclui a transação Spotify')
    await screen.findByRole('button', { name: 'Confirmar' })
    for (const yes of ['sim', 'Sim!', '  SIM  ', 'pode', 'Pode sim.', 'confirmo', 'ok']) typeAndSend(yes)

    expect(await screen.findAllByText('Toque em Confirmar, logo acima, para concluir — ou em Cancelar para desistir.')).toHaveLength(7)
    expect(agentAPI.chat).toHaveBeenCalledTimes(1)       // só o pedido original foi para a IA
    expect(agentAPI.confirm).not.toHaveBeenCalled()      // digitar nunca confirma
    expect(confirmButtons()).toHaveLength(1)             // e o cartão continua único e ativo
  })

  it('"sim, mas muda o valor" não é só um "sim": vai para a IA e encerra o cartão', async () => {
    agentAPI.chat.mockResolvedValueOnce(pending('tok-A')).mockResolvedValueOnce({ data: { reply: 'Certo, qual o novo valor?' } })
    setup()
    typeAndSend('Exclui a transação Spotify')
    await screen.findByRole('button', { name: 'Confirmar' })
    typeAndSend('sim, mas muda o valor para 10')

    expect(await screen.findByText('Certo, qual o novo valor?')).toBeInTheDocument()
    expect(agentAPI.chat).toHaveBeenCalledTimes(2)
    expect(confirmButtons()).toHaveLength(0)
  })

  it('sem cartão aberto, "sim" é uma mensagem normal para a IA', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Oi!' } })
    setup()
    typeAndSend('sim')
    await screen.findByText('Oi!')
    expect(agentAPI.chat).toHaveBeenCalledWith('sim', [])
  })

  it('qualquer outra pergunta encerra o cartão aberto: ele perde os botões e o texto "Ainda não fiz nada"', async () => {
    agentAPI.chat.mockResolvedValueOnce(pending('tok-A')).mockResolvedValueOnce({ data: { reply: 'Você gastou R$ 8.006,90.' } })
    setup()
    typeAndSend('Exclui a transação Spotify')
    await screen.findByRole('button', { name: 'Confirmar' })
    typeAndSend('Quanto gastei esse mês?')
    await screen.findByText('Você gastou R$ 8.006,90.')

    expect(confirmButtons()).toHaveLength(0)
    expect(screen.queryByText(/Ainda não fiz nada/)).not.toBeInTheDocument()
    expect(screen.getByText(/Sem efeito\./)).toBeInTheDocument()
  })

  it('depois de confirmar ou cancelar, a bolha troca "Ainda não fiz nada…" pelo estado final', async () => {
    agentAPI.chat.mockResolvedValue(pending('tok-A'))
    agentAPI.confirm.mockResolvedValue({ data: { message: 'Pronto, excluí.', dataChanged: true } })
    setup()
    typeAndSend('Exclui a transação Spotify')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))
    await screen.findByText('Pronto, excluí.')
    expect(screen.queryByText(/Ainda não fiz nada/)).not.toBeInTheDocument()
    expect(screen.getByText(/Confirmado\./)).toBeInTheDocument()
  })

  it('cancelado: a bolha diz "Cancelado."', async () => {
    agentAPI.chat.mockResolvedValue(pending('tok-A'))
    setup()
    typeAndSend('Exclui a transação Spotify')
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    await screen.findByText('Tudo bem, não mexi em nada.')
    expect(screen.queryByText(/Ainda não fiz nada/)).not.toBeInTheDocument()
    expect(screen.getByText(/Cancelado\./)).toBeInTheDocument()
  })

  it('cartão que já passou da validade chega sem botões, mesmo aberto', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Excluir X?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.', pendingAction: { token: 'tok-old', kind: 'delete', summary: 'Excluir X', expiresAt: Date.now() - 1000 } } })
    setup()
    typeAndSend('Exclui X')
    await screen.findByText(/Sem efeito\./)
    expect(confirmButtons()).toHaveLength(0)
  })

  it('a validade vence com o chat aberto: tocar em Confirmar não chama o servidor e explica', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
      agentAPI.chat.mockResolvedValue({ data: { reply: 'Excluir X?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.', pendingAction: { token: 'tok-1', kind: 'delete', summary: 'Excluir X', expiresAt: Date.now() + 10 * 60 * 1000 } } })
      setup()
      typeAndSend('Exclui X')
      const yes = await screen.findByRole('button', { name: 'Confirmar' })
      vi.setSystemTime(new Date('2026-10-29T12:11:00Z'))   // passaram 11 min
      fireEvent.click(yes)

      expect(await screen.findByText('Essa confirmação expirou. Peça de novo à Nancy.')).toBeInTheDocument()
      expect(agentAPI.confirm).not.toHaveBeenCalled()
      expect(confirmButtons()).toHaveLength(0)
    } finally { vi.useRealTimers() }
  })
})

describe('AgentChat — erros: limite por hora, tempo esgotado e tentar de novo', () => {
  it('limite por hora: diz quanto esperar e não oferece "Tentar de novo"', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 429, data: { error: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.' }, headers: { 'retry-after': '2544' } } })
    setup()
    typeAndSend('oi')
    expect(await screen.findByText('Você atingiu o limite de mensagens da IA por agora. Tente de novo em 43 min.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('IA sobrecarregada: mostra a causa real e deixa tentar de novo', async () => {
    agentAPI.chat.mockRejectedValue({ response: { status: 429, data: { error: 'Serviço de IA sobrecarregado. Aguarde alguns segundos e tente novamente.' }, headers: {} } })
    setup()
    typeAndSend('oi')
    expect(await screen.findByText('Serviço de IA sobrecarregado. Aguarde alguns segundos e tente novamente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('tempo esgotado no aparelho: manda conferir o Extrato e NÃO oferece "Tentar de novo" (evita lançar em dobro)', async () => {
    agentAPI.chat.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 95000ms exceeded' })
    setup()
    typeAndSend('Registra 50 de mercado')
    expect(await screen.findByText(/confira o Extrato antes de tentar de novo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('resposta 200 "Fiz o que você pediu, mas não consegui escrever a resposta" atualiza o app como uma ação feita', async () => {
    agentAPI.chat.mockResolvedValue({ data: { reply: 'Fiz o que você pediu, mas não consegui escrever a resposta agora. Confira no Extrato.', dataChanged: true } })
    const updated = vi.fn()
    window.addEventListener('budget-updated', updated)
    setup()
    typeAndSend('Registra 30 de transporte')
    expect(await screen.findByText(/Fiz o que você pediu/)).toBeInTheDocument()
    expect(updated).toHaveBeenCalledTimes(1)
    window.removeEventListener('budget-updated', updated)
  })
})

describe('AgentChat — foco do teclado no celular (tela cheia)', () => {
  const stubMobile = (matches) => vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches, addEventListener() {}, removeEventListener() {} }))

  it('no celular o diálogo é modal e o Tab dá a volta dentro dele', async () => {
    stubMobile(true)
    setup()
    const dialog = await screen.findByRole('dialog', { name: 'Nancy IA' })
    await waitFor(() => expect(dialog).toHaveAttribute('aria-modal', 'true'))
    const focusables = [...dialog.querySelectorAll('button:not([disabled]), textarea:not([disabled])')]
    const last = focusables[focusables.length - 1]; const first = focusables[0]
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('no desktop (janela flutuante) não é modal e o Tab não é preso', async () => {
    stubMobile(false)
    setup()
    const dialog = await screen.findByRole('dialog', { name: 'Nancy IA' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    const focusables = [...dialog.querySelectorAll('button:not([disabled]), textarea:not([disabled])')]
    focusables[focusables.length - 1].focus()
    const prevented = !fireEvent.keyDown(document, { key: 'Tab' })
    expect(prevented).toBe(false)
  })
})
