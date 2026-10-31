import { useState, useEffect, lazy, Suspense } from 'react'
import { invalidateCache } from '../../services/cache.js'

// O formulário só é baixado na primeira vez que o "+" é tocado.
const TransactionForm = lazy(() => import('./TransactionForm.jsx'))

// Folha "Nova transação" (design Nancy 2, tela 11) aberta pelas ações Receita/Despesa do
// menu do "+" da barra de baixo, por cima de QUALQUER tela autenticada. Montado uma vez em
// App.jsx (PrivateRoute); o menu só dispara o evento, então a barra não precisa conhecer
// o formulário.
//
// Ao salvar, usa o mesmo aviso que todo outro ponto que muda dado ('budget-updated'):
// o Início e o Extrato escutam e se recarregam sozinhos.
export default function NewTransactionSheet() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('expense')

  useEffect(() => {
    // detail.type: 'income' (Receita) ou 'expense' (Despesa); sem detalhe = saída.
    const show = (e) => { setType(e.detail?.type === 'income' ? 'income' : 'expense'); setOpen(true) }
    window.addEventListener('nancy:new-transaction', show)
    return () => window.removeEventListener('nancy:new-transaction', show)
  }, [])

  if (!open) return null

  return (
    <Suspense fallback={null}>
      <TransactionForm
        initialData={{ type }}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          setOpen(false)
          invalidateCache('dashboard')
          window.dispatchEvent(new CustomEvent('budget-updated'))
        }}
      />
    </Suspense>
  )
}
