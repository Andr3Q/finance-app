import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { useUser } from '../hooks/useUser.js'

// /confirmar-troca-email é pública (o link vai pro e-mail NOVO, pode ser
// aberto em qualquer navegador, sem sessão ativa aqui).
export default function ConfirmEmailChange() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const user            = useUser()
  const isLoggedIn      = !!user.id
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [err, setErr]       = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); setErr('Link inválido.'); return }

    authAPI.confirmEmailChange(token)
      .then(() => {
        // A confirmação sempre invalida a sessão atual no servidor (mesmo
        // padrão de troca de senha) — mesmo que este navegador ainda tenha
        // um usuário salvo, o cookie dele já não serve mais pra nada, então
        // limpa aqui pra não deixar a UI mostrar um estado "logado" morto.
        try { sessionStorage.removeItem('user') } catch {}
        setStatus('ok')
      })
      .catch(e => {
        setStatus('error')
        setErr(e.response?.data?.error || 'Link inválido ou expirado.')
      })
  }, [])

  const goLogin = () => navigate('/login')
  // No caminho de erro nada foi alterado — a sessão local, se existir, ainda
  // é válida, então preserva o mesmo comportamento honesto do VerifyEmail.jsx.
  const goSettings = () => isLoggedIn
    ? navigate('/settings/perfil')
    : navigate('/login', { state: { from: { pathname: '/settings/perfil' } } })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--t2)', fontSize: 14 }}>Confirmando seu novo e-mail...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(74,226,172,.12)', border: '1px solid rgba(74,226,172,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ color: 'var(--t1)', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>E-mail atualizado!</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>Seu e-mail de login foi trocado com sucesso. Por segurança, você precisa entrar de novo com o novo e-mail.</p>
            <button
              onClick={goLogin}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#4ae2ac', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              Fazer login
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </div>
            <h2 style={{ color: 'var(--t1)', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Link inválido</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>{err}</p>
            <button
              onClick={goSettings}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--cp)', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              {isLoggedIn ? 'Pedir nova troca em Configurações' : 'Fazer login'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
