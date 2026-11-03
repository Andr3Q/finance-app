import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import AgentChat from '../components/features/AgentChat.jsx'
import NancyIA from '../pages/NancyIA.jsx'

vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))
vi.mock('../services/api.js', () => ({ agentAPI: { chat: vi.fn(), confirm: vi.fn(), transcribe: vi.fn() } }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { agentAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setUser = (over = {}) => {
  const user = { id: 'u1', name: 'André Pereira', plan: 'elite', ...over }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
}
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function Go() { const nav = useNavigate(); return <><button onClick={() => nav('/dashboard')}>sair da tela</button><button onClick={() => nav('/nancy-ia')}>voltar à tela</button></> }
const setup = (entry = '/nancy-ia') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/nancy-ia" element={<NancyIA />} />
      <Route path="*" element={<Where />} />
    </Routes>
    <AgentChat />
    <Go />
  </MemoryRouter>
)
const reply = (text, extra = {}) => agentAPI.chat.mockResolvedValue({ data: { reply: text, ...extra } })
const input = () => screen.getByPlaceholderText('Pergunte à Nancy ou registre um gasto…')
const convs = () => [...document.querySelectorAll('.nia-conv')].map(b => b.textContent)
const ask = async (text) => { await userEvent.type(input(), text); await userEvent.keyboard('{Enter}') }

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  setDesktop(true)
  setUser()
})
afterEach(() => { delete window.matchMedia })

describe('Nancy IA no desktop (design "Nancy Desktop", tela 13)', () => {
  it('lista de conversas, cabeçalho do chat, boas-vindas do design, sugestões e entrada', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'Nova conversa' })).toBeInTheDocument()
    expect(screen.getByText('RECENTES')).toBeInTheDocument()
    expect(screen.getByText('As conversas desta sessão aparecem aqui.')).toBeInTheDocument()
    expect(document.querySelector('.nia-main-head')).toHaveTextContent('Nancy IA')
    expect(document.querySelector('.nia-status')).toHaveTextContent('online · entende texto e áudio')
    expect(screen.getByText('Oi, André! Sou a Nancy. Pergunte sobre seus gastos, peça uma análise ou mande um áudio que eu registro pra você.')).toBeInTheDocument()
    expect([...document.querySelectorAll('.nia-suggestion')].map(b => b.textContent)).toEqual([
      'Quanto gastei esse mês?', 'Onde estou gastando mais?', expect.stringMatching(/^Vou conseguir guardar em /), 'Registrar gasto de R$ 50 em alimentação',
    ])
    expect(input()).toBeInTheDocument()
    expect(document.querySelector('.nia-panel')).toBeNull() // o painel flutuante é só do celular
  })

  it('perguntar (por sugestão) mostra a resposta e abre a conversa em "Recentes", marcada como a atual', async () => {
    reply('Você gastou R$ 7.300,00 em outubro.')
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Quanto gastei esse mês?' }))
    expect(await screen.findByText('Você gastou R$ 7.300,00 em outubro.')).toBeInTheDocument()
    expect(agentAPI.chat).toHaveBeenCalledWith('Quanto gastei esse mês?', [])
    expect(convs()).toEqual(['Quanto gastei esse mês?'])
    expect(document.querySelector('.nia-conv')).toHaveClass('on')
    expect(document.querySelector('.nia-suggestion')).toBeNull() // sugestões só na conversa vazia
  })

  it('Enter envia; Nova conversa volta à boas-vindas e guarda a anterior; clicar nela traz a conversa de volta', async () => {
    reply('Resposta A')
    setup()
    await screen.findByRole('button', { name: 'Nova conversa' })
    await ask('Primeira pergunta')
    expect(await screen.findByText('Resposta A')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nova conversa' }))
    expect(screen.queryByText('Resposta A')).not.toBeInTheDocument()
    expect(document.querySelector('.nia-suggestion')).not.toBeNull()
    reply('Resposta B')
    await ask('Segunda pergunta')
    expect(await screen.findByText('Resposta B')).toBeInTheDocument()
    expect(convs()).toEqual(['Segunda pergunta', 'Primeira pergunta']) // a mais nova em cima
    await userEvent.click(screen.getByRole('button', { name: 'Primeira pergunta' }))
    expect(screen.getByText('Resposta A')).toBeInTheDocument()
    expect(screen.queryByText('Resposta B')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Primeira pergunta' })).toHaveAttribute('aria-current', 'true')
    // continuar a conversa antiga a mantém na mesma entrada (não cria outra)
    reply('Resposta A2')
    await ask('Mais uma')
    expect(await screen.findByText('Resposta A2')).toBeInTheDocument()
    expect(convs()).toEqual(['Segunda pergunta', 'Primeira pergunta'])
  })

  it('título é o começo da pergunta, cortado em 34 caracteres', async () => {
    reply('ok')
    setup()
    await screen.findByRole('button', { name: 'Nova conversa' })
    await ask('Quanto eu gastei com delivery de comida japonesa nos últimos três meses?')
    await screen.findByText('ok')
    expect(convs()[0]).toBe('Quanto eu gastei com delivery de…')
    expect(convs()[0].length).toBeLessThanOrEqual(34)
  })

  it('enquanto a resposta não chega, trocar de conversa fica desligado (a resposta cairia na conversa errada)', async () => {
    let resolve
    agentAPI.chat.mockReturnValue(new Promise(r => { resolve = r }))
    setup()
    await screen.findByRole('button', { name: 'Nova conversa' })
    await ask('Pergunta lenta')
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pergunta lenta' })).toBeDisabled()
    await act(async () => { resolve({ data: { reply: 'Chegou' } }) })
    expect(await screen.findByText('Chegou')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toBeEnabled()
  })

  it('cartão de confirmação deixado para trás ao trocar de conversa não age mais ao voltar', async () => {
    reply('Posso excluir a transação.', { pendingAction: { token: 't1', expiresInMs: 120000 } })
    setup()
    await screen.findByRole('button', { name: 'Nova conversa' })
    await ask('Exclua o almoço')
    expect(await screen.findByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nova conversa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Exclua o almoço' }))
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(agentAPI.confirm).not.toHaveBeenCalled()
  })

  it('a conversa continua ao sair da tela e voltar (o chat é o mesmo por baixo de todas as telas)', async () => {
    reply('Resposta guardada')
    setup()
    await screen.findByRole('button', { name: 'Nova conversa' })
    await ask('Pergunta')
    await screen.findByText('Resposta guardada')
    await userEvent.click(screen.getByRole('button', { name: 'sair da tela' }))
    expect(document.querySelector('.nia-page')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'voltar à tela' }))
    expect(await screen.findByText('Resposta guardada')).toBeInTheDocument()
    expect(convs()).toEqual(['Pergunta'])
  })

  it('no desktop "abrir o chat" (Início, Análise do mês...) leva à tela e envia a pergunta pronta', async () => {
    reply('Resposta da pergunta pronta')
    setup('/dashboard')
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    act(() => { window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: 'Como posso sobrar ainda mais este mês?' } })) })
    await waitFor(() => expect(agentAPI.chat).toHaveBeenCalledWith('Como posso sobrar ainda mais este mês?', []))
    expect(await screen.findByText('Resposta da pergunta pronta')).toBeInTheDocument()
    expect(convs()).toEqual(['Como posso sobrar ainda mais este…'])
  })

  it('fora do Elite mostra o convite e leva aos planos; sem campo de entrada', async () => {
    setUser({ plan: 'pro' })
    setup()
    expect(await screen.findByText(/A Nancy IA analisa seus gastos/)).toBeInTheDocument()
    expect(document.querySelector('.nia-status')).toHaveTextContent('disponível no Elite')
    expect(screen.queryByPlaceholderText('Pergunte à Nancy ou registre um gasto…')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Ver planos/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('pergunta pronta não é enviada fora do Elite (o convite aparece e a pergunta é descartada)', async () => {
    setUser({ plan: 'free' })
    setup('/dashboard')
    act(() => { window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: 'Pergunta' } })) })
    expect(await screen.findByText(/A Nancy IA analisa seus gastos/)).toBeInTheDocument()
    expect(agentAPI.chat).not.toHaveBeenCalled()
  })
})

describe('Nancy IA — celular continua o mesmo', () => {
  it('a rota /nancy-ia volta ao Início e "abrir o chat" continua abrindo o painel de tela cheia', async () => {
    setDesktop(false)
    setup('/nancy-ia')
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    expect(document.querySelector('.nia-page')).toBeNull()
    act(() => { window.dispatchEvent(new Event('nancy:open-agent-chat')) })
    expect(await screen.findByRole('dialog', { name: 'Nancy IA' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard') // não navegou
    expect(within(screen.getByRole('dialog')).getByPlaceholderText('Pergunte à Nancy…')).toBeInTheDocument() // texto do celular
  })
})
