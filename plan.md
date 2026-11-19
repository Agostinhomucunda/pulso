# Plano — PULSO

## Produto e plataforma

Criar uma plataforma profissional de oportunidades para Angola, com expansão africana preparada, identidade PULSO — “Oportunidades em movimento.” O site público está no repositório `Agostinhomucunda/pulso` e é servido por GitHub Pages. O Supabase fornece autenticação e base de dados. Nenhuma oportunidade ou organização é fabricada: a página consulta apenas registos publicados e verificados, e mostra um estado vazio quando não há conteúdo elegível.

## Design

- Interface editorial, responsiva e legível, inspirada na imagem fornecida pelo proprietário.
- Azul profundo/royal, branco e amarelo; Manrope e DM Sans.
- Marca PULSO 3D, hero de Luanda, pesquisa, categorias, catálogo, Radar informativo, organizações e acesso à conta.
- Transparência de fonte e estado; não prometer empregos nem apresentar sinais como vagas confirmadas.

## Implementação actual

- `index.html`, `styles.css`: interface sem framework e compatível com GitHub Pages no caminho `/pulso/`.
- `app.js`: pesquisa/filtros, leitura paginada de oportunidades elegíveis, organizações verificadas, detalhes/origem, favoritos, notificações, login, criação de conta e recuperação de palavra-passe via Supabase.
- `supabase-config.js`: URL do projecto e publishable key para uso público no browser; nunca guardar chaves privilegiadas.
- `supabase/`: migração inicial, tabelas relacionais e políticas RLS.
- `README.md` e `TODO.md`: uso, integrações e trabalho pendente.

## Regras de apresentação e segurança

- Só consultar oportunidades com estado `published` e `verified`; as políticas RLS do Supabase são o controlo de acesso real.
- Só mostrar organizações com estado `verified`.
- Mostrar fonte original e ligação de candidatura quando disponíveis.
- Não incluir registos inventados para preencher listas; apresentar estados vazios úteis.
- Perfis, favoritos, alertas e notificações obedecem às políticas RLS; chaves secretas nunca vão para o código do browser.
- O GitHub Pages aloja a interface estática; não executa tarefas agendadas, ingestão ou lógica de servidor.

## Etapas do produto

1. Interface responsiva no GitHub Pages — concluída.
2. Esquema inicial Supabase, RLS e configuração de autenticação — concluídos.
3. Integração de login, inscrição, recuperação, favoritos e leitura de notificações — implementada; falta validação ponta a ponta com conta/e-mail do proprietário.
4. Ferramentas de administração, publicação e gestão de oportunidades reais — pendentes.
5. Monitorização autorizada de fontes, revisão, deduplicação e Radar operacional — pendentes.
6. Integrações externas (SENGA/Google/e-mail/WhatsApp) só após confirmar API, permissão, custos e credenciais.

## Dependências e limites

- O catálogo permanece vazio até serem inseridos e aprovados registos reais no Supabase.
- O processo administrativo de verificação/publicação ainda não está construído.
- A inscrição requer fornecedor de e-mail e confirmação configurados. A informação legal e os contactos de privacidade devem ser revistos pelo proprietário antes de depender do registo público em produção.
- GitHub Pages não fornece base de dados, autenticação ou processamento de servidor por si só.
