// Preferências de notificação (tela "Preferências", Nancy 2). Ficam na conta (servidor), então valem em
// todos os aparelhos e também mandam nos avisos que o servidor dispara (push de conta que vence e de limite,
// resumo semanal por e-mail). Aqui só o que o app precisa saber: o nome do campo de cada interruptor, o valor
// padrão (campo ausente = padrão) e a leitura que o feed de avisos usa.
export const PREF_KEYS = {
  salary:  'notifSalary',
  bills:   'notifBudgetReminder',
  limits:  'notifBudgetAlert',
  stories: 'notifStories',
  tips:    'notifTips',
  email:   'notifWeeklyEmail',
}

export const PREF_DEFAULTS = {
  notifSalary: true, notifBudgetReminder: true, notifBudgetAlert: true, notifStories: true, notifTips: true,
  notifWeeklyEmail: false,
}

export const prefValue = (user, key) => (typeof user?.[key] === 'boolean' ? user[key] : PREF_DEFAULTS[key])

/** { salary, bills, limits, stories, tips, email } — o que cada aviso do feed precisa perguntar. */
export function prefsOf(user) {
  const out = {}
  for (const [name, key] of Object.entries(PREF_KEYS)) out[name] = prefValue(user, key)
  return out
}
