'use strict'
// Stub global do mercadopago — evita que Jest CommonJS tente resolver
// uuid@13.x (ESM puro) que é dependência transitiva do pacote mercadopago.
// moduleNameMapper em package.json aponta todos os requires de 'mercadopago'
// para este arquivo antes que o loader tente carregar o módulo real.
module.exports = {
  MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
  Preference:        jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({ init_point: 'https://mp.test/checkout' }),
  })),
  Payment: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue({
      status: 'approved',
      external_reference: null,
    }),
  })),
}
