-- Liga uma transação à conta fixa (Budget) que ela quita, quando aplicável.
-- NULL = transação avulsa, sem relação com nenhuma conta fixa. Sem esse
-- vínculo, "/transactions/auto-launch" não tinha como saber que uma conta já
-- tinha sido paga individualmente (ex: via chat de IA) e criava uma segunda
-- transação duplicada pra mesma conta fixa no mesmo mês.
ALTER TABLE "Transaction" ADD COLUMN "budgetId" TEXT;

-- Único (não apenas índice): garante no banco que uma conta fixa nunca é paga
-- 2x no mesmo mês, mesmo sob corrida de 2 requests simultâneos. NULLs não
-- colidem entre si no Postgres — transações avulsas (budgetId null)
-- continuam sem nenhuma restrição.
CREATE UNIQUE INDEX "Transaction_budgetId_month_year_key" ON "Transaction"("budgetId", "month", "year");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
