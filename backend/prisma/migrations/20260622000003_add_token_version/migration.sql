-- tokenVersion: permite invalidar todos os JWTs de um usuário após reset de senha.
-- DEFAULT 0 garante que registros existentes recebam o valor inicial sem downtime.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
