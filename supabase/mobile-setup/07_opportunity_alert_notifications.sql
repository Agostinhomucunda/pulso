-- BLOCO 07 — ALERTAS AUTOMÁTICOS DE OPORTUNIDADES
-- Executar depois dos blocos 01–06 (ou da migração inicial equivalente).
-- Seguro para voltar a executar; não cria oportunidades fictícias.

create or replace function public.notify_pulso_matching_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  opportunity_text text;
begin
  if new.status <> 'published' or new.verification_status <> 'verified' then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.status = 'published'
    and old.verification_status = 'verified' then
    return new;
  end if;

  opportunity_text := pg_catalog.lower(pg_catalog.concat_ws(
    ' ', new.title, new.description, new.sector, new.province,
    new.municipality, new.requirements, new.source_name
  ));

  insert into public.notifications (user_id, title, message, opportunity_id)
  select distinct
    alert.user_id,
    'Nova oportunidade verificada: ' || new.title,
    pg_catalog.concat_ws(
      ' · ',
      case new.category
        when 'employment' then 'Emprego'
        when 'scholarship' then 'Bolsa'
        when 'public_competition' then 'Concurso'
        when 'internship' then 'Estágio'
        when 'training' then 'Formação'
        when 'recruitment_program' then 'Programa'
        else 'Oportunidade'
      end,
      case when new.province is not null then 'Província: ' || new.province end,
      case when new.municipality is not null then 'Município: ' || new.municipality end,
      case when new.source_name is not null then 'Fonte: ' || new.source_name end
    ),
    new.id
  from public.user_alerts as alert
  where alert.active
    and (pg_catalog.cardinality(alert.categories) = 0 or new.category = any (alert.categories))
    and (
      pg_catalog.cardinality(alert.provinces) = 0
      or exists (
        select 1 from pg_catalog.unnest(alert.provinces) as province_filter(value)
        where pg_catalog.lower(pg_catalog.btrim(province_filter.value))
          = pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(new.province, '')))
      )
    )
    and (
      pg_catalog.cardinality(alert.keywords) = 0
      or exists (
        select 1 from pg_catalog.unnest(alert.keywords) as keyword_filter(value)
        where pg_catalog.btrim(keyword_filter.value) <> ''
          and opportunity_text like '%' || pg_catalog.lower(pg_catalog.btrim(keyword_filter.value)) || '%'
      )
    )
    and not exists (
      select 1 from public.notifications as existing
      where existing.user_id = alert.user_id and existing.opportunity_id = new.id
    );

  return new;
end;
$function$;

revoke all on function public.notify_pulso_matching_alerts() from public, anon, authenticated;

drop trigger if exists on_pulso_opportunity_alert_match on public.opportunities;
create trigger on_pulso_opportunity_alert_match
after insert or update of status, verification_status on public.opportunities
for each row execute function public.notify_pulso_matching_alerts();
