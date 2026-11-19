# TODO — PULSO

## Etapa 1 — Website público
- [x] Página responsiva com identidade PULSO, navegação, pesquisa, categorias e estados acessíveis.
- [x] Remover registos, organizações, notificações e avisos fictícios do site.
- [x] Ler oportunidades publicadas e verificadas no Supabase; mostrar estado vazio quando não há registos.
- [x] Ler e apresentar apenas organizações verificadas.
- [x] Mostrar detalhes, fonte original e ligação de candidatura quando disponíveis.
- [x] Activar filtros, pesquisa, detalhes e favoritos (na conta ou neste dispositivo).

## Etapa 2 — Base de dados e segurança
- [x] Criar o esquema relacional inicial e políticas RLS para perfis, organizações, fontes, oportunidades, Radar e dados pessoais.
- [x] Separar contas comuns da lista administrativa; impedir promoção de privilégios pelo browser.
- [x] Ligar o website ao projecto Supabase com URL e publishable key pública, sem segredos no repositório.
- [ ] Rever a informação de privacidade, o responsável pelo tratamento e os contactos oficiais antes de depender de inscrições públicas em produção.

## Etapa 3 — Contas
- [x] Login, criação de conta por e-mail, confirmação, recuperação e actualização da palavra-passe via Supabase Auth.
- [x] Guardar favoritos autenticados na tabela `saved_opportunities`.
- [x] Ler notificações autenticadas da tabela `notifications` e permitir marcá-las como lidas.
- [ ] Testar todo o percurso com uma conta real e confirmar entrega de e-mails no projecto do proprietário.
- [ ] Completar edição de perfis e atribuição segura do primeiro administrador.
- [ ] Implementar painel administrativo protegido, auditoria e revisão de conteúdo.
- [ ] Activar cadastro e publicação empresarial após definir o fluxo de verificação.

## Etapa 4 — Oportunidades verificadas
- [x] Filtrar no cliente/API apenas oportunidades `published` e `verified`; usar RLS como controlo de acesso.
- [x] Exigir fonte e link original no esquema e apresentá-los nos detalhes.
- [ ] Criar o fluxo administrativo de submissão, revisão, aprovação, actualização e expiração.
- [ ] Alimentar as primeiras oportunidades reais e verificar apresentação no site.
- [ ] Completar filtros, quando existirem dados, por localização, prazo e outros campos disponíveis.

## Etapa 5 — Fontes, Radar e notificações
- [ ] Verificar termos, robots, RSS/API e autorização de cada fonte antes da monitorização.
- [ ] Implementar ingestão autorizada, deduplicação, histórico e fila de revisão humana.
- [ ] Ligar o Radar a sinais reais aprovados, sem apresentar inferências como vagas.
- [ ] Criar alertas e notificações operacionais por e-mail/produto; WhatsApp apenas através da API oficial e com consentimento.
- [ ] Registar origem e licença de imagens externas.

## Verificações da sessão de 19-11-2026
- [x] A API pública do Supabase responde para `opportunities` e `organizations`; ambos os conjuntos estão actualmente vazios.
- [x] O endpoint de Auth indica e-mail activo e novas inscrições permitidas.
- [ ] Teste final do formulário de inscrição e confirmação de e-mail com uma conta controlada pelo proprietário.
