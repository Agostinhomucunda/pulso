# PULSO — Oportunidades em movimento

Site público de oportunidades em Angola, com uma área autenticada separada para cada utilizador. A interface está em GitHub Pages; o catálogo público é alimentado automaticamente por fontes HTTPS configuradas e o Supabase continua disponível para autenticação, dados pessoais e fallback.

## Site e repositório

- Site: <https://agostinhomucunda.github.io/pulso/>
- Repositório: <https://github.com/Agostinhomucunda/pulso>
- Dashboard: <https://agostinhomucunda.github.io/pulso/dashboard.html>
- Publicação: GitHub Pages a partir da branch `main`.

## Funcionalidades

A home pública tem pesquisa, filtros e catálogo automático estático, com fallback para a RPC do Supabase quando necessário. Só mostra oportunidades publicadas e verificadas e organizações verificadas; não usa anúncios nem estatísticas fictícias. Os detalhes preservam a entidade anunciante, fonte original e ligação de candidatura quando disponíveis.

O registo usa confirmação por e-mail. Depois da inscrição, a interface mostra em destaque a instrução “Verifica o teu Gmail para activares a conta”, permite reenviar a confirmação e explica onde procurar. Depois de iniciar sessão ou confirmar o e-mail, o utilizador entra num dashboard próprio, diferente da home, com avatar/nome, edição de perfil, contagens reais, pesquisa/filtros, guardados, alertas, notificações e contactos.

Favoritos usam `saved_opportunities`; campos do perfil usam a própria linha de `profiles`; preferências de alerta usam `user_alerts`; notificações persistidas usam `notifications`. As consultas e alterações de dados privados dependem das políticas RLS e da identidade autenticada.

Os alertas podem filtrar por categoria, província e palavras-chave. O dashboard consulta notificações periodicamente enquanto está aberto; o sininho continua disponível no painel. Se o utilizador autorizar explicitamente, o navegador também pode mostrar notificações enquanto o dashboard está aberto. Não há serviço de Web Push em segundo plano.

## Contactos publicados

- Telefone: [+244 936 975 657](tel:+244936975657)
- Telefone: [+244 955 614 045](tel:+244955614045)
- WhatsApp: [abrir conversa](https://wa.me/244955614045)
- E-mail: [pulsobussines@gmail.com](mailto:pulsobussines@gmail.com)

O endereço de e-mail acima mantém a grafia fornecida pelo proprietário. A informação legal, o responsável pelo tratamento e os procedimentos de privacidade ainda devem ser revistos pelo proprietário antes de depender de inscrições públicas em produção.

## Catálogo automático

O catálogo público também pode ser alimentado pelo worker `scripts/collect_opportunities.py`, executado pelo GitHub Actions em `.github/workflows/collect-opportunities.yml` a cada seis horas ou manualmente em **Actions → Collect PULSO opportunities → Run workflow**. O worker consulta apenas URLs HTTPS públicas configuradas em `data/sources.json`, respeita respostas de erro e não tenta contornar autenticação, paywalls, robots.txt ou bloqueios anti-bot.

As fontes actualmente ligadas incluem SEPE, ENAPP, Portal do Governo de Angola, ANGOP, Jornal de Angola, Novo Jornal, Expansão, VerAngola Empregos, Embaixada dos Estados Unidos, Embaixada da Alemanha e Universidades.ao. Fontes oficiais e portais públicos de emprego podem publicar cartões automaticamente quando o título contém uma indicação explícita de vaga, concurso, candidatura, bolsa, estágio, curso, formação ou recrutamento e o link é HTTPS. Jornais e fontes com termos de redistribuição mais restritivos ficam em `data/review-queue.json` para revisão, sem serem apresentados como oportunidades confirmadas.

O worker grava o catálogo em `data/opportunities.json`, o que permite à homepage funcionar mesmo sem consultar o Supabase. O site apresenta apenas os cinco cartões mais recentes; o GitHub Pages publica a alteração depois de o workflow fazer commit na `main`. “Toda a web” não é uma fonte tecnicamente finita: a cobertura é ampliada adicionando domínios públicos e autorizados a `data/sources.json`, sem prometer rastreio integral nem ignorar as regras dos sites.

## Configuração do Supabase

`supabase-config.js` contém apenas o URL e a publishable key do projecto para uso no browser. Nunca adicionar `sb_secret_`, `service_role`, palavras-passe ou tokens ao repositório.

Em **Authentication → Settings**, permitir novas inscrições e manter a confirmação de e-mail activa. Configurar o fornecedor de e-mail e permitir redireccionamento para `https://agostinhomucunda.github.io/pulso/`.

O esquema inicial encontra-se em `supabase/migrations/20261119103000_initial_pulso_schema.sql`. Para proteger o catálogo público, executar também uma vez `supabase/migrations/20261119140000_public_opportunity_cards.sql` em **Supabase Dashboard → SQL Editor**; essa alteração revoga o `select` anónimo directo sobre oportunidades e instala uma RPC estável, limitada a cinco cartões verificados e a campos públicos. Para alertas que geram notificações automaticamente, executar uma vez `supabase/migrations/20261119122700_opportunity_alert_notifications.sql` em **Supabase Dashboard → SQL Editor**. Essa trigger só cria uma notificação quando uma oportunidade passa a `published` e `verified` e coincide com pelo menos um alerta activo. A função não cria vagas de exemplo e foi concebida para evitar duplicados por utilizador/oportunidade.

Se a configuração foi feita pelos seis blocos móveis, executar apenas o novo bloco `supabase/mobile-setup/07_opportunity_alert_notifications.sql` depois dos blocos `01`–`06`. Não é necessário executar as duas cópias; a migration e o bloco móvel contêm a mesma alteração e são idempotentes.

A chave pública do browser não pode executar DDL nem instalar esta trigger; a aplicação da migration requer o proprietário do projecto. Até esta etapa ser executada, o dashboard consegue guardar as preferências de alertas, mas a base de dados não cria automaticamente notificações correspondentes a novas oportunidades.

## Desenvolvimento e limites

Não há compilação nem dependências npm locais. Na raiz do repositório, iniciar `python3 -m http.server 8000` e abrir `http://localhost:8000/`.

O catálogo pode continuar vazio até serem inseridos e aprovados registos reais. O fluxo administrativo de submissão/verificação, a ingestão de fontes e o Radar operacional continuam por construir. Testes completos de inscrição e entrega de e-mail precisam de uma conta e endereço controlados pelo proprietário.
