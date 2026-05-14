import { useState, useRef, useEffect } from 'react'
import { agentAPI } from '../services/api.js'

const SUGGESTIONS = [
  'Quanto gastei esse mês?',
  'Qual meu saldo atual?',
  'Onde estou gastando mais?',
  'Registrar gasto de R$ 50 em alimentação',
]

export default function AgentChat() {
  const [open,    setOpen]    = useState(false)
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])  // { role, content }
  const bottomRef             = useRef(null)
  const inputRef              = useRef(null)

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

  return (
    <>
      {/* Botão flutuante */}
      <button
        className={`agent-fab${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
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
            {history.length === 0 ? (
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

          {/* Input */}
          <div className="agent-input-wrap">
            <textarea
              ref={inputRef}
              className="agent-input"
              placeholder="Pergunte algo sobre suas finanças…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={loading}
            />
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
          </div>
        </div>
      )}
    </>
  )
}
