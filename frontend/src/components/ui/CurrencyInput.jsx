import { useState, useRef, useEffect } from 'react'

function process(raw) {
  // Strip thousand dots, find decimal comma
  const noDots = raw.replace(/\./g, '')
  const commaPos = noDots.lastIndexOf(',')
  let intStr, decStr, hasComma

  if (commaPos !== -1) {
    intStr  = noDots.slice(0, commaPos).replace(/\D/g, '')
    decStr  = noDots.slice(commaPos + 1).replace(/\D/g, '').slice(0, 2)
    hasComma = true
  } else {
    intStr  = noDots.replace(/\D/g, '')
    decStr  = ''
    hasComma = false
  }

  intStr = intStr.replace(/^0+(?=\d)/, '') || ''

  const intFmt = intStr ? parseInt(intStr, 10).toLocaleString('pt-BR') : ''
  const display = hasComma ? (intFmt || '0') + ',' + decStr : intFmt
  const numStr  = (intStr || '0') + (hasComma ? '.' + decStr.padEnd(2, '0') : '')
  const value   = intStr || (hasComma && decStr) ? parseFloat(numStr) : ''

  return { display, value }
}

function toDisplay(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  // Zero some (aparece o placeholder "0,00"): com "0,00" escrito de verdade os dígitos digitados caíam nos centavos
  // e eram descartados, e o campo parecia travado. É o mesmo que o blur já faz com zero.
  if (!n) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// O que está escrito no campo, como número ("1.500,5" → 1500.5; vazio → 0).
const writtenAmount = (d) => {
  const n = parseFloat(String(d).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function CurrencyInput({ value, onChange, className, style, placeholder, autoFocus }) {
  const focused = useRef(false)
  const [display, setDisplay] = useState(() => toDisplay(value))

  useEffect(() => {
    // Com o campo em foco quem digita manda (um valor diferente vindo de fora não atropela a digitação) — com UMA exceção:
    // o valor de fora ficar vazio enquanto ainda há número escrito significa "o formulário foi limpo" (ex.: Enter para
    // salvar, com o foco ainda no campo). Antes o campo seguia mostrando o valor antigo e parecia que nada tinha sido salvo.
    const cleared = value === '' || value == null
    setDisplay(d => (!focused.current || (cleared && writtenAmount(d) !== 0) ? toDisplay(value) : d))
  }, [value])

  const handleChange = (e) => {
    const { display: d, value: v } = process(e.target.value)
    setDisplay(d)
    onChange(v)
  }

  const handleBlur = () => {
    focused.current = false
    const n = parseFloat(display.replace(/\./g, '').replace(',', '.'))
    if (n > 0) {
      setDisplay(n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      onChange(n)
    } else {
      // Descarta zero, negativo ou inválido — reseta o campo
      setDisplay('')
      onChange('')
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      style={style}
      placeholder={placeholder || '0,00'}
      value={display}
      onChange={handleChange}
      onFocus={() => { focused.current = true }}
      onBlur={handleBlur}
      autoFocus={autoFocus}
    />
  )
}
