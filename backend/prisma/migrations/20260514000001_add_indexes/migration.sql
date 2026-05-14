-- Adiciona indexes compostos para as queries mais frequentes do app.
-- IF NOT EXISTS garante idempotência caso o index já exista.

-- Transaction: cobre a query principal de listagem por mês/ano
CREATE INDEX IF NOT EXISTS "Transaction_userId_month_year_archived_idx"
  ON "Transaction"("userId", "month", "year", "archived");

-- Transaction: cobre as queries de aggregate por tipo (push notifications)
CREATE INDEX IF NOT EXISTS "Transaction_userId_type_month_year_idx"
  ON "Transaction"("userId", "type", "month", "year");

-- Budget: FK column sem index automático no PostgreSQL
CREATE INDEX IF NOT EXISTS "Budget_userId_idx"
  ON "Budget"("userId");

-- PushSubscription: FK column sem index automático no PostgreSQL
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");
