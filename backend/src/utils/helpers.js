function nowBrasilia() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => parseInt(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year'), day: get('day') }
}

module.exports = { nowBrasilia }
