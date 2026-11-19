# TODO — PULSO

## Etapa 1 — Website público estático
- [x] Entregar a página inicial com logótipo PULSO, menu, texto principal “Descubra as melhores oportunidades em Angola”, subtexto, pesquisa, categorias, oportunidades de exemplo, Radar, Entrar, Criar conta e Cadastro empresarial indisponível.
- [x] Implementar experiência responsiva real para telemóveis, tablets e computadores, sem reduzir simplesmente o desktop.
- [x] Implementar pesquisa textual, filtros por categoria, acesso a detalhe, favoritos persistentes no navegador e navegação acessível.
- [x] Identificar os dados visíveis como exemplos de demonstração; não os apresentar como vagas reais ou verificadas.
- [x] Explicar no site/documentação que GitHub Pages não executa backend e que formulários da versão estática não criam contas nem enviam dados.
- [x] Documentar como o proprietário activa GitHub Pages no repositório público.

## Etapa 2 — Especificação e backend de produção
- [ ] Seleccionar arquitetura modular, alojamento de servidor e base de dados compatíveis com o orçamento; estruturar utilizadores, empresas, oportunidades, fontes, notícias, sinais, alertas, notificações e registos administrativos.
- [ ] Definir política de privacidade, termos, retenção de dados, segurança, backups, permissões e tratamento de erros antes de recolher dados pessoais.

## Etapa 3 — Contas, empresas e administração
- [x] Ligar login por e-mail/palavra-passe e recuperação de palavra-passe ao Supabase Auth, com redireccionamento para GitHub Pages.
- [ ] Activar registo público e validação de e-mail apenas depois de aprovar/publicar privacidade e termos; até lá, manter o formulário fechado e permitir apenas contas criadas/convidadas pelo proprietário.
- [ ] Completar edição de perfis e atribuição segura do primeiro administrador; contas comuns não podem atribuir privilégios.
- [ ] Verificar documentação e autorização do SENGA e Google antes de activar qualquer autenticação; não simular integração.
- [ ] Manter cadastro/publicação empresarial bloqueados até existir verificação de legitimidade.
- [ ] Implementar painel administrativo protegido, auditoria, revisão/edição e gestão de denúncias.

## Etapa 4 — Oportunidades verificadas
- [ ] Modelar oportunidades com título, instituição, categoria, localização, requisitos/datas/salário apenas quando disponíveis, fonte e link oficial.
- [ ] Permitir combinação de filtros e detalhes com chamada “ACEDER À PUBLICAÇÃO ORIGINAL”.
- [ ] Exibir claramente estados confirmada, não verificada, em observação e sinal de possível recrutamento.
- [ ] Não inventar números de vagas, salários, requisitos, datas, fontes, logótipos ou verificação.

## Etapa 5 — Fontes, Radar e notificações
- [ ] Verificar termos/robots/RSS/API e autorização de cada fonte antes da monitorização; não contornar login, paywall ou restrições.
- [ ] Criar tarefas agendadas, histórico, erros, deduplicação, avaliação de confiança e fila de revisão.
- [ ] Implementar Radar PULSO AI sem transformar inferências em vagas confirmadas.
- [ ] Implementar alertas e notificações no produto/e-mail e considerar WhatsApp apenas por API oficial, com consentimento e configuração segura.
- [ ] Registar origem e licença de imagens, priorizando fonte oficial e omitindo a imagem quando não houver uma adequada/confiável.
