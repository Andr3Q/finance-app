import ProtoIcon from './ProtoIcon.jsx'
import { CategoryIcon } from '../ui/icons.jsx'

// Ícone de cada categoria nas tabelas do desktop: os do design (Alimentação, Transporte, Shopping, Saúde, Contas fixas e a entrada
// extra no lugar do "Freelance"); as categorias que o design não desenha (Lazer, Educação, Casa, Outros) mantêm o ícone do app.
const PROTO = { food: 'food', transport: 'car', shopping: 'bag', health: 'heart', fixed: 'receipt', income: 'zap' }

export default function ProtoCategoryIcon({ category, size = 18 }) {
  const name = PROTO[category]
  return name ? <ProtoIcon name={name} size={size} /> : <CategoryIcon category={category} size={size} color="currentColor" />
}
