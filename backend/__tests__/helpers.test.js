'use strict'
const { parseDateInput, partsBrasilia } = require('../src/utils/helpers')

describe('parseDateInput', () => {
  test('"YYYY-MM-DD" vira meia-noite de Brasília (03:00 UTC), não meia-noite UTC', () => {
    expect(parseDateInput('2026-09-25').toISOString()).toBe('2026-09-25T03:00:00.000Z')
  })

  test('dia 1º do mês fica no mês certo em Brasília', () => {
    const d = parseDateInput('2026-09-01')
    expect(partsBrasilia(d)).toEqual({ day: 1, month: 9, year: 2026 })
  })

  test('ISO com hora é um instante real e passa inalterado', () => {
    expect(parseDateInput('2026-09-17T22:13:33.000Z').toISOString()).toBe('2026-09-17T22:13:33.000Z')
  })

  test('rejeita dia inexistente e lixo', () => {
    expect(parseDateInput('2026-02-31')).toBeNull()
    expect(parseDateInput('2026-13-01')).toBeNull()
    expect(parseDateInput('not-a-date')).toBeNull()
    expect(parseDateInput(20260925)).toBeNull()
    expect(parseDateInput(undefined)).toBeNull()
  })
})

describe('partsBrasilia', () => {
  test('instante de madrugada UTC ainda é o dia anterior em Brasília', () => {
    expect(partsBrasilia(new Date('2026-10-01T01:30:00.000Z'))).toEqual({ day: 30, month: 9, year: 2026 })
  })
})
