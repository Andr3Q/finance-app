import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// O app Android (nancy-twa) precisa trazer a cobrança do Google Play para a venda de planos dentro do app funcionar (Digital Goods API).
// É exatamente o que o Bubblewrap gera com features.playBilling.enabled (biblioteca de cobrança, atividade e serviço de pagamento no
// manifesto, e o tratador no DelegationService). Se alguém regenerar o projeto sem isso, o app volta a abrir sem aparelho de cobrança e a
// tela de planos some em silêncio. Estes testes leem os arquivos do projeto Android e travam essa configuração.
const lerTexto = (...partes) => readFileSync(resolve(process.cwd(), '..', 'nancy-twa', ...partes), 'utf8')
const twa = JSON.parse(lerTexto('twa-manifest.json'))
const gradle = lerTexto('app', 'build.gradle')
const manifesto = lerTexto('app', 'src', 'main', 'AndroidManifest.xml')
const delegacao = lerTexto('app', 'src', 'main', 'java', 'br', 'com', 'myfinancepro', 'app', 'DelegationService.java')

// o bloco <tag ...>...</tag> que contém o nome dado
function bloco(xml, tag, nome) {
  const re = new RegExp(`<${tag}\\b[^>]*android:name="${nome}"[\\s\\S]*?</${tag}>`)
  const m = xml.match(re)
  return m ? m[0] : ''
}

describe('app Android — cobrança pela Google Play', () => {
  test('twa-manifest.json liga features.playBilling', () => {
    expect(twa.features?.playBilling?.enabled).toBe(true)
  })

  test('o build traz a biblioteca de cobrança do android-browser-helper (e continua com a do navegador)', () => {
    expect(gradle).toMatch(/implementation 'com\.google\.androidbrowserhelper:billing:\d+\.\d+\.\d+'/)
    expect(gradle).toMatch(/implementation 'com\.google\.androidbrowserhelper:androidbrowserhelper:\d+\.\d+\.\d+'/)
    // a Play não aceita mais atualização com Play Billing Library antiga (billing 1.2.0 usa a 8.3.0)
    const versao = gradle.match(/androidbrowserhelper:billing:(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number)
    expect(versao[0] * 1000 + versao[1]).toBeGreaterThanOrEqual(1002)
  })

  test('o manifesto declara a atividade de pagamento (PAY) com o método do Google Play, exportada', () => {
    const atividade = bloco(manifesto, 'activity', 'com.google.androidbrowserhelper.playbilling.provider.PaymentActivity')
    expect(atividade).not.toBe('')
    expect(atividade).toContain('android:exported="true"')
    expect(atividade).toContain('<action android:name="org.chromium.intent.action.PAY" />')
    expect(atividade).toContain('android:name="org.chromium.default_payment_method_name"')
    expect(atividade).toContain('android:value="https://play.google.com/billing"')
  })

  test('o manifesto declara o serviço que o Chrome consulta (IS_READY_TO_PAY), exportado', () => {
    const servico = bloco(manifesto, 'service', 'com.google.androidbrowserhelper.playbilling.provider.PaymentService')
    expect(servico).not.toBe('')
    expect(servico).toContain('android:exported="true"')
    expect(servico).toContain('<action android:name="org.chromium.intent.action.IS_READY_TO_PAY" />')
  })

  test('o DelegationService registra o tratador de bens digitais e está exportado (a documentação exige exported=true)', () => {
    expect(delegacao).toContain('import com.google.androidbrowserhelper.playbilling.digitalgoods.DigitalGoodsRequestHandler;')
    expect(delegacao).toContain('registerExtraCommandHandler(new DigitalGoodsRequestHandler(getApplicationContext()));')
    const servico = bloco(manifesto, 'service', '.DelegationService')
    expect(servico).toContain('android:exported="@bool/enableNotification"')
    expect(twa.enableNotifications).toBe(true) // @bool/enableNotification vira true: o serviço fica exportado
  })

  test('o pacote segue sendo o do app da Play e com SDK mínimo 24 (exigência da Proteção Automática)', () => {
    expect(twa.packageId).toBe('br.com.myfinancepro.app')
    expect(twa.minSdkVersion).toBeGreaterThanOrEqual(24)
    expect(gradle).toMatch(/minSdkVersion 24/)
  })
})
