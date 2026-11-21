-- PULSO: corrigir a expressão de validação do número WhatsApp para E.164.
-- A migração inicial foi aplicada antes da publicação da funcionalidade; a tabela está vazia.
-- A classe [+] evita ambiguidades de escaping entre camadas SQL/JSON.

alter table public.whatsapp_alert_subscriptions
  drop constraint if exists whatsapp_alert_number_e164;

alter table public.whatsapp_alert_subscriptions
  add constraint whatsapp_alert_number_e164
  check (whatsapp_number ~ '^[+][1-9][0-9]{7,14}$');
