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

A autorização do browser só é pedida por acção explícita. O estado da aplicação refresca notificações enquanto o dashboard está aberto; não promete Web Push nem avisos quando fechado. Preferências são persistidas imediatamente. A trigger de produção requer execução manual da migration pelo proprietário no Supabase, dado que a aplicação estática não tem credenciais administrativas.

## Contactos oficiais fornecidos

Apresentar na home e no dashboard: `+244 936 975 657` (`tel:+244936975657`), `+244 955 614 045` (`tel:+244955614045`, WhatsApp `https://wa.me/244955614045`) e `pulsobussines@gmail.com` (`mailto:pulsobussines@gmail.com`). O endereço preserva exactamente a grafia recebida; não foram inventados outros canais.

## Estado, dependências e âmbito futuro

Os percursos de confirmação, reenvio, catálogo, painel, perfil, guardados, alertas, notificação, contactos e comportamento móvel passaram testes locais com respostas Supabase/Auth simuladas. Não foram criadas contas de teste nem gravados dados de produção. A confirmação e entrega reais de e-mail permanecem por validar pelo proprietário. O catálogo pode continuar vazio até existirem oportunidades reais aprovadas. O responsável pelo tratamento e a informação legal ainda precisam de revisão.

Aplicar `supabase/migrations/20261119122700_opportunity_alert_notifications.sql` em **Supabase Dashboard → SQL Editor**; em alternativa, se a configuração inicial foi feita pelos blocos móveis 01–06, executar apenas o bloco 07 equivalente. Até à aplicação, as preferências de alerta ficam ligadas ao Supabase, mas as novas correspondências não produzem notificações automaticamente.

A administração de anúncios, submissão empresarial, ingestão/deduplicação de fontes e Radar operacional permanecem fora deste ciclo. Verificar autorização, termos, RSS/API e licenças antes de qualquer monitorização.
