-- emailVerifyToken: busca via findFirst por hash — sem índice = full scan na tabela User
-- Padrão idêntico ao resetToken que já tem @@index([resetToken]) desde a migration inicial
CREATE INDEX IF NOT EXISTS "User_emailVerifyToken_idx" ON "User"("emailVerifyToken");
