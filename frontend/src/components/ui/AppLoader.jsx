import NancyMark from './NancyMark.jsx'

// Tela de carregamento do app (substitui a antiga: spinner e texto cinza sobre fundo cinza, que parecia uma tela em branco).
// Azul chapado do app, o ícone do Nancy no centro e um anel branco girando; o texto fica só para leitor de tela.
export default function AppLoader({ label = 'Carregando…' }) {
  return (
    <div className="app-loader" role="status" aria-live="polite">
      <div className="app-loader-box">
        <span className="app-loader-ring" aria-hidden="true" />
        <NancyMark size={60} />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}
