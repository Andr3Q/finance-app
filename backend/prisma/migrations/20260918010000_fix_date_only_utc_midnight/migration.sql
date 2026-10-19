-- Datas sem hora ("YYYY-MM-DD", de input[type=date]) eram gravadas via
-- `new Date(str)` = meia-noite UTC, que em Brasília ainda é 21h do dia
-- ANTERIOR — toda a interface mostrava essas datas 1 dia atrasadas.
-- Move essas linhas (e só elas: hora exatamente 00:00:00 UTC) pra meia-noite
-- de Brasília (03:00 UTC), mesmo instante que parseDateInput() passa a gravar.
-- Transações criadas "agora" têm hora real e não são tocadas.
UPDATE "Transaction" SET "date"     = "date"     + interval '3 hours' WHERE "date"::time = '00:00:00';
UPDATE "Goal"        SET "deadline" = "deadline" + interval '3 hours' WHERE "deadline" IS NOT NULL AND "deadline"::time = '00:00:00';
UPDATE "Budget"      SET "endDate"  = "endDate"  + interval '3 hours' WHERE "endDate"  IS NOT NULL AND "endDate"::time  = '00:00:00';
