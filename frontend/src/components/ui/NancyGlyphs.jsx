// Glifos do Nancy 2 que se repetem em telas diferentes (Notificações, Finanças). Traço fino,
// 24x24, desenhados como no design: carteira (salário), recibo (conta fixa) e "×" (remover).
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }

export const WalletGlyph = ({ size = 20 }) => (
  <svg {...base} width={size} height={size} strokeWidth="1.8">
    <rect x="2.5" y="8.8" width="19" height="12.4" rx="3" /><path d="M4.8 6.2h11.5" />
  </svg>
)

export const ReceiptGlyph = ({ size = 20 }) => (
  <svg {...base} width={size} height={size} strokeWidth="1.8">
    <path d="M5.2 21.3V2.7h13.6v18.6l-2.27-1.5-2.27 1.5-2.26-1.5-2.27 1.5-2.27-1.5z" /><path d="M9.2 8h5.6M9.2 11.8h5.6" />
  </svg>
)

// o viewBox é recortado no próprio "×" pra ele ocupar o tamanho pedido
export const CloseGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="5.4 5.4 13.2 13.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
)

export const LayersGlyph = ({ size = 20 }) => (
  <svg {...base} width={size} height={size} strokeWidth="1.8">
    <polygon points="12 3 3 8 12 13 21 8 12 3" /><polyline points="3 12.5 12 17.5 21 12.5" /><polyline points="3 17 12 22 21 17" />
  </svg>
)

export const PlusGlyph = ({ size = 18 }) => (
  <svg {...base} width={size} height={size} strokeWidth="1.9"><path d="M12 5v14M5 12h14" /></svg>
)
