// Mock global do Prisma — substitui src/lib/prisma.js em todos os testes
const { mockDeep } = require('jest-mock-extended')

const prismaMock = mockDeep()

// Valores default seguros — evitam TypeError quando rota chama .then() sem mock explícito
function setDefaults() {
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.findFirst.mockResolvedValue(null)
  prismaMock.user.create.mockResolvedValue(null)
  prismaMock.user.update.mockResolvedValue(null)
  prismaMock.transaction.findMany.mockResolvedValue([])
  prismaMock.transaction.findFirst.mockResolvedValue(null)
  prismaMock.transaction.findUnique.mockResolvedValue(null)
  prismaMock.transaction.create.mockResolvedValue(null)
  prismaMock.transaction.update.mockResolvedValue(null)
  prismaMock.transaction.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.transaction.delete.mockResolvedValue(null)
  prismaMock.transaction.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.transaction.count.mockResolvedValue(0)
  prismaMock.budget.findMany.mockResolvedValue([])
  prismaMock.budget.findFirst.mockResolvedValue(null)
  prismaMock.budget.create.mockResolvedValue(null)
  prismaMock.budget.update.mockResolvedValue(null)
  prismaMock.budget.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.goal.findMany.mockResolvedValue([])
  prismaMock.goal.findFirst.mockResolvedValue(null)
  prismaMock.goal.findUnique.mockResolvedValue(null)
  prismaMock.goal.create.mockResolvedValue(null)
  prismaMock.goal.update.mockResolvedValue(null)
  prismaMock.goal.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.categoryLimit.findMany.mockResolvedValue([])
  prismaMock.loginAudit.create.mockResolvedValue({})
  prismaMock.loginAudit.findFirst.mockResolvedValue(null)
  prismaMock.loginAudit.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.accountUnlockToken.create.mockResolvedValue({})
  prismaMock.accountUnlockToken.findUnique.mockResolvedValue(null)
  prismaMock.accountUnlockToken.update.mockResolvedValue({})
  prismaMock.$transaction.mockImplementation((callbackOrArray) => {
    if (typeof callbackOrArray === 'function') return callbackOrArray(prismaMock)
    return Promise.resolve(callbackOrArray ?? [])
  })
}

// Reseta chamadas e restaura defaults antes de cada teste
beforeEach(() => {
  jest.clearAllMocks()
  setDefaults()
})

module.exports = prismaMock
module.exports.raw = prismaMock
