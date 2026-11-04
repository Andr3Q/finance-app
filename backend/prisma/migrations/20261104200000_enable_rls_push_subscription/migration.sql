-- PushSubscription (endpoint + chaves p256dh/auth das notificações push) ficou de fora do RLS no baseline: as outras 11 tabelas do app já têm.
-- O Supabase expõe o schema "public" pela Data API; sem RLS, quem tivesse a chave pública do projeto poderia ler e gravar estas linhas.
-- O backend conecta como dono da tabela, que não é afetado pelo RLS (igual às demais tabelas, sem policies), então o app segue igual.
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
