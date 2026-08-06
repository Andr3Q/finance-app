import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentAPI } from '../../services/api.js'
import { useUser } from '../../hooks/useUser.js'
import { analytics } from '../../services/analytics.js'

const SUGGESTIONS = [
  'Quanto gastei esse mês?',
  'Qual meu saldo atual?',
  'Onde estou gastando mais?',
  'Registrar gasto de R$ 50 em alimentação',
]

export default function AgentChat() {
  const [open,         setOpen]         = useState(false)
  const [input,        setInput]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [history,      setHistory]      = useState([])
  const [listening,    setListening]    = useState(false)
  const [voiceError,   setVoiceError]   = useState('')
  const [voiceSupport, setVoiceSupport] = useState(false)
  // 'unknown' | 'granted' | 'denied' | 'prompt' — consultado via Permissions API.
  // Uma vez negada, o browser NUNCA mostra o prompt de novo sozinho — só dá pra
  // detectar o estado e orientar o usuário a liberar manualmente nas configurações.
  const [micPermission, setMicPermission] = useState('unknown')
  const bottomRef      = useRef(null)
  const inputRef       = useRef(null)
  const recognitionRef = useRef(null)
  const navigate       = useNavigate()
  const user           = useUser()
  const isElite        = user.plan === 'elite'

  useEffect(() => {
    setVoiceSupport(!!(window.SpeechRecognition || window.webkitSpeechRecognition))

    // Permissions API — não existe no Safari/iOS, então falha silenciosamente
    // e o app cai de volta no comportamento antigo (detecta só pelo onerror).
    if (!navigator.permissions?.query) return
    let status
    navigator.permissions.query({ name: 'microphone' }).then(s => {
      status = s
      setMicPermission(s.state)
      s.onchange = () => setMicPermission(s.state)
    }).catch(() => {})
    return () => { if (status) status.onchange = null }
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, loading])

  const send = async (msg) => {
    const text = (msg || input).trim()
    if (!text || loading) return
    setInput('')
    analytics.track('ai_message_sent')

    const userMsg = { role: 'user', content: text }
    setHistory(h => [...h, userMsg])
    setLoading(true)

    try {
      const apiHistory = history
        .filter(m => m.role && m.content && !m.error)
        .map(m => ({ role: m.role, content: m.content }))
      const res = await agentAPI.chat(text, apiHistory)
      setHistory(h => [...h, { role: 'assistant', content: res.data.reply }])
    } catch (err) {
      const status = err.response?.status
      const serverMsg = err.response?.data?.error
      const errMsg =
        status === 429 ? 'Muitas mensagens seguidas. Aguarde alguns segundos.' :
        status === 503 ? 'Agente IA não configurado.' :
        status === 401 || status === 403 ? 'Sessão expirada. Faça login novamente.' :
        !err.response ? 'Sem conexão com o servidor.' :
        serverMsg || 'Erro ao processar mensagem.'
      setHistory(h => [...h, { role: 'assistant', content: errMsg, error: true }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const MIC_HELP = 'Toque no ícone de cadeado/informações ao lado do endereço do site (ou, se instalou o Nancy como app, vá em Configurações do Android → Apps → Nancy → Permissões) e libere o Microfone. Depois recarregue a página.'

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    // Permissão já sabidamente negada — nem tenta iniciar (evitaria só repetir o
    // mesmo erro "service-not-allowed"). Mostra a instrução direto, sem timeout,
    // porque exige uma ação manual do usuário fora do app.
    if (micPermission === 'denied') {
      setVoiceError(`Microfone bloqueado. ${MIC_HELP}`)
      return
    }

    setVoiceError('')
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = true

    rec.onstart = () => setListening(true)

    rec.onerror = (e) => {
      setListening(false)
      const code = e.error || 'unknown'
      if (code === 'not-allowed' || code === 'permission-denied' || code === 'service-not-allowed') {
        setMicPermission('denied')
        setVoiceError(`Permissão de microfone negada. ${MIC_HELP}`)
        return // não some depois de 5s — o usuário precisa de tempo pra agir
      } else if (code === 'no-speech') {
        setVoiceError('Nenhuma fala detectada. Tente novamente.')
      } else if (code === 'network') {
        setVoiceError('Erro de rede no reconhecimento de voz.')
      } else if (code === 'audio-capture') {
        setVoiceError('Microfone não encontrado. Verifique o hardware.')
      } else if (code === 'service-not-available') {
        setVoiceError('Serviço de voz indisponível. Tente no Chrome.')
      } else {
        setVoiceError(`Erro: ${code}`)
      }
      setTimeout(() => setVoiceError(''), 5000)
    }

    rec.onend = () => setListening(false)

    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      setInput(transcript)
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }

    recognitionRef.current = rec
    rec.start()
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

      {/* Painel do chat */}
      {open && (
        <div className="agent-panel fade-in">
          {/* Header */}
          <div className="agent-header">
            <div className="agent-header-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
            </div>
            <div>
              <div className="agent-header-title">Assistente IA</div>
              <div className="agent-header-sub">Finance · Claude</div>
            </div>
            <div className="agent-header-dot" />
          </div>

          {/* Mensagens */}
          <div className="agent-messages">
            {!isElite ? (
              <div className="agent-welcome">
                <div className="agent-welcome-ico" style={{ background: 'rgba(123,47,255,.12)', border: '1px solid rgba(123,47,255,.25)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7b2fff" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <div className="agent-welcome-title">Assistente IA</div>
                <div className="agent-welcome-sub" style={{ marginBottom: 16 }}>
                  Analise gastos, tire dúvidas e registre transações por texto. Disponível no plano <strong style={{ color: '#a78bfa' }}>Elite</strong>.
                </div>
                <button
                  onClick={() => { setOpen(false); navigate('/planos') }}
                  style={{ background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Ver planos →
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="agent-welcome">
                <div className="agent-welcome-ico">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                </div>
                <div className="agent-welcome-title">Olá! Sou seu assistente financeiro.</div>
                <div className="agent-welcome-sub">Posso analisar seus gastos, responder dúvidas e registrar transações por texto.</div>
                <div className="agent-suggestions">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className="agent-suggestion" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              history.map((m, i) => (
                <div key={i} className={`agent-msg ${m.role}${m.error ? ' err' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="agent-msg-ico">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                      </svg>
                    </div>
                  )}
                  <div className="agent-msg-bubble">{m.content}</div>
                </div>
              ))
            )}
            {loading && (
              <div className="agent-msg assistant">
                <div className="agent-msg-ico">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
                  </svg>
                </div>
                <div className="agent-typing">
                  <span/><span/><span/>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input — só exibido para Elite */}
          {isElite && voiceError && (
            <div className="agent-voice-error">{voiceError}</div>
          )}
          {isElite && <div className="agent-input-wrap">
            <textarea
              ref={inputRef}
              className={`agent-input${listening ? ' voice-active' : ''}`}
              placeholder={listening ? 'Ouvindo…' : 'Pergunte algo sobre suas finanças…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              maxLength={2000}
              disabled={loading}
            />
            {voiceSupport && (
              <button
                className={`agent-mic${listening ? ' listening' : ''}${micPermission === 'denied' ? ' blocked' : ''}`}
                onClick={toggleVoice}
                disabled={loading}
                aria-label={listening ? 'Parar gravação' : micPermission === 'denied' ? 'Microfone bloqueado — toque para ver como liberar' : 'Falar mensagem'}
                title={micPermission === 'denied' ? 'Microfone bloqueado — toque para ver como liberar' : undefined}
                type="button"
              >
                {listening ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                    <path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
            )}
            <button
              className="agent-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              aria-label="Enviar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>}
        </div>
      )}
    </>
  )
}
