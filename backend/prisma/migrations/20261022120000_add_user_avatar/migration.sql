-- Foto de perfil (tela "Dados pessoais", Nancy 2). A imagem (JPEG 256x256 em data URL, ~15-48 KB) fica numa
-- tabela própria, 1 linha por usuário, pra não pesar nas leituras da linha de "User" (dashboard, login...).
-- Em "User" entra só a data da última troca (coluna opcional, sem valor padrão: não reescreve a tabela).
ALTER TABLE "User" ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);

CREATE TABLE "UserAvatar" (
    "userId"    TEXT         NOT NULL,
    "image"     TEXT         NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAvatar" ENABLE ROW LEVEL SECURITY;
