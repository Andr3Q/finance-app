const LEVELS = [
  { label: 'Muito fraca', color: '#ff4757' },
  { label: 'Fraca',       color: '#ff6b35' },
  { label: 'Média',       color: '#ffa502' },
  { label: 'Forte',       color: '#4ac46e' },
]

function score(pwd) {
  if (!pwd) return 0
  let s = 0
  if (pwd.length >= 8)           s++
  if (/[a-z]/.test(pwd))         s++
  if (/[A-Z]/.test(pwd))         s++
  if (/\d/.test(pwd))            s++
  if (/[^a-zA-Z0-9]/.test(pwd)) s++
  // clamp to 4 levels: 1-2 → 0, 3 → 1, 4 → 2, 5 → 3 (full PASSWORD_RE = level 2, +special = 3)
  if (s <= 2) return 1
  if (s === 3) return 2
  if (s === 4) return 3
  return 4
}

export default function PasswordStrength({ password }) {
  if (!password) return null

  const lvl   = score(password)
  const level = LEVELS[lvl - 1]

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {LEVELS.map((l, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 4,
            background: i < lvl ? level.color : 'var(--bd)',
            transition: 'background .2s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: level.color, marginTop: 4, fontWeight: 600 }}>
        {level.label}
      </div>
    </div>
  )
}
