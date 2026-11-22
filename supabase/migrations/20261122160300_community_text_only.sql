-- O fluxo social publica apenas texto; os contactos ficam opcionais.

alter table public.community_posts
  alter column phone drop not null,
  alter column whatsapp drop not null;
