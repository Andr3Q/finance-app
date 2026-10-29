import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentAPI } from '../../services/api.js'
import { useUser } from '../../hooks/useUser.js'
import { useEscapeKey } from '../../hooks/useEscapeKey.js'
import { useFocusTrap } from '../../hooks/useFocusTrap.js'
import { chatError } from '../../utils/chatErrors.js'
import { analytics } from '../../services/analytics.js'
import { invalidateCache } from '../../services/cache.js'
import { MONTHS } from '../../constants/index.js'
import NancyMark from '../ui/NancyMark.jsx'
import AiMessage from './AiMessage.jsx'

// Sugestões da conversa vazia (design Nancy 2, tela 12). A do meio usa o mês atual.
function buildSuggestions(now = new Date()) {
  return [
    'Quanto gastei esse mês?',
    'Onde estou gastando mais?',
    `Vou conseguir guardar em ${MONTHS[now.getMonth()].toLowerCase()}?`,
    'Registrar gasto de R$ 50 em alimentação',
  ]
}

// Duração máxima de uma gravação — evita upload/transcrição gigante se o
// usuário esquecer o microfone ligado (custo de Whisper cresce com a duração).
const MAX_RECORDING_MS = 60_000

// Ordem de preferência de formato — webm/opus é o padrão em Chrome/Firefox/Edge;
// Safari (desktop e iOS) não suporta webm e cai para mp4/aac.
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

function pickSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return PREFERRED_MIME_TYPES.find(t => MediaRecorder.isTypeSupported(t)) || ''
}

// A mensagem antiga assumia Android para todo mundo — no iPhone o caminho pra
// liberar o microfone é outro, e nem sempre existe se o app foi instalado na
// tela de início (WebKit historicamente restringe getUserMedia em PWA standalone).
function getMicHelpText() {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) {
    return 'Toque no ícone "aA" ao lado do endereço do site → Configurações do Site → Microfone → Permitir. Se você instalou o Nancy na Tela de Início, abra pelo Safari normal primeiro (apps instalados têm mais restrição pra microfone no iPhone). Depois recarregue a página.'
  }
  if (/Android/.test(ua)) {
    return 'Toque no ícone de cadeado/informações ao lado do endereço do site (ou, se instalou o Nancy como app, vá em Configurações do Android → Apps → Nancy → Permissões) e libere o Microfone. Depois recarregue a página.'
  }
  return 'Clique no ícone de cadeado/informações ao lado do endereço do site, libere o Microfone e recarregue a página.'
}

// Cartão de confirmação (excluir/editar): só o ÚLTIMO fica ativo. Um "Confirmar" antigo que sobrava na tela executava a
// ação mesmo depois de a pessoa ter tocado em "Cancelar" num cartão repetido (achado do QA N2-7, rodada 2).
const closeOpenPending = (list) => list.map(m => (m.pending?.state === 'open' ? { ...m, pending: { ...m.pending, state: 'closed' } } : m))
const isExpired = (pending) => !!pending?.expiresAt && Date.now() > pending.expiresAt
const hasOpenPending = (list) => list.some(m => m.pending?.state === 'open' && !isExpired(m.pending))
// "sim", "ok", "pode"... digitado com um cartão aberto: não vai para a IA (ela repetiria a pergunta e deixaria dois
// cartões) — só lembra de tocar no botão. Confirmar continua exigindo o toque.
const AFFIRMATION = /^(sim|s|ok|okay|isso|pode|pode sim|claro|confirmo|confirma|confirmar|com certeza|pode excluir|pode alterar|pode apagar|vai|manda)$/
const isAffirmation = (text) => AFFIRMATION.test(text.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!\s]+$/g, ''))
// A frase fixa do servidor (ver composeReply em backend/src/routes/agent.js) deixa de valer depois que o cartão se resolve
const WAITING = /Ainda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir\./
const RESOLVED_TEXT = { done: 'Confirmado.', cancelled: 'Cancelado.', closed: 'Sem efeito.' }
const displayContent = (m) => {
  if (!m.pending) return m.content
  const state = m.pending.state === 'open' && isExpired(m.pending) ? 'closed' : m.pending.state
  return state === 'open' ? m.content : m.content.replace(WAITING, RESOLVED_TEXT[state] || 'Sem efeito.')
}

export default function AgentChat() {
  const [open,         setOpen]         = useState(false)
  useEscapeKey(() => setOpen(false), open)
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [history,      setHistory]      = useState([])
  const [listening,     setListening]     = useState(false) // gravando
  const [transcribing,  setTranscribing]  = useState(false) // enviado, aguardando texto
  const [voiceError,    setVoiceError]    = useState('')
  const [voiceSupport,  setVoiceSupport]  = useState(false)
  // 'unknown' | 'granted' | 'denied' | 'prompt' — consultado via Permissions API.
  // Uma vez negada, o browser NUNCA mostra o prompt de novo sozinho — só dá pra
  // detectar o estado e orientar o usuário a liberar manualmente nas configurações.
  const [micPermission, setMicPermission] = useState('unknown')
  const bottomRef        = useRef(null)
  const inputRef         = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const streamRef        = useRef(null)
  const maxDurationTimer = useRef(null)
  const navigate         = useNavigate()
  const panelRef         = useRef(null)
  // Em tela cheia (celular) o chat é modal: o foco do teclado fica dentro dele. No desktop é uma janela flutuante, sem trava.
  const [fullScreen, setFullScreen] = useState(false)
  useEffect(() => { if (open) setFullScreen(!!window.matchMedia?.('(max-width: 900px)').matches) }, [open])
  useFocusTrap(panelRef, open && fullScreen)

  // Permite abrir o chat de fora (ex: menu rápido do "+" na barra de
  // navegação, que fica num componente irmão — Navbar/AgentChat são montados
  // separadamente em App.jsx, sem estado compartilhado hoje).
  // Quem abre o chat pode mandar uma pergunta pronta (detail.message), ex.: o cartão "Quer que a
  // Nancy sugira onde cortar?" da Análise do mês. Ela é enviada sozinha — só pra quem tem o
  // chat (Elite); pros outros o chat abre mostrando o convite pro plano e a pergunta é descartada.
  const [pendingMsg, setPendingMsg] = useState(null)
  useEffect(() => {
    const openChat = (e) => { setOpen(true); setPendingMsg(e?.detail?.message || null) }
    window.addEventListener('nancy:open-agent-chat', openChat)
    return () => window.removeEventListener('nancy:open-agent-chat', openChat)
  }, [])
  const user             = useUser()
  const isElite          = user.plan === 'elite'
  const firstName        = user.name?.split(' ')[0] || ''
  const suggestions      = buildSuggestions()

  useEffect(() => {
    if (!open || !pendingMsg) return
    setPendingMsg(null)
    if (isElite) send(pendingMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingMsg, isElite])

  useEffect(() => {
    // MediaRecorder + getUserMedia são suportados de forma muito mais ampla e
    // consistente entre navegadores do que o SpeechRecognition nativo (que o
    // Firefox nunca implementou de verdade e o Safari/iOS suporta de forma
    // instável) — gravar áudio bruto e transcrever no servidor funciona igual
    // em qualquer navegador moderno.
    setVoiceSupport(!!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder))

    // Permissions API — não existe no Safari/iOS, então falha silenciosamente
    // e o app cai de volta no comportamento antigo (detecta só pelo erro do
    // getUserMedia quando o usuário tentar gravar).
    if (!navigator.permissions?.query) return
    let status
    navigator.permissions.query({ name: 'microphone' }).then(s => {
      status = s
      setMicPermission(s.state)
      s.onchange = () => {
        setMicPermission(s.state)
        if (s.state === 'granted') setVoiceError('') // liberou nas configurações: o aviso de "bloqueado" não vale mais
      }
    }).catch(() => {})
    return () => { if (status) status.onchange = null }
  }, [])

  // Libera o microfone (indicador do navegador) se o componente desmontar
  // durante uma gravação em andamento — sem isso, o ícone de "gravando" do
  // navegador ficaria ativo indefinidamente.
  useEffect(() => () => {
    clearTimeout(maxDurationTimer.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120)
    } else {
      setVoiceError('') // o aviso do microfone não fica esperando na próxima vez que o chat abrir
    }
    if (!open && listening) {
      // O painel esconde o botão de "parar gravação" ao fechar, mas o
      // componente continua montado (só o conteúdo interno é condicional) —
      // sem isso, o microfone ficaria gravando em segundo plano indefinidamente,
      // sem nenhuma forma de interromper pela interface.
      mediaRecorderRef.current?.stop()
    }
  }, [open, listening])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  // dropLast: tira do fim da conversa a pergunta que falhou e o erro dela, para "Tentar de novo" não repetir a pergunta.
  const send = async (msg, { dropLast = 0 } = {}) => {
    const text = (msg || input).trim()
    if (!text || loading || transcribing) return
    setInput('')

    if (hasOpenPending(history) && isAffirmation(text)) {
      setHistory([...history, { role: 'user', content: text }, { role: 'assistant', content: 'Toque em Confirmar, logo acima, para concluir — ou em Cancelar para desistir.' }])
      return
    }
    analytics.track('ai_message_sent')

    // qualquer outra mensagem encerra os cartões abertos: a conversa seguiu, o botão antigo não pode mais agir
    const base = closeOpenPending(history.slice(0, history.length - dropLast))
    const userMsg = { role: 'user', content: text }
    setHistory([...base, userMsg])
    setLoading(true)

    try {
      // Contexto da conversa: só as últimas 10 mensagens (é o que o servidor usa — mandar tudo travava o chat com "Histórico
      // inválido." depois de uns 20 turnos) e sem os turnos que falharam (pergunta que ficou sem resposta não é contexto).
      const apiHistory = base
        .filter((m, i) => m.role && m.content && !m.error && !(m.role === 'user' && base[i + 1]?.error))
        .map(m => ({ role: m.role, content: m.content }))
        .slice(-10)
      const res = await agentAPI.chat(text, apiHistory)
      const { reply, pendingAction, dataChanged } = res.data
      // pendingAction: a IA preparou uma edição/exclusão e NADA foi feito ainda — os botões Confirmar/Cancelar
      // aparecem abaixo da resposta e só o toque em Confirmar executa (POST /agent/confirm).
      setHistory(h => [...closeOpenPending(h), { role: 'assistant', content: reply, ...(pendingAction ? { pending: { token: pendingAction.token, expiresAt: pendingAction.expiresAt, state: 'open' } } : {}) }])
      // O chat pode criar/editar/excluir transação via tool-calling — sem isso,
      // Dashboard/Transações continuavam mostrando dado velho até o usuário
      // forçar um refresh manual (ex: trocar de mês e voltar).
      if (dataChanged) refreshApp()
    } catch (err) {
      const { message, retry } = chatError(err)
      setHistory(h => [...h, { role: 'assistant', content: message, error: true, ...(retry ? { retryText: text } : {}) }])
    } finally {
      setLoading(false)
    }
  }

  const refreshApp = () => {
    invalidateCache('dashboard')
    window.dispatchEvent(new CustomEvent('budget-updated'))
  }

  const setPendingState = (index, state) =>
    setHistory(h => h.map((m, i) => (i === index && m.pending ? { ...m, pending: { ...m.pending, state } } : m)))

  const confirmPending = async (index) => {
    const pending = history[index]?.pending
    if (!pending || pending.state !== 'open' || loading || transcribing) return
    if (isExpired(pending)) {
      setPendingState(index, 'closed')
      setHistory(h => [...h, { role: 'assistant', content: 'Essa confirmação expirou. Peça de novo à Nancy.', error: true }])
      return
    }
    analytics.track('ai_action_confirmed')
    setLoading(true)
    try {
      const res = await agentAPI.confirm(pending.token)
      setPendingState(index, 'done')
      setHistory(h => [...h, { role: 'assistant', content: res.data.message }])
      if (res.data.dataChanged) refreshApp()
    } catch (err) {
      // 400 (token inválido/expirado) e 409 (a transação mudou ou o mês fechou) não adiantam tentar de novo
      const final = [400, 409].includes(err.response?.status)
      setPendingState(index, final ? 'closed' : 'open')
      setHistory(h => [...h, { role: 'assistant', content: final ? (err.response.data?.error || chatError(err).message) : chatError(err).message, error: true }])
    } finally {
      setLoading(false)
    }
  }

  const cancelPending = (index) => {
    if (history[index]?.pending?.state !== 'open' || loading) return
    analytics.track('ai_action_cancelled')
    setHistory(h => [...closeOpenPending(h).map((m, i) => (i === index ? { ...m, pending: { ...m.pending, state: 'cancelled' } } : m)), { role: 'assistant', content: 'Tudo bem, não mexi em nada.' }])
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const showVoiceError = (msg, { persistent = false } = {}) => {
    setVoiceError(msg)
    if (!persistent) setTimeout(() => setVoiceError(''), 5000)
  }

  const transcribeAndFill = async (blob, mimeType) => {
    // Gravação muito curta = provável clique acidental ou nenhuma fala captada.
    // Evita gastar uma chamada de transcrição (e a cota do usuário) sem necessidade.
    if (blob.size < 1000) {
      showVoiceError('Nenhuma fala detectada. Tente novamente.')
      return
    }

    setTranscribing(true)
    try {
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
      const formData = new FormData()
      formData.append('audio', blob, `voz.${ext}`)
      const res = await agentAPI.transcribe(formData)
      if (res.data.text) {
        setInput(res.data.text)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    } catch (err) {
      const status    = err.response?.status
      const serverMsg = err.response?.data?.error
      const msg =
        status === 429 ? 'Muitas transcrições seguidas. Aguarde um pouco.' :
        status === 403 ? 'Recurso de voz exclusivo do plano Elite.' :
        status === 422 ? (serverMsg || 'Não consegui entender o áudio. Tente novamente.') :
        !err.response  ? 'Sem conexão com o servidor.' :
        serverMsg || 'Erro ao transcrever áudio.'
      showVoiceError(msg)
    } finally {
      setTranscribing(false)
    }
  }

  const toggleVoice = async () => {
    if (listening) {
      mediaRecorderRef.current?.stop() // dispara onstop, que envia pro backend
      return
    }
    if (transcribing) return // já tem uma transcrição em andamento

    // Permissão já sabidamente negada — nem tenta abrir o getUserMedia de novo
    // (só repetiria o mesmo erro). Mostra a instrução direto, sem timeout,
    // porque exige uma ação manual do usuário fora do app.
    if (micPermission === 'denied') {
      showVoiceError(`Microfone bloqueado. ${getMicHelpText()}`, { persistent: true })
      return
    }

    setVoiceError('')

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMicPermission('denied')
      showVoiceError(`Permissão de microfone negada. ${getMicHelpText()}`, { persistent: true })
      return
    }
    streamRef.current = stream

    const mimeType = pickSupportedMimeType()
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream)
    audioChunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      clearTimeout(maxDurationTimer.current)
      stopStream()
      setListening(false)
      const finalType = recorder.mimeType || mimeType || 'audio/webm'
      const blob = new Blob(audioChunksRef.current, { type: finalType })
      transcribeAndFill(blob, finalType)
    }

    recorder.onerror = () => {
      clearTimeout(maxDurationTimer.current)
      stopStream()
      setListening(false)
      showVoiceError('Erro ao gravar áudio. Tente novamente.')
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    setListening(true)

    maxDurationTimer.current = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, MAX_RECORDING_MS)
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        className={`agent-fab${open ? ' active' : ''}`}
        onClick={() => { if (!open) analytics.track('ai_chat_opened'); setOpen(o => !o) }}
        aria-label="Assistente IA"
        title="Assistente Financeiro IA"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            <circle cx="9"  cy="10" r="1" fill="currentColor"/>
            <circle cx="12" cy="10" r="1" fill="currentColor"/>
            <circle cx="15" cy="10" r="1" fill="currentColor"/>
          </svg>
        )}
      </button>

      {/* Painel do chat — tela cheia azul no celular, janela flutuante no desktop (tela 12) */}
      {open && (
        <div ref={panelRef} className="agent-panel nia-panel fade-in" role="dialog" aria-label="Nancy IA" aria-modal={fullScreen ? 'true' : undefined}>
          <div className="nia-head">
            <NancyMark size={42} />
            <div className="nia-head-txt">
              <div className="nia-name">Nancy IA</div>
              <div className="nia-status">{isElite ? <><span className="nia-dot" />online</> : 'disponível no Elite'}</div>
            </div>
            <button type="button" className="nia-close" onClick={() => setOpen(false)} aria-label="Fechar chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="nia-msgs">
            {!isElite ? (
              <>
                <div className="nia-msg bot">
                  <div className="nia-bubble">
                    Oi{firstName ? `, ${firstName}` : ''}! A Nancy IA analisa seus gastos, tira dúvidas e registra transações por texto ou áudio. Ela está disponível no plano Elite.
                  </div>
                </div>
                <button type="button" className="nia-upgrade" onClick={() => { setOpen(false); navigate('/planos') }}>
                  Ver planos →
                </button>
              </>
            ) : (
              <>
                <div className="nia-msg bot">
                  <div className="nia-bubble">
                    Oi{firstName ? `, ${firstName}` : ''}! Sou a Nancy. Pergunte sobre seus gastos ou peça para eu registrar uma despesa. Pode digitar ou mandar um áudio.
                  </div>
                </div>
                {history.length === 0 && (
                  <div className="nia-suggestions">
                    {suggestions.map((sug, i) => (
                      <button key={i} type="button" className="nia-suggestion" onClick={() => send(sug)}>{sug}</button>
                    ))}
                  </div>
                )}
                {history.map((m, i) => {
                  const isBot       = m.role !== 'user'
                  const canRetry    = m.error && m.retryText && i === history.length - 1 && !loading
                  const awaiting    = m.pending?.state === 'open' && !isExpired(m.pending)
                  const hasActions  = awaiting || canRetry
                  const shown       = displayContent(m)
                  const bubble      = <div className={`nia-bubble${isBot && !m.error ? ' nia-rich-bubble' : ''}`}>{isBot && !m.error ? <AiMessage text={shown} /> : shown}</div>
                  return (
                    <div key={i} className={`nia-msg ${isBot ? 'bot' : 'user'}${m.error ? ' err' : ''}`}>
                      {hasActions ? (
                        <div className="nia-col">
                          {bubble}
                          {awaiting && (
                            <div className="nia-actions" role="group" aria-label="Confirmar a ação">
                              <button type="button" className="nia-act-yes" onClick={() => confirmPending(i)} disabled={loading}>Confirmar</button>
                              <button type="button" className="nia-act-no" onClick={() => cancelPending(i)} disabled={loading}>Cancelar</button>
                            </div>
                          )}
                          {canRetry && (
                            <div className="nia-actions">
                              <button type="button" className="nia-act-no" onClick={() => send(m.retryText, { dropLast: 2 })}>Tentar de novo</button>
                            </div>
                          )}
                        </div>
                      ) : bubble}
                    </div>
                  )
                })}
              </>
            )}
            {loading && (
              <div className="nia-msg bot">
                <div className="nia-bubble nia-typing" aria-label="Nancy está digitando"><span/><span/><span/></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {isElite && voiceError && (
            <div className="nia-voice-error" role="status">
              <span>{voiceError}</span>
              <button type="button" onClick={() => setVoiceError('')} aria-label="Fechar aviso">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          )}
          {isElite && (
            <div className="nia-input-bar">
              <textarea
                ref={inputRef}
                className={`nia-input${listening ? ' voice-active' : ''}`}
                placeholder={listening ? 'Ouvindo…' : transcribing ? 'Transcrevendo…' : 'Pergunte à Nancy…'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
                maxLength={2000}
                disabled={loading || transcribing}
              />
              {voiceSupport && (
                <button
                  className={`nia-mic${listening ? ' listening' : ''}${transcribing ? ' transcribing' : ''}${micPermission === 'denied' ? ' blocked' : ''}`}
                  onClick={toggleVoice}
                  disabled={loading || transcribing}
                  aria-label={listening ? 'Parar gravação' : transcribing ? 'Transcrevendo áudio' : micPermission === 'denied' ? 'Microfone bloqueado — toque para ver como liberar' : 'Falar mensagem'}
                  title={micPermission === 'denied' ? 'Microfone bloqueado — toque para ver como liberar' : undefined}
                  type="button"
                >
                  {listening ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                  ) : transcribing ? (
                    <span className="agent-mic-spinner" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                      <path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
                    </svg>
                  )}
                </button>
              )}
              <button className={`nia-send${loading || transcribing ? ' busy' : ''}`} onClick={() => send()} disabled={!input.trim() || loading || transcribing} aria-label="Enviar">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
