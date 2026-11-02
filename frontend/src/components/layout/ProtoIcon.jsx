// Ícones do design desktop (Nancy Desktop.dc.html, objeto P): traçado de 24x24, linha de 2, pontas arredondadas — os mesmos
// caminhos do protótipo, para o menu e a barra de cima ficarem idênticos ao design.
const PATHS = {
  home:   ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  list:   ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  grid:   ['M3 3h18v18H3z', 'M3 9h18', 'M3 15h18', 'M9 3v18'],
  spark:  ['M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  wallet: ['M3 7h18v13H3z', 'M3 7l3-4h12l3 4', 'M16 13h2'],
  cal:    ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  zap:    ['M13 2 4 14h7l-1 8 9-12h-7z'],
  gear:   ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9 7 7', 'M17 17l2.1 2.1', 'M4.9 19.1 7 17', 'M17 7l2.1-2.1'],
  bell:   ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10 21h4'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M21 21l-5-5'],
  plus:   ['M12 5v14', 'M5 12h14'],
  eye:    ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  // olho cortado (valores ocultos): o protótipo não desenha esse estado, usa o mesmo traço dos demais ícones
  eyeOff: ['M3 3l18 18', 'M10.6 5.1A9.9 9.9 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4', 'M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 4.4-1', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'],
  card:   ['M2 6h20v12H2z', 'M2 10h20'],
  back:   ['M15 6l-6 6 6 6'],
  check:  ['M5 12l5 5L20 7'],
  mail:   ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  x:      ['M6 6l12 12', 'M18 6 6 18'],
  receipt:['M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z', 'M9 8h6', 'M9 12h6'],
  layers: ['M12 3 2 8l10 5 10-5z', 'M2 13l10 5 10-5'],
  chart:  ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  food:   ['M4 3v8a3 3 0 0 0 6 0V3', 'M7 3v18', 'M17 3c-2 2-3 5-3 8h3v10'],
  car:    ['M3 16v-4l2-5h14l2 5v4z', 'M7 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M17 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  bag:    ['M5 8h14l-1 12H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  heart:  ['M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  // o protótipo só desenha o download; o envio é o mesmo traço espelhado
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
}

export default function ProtoIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }} aria-hidden="true" focusable="false">
      {(PATHS[name] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
