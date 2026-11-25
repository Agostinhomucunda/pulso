# Plano — PULSO

## Produto e plataforma

O PULSO é uma plataforma de oportunidades para Angola, com expansão africana preparada e identidade “Oportunidades em movimento”. O site público está no repositório `Agostinhomucunda/pulso` e é servido por GitHub Pages. O Supabase fornece autenticação e base de dados. Nenhuma oportunidade, organização, contagem ou notificação é inventada: a home consulta apenas registos publicados e verificados e mostra estados vazios úteis quando não há dados elegíveis.

A home pública é uma página editorial com pesquisa, categorias, oportunidades verificadas, Radar informativo, organizações e contactos. A área pós-login é uma página de dashboard separada, autenticada e organizada para trabalho recorrente do utilizador.

## Design

A identidade actual e a imagem de referência orientam a hierarquia e profundidade visual, não o conteúdo. O dashboard utiliza camadas, sombra, perspectiva 3D subtil, brilhos azuis discretos, cartões informativos e navegação dedicada; não copia anúncios, estatísticas nem ecrãs da referência.

- Azul profundo/royal para confiança e navegação, branco para leitura e amarelo para acções e foco.
- Manrope para títulos e DM Sans para interface.
- Superfícies elevadas, animação breve de entrada/hover e respeito por `prefers-reduced-motion`.
- Voz directa e útil, incluindo “Verifica o teu Gmail para activares a conta” e mensagens claras para estados vazios.
- Avatar e iniciais, nome, filtros, contactos, suporte e ligações aos canais de origem sempre visíveis nos locais apropriados.

## Estrutura implementada

- `index.html`, `styles.css`, `app.js`: home pública, pesquisa/filtros, catálogo, organizações, detalhes/fontes, Auth, confirmação e reenvio de e-mail, recuperação de palavra-passe, navegação de sessão e contactos.
- `dashboard.html`, `dashboard.css`, `dashboard.js`: dashboard separado com resumo, oportunidades filtráveis, guardados, alertas, notificações, edição do perfil, sino, permissões do browser e suporte/contactos.
- `supabase-config.js`: URL e publishable key apropriadas para o browser; não contém credenciais privilegiadas.
- `supabase/migrations/20261119103000_initial_pulso_schema.sql`: esquema de perfis, organizações, oportunidades, guardados, alertas e notificações protegido por RLS.
- `supabase/migrations/20261119122700_opportunity_alert_notifications.sql`: nova trigger idempotente para oportunidades elegíveis que correspondem a alertas activos. A mesma alteração está disponível em `supabase/mobile-setup/07_opportunity_alert_notifications.sql`.
- `README.md` e `TODO.md`: instruções, estado actual, dependências e trabalho restante.

## Regras de dados, conta e alertas

Consultar oportunidades apenas em `status=published` e `verification_status=verified`, e organizações apenas com `verification_status=verified`. Após login ou confirmação bem-sucedida, encaminhar para `dashboard.html`; sem sessão, não carregar os dados privados. O utilizador edita os campos permitidos da própria linha `profiles`; guardados e alertas usam a identidade de sessão e RLS. O sino apresenta notificações persistidas, com estado lido/não lido. Um alerta pode combinar categoria, província e palavras-chave; a trigger cria no máximo uma notificação por utilizador/oportunidade elegível, mesmo com vários alertas coincidentes.

A autorização do browser só é pedida por acção explícita. O dashboard refresca notificações enquanto está aberto; a extensão Web Push está activada para dois casos — resumo agregado de oportunidades publicadas e aviso geral da administração — com recepção em segundo plano através do service worker. A trigger de alertas pessoais existente requer a migration própria, executada manualmente pelo proprietário no Supabase.

## Contactos oficiais fornecidos

Apresentar na home e no dashboard: `+244 936 975 657` (`tel:+244936975657`), `+244 955 614 045` (`tel:+244955614045`, WhatsApp `https://wa.me/244955614045`) e `pulsobussines@gmail.com` (`mailto:pulsobussines@gmail.com`). O endereço preserva exactamente a grafia recebida; não foram inventados outros canais.

## Estado, dependências e âmbito futuro

Os percursos de confirmação, reenvio, catálogo, painel, perfil, guardados, alertas, notificação, contactos e comportamento móvel passaram testes locais com respostas Supabase/Auth simuladas. Não foram criadas contas de teste nem gravados dados de produção. A confirmação e entrega reais de e-mail permanecem por validar pelo proprietário. O catálogo pode continuar vazio até existirem oportunidades reais aprovadas. O responsável pelo tratamento e a informação legal ainda precisam de revisão.

Aplicar `supabase/migrations/20261119122700_opportunity_alert_notifications.sql` em **Supabase Dashboard → SQL Editor**; em alternativa, se a configuração inicial foi feita pelos blocos móveis 01–06, executar apenas o bloco 07 equivalente. Até à aplicação, as preferências de alerta ficam ligadas ao Supabase, mas as novas correspondências não produzem notificações automaticamente.

A administração de anúncios, submissão empresarial, ingestão/deduplicação de fontes e Radar operacional permanecem fora deste ciclo. Verificar autorização, termos, RSS/API e licenças antes de qualquer monitorização.


## Extensão isolada — contas empresariais e parcerias

O portal `empresas-parceiros.html` é uma página nova, com `empresas-parceiros.css` e `empresas-parceiros.js` próprios. A home recebe uma ligação adicional na área Empresas e uma etapa de escolha ao clicar em “Criar conta” (conta normal, conta empresarial ou pedido de parceria); o registo normal continua no formulário/Auth existente e os dois percursos organizacionais abrem o portal próprio. Não se altera `app.js`, a autenticação existente, os dashboards ou as oportunidades. O portal usa a sessão Supabase já existente; se não houver sessão, permite iniciar sessão pela mesma Auth e não encaminha automaticamente para outra página. A criação de conta Auth continua no fluxo normal do PULSO.

A candidatura empresarial e o pedido de parceria vivem em tabelas novas, não nas tabelas públicas `organizations` ou `opportunities`. Titulares autenticados podem criar pedidos e consultar apenas os seus próprios registos. Administradores autorizados, através de `is_pulso_admin()`, podem rever e actualizar estados/notas. A documentação fica num bucket privado, com acesso por titular e administrador e limites de formato/tamanho. A RLS restringe a substituição a um documento do mesmo pedido, titular e tipo, previamente marcado como `replacement_requested`. Os estados empresariais e de parceria mantêm listas distintas. Os três espaços de acesso futuro são apenas cartões de estado/placeholder, sem menus ou ferramentas internas.

O formulário empresarial inclui identificação da entidade e do representante, documentos comerciais/fiscais e identificação, com carregamentos adicionais/substituições. O pedido de parceria tem campos e estados próprios; aprovação como parceiro nunca equivale a verificação legal. Não se integra uma API oficial não documentada nem se imita validação automática: a decisão é revisão documental por responsável autorizado.

A consulta do portal oficial do [Guiché Único da Empresa](https://gue.gov.ao/) descreve constituição, actualização e publicação online, mas não apresenta documentação pública de API de consulta. A página do [SIAC — Registo Comercial](https://siac.gov.ao/servico/registo-comercial/) descreve serviços e documentos, sem interface API publicamente documentada. Assim, a primeira versão usa revisão manual e não afirma que exista uma integração oficial.

Estrutura adicionada: `empresas-parceiros.html` contém a interface; `empresas-parceiros.css` isola o visual; `empresas-parceiros.js` trata autenticação local à página, formulários, documentos, consulta de estado e espaços reservados; três migrations em `supabase/migrations/` criam as tabelas, políticas e bucket privado e corrigem/restringem a policy de substituição. Nenhuma dependência de build é introduzida. Não foi encontrada política de privacidade pública no repositório; rever responsável pelo tratamento e conservação antes de activar publicamente o envio de documentos de identificação.


## Extensão isolada — notificações Web Push

O service worker `sw.js` apresenta notificações Push e abre apenas páginas PULSO no mesmo âmbito. O dashboard pede permissão após acção explícita e associa a subscrição Push ao utilizador autenticado e ao dispositivo; se Push não estiver configurado ou suportado, mantém o modo de notificação do navegador enquanto o dashboard está aberto. No iPhone, a recepção Push depende da aplicação PULSO estar adicionada ao ecrã principal e de uma versão iOS compatível.

`supabase/migrations/20261125090000_web_push_notifications.sql` acrescenta colunas tipadas à caixa de notificações, a tabela privada `push_subscriptions` protegida por RLS e um registo server-only para idempotência/auditoria. A nova Edge Function `pulso-notifications` autentica o administrador, valida IDs publicados/verificados e trata apenas dois envios: um resumo único por lote de oportunidades e uma mensagem geral escrita pela administração. Os envios também ficam na caixa persistente dos utilizadores sem subscrição Push. Os alertas pessoais existentes continuam na caixa, mas não são transformados em Push ou avisos locais do navegador. As chaves VAPID privadas ficam exclusivamente nos segredos Supabase; a chave pública fica numa configuração browser-safe separada. A função existente `pulso-ingest` não é alterada; o dashboard integra o envio após importação em lote, publicação manual, aprovação empresarial e oportunidades recém-criadas pela recolha automática, sem repetir o aviso quando uma oportunidade recolhida volta a ser revista.

A migração foi aplicada, os três segredos VAPID ficaram guardados no Supabase e a Edge Function `pulso-notifications` foi publicada com JWT obrigatório; o frontend usa apenas a chave pública. O site já está publicado a partir de `main` no GitHub Pages. Não foi enviado aviso de teste aos utilizadores. A entrega Push depende dos serviços dos navegadores e do TTL, não sendo possível garantir entrega depois de expirado ou quando a subscrição fica inválida. O envio não usa IA; custos e quotas de execução/base de dados dependem do plano Supabase.
