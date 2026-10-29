// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Nancy IA (chat) — celular. Rodada de QA N2-7: a IA apagava/alterava sem perguntar, mostrava markdown cru e o texto
// "internal" do servidor, e o aviso do microfone ficava preso na tela. A API é simulada: o que se testa é o que o
// usuário vê e toca no navegador.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const ELITE = { ...TEST_USER, plan: 'elite' }
const tx = (id, category, amount) => ({ id, type: 'expense', category, amount, description: category, date: '2026-10-10T15:00:00Z', month: 10, year: 2026 })
const DASH = {
  summary: { salary: 5000, totalIncome: 1500, totalExpenses: 7300, unpaidBudgetIds: [] },
  transactions: [tx(1, 'fixed', 5080), tx(2, 'food', 1165), tx(3, 'transport', 575), tx(4, 'shopping', 350), tx(5, 'health', 130)],
  limits: [], budgets: [],
}

// replies: o que /api/agent/chat devolve, em ordem (objeto = 200; { status, body } = erro). A 1ª sai sozinha: o chat
// abre pelo cartão da Análise, que já envia a pergunta.
async function setup(page, { replies = [], confirm = { message: 'Pronto.', dataChanged: true } } = {}) {
  const calls = { chat: [], confirm: [] }
  await injectSession(page, ELITE)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(ELITE)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.route('**/api/agent/chat**', r => {
    calls.chat.push(JSON.parse(r.request().postData() || '{}'))
    const next = replies.shift() || { reply: 'ok' }
    r.fulfill(next.status ? json(next.body, next.status) : json(next))
  })
  await page.route('**/api/agent/confirm**', r => {
    calls.confirm.push(JSON.parse(r.request().postData() || '{}'))
    r.fulfill(confirm.status ? json(confirm.body, confirm.status) : json(confirm))
  })
  await page.goto('/analise')
  await page.getByRole('button', { name: /quer que a nancy sugira onde cortar/i }).click()
  await expect(page.getByRole('dialog', { name: 'Nancy IA' })).toBeVisible()
  return calls
}

const PENDING = {
  reply: 'Excluir “Netflix” de R$ 55,90 em 03/10/2026?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.',
  pendingAction: { token: 'tok-abc', kind: 'delete', summary: 'Excluir “Netflix” de R$ 55,90 em 03/10/2026' },
  dataChanged: false,
}

test.describe('Nancy IA — resposta formatada', () => {
  test('negrito, lista e tabela aparecem formatados e cabem na tela do celular', async ({ page }) => {
    await setup(page, { replies: [{ reply: '**Resumo dos gastos em outubro**\n\n| Categoria | Valor total (R$) | % do total | Observação longa |\n|---|---|---|---|\n| Casa | R$ 3.500,00 | 45% | maior gasto do mês |\n| Alimentação | R$ 1.200,00 | 15% | abaixo da média |\n\n- **Saldo:** R$ 8.822,20\n- Metas em dia' }] })
    const panel = page.getByRole('dialog', { name: 'Nancy IA' })

    await expect(panel.locator('strong', { hasText: 'Resumo dos gastos em outubro' })).toBeVisible()
    await expect(panel.getByRole('table')).toBeVisible()
    await expect(panel.getByRole('columnheader')).toHaveText(['Categoria', 'Valor total (R$)', '% do total', 'Observação longa'])
    await expect(panel.getByRole('listitem')).toHaveText(['Saldo: R$ 8.822,20', 'Metas em dia'])
    const text = await panel.innerText()
    expect(text).not.toContain('**')
    expect(text).not.toContain('|---')
    expect(text).not.toContain('| Categoria')

    const m = await page.evaluate(() => {
      const bubble = [...document.querySelectorAll('.nia-bubble')].find(b => b.querySelector('table')).getBoundingClientRect()
      const wrap = document.querySelector('.nia-table-wrap').getBoundingClientRect()
      return { pageOverflow: document.documentElement.scrollWidth - window.innerWidth, wrapRight: wrap.right, bubbleRight: bubble.right, panelRight: document.querySelector('.nia-panel').getBoundingClientRect().right }
    })
    expect(m.pageOverflow).toBeLessThanOrEqual(0)            // a tabela larga rola dentro do balão, não a página
    expect(m.wrapRight).toBeLessThanOrEqual(m.bubbleRight + 1)
    expect(m.bubbleRight).toBeLessThanOrEqual(m.panelRight)
  })
})

test.describe('Nancy IA — excluir e editar só depois do Confirmar', () => {
  test('a IA prepara a exclusão: botões Confirmar/Cancelar grandes e nada executado até o toque', async ({ page }) => {
    const calls = await setup(page, { replies: [PENDING] })

    await expect(page.getByText(/Ainda não fiz nada/)).toBeVisible()
    const yes = page.getByRole('button', { name: 'Confirmar' })
    const no  = page.getByRole('button', { name: 'Cancelar' })
    await expect(yes).toBeVisible()
    await expect(no).toBeVisible()
    for (const b of [yes, no]) {
      const box = await b.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(40)   // alvo de toque confortável
      expect(box.x + box.width).toBeLessThanOrEqual(393)
    }
    expect(calls.confirm).toHaveLength(0)
  })

  test('Confirmar executa uma vez com o token da ação e mostra o resultado', async ({ page }) => {
    const calls = await setup(page, { replies: [PENDING], confirm: { message: 'Pronto, excluí a transação “Netflix” de R$ 55,90 em 03/10/2026.', dataChanged: true } })
    await page.getByRole('button', { name: 'Confirmar' }).click()

    await expect(page.getByText(/Pronto, excluí a transação/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancelar' })).toHaveCount(0)
    expect(calls.confirm).toEqual([{ token: 'tok-abc' }])
  })

  test('Cancelar desiste: o servidor nem é chamado', async ({ page }) => {
    const calls = await setup(page, { replies: [PENDING] })
    await page.getByRole('button', { name: 'Cancelar' }).click()

    await expect(page.getByText('Tudo bem, não mexi em nada.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
    expect(calls.confirm).toHaveLength(0)
  })

  test('confirmação expirada: mostra o motivo em português e fecha os botões', async ({ page }) => {
    await setup(page, { replies: [PENDING], confirm: { status: 400, body: { error: 'Essa confirmação expirou. Peça de novo à Nancy.', expired: true } } })
    await page.getByRole('button', { name: 'Confirmar' }).click()

    await expect(page.getByText('Essa confirmação expirou. Peça de novo à Nancy.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0)
  })
})

test.describe('Nancy IA — erros e aviso do microfone', () => {
  test('erro do servidor aparece em português (nunca "internal") e dá para tentar de novo', async ({ page }) => {
    const calls = await setup(page, { replies: [{ status: 500, body: { error: 'internal' } }, { reply: 'Agora foi.' }] })

    await expect(page.getByText('Não consegui falar com a Nancy agora. Tente de novo em instantes.')).toBeVisible()
    await expect(page.getByText('internal', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Tentar de novo' }).click()

    await expect(page.getByText('Agora foi.')).toBeVisible()
    await expect(page.getByText('Não consegui falar com a Nancy agora.')).toHaveCount(0)
    expect(calls.chat).toHaveLength(2)
    expect(calls.chat[1].message).toBe(calls.chat[0].message)
    expect(calls.chat[1].history).toEqual([]) // a pergunta que falhou não vai duplicada para a IA
  })

  test('o aviso de microfone bloqueado tem como fechar e não volta ao reabrir o chat', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    })
    await setup(page, { replies: [{ reply: 'Comece cortando delivery.' }] })
    const panel = page.getByRole('dialog', { name: 'Nancy IA' })

    await panel.getByRole('button', { name: 'Falar mensagem' }).click()
    const banner = panel.getByText(/Permissão de microfone negada/)
    await expect(banner).toBeVisible()
    await panel.getByRole('button', { name: 'Fechar aviso' }).click()
    await expect(banner).toHaveCount(0)

    // depois da recusa o botão do microfone passa a se chamar "Microfone bloqueado…" e o aviso volta ao tocar nele
    await panel.getByRole('button', { name: /Microfone bloqueado/ }).click()
    await expect(panel.getByText(/^Microfone bloqueado\./)).toBeVisible()
    await panel.getByRole('button', { name: 'Fechar chat' }).click()
    await page.getByRole('button', { name: /quer que a nancy sugira onde cortar/i }).click()
    await expect(page.getByRole('dialog', { name: 'Nancy IA' })).toBeVisible()
    await expect(page.getByText(/Microfone bloqueado|Permissão de microfone negada/)).toHaveCount(0)
  })
})
