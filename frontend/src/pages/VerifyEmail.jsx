import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api.js'
import { saveUser, useUser } from '../hooks/useUser.js'

// /verify-email é pública (o link pode ser aberto em qualquer navegador,
// sem sessão ativa) — os botões abaixo não podem assumir que o usuário
// está logado NESTE navegador só porque acabou de confirmar o e-mail.
export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const user            = useUser()
  const isLoggedIn      = !!user.id
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [err, setErr]       = useState('')

  // Se não estiver logado, PrivateRoute (App.jsx) mandaria pro /login de
  // qualquer forma — melhor já mandar pra lá direto, com um rótulo honesto
  // no botão, preservando a rota pretendida (state.from) pra voltar depois do login.
  const goDashboard = () => isLoggedIn
    ? navigate('/dashboard')
    : navigate('/login', { state: { from: { pathname: '/dashboard' } } })
  const goSettings = () => isLoggedIn
    ? navigate('/settings')
    : navigate('/login', { state: { from: { pathname: '/settings' } } })

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); setErr('Link inválido.'); return }

    authAPI.verifyEmail(token)
      .then(() => {
        // Atualiza o user em sessionStorage para refletir emailVerified: true
        try {
          const cur = JSON.parse(sessionStorage.getItem('user') || '{}')
          if (cur.id) saveUser({ ...cur, emailVerified: true })
        } catch {}
        setStatus('ok')
      })
      .catch(e => {
        setStatus('error')
        setErr(e.response?.data?.error || 'Link inválido ou expirado.')
      })
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 16, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <span className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 20px' }} />
            <p style={{ color: 'var(--t2)', fontSize: 14 }}>Verificando seu e-mail...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(74,226,172,.12)', border: '1px solid rgba(74,226,172,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ color: 'var(--t1)', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>E-mail confirmado!</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>Sua conta está totalmente ativada. Aproveite o Nancy!</p>
            <button
              onClick={goDashboard}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#4ae2ac', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              {isLoggedIn ? 'Ir para o Dashboard' : 'Fazer login'}
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
              {isLoggedIn ? 'Reenviar verificação em Configurações' : 'Fazer login'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
