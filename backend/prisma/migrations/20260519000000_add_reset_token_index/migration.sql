-- Índice em resetToken: a rota /reset-password faz findFirst({where:{resetToken:hash}})
-- Sem índice isso é um full table scan em toda a tabela de usuários.
CREATE INDEX IF NOT EXISTS "User_resetToken_idx" ON "User"("resetToken");
