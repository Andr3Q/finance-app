const isProd = process.env.NODE_ENV === 'production'

const UUID_REGEX     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_COLOR      = /^#[0-9A-F]{6}$/i
const EMAIL_REGEX    = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const MAX_AMOUNT     = 999_999_999.99

const CATEGORY_LABELS = {
  food:       'Alimentação',
  shopping:   'Shopping',
  transport:  'Transporte',
  health:     'Saúde',
  leisure:    'Lazer',
  education:  'Educação',
  home:       'Casa',
  fixed:      'Conta Fixa',
  income:     'Entrada Extra',
  other:      'Outros',
}

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS)

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

module.exports = {
  isProd,
  UUID_REGEX,
  HEX_COLOR,
  EMAIL_REGEX,
  PASSWORD_REGEX,
  MAX_AMOUNT,
  CATEGORY_LABELS,
  VALID_CATEGORIES,
  MONTHS,
}
