const LEVELS = [
  { label: 'Muito fraca', color: '#ff4757' },
  { label: 'Fraca',       color: '#ff6b35' },
  { label: 'Média',       color: '#ffa502' },
  { label: 'Forte',       color: '#4ae2ac' },
]

// O backend (PASSWORD_REGEX, backend/src/utils/constants.js) só exige
// comprimento 8+, minúscula, maiúscula e número — caractere especial é só
// bônus opcional, nunca exigido. A versão antiga somava os 5 critérios sem
// distinguir QUAIS batiam, então uma senha faltando maiúscula mas com
// caractere especial (ex: "abcdefg1!") pontuava igual a uma que realmente
// atende o mínimo do backend (ex: "Password1") — e essa última, que o
// servidor JÁ aceita, aparecia como "Média" em vez de "Forte", passando a
// falsa impressão de que precisava de mais quando já seria aceita como está.
function score(pwd) {
  if (!pwd) return 0
  const hasLen     = pwd.length >= 8
  const hasLower   = /[a-z]/.test(pwd)
  const hasUpper   = /[A-Z]/.test(pwd)
  const hasDigit   = /\d/.test(pwd)
  const basicCount = [hasLen, hasLower, hasUpper, hasDigit].filter(Boolean).length

  // Todos os 4 critérios exigidos pelo backend presentes = senha já seria
  // aceita — "Forte", com ou sem o bônus de caractere especial.
  if (basicCount === 4) return 4
  if (basicCount === 3) return 3
  if (basicCount === 2) return 2
  return 1
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
