import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api.js'

export default function UnlockAccount() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const [status, setStatus] = useState('loading')
  const [err, setErr]       = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { setStatus('error'); setErr('Link inválido.'); return }

    authAPI.unlockAccount(token)
      .then(() => setStatus('ok'))
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
            <p style={{ color: 'var(--t2)', fontSize: 14 }}>Desbloqueando sua conta...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(74,226,172,.12)', border: '1px solid rgba(74,226,172,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4ae2ac" strokeWidth="2.5" strokeLinecap="round"><path d="M17 11H7a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2z"/><path d="M11 15v-2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 style={{ color: 'var(--t1)', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Conta desbloqueada!</h2>
            <p style={{ color: 'var(--t2)', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Sua conta foi desbloqueada com sucesso. Para sua segurança, recomendamos alterar a senha.
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: '#4ae2ac', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              Ir para o login
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
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: '12px 0', borderRadius: 10, border: 'none', background: 'var(--cp)', color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
            >
              Voltar para o login
            </button>
          </>
        )}
      </div>
    </div>
  )
}
