-- Detalhes do pagamento para a tela "Pagamentos" (Nancy 2): valor cobrado, forma (cartão / PIX) e final do
-- cartão. Colunas opcionais e sem valor padrão: os pagamentos antigos ficam sem esses dados (a tela mostra o
-- valor pelo preço de tabela do plano e omite forma/cartão), e os novos passam a guardar o que o Mercado Pago
-- devolve no webhook. Nada é reescrito.
ALTER TABLE "processed_payments" ADD COLUMN "amount"   DECIMAL(10,2);
ALTER TABLE "processed_payments" ADD COLUMN "method"   TEXT;
ALTER TABLE "processed_payments" ADD COLUMN "cardLast4" TEXT;
