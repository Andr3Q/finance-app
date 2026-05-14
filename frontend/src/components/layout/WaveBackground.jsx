import { useEffect, useRef } from 'react'

/*
 * Canvas wave background — três camadas de ondas, cada uma é a soma
 * de três senóides com frequências e velocidades irracionais entre si.
 * Com 9 componentes no total, o padrão demora décadas para se repetir
 * visivelmente — parece água de verdade, sem loop perceptível.
 *
 * Cada frame: O(n/4) iterações (passo=4px) × 3 layers × 3 sin() = ~9 sin/px.
 * requestAnimationFrame garante 60fps sem bloquear a UI thread.
 */

const LAYERS = [
  {
    waves: [
      { amp: 22, freq: 0.00550, speed:  0.500 },
      { amp: 11, freq: 0.01382, speed: -0.271 },
      { amp:  6, freq: 0.02473, speed:  0.743 },
    ],
    rgb:   '0,255,204',   // teal aurora
    alpha:  0.22,
    baseY:  0.44,         // baseline como fração da altura do canvas
  },
  {
    waves: [
      { amp: 16, freq: 0.00718, speed: -0.432 },
      { amp:  9, freq: 0.01731, speed:  0.613 },
      { amp:  4, freq: 0.03124, speed: -0.881 },
    ],
    rgb:   '123,47,255',  // purple aurora
    alpha:  0.14,
    baseY:  0.58,
  },
  {
    waves: [
      { amp: 12, freq: 0.00913, speed:  0.661 },
      { amp:  7, freq: 0.02041, speed: -0.512 },
      { amp:  3, freq: 0.03817, speed:  1.093 },
    ],
    rgb:   '0,180,216',   // blue aurora
    alpha:  0.11,
    baseY:  0.70,
  },
]

const H_CSS = 220  // altura em CSS pixels

export default function WaveBackground() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    let t = 0

    function setup() {
      const dpr = window.devicePixelRatio || 1
      canvas.width  = window.innerWidth * dpr
      canvas.height = H_CSS * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function frame() {
      const W = window.innerWidth

      ctx.clearRect(0, 0, W, H_CSS)

      // Desenha do fundo para a frente (layer 2 → 1 → 0)
      for (let li = LAYERS.length - 1; li >= 0; li--) {
        const { waves, rgb, alpha, baseY } = LAYERS[li]
        const base = H_CSS * baseY

        ctx.beginPath()
        for (let x = 0; x <= W; x += 4) {
          let y = base
          for (const w of waves) y += w.amp * Math.sin(x * w.freq + t * w.speed)
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.lineTo(W, H_CSS)
        ctx.lineTo(0, H_CSS)
        ctx.closePath()

        // Gradiente vertical: transparente no topo da onda → cor → quase-transparente no rodapé
        const topY = base - 50
        const g = ctx.createLinearGradient(0, topY, 0, H_CSS)
        g.addColorStop(0,    `rgba(${rgb},0)`)
        g.addColorStop(0.28, `rgba(${rgb},${alpha})`)
        g.addColorStop(1,    `rgba(${rgb},${+(alpha * 0.30).toFixed(3)})`)
        ctx.fillStyle = g
        ctx.fill()
      }

      t += 0.012
      raf = requestAnimationFrame(frame)
    }

    setup()
    window.addEventListener('resize', setup)
    frame()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', setup)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        height: H_CSS + 'px',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
