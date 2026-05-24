ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyExpiry" TIMESTAMP(3);
-- Usuários existentes já confirmados por estar no sistema antes desta feature
UPDATE "User" SET "emailVerified" = true WHERE "createdAt" < NOW();
