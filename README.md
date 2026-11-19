# PULSO — Oportunidades em movimento

Site público de oportunidades em Angola, com uma área autenticada separada para cada utilizador. A interface está em GitHub Pages; o catálogo público é alimentado automaticamente por fontes HTTPS configuradas e o Supabase continua disponível para autenticação, dados pessoais e fallback.

## Site e repositório

- Site: <https://agostinhomucunda.github.io/pulso/>
- Repositório: <https://github.com/Agostinhomucunda/pulso>
- Dashboard: <https://agostinhomucunda.github.io/pulso/dashboard.html>
- Publicação: GitHub Pages a partir da branch `main`.

## Funcionalidades

A home pública tem pesquisa, filtros e apresenta inicialmente até cinco oportunidades recentes. Consulta primeiro a RPC pública do Supabase e mantém o catálogo estático como fallback; só apresenta oportunidades publicadas/verificadas e organizações verificadas. Na interface, o cartão é visível a todos, mas o detalhe e os links oficiais só são mostrados após iniciar sessão.

O registo usa confirmação por e-mail. Depois da inscrição, a interface mostra em destaque a instrução “Verifica o teu Gmail para activares a conta”, permite reenviar a confirmação e explica onde procurar. Depois de iniciar sessão ou confirmar o e-mail, o utilizador entra num dashboard próprio, diferente da home, com avatar/nome, edição de perfil, contagens reais, pesquisa/filtros, guardados, alertas, notificações e contactos.

Favoritos usam `saved_opportunities`; campos do perfil usam a própria linha de `profiles`; preferências de alerta usam `user_alerts`; notificações persistidas usam `notifications`. O painel administrativo só aparece a utilizadores autorizados em `admin_users`. Permite completar links HTTPS de imagem/logótipo em falta e adicionar oportunidades com fonte oficial; as alterações dependem das políticas RLS e do esquema Supabase activo.

Os alertas podem filtrar por categoria, província e palavras-chave. O dashboard consulta notificações periodicamente enquanto está aberto; o sininho continua disponível no painel. Se o utilizador autorizar explicitamente, o navegador também pode mostrar notificações enquanto o dashboard está aberto. Não há serviço de Web Push em segundo plano.

## Contactos publicados

- Telefone: [+244 936 975 657](tel:+244936975657)
- Telefone: [+244 955 614 045](tel:+244955614045)
- WhatsApp: [abrir conversa](https://wa.me/244955614045)
- E-mail: [pulsobussines@gmail.com](mailto:pulsobussines@gmail.com)

O endereço de e-mail acima mantém a grafia fornecida pelo proprietário. A informação legal, o responsável pelo tratamento e os procedimentos de privacidade ainda devem ser revistos pelo proprietário antes de depender de inscrições públicas em produção.

## Catálogo automático

O catálogo público também pode ser alimentado pelo worker `scripts/collect_opportunities.py`, configurado no GitHub Actions em `.github/workflows/collect-opportunities.yml` para correr a cada seis horas ou manualmente em **Actions → Collect PULSO opportunities → Run workflow**. No histórico consultado, só foi observada uma execução manual bem-sucedida; a execução agendada ainda precisa de validação. O worker consulta apenas URLs HTTPS públicas configuradas em `data/sources.json`, respeita respostas de erro e não tenta contornar autenticação, paywalls, robots.txt ou bloqueios anti-bot.

As fontes actualmente ligadas incluem SEPE, ENAPP, Portal do Governo de Angola, ANGOP, Jornal de Angola, Novo Jornal, Expansão, VerAngola Empregos, Embaixada dos Estados Unidos, Embaixada da Alemanha e Universidades.ao. Fontes oficiais e portais públicos de emprego podem publicar cartões automaticamente quando o título contém uma indicação explícita de vaga, concurso, candidatura, bolsa, estágio, curso, formação ou recrutamento e o link é HTTPS. Jornais e fontes com termos de redistribuição mais restritivos ficam em `data/review-queue.json` para revisão, sem serem apresentados como oportunidades confirmadas.

O worker grava o catálogo em `data/opportunities.json`, o que permite à homepage funcionar mesmo sem consultar o Supabase. No ficheiro actual há sete oportunidades, todas da ENAPP; os outros conectores configurados ainda não aparecem no catálogo publicado. O site apresenta apenas os cinco cartões mais recentes; o GitHub Pages publica a alteração depois de o workflow fazer commit na `main`. “Toda a web” não é uma fonte tecnicamente finita: a cobertura é ampliada adicionando domínios públicos e autorizados a `data/sources.json`, sem prometer rastreio integral nem ignorar as regras dos sites.

## Configuração do Supabase

`supabase-config.js` contém apenas o URL e a publishable key do projecto para uso no browser. Nunca adicionar `sb_secret_`, `service_role`, palavras-passe ou tokens ao repositório.

Em **Authentication → Settings**, permitir novas inscrições e manter a confirmação de e-mail activa. Configurar o fornecedor de e-mail e permitir redireccionamento para `https://agostinhomucunda.github.io/pulso/`.

O esquema inicial encontra-se em `supabase/migrations/20261119103000_initial_pulso_schema.sql`. Para alimentar dinamicamente e proteger os cartões públicos, executar uma vez `supabase/migrations/20261119140000_public_opportunity_cards.sql` em **Supabase Dashboard → SQL Editor**. A chamada a esta RPC no projecto actualmente responde 404; até à migration, a home mantém o catálogo estático e alterações feitas no painel à base não aparecem na home. Para alertas que geram notificações automaticamente, executar uma vez `supabase/migrations/20261119122700_opportunity_alert_notifications.sql`.

Se a configuração foi feita pelos seis blocos móveis, executar apenas o novo bloco `supabase/mobile-setup/07_opportunity_alert_notifications.sql` depois dos blocos `01`–`06`. Não é necessário executar as duas cópias; a migration e o bloco móvel contêm a mesma alteração e são idempotentes.

A chave pública do browser não pode executar DDL nem instalar migrations; isso requer o proprietário do projecto. Para activar o primeiro administrador, depois de a pessoa criar e confirmar a conta, executar no SQL Editor, substituindo o endereço pelo e-mail exacto dessa conta:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'EMAIL_EXACTO_DA_CONTA';
```

O painel não aparece antes da conta estar na allowlist. As políticas RLS continuam a controlar o acesso à base de dados.

## Desenvolvimento e limites

Não há compilação nem dependências npm locais. Na raiz do repositório, iniciar `python3 -m http.server 8000` e abrir `http://localhost:8000/`.

O catálogo pode continuar vazio até serem inseridos e aprovados registos reais. O painel administrativo está no código, mas requer o esquema Supabase aplicado e uma conta na allowlist. O workflow de recolha está activo e tem uma execução manual bem-sucedida; no histórico consultado ainda não foi observada uma execução agendada bem-sucedida. Testes completos de inscrição, entrega de e-mail e acesso admin precisam de uma conta controlada pelo proprietário.
