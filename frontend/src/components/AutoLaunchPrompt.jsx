// ─── src/components/AutoLaunchPrompt.jsx ───────────────
// Exibe um banner no início do mês perguntando se o usuário
// quer lançar as contas fixas automaticamente como transações.

import { useState } from 'react'
import { transactionsAPI } from '../services/api.js'

export default function AutoLaunchPrompt({ autoLaunched, onLaunched }) {
  const [loading,   setLoading]   = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error,     setError]     = useState('')

  // Se já foi lançado este mês ou o usuário fechou o banner, não mostra
  if (autoLaunched || dismissed) return null

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await transactionsAPI.autoLaunch()
      onLaunched(res.data.message) // avisa o Dashboard para recarregar
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar contas fixas.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12, marginBottom: 16,
      background: 'rgba(79,142,247,0.08)', border: '1px solid rgba(79,142,247,0.25)',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: 15, color: '#f0f0ff', marginBottom: 4 }}>
            🔁 Lançar contas fixas do mês?
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Suas contas fixas ainda não foram lançadas este mês.
            Clique para registrá-las automaticamente como gastos no histórico.
          </p>

          {error && (
            <p style={{ color: 'var(--color-red)', fontSize: 13, marginBottom: 10 }}>⚠️ {error}</p>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handleLaunch}
              disabled={loading}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: 13 }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Lançando...</>
                : '✅ Lançar agora'
              }
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="btn btn-ghost"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              Agora não
            </button>
          </div>
        </div>

        <button onClick={() => setDismissed(true)} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0
        }}>✕</button>
      </div>
    </div>
  )
}
