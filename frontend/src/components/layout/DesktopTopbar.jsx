import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '../../hooks/useUser.js'
import { useHideBalance } from '../../hooks/useHideBalance.js'
import { useUnreadCount } from '../../hooks/useUnreadCount.js'
import { usePageSubtitleOverride } from '../../hooks/usePageSubtitle.js'
import ProtoIcon from './ProtoIcon.jsx'
import { desktopTitle } from '../../utils/desktopNav.js'

// Barra de cima do desktop (design "Nancy Desktop": 76 px): título e subtítulo da tela, busca, olho, sino e "Nova transação".
export default function DesktopTopbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useUser()
  const [hidden, toggleHidden] = useHideBalance()
  const unread = useUnreadCount()
  const subtitleOverride = usePageSubtitleOverride()
  const [query, setQuery] = useState('')

  const firstName = user.name ? user.name.split(' ')[0] : ''
  const [title, defaultSub] = desktopTitle(pathname, { now: new Date(), firstName })
  const subtitle = subtitleOverride || defaultSub

  // A busca leva ao Extrato já filtrado (é onde ficam os lançamentos); a mesma tela do Extrato faz a filtragem.
  const submitSearch = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    navigate('/transactions', { state: { search: q } })
  }

  return (
    <header className="nds-topbar">
      <div className="nds-topbar-text">
        <h1 className="nds-topbar-title">{title}</h1>
        <span className="nds-topbar-sub">{subtitle}</span>
      </div>

      <form className="nds-search" role="search" onSubmit={submitSearch}>
        <ProtoIcon name="search" />
        <input
          type="search"
          className="nds-search-input"
          placeholder="Buscar transações, contas, metas…"
          aria-label="Buscar transações, contas, metas"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
      </form>

      <button type="button" className="nds-iconbtn" onClick={toggleHidden}
        aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'} aria-pressed={hidden}>
        <ProtoIcon name={hidden ? 'eyeOff' : 'eye'} />
      </button>

      <button type="button" className="nds-iconbtn" onClick={() => navigate('/notificacoes')} aria-label="Notificações">
        <ProtoIcon name="bell" />
        {unread > 0 && <span className="nds-bell-dot" data-testid="topbar-bell-dot" />}
      </button>

      <button type="button" className="nds-newtx" onClick={() => window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail: {} }))}>
        <ProtoIcon name="plus" />
        Nova transação
      </button>
    </header>
  )
}
