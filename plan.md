# Plano — PULSO

## Produto e decisão de plataforma

Criar uma plataforma profissional de oportunidades para Angola, com expansão africana preparada, identidade PULSO — “Oportunidades em movimento.” A implementação inicial solicitada é o próprio site dentro do repositório público `Agostinhomucunda/pulso`, preparado para o proprietário activar GitHub Pages. GitHub Pages é alojamento estático e não fornece backend ou base de dados; portanto esta entrega é a primeira camada navegável do produto, não a plataforma de produção completa. Capacidades simuladas são rotuladas como demonstração. Não apresentar dados inventados como reais.

## Design

- Movimento visual: interface editorial de oportunidades com influência de produto digital premium, baseada directamente na imagem de referência do proprietário.
- Princípios: confiança antes de volume; hierarquia imediata; conteúdo legível; mobile-first.
- Cores: azul profundo/royal para confiança e energia; branco para leitura; amarelo para acções e foco.
- Estrutura: hero visual com imagem de Luanda fornecida pelo proprietário, busca e atalhos de categorias; catálogo e painel do Radar em disposição assimétrica; secções editoriais para inteligência e empresas.
- Elementos distintivos: marca PULSO em forma circular/onda, pequenos marcadores de estado e órbitas gráficas do Radar.
- Interacção: acções com resposta visível; filtros e pesquisa executáveis no cliente; favoritos persistidos localmente; sem fingir que login envia dados ao servidor.
- Movimento: transições breves e discretas, respeitando `prefers-reduced-motion`.
- Tipografia: Manrope para títulos/marca e DM Sans para interface e texto.
- Essência: informação de oportunidades para pessoas em Angola, distinguida por transparência de fonte e contexto; próxima, credível e clara.
- Voz: directa e encorajadora, sem prometer empregos. Exemplos: “Descubra as melhores oportunidades em Angola.” “Uma previsão é uma análise, nunca uma vaga confirmada.”
- Logótipo: símbolo P/onda tridimensional em azul royal com acento amarelo, acompanhado pelo wordmark PULSO; aparência própria e legível em tamanhos pequenos.

## Implementação e estrutura

- `index.html`: página única sem framework, sem build step, compatível com GitHub Pages em `/pulso/`.
- `styles.css`: design responsivo, acessibilidade e estados de interface.
- `app.js`: catálogo demonstrativo, interacções de interface, login Supabase e recuperação de palavra-passe.
- `supabase-config.js`: URL, publishable key pública e redirect URL do projecto; nunca guardar chaves privilegiadas no cliente.
- `supabase/`: migração inicial e políticas RLS; o projecto Supabase PULSO está na região eu-west-1.
- `assets/`: marca SVG e recorte da imagem de referência fornecida.
- `README.md`: instruções para activar Pages e explicar limites.
- `plan.md` e `TODO.md`: decisões e progresso.

O GitHub Pages continua a servir a interface estática; o Supabase fornece autenticação e base de dados externa. O login e a recuperação de palavra-passe usam a publishable key com RLS. O registo público fica fechado até à aprovação/publicação de privacidade e termos. Não há chaves secretas no cliente.

## Etapas do produto

1. Interface pública responsiva e navegação/demonstração funcional no browser; activar Pages pelo proprietário.
2. Seleccionar o Supabase como backend inicial e criar tabelas com políticas RLS; manter GitHub Pages para a interface.
3. Activar login e recuperação por e-mail; manter o registo público fechado até publicar privacidade e termos. Perfis, favoritos/alertas duráveis, notificações e funções administrativas continuam por ligar.
4. Ingestão de fontes públicas/autorizadas com histórico, deduplicação, revisão e links para origem.
5. Radar PULSO AI claramente separado de vagas confirmadas.
6. Integrações externas (SENGA/Google/e-mail/WhatsApp) apenas após verificar API, permissão, custos e credenciais.

## Dependências conhecidas

- Activação do GitHub Pages é uma acção do proprietário do repositório.
- Base de dados/backend, correio, autenticação social, SENGA, WhatsApp e fontes automatizadas não são incluídos pelo Pages.
- Dados comerciais/demonstração não devem ser confundidos com fontes oficiais.
