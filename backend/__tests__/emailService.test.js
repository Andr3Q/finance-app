'use strict'

const mockSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

const { sendResetEmail } = require('../src/services/emailService')

// Regressão do incidente real: EMAIL_FROM apontando pro domínio de sandbox da
// Resend (onboarding@resend.dev) fazia a API rejeitar o envio pra qualquer
// destinatário que não fosse o dono da conta — mas o SDK da Resend não lança
// exceção nesse caso, só resolve com { data: null, error: {...} }. Sem checar
// esse campo, o app respondia "e-mail enviado" com sucesso mesmo o envio tendo
// sido rejeitado de ponta a ponta.
describe('emailService — propagação de erro da Resend', () => {
  beforeEach(() => mockSend.mockReset())

  test('Resend aceita o envio (error: null): resolve normalmente', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null })

    await expect(sendResetEmail('user@example.com', 'Usuário', 'https://app/reset?token=abc'))
      .resolves.toBeUndefined()
  })

  test('Resend rejeita o envio (error preenchido, sem lançar exceção): lança erro', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'You can only send testing emails to your own email address.' },
    })

    await expect(sendResetEmail('user@example.com', 'Usuário', 'https://app/reset?token=abc'))
      .rejects.toThrow(/testing emails to your own email address/)
  })
})
