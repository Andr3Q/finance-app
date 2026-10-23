import { useId } from 'react'

// Ícone do Nancy (ícone 6b, provisório do design): quadrado arredondado em degradê azul (#2F6BFF → #0A2A9E, diagonal), um
// "n" itálico serifado branco e três pontos (branco a 70%, menta clara #93F0CB, menta #3BE3A0) subindo à direita.
// O "n" foi traçado do PNG 1024 que o André enviou (marching squares + simplificação, sem fonte): o SVG do design usa a
// Instrument Serif por <text>, que desenha outro "n" (cursivo) — o PNG é a referência. Pontos, raio dos cantos (23/100) e
// degradê são os do SVG do design. Todos os usos (chat, stories, Instalar app) passam por este componente.
const N_PATH =
  'M46.92 34.52 L45.56 34.77 L43.7 35.38 L42.63 35.86 L41.36 36.55 L39.8 37.55 L38.23 38.82 L36.87 40.06 L35.5 41.55 L34.13 43.2 L34.1 42.92 L35.14 35.6 L35.11 35.41 L23.78 35.41 L23.44 37.16 L23.49 37.27 L27.98 38.21 L28.26 38.33 L22.02 74.0 L28.79 73.97 L33.31 48.19 L34.33 46.64 L35.86 44.78 L36.6 43.99 L37.84 42.87 L39.31 41.72 L41.16 40.55 L42.82 39.77 L44.09 39.38 L45.85 39.17 L46.92 39.26 L47.51 39.4 L48.0 39.58 L48.49 39.88 L48.93 40.28 L49.43 40.97 L49.73 41.65 L49.89 42.33 L49.99 43.31 L49.79 45.56 L49.49 47.51 L44.85 73.97 L57.18 73.97 L57.51 72.22 L57.47 72.15 L52.2 71.18 L52.15 71.04 L56.61 44.87 L56.77 43.02 L56.72 41.75 L56.52 40.38 L56.02 38.82 L55.32 37.46 L54.6 36.57 L53.95 35.99 L53.47 35.68 L52.1 35.0 L50.54 34.59 L49.85 34.48 L48.49 34.43Z'

export default function NancyMark({ size = 40 }) {
  // id único por instância (useId traz ":" no meio, que atrapalha o url(#...) em alguns navegadores)
  const gradId = `nancy-mark-${useId().replace(/:/g, '')}`
  return (
    <svg className="nancy-mark" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2F6BFF" />
          <stop offset="1" stopColor="#0A2A9E" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${gradId})`} />
      <path d={N_PATH} fill="#fff" />
      <circle cx="63" cy="70" r="2.6" fill="#fff" opacity=".7" />
      <circle cx="71.5" cy="63" r="3.8" fill="#93F0CB" />
      <circle cx="82" cy="54" r="5.4" fill="#3BE3A0" />
    </svg>
  )
}
