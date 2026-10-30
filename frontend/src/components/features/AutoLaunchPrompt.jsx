// ─── src/components/AutoLaunchPrompt.jsx ───────────────
// Exibe um banner no início do mês perguntando se o usuário
// quer lançar as contas fixas automaticamente como transações.

import { useState } from 'react'
import { transactionsAPI } from '../../services/api.js'
import { invalidateCache } from '../../services/cache.js'
import { IconAlert } from '../ui/icons.jsx'

// pending/total: quantas contas fixas faltam e quantas existem — sem isto o aviso dizia "ainda não foram lançadas" mesmo com 3 de 4 pagas.
export default function AutoLaunchPrompt({ autoLaunched, pending = 0, total = 0 }) {
  const [loading,   setLoading]   = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error,     setError]     = useState('')

  // Se já foi lançado este mês ou o usuário fechou o banner, não mostra
  if (autoLaunched || dismissed) return null

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      await transactionsAPI.autoLaunch()
      setDismissed(true)
      // Lançar cria transações: avisa o app inteiro, como todo ponto que muda dado (o Início refaz a busca; o Extrato e os
      // stories descartam o que tinham guardado — sem isto o story do mês seguia mostrando as contas fixas de antes).
      invalidateCache('dashboard')
      window.dispatchEvent(new CustomEvent('budget-updated'))
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao lançar contas fixas.')
      setLoading(false)
    }
  }

  return (
    <div className="alc fu d2">
      <div>
        <h4>Lançar contas fixas do mês?</h4>
        <p>{pending > 0 && total > pending
          ? `${pending === 1 ? 'Falta 1 conta fixa' : `Faltam ${pending} contas fixas`} para lançar este mês.`
          : 'Suas contas fixas ainda não foram lançadas este mês.'}</p>
        {error && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}><IconAlert size={13} color="var(--red)" /> {error}</p>
        )}
      </div>
      <div className="alc-acts">
        <button onClick={handleLaunch} disabled={loading} className="btn bp" style={{ padding: '8px 14px', fontSize: 13 }}>
          {loading
            ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Lançando...</>
            : <>
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                Lançar agora
              </>
          }
        </button>
        <button onClick={() => setDismissed(true)} className="btn bg" style={{ padding: '8px 14px', fontSize: 13 }}>
          Agora não
        </button>
      </div>
    </div>
  )
}
