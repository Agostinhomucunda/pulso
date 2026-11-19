# PULSO — Oportunidades em movimento

Site público do PULSO para oportunidades de emprego, bolsas, concursos, estágios, formação e programas em Angola. O código está preparado para GitHub Pages e usa o Supabase para autenticação e leitura do catálogo publicado.

## Site e repositório

- Site: <https://agostinhomucunda.github.io/pulso/>
- Repositório: <https://github.com/Agostinhomucunda/pulso>
- Publicação: GitHub Pages a partir da branch `main`.

## Funcionalidades actuais

- Interface responsiva, pesquisa e filtros por categoria.
- Catálogo carregado do Supabase: só são pedidas oportunidades com `status = published` e `verification_status = verified`; as políticas RLS continuam a ser a camada de segurança.
- Detalhes com a entidade, fonte original e ligação de candidatura quando disponíveis.
- Organizações apresentadas apenas quando têm estado de verificação `verified`.
- Estado vazio explícito quando ainda não há publicações verificadas; não são carregados registos inventados.
- Criar conta com confirmação por e-mail, entrar, terminar sessão e recuperar/actualizar a palavra-passe através do Supabase Auth.
- Favoritos persistidos na tabela `saved_opportunities` para utilizadores com sessão iniciada; sem sessão, ficam guardados apenas neste dispositivo.
- Centro de notificações ligado à tabela `notifications` para a conta autenticada.

A interface não cria oportunidades ou organizações e não monitoriza fontes automaticamente. A publicação e verificação de conteúdo são tarefas administrativas que ainda precisam de um fluxo próprio. O Radar tem apresentação informativa; a recolha e análise automatizadas ainda não estão ligadas.

## Configuração do Supabase

O ficheiro `supabase-config.js` contém o URL e a publishable key do projecto, concebidos para uso no browser. Não adicionar `sb_secret_`, `service_role`, palavras-passe ou tokens ao repositório.

A autenticação usa a configuração de redireccionamento para `https://agostinhomucunda.github.io/pulso/`. Para aceitar novas contas, o fornecedor de e-mail e a opção **Allow new users to sign up** têm de estar activos em **Authentication → Settings**; mantém a confirmação de e-mail activa. O formulário mostra uma mensagem se o serviço recusar inscrições.

A migração inicial está em `supabase/migrations/20261119103000_initial_pulso_schema.sql`. Para configuração num dispositivo móvel, existem seis blocos menores em `supabase/mobile-setup/`, numerados de `01` a `06`. A migração cria as tabelas e políticas RLS, mas não insere dados de oportunidades nem organizações. As tabelas públicas só devem expor itens verificados e publicados.

## Desenvolvimento e verificação

O site não tem passo de compilação nem dependências npm locais. Para o servir localmente, executa na raiz do repositório:

```bash
python3 -m http.server 8000
```

Abre `http://localhost:8000/` quando o servidor é iniciado a partir da raiz do projecto. Para testar a autenticação, usa uma conta autorizada e um endereço de e-mail ao qual tenhas acesso; a aplicação envia uma mensagem de confirmação.

## Âmbito ainda pendente

- Fluxo administrativo protegido para rever, aprovar, publicar e gerir organizações e oportunidades.
- Ingestão autorizada de fontes, deduplicação, histórico e revisão humana.
- Implementação operacional do Radar e dos alertas.
- Completar e validar a informação legal e os contactos oficiais de privacidade antes de depender do registo público em produção.
- Testes de ponta a ponta com uma conta de utilizador real e a configuração de e-mail do proprietário.

O GitHub Pages só serve os ficheiros estáticos; não executa rotinas de backend. A segurança dos dados depende das políticas RLS do Supabase, e as candidaturas decorrem no serviço ou site da entidade anunciante.
