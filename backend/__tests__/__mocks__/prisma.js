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
  prismaMock.transaction.create.mockResolvedValue(null)
  prismaMock.transaction.update.mockResolvedValue(null)
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
  prismaMock.$transaction.mockResolvedValue([])
}

// Reseta chamadas e restaura defaults antes de cada teste
beforeEach(() => {
  jest.clearAllMocks()
  setDefaults()
})

module.exports = prismaMock
module.exports.raw = prismaMock
