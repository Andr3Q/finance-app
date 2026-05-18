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
  if (!n && n !== 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CurrencyInput({ value, onChange, className, style, placeholder, autoFocus }) {
  const focused = useRef(false)
  const [display, setDisplay] = useState(() => toDisplay(value))

  useEffect(() => {
    if (!focused.current) setDisplay(toDisplay(value))
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
    } else if (!display) {
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
