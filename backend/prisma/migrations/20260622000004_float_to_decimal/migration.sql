-- Float → Decimal(19,4) para todos os campos monetários.
-- DOUBLE PRECISION é convertido para NUMERIC implicitamente pelo PostgreSQL.
ALTER TABLE "User"           ALTER COLUMN "salary"        TYPE DECIMAL(19,4);
ALTER TABLE "Transaction"    ALTER COLUMN "amount"        TYPE DECIMAL(19,4);
ALTER TABLE "Budget"         ALTER COLUMN "amount"        TYPE DECIMAL(19,4);
ALTER TABLE "Goal"           ALTER COLUMN "targetAmount"  TYPE DECIMAL(19,4);
ALTER TABLE "Goal"           ALTER COLUMN "currentAmount" TYPE DECIMAL(19,4);
ALTER TABLE "CategoryLimit"  ALTER COLUMN "amount"        TYPE DECIMAL(19,4);
ALTER TABLE "InstallmentPlan" ALTER COLUMN "amount"       TYPE DECIMAL(19,4);
