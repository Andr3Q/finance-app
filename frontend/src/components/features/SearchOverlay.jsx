import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryIcon } from '../ui/icons.jsx'
import { CATEGORY_LABELS } from '../../constants/index.js'
import { fmt } from '../../utils/format.js'

const SUGGESTIONS = [
  { label: 'Alimentação', cat: 'food',      color: '#f59e0b' },
  { label: 'Moradia',     cat: 'housing',   color: '#3b82f6' },
  { label: 'Transporte',  cat: 'transport', color: '#8b5cf6' },
  { label: 'Saúde',       cat: 'health',    color: '#ec4899' },
  { label: 'Lazer',       cat: 'leisure',   color: '#06b6d4' },
  { label: 'Contas fixas',cat: 'utilities', color: '#f97316' },
  { label: 'Entradas',    type:'income',    color: '#4ae2ac' },
  { label: 'Gastos',      type:'expense',   color: '#ef4444' },
]

export default function SearchOverlay({ isOpen, onClose, transactions = [] }) {
  const navigate  = useNavigate()
  const inputRef  = useRef(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return transactions.filter(t => {
      const desc = (t.description || '').toLowerCase()
      const cat  = (CATEGORY_LABELS[t.category] || t.category || '').toLowerCase()
      const val  = String(t.amount)
      const type = t.type === 'income' ? 'entrada' : 'gasto'
      return desc.includes(q) || cat.includes(q) || val.includes(q) || type.includes(q)
    }).slice(0, 25)
  }, [query, transactions])

  if (!isOpen) return null

  return (
    <div className="srch-page">

      {/* Header */}
      <div className="srch-hdr">
        <button className="srch-back" onClick={onClose} aria-label="Voltar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div className="srch-input-wrap">
          <svg className="srch-input-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
          </svg>
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
            <button className="srch-clear" onClick={() => setQuery('')}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="srch-content">

        {/* Estado inicial — sem query */}
        {!query && (
          <>
            <p className="srch-lbl">Pesquisar por categoria</p>
            <div className="srch-chips">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="srch-chip"
                  onClick={() => setQuery(s.label.toLowerCase())}
                  style={{ '--chip-c': s.color }}
                >
                  <span className="srch-chip-dot" />
                  {s.label}
                </button>
              ))}
            </div>

            <p className="srch-lbl" style={{ marginTop: 28 }}>Você pode buscar por</p>
            <div className="srch-tips">
              {[
                ['Descrição', 'ex: Aluguel, Restaurante'],
                ['Categoria', 'ex: Alimentação, Moradia'],
                ['Valor',     'ex: 150, 2000'],
                ['Tipo',      '"entrada" ou "gasto"'],
              ].map(([t, sub]) => (
                <div key={t} className="srch-tip">
                  <div className="srch-tip-dot" />
                  <div>
                    <span className="srch-tip-title">{t}</span>
                    <span className="srch-tip-sub"> — {sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Sem resultados */}
        {query && results.length === 0 && (
          <div className="srch-empty">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
            </svg>
            <p className="srch-empty-t">Nenhum resultado para "{query}"</p>
            <p className="srch-empty-s">Tente outra descrição ou categoria</p>
          </div>
        )}

        {/* Resultados */}
        {query && results.length > 0 && (
          <>
            <p className="srch-lbl">{results.length} resultado{results.length !== 1 ? 's' : ''}</p>
            <div className="srch-list">
              {results.map(t => {
                const isInc = t.type === 'income'
                const desc  = t.description || CATEGORY_LABELS[t.category] || t.category
                const date  = new Date(t.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' })
                return (
                  <button key={t.id} className="srch-item" onClick={() => { onClose(); navigate('/transactions') }}>
                    <div className={`srch-item-ico${isInc ? ' inc' : ''}`}>
                      <CategoryIcon category={t.category} size={17} color="currentColor" />
                    </div>
                    <div className="srch-item-body">
                      <div className="srch-item-title">{desc}</div>
                      <div className="srch-item-meta">
                        <span className="srch-item-cat">{CATEGORY_LABELS[t.category] || t.category}</span>
                        <span className="srch-item-date">{date}</span>
                      </div>
                    </div>
                    <div className={`srch-item-amt${isInc ? ' inc' : ''}`}>
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
  )
}
