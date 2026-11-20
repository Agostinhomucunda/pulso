# PULSO — configuração da recolha automática

A recolha lê feeds RSS, Atom ou JSON Feed que o administrador configure para uma fonte. Os 67 endereços da lista são apenas registos iniciais: começam desactivados e não se assume automaticamente que a página principal tenha um feed.

## O que o fluxo faz

1. O administrador configura o URL do feed, formato, termos de utilização e domínios permitidos; depois activa a fonte.
2. **Recolher agora** processa uma fonte activa por execução. Dois passos de IA filtram e normalizam os itens recebidos.
3. Itens válidos são publicados automaticamente no PULSO e aparecem na lista administrativa para revisão posterior. Rejeitar retira a oportunidade do catálogo.
4. A imagem não é descarregada: a IA grava o URL HTTPS no campo da oportunidade e o cartão usa esse link. A organização pode ser completada depois.

## Instalação

1. Confirmar que as migrações base de administração e cartões públicos já foram aplicadas. Se não, aplicar `20261119140000_manual_opportunity_admin.sql` e `20261119140000_public_opportunity_cards.sql` depois do esquema inicial.
2. Aplicar, pela ordem do nome, `20261120180000_pulso_ai_automation.sql` e `20261120190000_pulso_review_queue.sql` no Supabase.
3. Publicar a Edge Function `supabase/functions/pulso-ingest/index.ts` no projecto `jspdbfteqackaksvslms` e configurar `OPENAI_API_KEY` como segredo server-side. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` só podem existir no runtime da função; nunca os colocar no JavaScript do navegador.
4. Entrar no PULSO com uma conta incluída em `admin_users`, configurar um feed HTTPS permitido e usar **Recolher agora**.

Não foi executada nenhuma recolha nesta entrega, por isso não foram feitas chamadas pagas à OpenAI. O botão do painel inicia a recolha manualmente; ainda não há uma rotina recorrente. Cada execução usa chamadas de API.
