'use strict'
const request = require('supertest')
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/pushService', () => ({ sendPushToUser: jest.fn().mockResolvedValue(true) }))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(), sendPasswordChangedAlert: fn(),
    sendNewIpLoginAlert: fn(), sendAccountUnlockEmail: fn(),
    sendEmailChangeVerification: fn(), sendEmailChangeAlert: fn(),
  }
})

const prisma = require('./__mocks__/prisma')
const { clientIpMiddleware } = require('../src/middleware/clientIp')
const { keyGenerator }       = require('../src/middleware/rateLimiter')
const app                    = require('../src/server')

// O site passa por um Worker do Cloudflare cujo IP de saída muda a cada requisição (req.ip não é o do visitante). O Worker
// manda o IP real + um segredo; o app só confia nele com o segredo certo. Estes testes travam essa regra.
const SECRET = 'segredo-de-teste-com-32-caracteres!!'
const run = (headers, ip = '10.0.0.9') => { const req = { headers, ip }; clientIpMiddleware(req, {}, () => {}); return req.clientIp }

describe('clientIpMiddleware', () => {
  beforeEach(() => { process.env.EDGE_SECRET = SECRET })
  afterAll(() => { delete process.env.EDGE_SECRET })

  it('com o segredo certo usa o IP real enviado pelo Worker (IPv4, IPv6 e com espaços em volta)', () => {
    expect(run({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': '203.0.113.7' })).toBe('203.0.113.7')
    expect(run({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': '2001:db8::1' })).toBe('2001:db8::1')
    expect(run({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': '  198.51.100.4 ' })).toBe('198.51.100.4')
  })

  it('segredo errado, ausente ou de outro tamanho NÃO é confiável: vale req.ip (e não lança erro)', () => {
    expect(run({ 'x-nancy-edge': 'errado', 'x-nancy-client-ip': '203.0.113.7' })).toBe('10.0.0.9')
    expect(run({ 'x-nancy-edge': SECRET + 'x', 'x-nancy-client-ip': '203.0.113.7' })).toBe('10.0.0.9')
    expect(run({ 'x-nancy-client-ip': '203.0.113.7' })).toBe('10.0.0.9')
  })

  it('sem EDGE_SECRET configurado os cabeçalhos são ignorados (o comportamento de antes)', () => {
    delete process.env.EDGE_SECRET
    expect(run({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': '203.0.113.7' })).toBe('10.0.0.9')
    expect(run({ 'x-nancy-edge': '', 'x-nancy-client-ip': '203.0.113.7' })).toBe('10.0.0.9')
  })

  it('IP inválido (texto, lista de IPs, vazio) é recusado mesmo com o segredo certo', () => {
    for (const bad of ['abc', '1.2.3.4, 5.6.7.8', '', '999.1.1.1', '<script>']) {
      expect(run({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': bad })).toBe('10.0.0.9')
    }
  })
})

describe('chave do limitador de requisições', () => {
  it('usa o usuário logado, senão o IP real, senão req.ip', () => {
    expect(keyGenerator({ userId: 'u1', clientIp: '203.0.113.7', ip: '10.0.0.9' })).toBe('u1')
    expect(keyGenerator({ clientIp: '203.0.113.7', ip: '10.0.0.9' })).toBe('203.0.113.7')
    expect(keyGenerator({ ip: '10.0.0.9' })).toBe('10.0.0.9')
  })
})

describe('IP gravado na auditoria de login (usado no alerta de "novo acesso")', () => {
  beforeEach(() => {
    process.env.EDGE_SECRET = SECRET
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.loginAudit.create.mockClear()
    prisma.loginAudit.create.mockResolvedValue({})
  })
  afterAll(() => { delete process.env.EDGE_SECRET })
  const auditedIp = () => prisma.loginAudit.create.mock.calls[0][0].data.ip
  const login = (headers = {}) => request(app).post('/api/auth/login').set(headers).send({ email: 'x@example.com', password: 'Qualquer123' })

  it('grava o IP real quando o pedido vem do Worker com o segredo certo', async () => {
    await login({ 'x-nancy-edge': SECRET, 'x-nancy-client-ip': '203.0.113.7' })
    expect(auditedIp()).toBe('203.0.113.7')
  })

  it('um cliente que forja o cabeçalho SEM o segredo não consegue escolher o IP gravado', async () => {
    await login({ 'x-nancy-client-ip': '203.0.113.7' })
    expect(auditedIp()).not.toBe('203.0.113.7')
    await login({ 'x-nancy-edge': 'chute', 'x-nancy-client-ip': '203.0.113.7' })
    expect(prisma.loginAudit.create.mock.calls[1][0].data.ip).not.toBe('203.0.113.7')
  })
})
