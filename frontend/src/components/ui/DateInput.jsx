import { useState, useEffect } from 'react'

function isoToDisplay(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function displayToISO(str) {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

export default function DateInput({ value, onChange, className, placeholder }) {
  const [display, setDisplay] = useState(() => isoToDisplay(value))

  useEffect(() => { setDisplay(isoToDisplay(value)) }, [value])

  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let fmt = digits
    if (digits.length > 4) fmt = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    else if (digits.length > 2) fmt = digits.slice(0, 2) + '/' + digits.slice(2)
    setDisplay(fmt)
    onChange(displayToISO(fmt))
  }

  const handleClear = () => { setDisplay(''); onChange('') }

  return (
    <div className="date-inp-wrap">
      <input
        type="text"
        inputMode="numeric"
        className={className}
        placeholder={placeholder || 'DD/MM/AAAA'}
        value={display}
        onChange={handleChange}
        maxLength={10}
      />
      {display && (
        <button type="button" className="date-inp-clear" onClick={handleClear} tabIndex={-1} aria-label="Limpar data">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  )
}
