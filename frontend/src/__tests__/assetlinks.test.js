import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// /.well-known/assetlinks.json é o que o Android lê para confirmar que o app da Play e o site são do mesmo dono.
// Sem essa confirmação o app abre o site dentro de uma aba do Chrome, com barra de endereço (aconteceu em 2026-11-13).
//
// A Play NÃO entrega aos usuários o pacote que a gente envia: ela reassina o app com a chave dela (a "chave de
// assinatura do app"). Por isso o arquivo precisa ter DUAS impressões SHA-256:
//   - a da chave de assinatura da Play (a que vale para quem instala pela loja);
//   - a da chave de upload (a do nosso keystore; vale para builds assinados por nós, como instalação direta).
// Se um build novo mudar a assinatura, a impressão nova precisa entrar aqui ANTES de a Play liberar o app.
const PLAY_SIGNING = '23:4F:71:15:D2:36:DE:D1:E4:1B:86:58:F3:E3:55:1A:D7:C5:F8:25:5B:AA:2D:50:0D:F5:18:75:57:20:11:AA'
const UPLOAD = '10:3B:6A:66:61:B3:3D:E0:B4:39:44:A9:E9:D0:4C:EC:BE:73:C5:F0:4E:9B:92:37:8E:D1:54:EF:62:FF:1A:57'

const lerJson = (...partes) => JSON.parse(readFileSync(resolve(process.cwd(), ...partes), 'utf8'))
const links = lerJson('public', '.well-known', 'assetlinks.json')
const alvo = links[0]?.target

describe('assetlinks.json (confirmação app Android <-> site)', () => {
  test('uma declaração, com a permissão de abrir os links do site', () => {
    expect(Array.isArray(links)).toBe(true)
    expect(links).toHaveLength(1)
    expect(links[0].relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(alvo.namespace).toBe('android_app')
  })

  test('o pacote é o mesmo do app (nancy-twa/twa-manifest.json)', () => {
    const app = lerJson('..', 'nancy-twa', 'twa-manifest.json')
    expect(alvo.package_name).toBe(app.packageId)
    expect(alvo.package_name).toBe('br.com.myfinancepro.app')
  })

  test('tem a assinatura da Play (quem instala pela loja) e a de upload', () => {
    expect(alvo.sha256_cert_fingerprints).toContain(PLAY_SIGNING)
    expect(alvo.sha256_cert_fingerprints).toContain(UPLOAD)
  })

  test('toda impressão é SHA-256 bem formada (32 pares hexadecimais em maiúsculas) e sem repetição', () => {
    const lista = alvo.sha256_cert_fingerprints
    for (const f of lista) expect(f).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    expect(new Set(lista).size).toBe(lista.length)
  })
})
