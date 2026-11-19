# TODO — PULSO

## Entregue e validado neste ciclo

### Home pública e contactos
- [x] Página responsiva, catálogo Supabase real e apenas registos publicados/verificados; sem dados fictícios.
- [x] Homepage ligada à RPC pública limitada a cinco cartões, sem `select` anónimo directo da tabela completa de oportunidades.
- [x] Pesquisa, filtros, detalhes, fontes originais e ligações de candidatura.
- [x] Contactos na navegação e secção pública: `+244 936 975 657`, `+244 955 614 045`, `pulsobussines@gmail.com` e WhatsApp em `wa.me/244955614045`.
- [x] Ligações `tel:`, `mailto:` e WhatsApp testadas também em ecrã móvel.

### Conta e autenticação
- [x] Login, inscrição por e-mail, recuperação e alteração de palavra-passe via Supabase Auth.
- [x] Após inscrição que exige confirmação, mostrar um painel destacado a pedir que verifique o Gmail, identificar o endereço e orientar sobre Inbox/Spam.
- [x] Reenviar a mensagem de confirmação a pedido do utilizador.
- [x] Encaminhar sessão válida — após login, inscrição com sessão ou confirmação de e-mail — para o dashboard.
- [x] A página do dashboard não carrega dados privados sem uma sessão autenticada.
- [ ] Testar a entrega real do e-mail e o retorno de sessão com conta/endereço controlados pelo proprietário; os testes desta implementação usaram Auth simulado.

### Dashboard e perfil
- [x] Página autenticada separada da home, responsiva, com profundidade 3D subtil, animação reduzida respeitada e identidade PULSO.
- [x] Avatar/iniciais, nome, e-mail e menu de editar perfil, suporte e terminar sessão.
- [x] Painel inicial, oportunidades, guardados, alertas, notificações, perfil e suporte.
- [x] Pesquisa por texto, filtro por categoria/província, paginação e estados vazios.
- [x] Contagens calculadas exclusivamente a partir de oportunidades publicadas e verificadas; sem valores da imagem de referência.
- [x] Ler e guardar nome, província, município, área profissional e escolaridade na linha própria de `profiles`, respeitando RLS.
- [x] Listar, abrir, guardar e remover `saved_opportunities` da conta autenticada.

### Alertas, notificações e contactos de suporte
- [x] Criar, listar, activar, pausar e remover preferências em `user_alerts` por categoria, província e palavras-chave.
- [x] Sino com contagem não lida; ler notificações persistidas em `notifications` e marcar como lidas.
- [x] Pedir autorização de notificações do browser só depois de acção explícita; consulta periódica enquanto o dashboard está aberto.
- [x] Contactos e apoio no dashboard, incluindo telefones, Gmail e botão WhatsApp.
- [x] Criar migração idempotente que notifica uma vez por utilizador/oportunidade elegível, sem privilégio de escrita público.
- [ ] O proprietário deve executar no Supabase `supabase/migrations/20261119122700_opportunity_alert_notifications.sql` (ou, se usou setup móvel, `supabase/mobile-setup/07_opportunity_alert_notifications.sql`). Até à execução, as preferências são guardadas, mas a trigger de correspondência automática ainda não corre.
- [ ] O proprietário deve executar no Supabase `supabase/migrations/20261119140000_public_opportunity_cards.sql` antes de publicar a home actualizada; até à execução, a homepage actualizada ficará sem catálogo porque a RPC ainda não existe.
- [x] Worker automático em GitHub Actions com recolha periódica de fontes HTTPS públicas, deduplicação, validação de links, publicação estática e fila de revisão para fontes noticiosas ou restritas.
- [ ] Ampliar o catálogo de fontes apenas depois de confirmar URL canónico, robots.txt, termos de utilização e um canal público estável para cada nova instituição.

## Segurança e trabalho futuro
- [x] Manter RLS do esquema inicial, chave publishable pública e nenhuma chave privilegiada no browser.
- [ ] Rever política de privacidade, responsável pelo tratamento e procedimentos antes de depender de inscrições públicas em produção.
- [ ] Criar ferramentas administrativas para submissão, revisão, aprovação, actualização e expiração de oportunidades.
- [ ] Inserir e aprovar primeiras oportunidades reais e validar a apresentação no site.
- [ ] Verificar autorização, termos, RSS/API e licenças das fontes antes de monitorização/ingestão.
- [ ] Testar Auth por e-mail e a confirmação num dispositivo/conta controlados pelo proprietário.
