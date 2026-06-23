-- Proteção anti-replay do TOTP: armazena o último código usado e quando foi usado.
-- Um código TOTP válido por apenas 30s pode ser reutilizado dentro da janela de 90s
-- (speakeasy window: 1). Com esses campos, o servidor rejeita o mesmo código duas vezes.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastUsedTotpToken" TEXT,
  ADD COLUMN IF NOT EXISTS "lastUsedTotpAt"    TIMESTAMP(3);
