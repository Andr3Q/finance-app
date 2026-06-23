-- Migração de backup codes HMAC-SHA256 → bcrypt
-- Os hashes HMAC existentes não podem ser convertidos para bcrypt sem os códigos originais.
-- Usuários com 2FA ativo precisarão regenerar seus códigos de recuperação.
DELETE FROM "two_factor_backup_codes";
