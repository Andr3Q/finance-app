import { isAndroidApp } from './androidApp.js'
import { getPlayBilling } from '../services/playBilling.js'

// "Esconder preço, convite e botão de compra?" Só no app Android da Play Store E enquanto a cobrança do Google não estiver pronta.
//  - site comum: nunca esconde (vende pelo Mercado Pago);
//  - app Android sem cobrança pronta (desligada no servidor, aparelho sem a API, produtos faltando): esconde tudo (política de pagamentos
//    do Google: o app não pode vender por fora da Play);
//  - app Android com a cobrança do Google pronta: mostra, e o "Ver planos" leva à tela de planos do app (PlanosPlay).
// Lê o estado no momento da chamada; quem precisa re-renderizar quando ele muda usa usePlayBilling() (o App já assina).
export function hidePurchaseUI() {
  return isAndroidApp() && getPlayBilling().status !== 'ready'
}
