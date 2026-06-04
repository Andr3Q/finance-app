import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryIcon } from '../ui/icons.jsx'
import { CATEGORY_LABELS } from '../../constants/index.js'
import { fmt } from '../../utils/format.js'

const SUGGESTIONS = [
  { icon: '🍽️', label: 'Alimentação',  cat: 'food'       },
  { icon: '🏠', label: 'Moradia',       cat: 'housing'    },
  { icon: '🚗', label: 'Transporte',    cat: 'transport'  },
  { icon: '💊', label: 'Saúde',         cat: 'health'     },
  { icon: '🎮', label: 'Lazer',         cat: 'leisure'    },
  { icon: '💡', label: 'Contas fixas',  cat: 'utilities'  },
  { icon: '💰', label: 'Entradas',      type: 'income'    },
  { icon: '📉', label: 'Gastos',        type: 'expense'   },
]

export default function SearchOverlay({ isOpen, onClose, transactions = [] }) {
  const navigate    = useNavigate()
  const inputRef    = useRef(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  // Filtrar transações em tempo real
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return transactions.filter(t => {
      const desc = (t.description || '').toLowerCase()
      const cat  = (CATEGORY_LABELS[t.category] || t.category || '').toLowerCase()
      const val  = String(t.amount)
      return desc.includes(q) || cat.includes(q) || val.includes(q)
    }).slice(0, 20)
  }, [query, transactions])

  const handleSuggestion = (s) => {
    if (s.cat)  setQuery(CATEGORY_LABELS[s.cat] || s.cat)
    if (s.type) setQuery(s.type === 'income' ? 'entrada' : 'gasto')
  }

  const handleResultClick = () => {
    onClose()
    navigate('/transactions')
  }

  if (!isOpen) return null

  return (
    <div className="srch-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="srch-box">

        {/* Input */}
        <div className="srch-header">
          <button className="srch-back" onClick={onClose} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <input
            ref={inputRef}
            className="srch-input"
            type="text"
            placeholder="Buscar transações, categorias..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button className="srch-clear" onClick={() => setQuery('')} aria-label="Limpar">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
            </button>
          )}
        </div>

        <div className="srch-body">
          {/* Sugestões rápidas (quando sem query) */}
          {!query && (
            <>
              <div className="srch-section-lbl">Pesquisar por categoria</div>
              <div className="srch-chips">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="srch-chip" onClick={() => handleSuggestion(s)}>
                    <span className="srch-chip-icon">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="srch-section-lbl" style={{ marginTop: 20 }}>Você pode buscar por</div>
              <ul className="srch-tips">
                <li><span className="srch-tip-ico">📝</span>Descrição da transação</li>
                <li><span className="srch-tip-ico">📂</span>Categoria (ex: Alimentação, Moradia)</li>
                <li><span className="srch-tip-ico">💵</span>Valor (ex: 150)</li>
                <li><span className="srch-tip-ico">💚</span>Tipo: "entrada" ou "gasto"</li>
              </ul>
            </>
          )}

          {/* Resultados */}
          {query && results.length === 0 && (
            <div className="srch-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color:'var(--t3)', marginBottom:12 }}>
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
              </svg>
              <div className="srch-empty-title">Nenhum resultado</div>
              <div className="srch-empty-sub">Tente buscar por outra descrição ou categoria</div>
            </div>
          )}

          {query && results.length > 0 && (
            <>
              <div className="srch-section-lbl">{results.length} resultado{results.length !== 1 ? 's' : ''}</div>
              <div className="srch-results">
                {results.map(t => {
                  const isInc = t.type === 'income'
                  const desc  = t.description || CATEGORY_LABELS[t.category] || t.category
                  const date  = new Date(t.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
                  return (
                    <button key={t.id} className="srch-result-item" onClick={handleResultClick}>
                      <div className={`srch-result-ico${isInc ? ' inc' : ''}`}>
                        <CategoryIcon category={t.category} size={16} color="currentColor" />
                      </div>
                      <div className="srch-result-body">
                        <div className="srch-result-title">{desc}</div>
                        <div className="srch-result-meta">
                          <span className="srch-result-cat">{CATEGORY_LABELS[t.category] || t.category}</span>
                          <span className="srch-result-date">{date}</span>
                        </div>
                      </div>
                      <div className={`srch-result-amt${isInc ? ' inc' : ''}`}>
                        {isInc ? '+' : '−'}R$ {fmt(t.amount)}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
