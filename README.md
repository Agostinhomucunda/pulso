# PULSO — Oportunidades em movimento

Primeira versão do website do PULSO, uma plataforma de oportunidades pensada para Angola, com design responsivo inspirado na imagem criada pelo fundador e símbolo de marca 3D original.

## Ver o site com GitHub Pages

1. Abre **Settings → Pages** no repositório `Agostinhomucunda/pulso`.
2. Em **Build and deployment**, escolhe **Deploy from a branch**.
3. Seleciona a branch `main`, a pasta `/ (root)` e clica **Save**.
4. Aguarda a publicação e abre o endereço que o GitHub Pages apresentar (normalmente `https://agostinhomucunda.github.io/pulso/`).

O projecto usa HTML, CSS e JavaScript estáticos, sem compilação. Os caminhos dos recursos são relativos para funcionar sob o subcaminho `/pulso/`.

## O que funciona nesta versão

- Navegação adaptada a ecrãs pequenos e grandes.
- Pesquisa textual e filtros de categoria para a lista de demonstração.
- Cartões com detalhe, fonte e estado informativo.
- Guardar/remover favoritos no armazenamento local do navegador.
- Painel de notificações de exemplo, login e criação de conta apenas demonstrativos.
- Mensagem de cadastro empresarial indisponível nesta fase.
- Acessibilidade básica, metadados, identidade visual e adaptação a movimento reduzido.

**Aviso:** as publicações e organizações visíveis são dados de demonstração, não anúncios oficiais. O protótipo não envia candidaturas, não cria contas reais nem autentica utilizadores.

## Limites do GitHub Pages

GitHub Pages aloja ficheiros estáticos. Não executa API, base de dados, login seguro, tarefas de varredura, IA no servidor nem notificações por e-mail/WhatsApp. Essas capacidades do produto requerem um backend e serviços externos autorizados, que devem ser configurados numa etapa posterior; não se deve guardar segredos no repositório público.

## Desenvolvimento local

Abre `index.html` directamente no navegador ou inicia um servidor estático, por exemplo:

```bash
python3 -m http.server 8000
```

Depois visita `http://localhost:8000`.


## Próximo passo: preparar a base de dados Supabase

A migração inicial está em `supabase/migrations/20261119103000_initial_pulso_schema.sql`. Para a aplicar, abre o projecto PULSO no Supabase, entra em **SQL Editor → New query**, copia o conteúdo completo desse ficheiro, cola-o no editor e executa. A migração cria tabelas e políticas RLS; não insere oportunidades nem contas de demonstração.

A política pública só permite ler oportunidades publicadas e verificadas e organizações verificadas. Contas comuns só podem aceder aos seus próprios perfis, favoritos, alertas e notificações. A lista de administradores não é editável pelo browser. Depois de criar a primeira conta de utilizador do PULSO, o primeiro administrador terá de ser concedido no SQL Editor, nunca a partir do site público.

Não coles chaves `sb_secret_`, `service_role`, palavras-passe ou tokens no SQL Editor desta migração, no chat ou no GitHub. Se o Supabase mostrar um erro, partilha apenas a mensagem de erro, removendo qualquer valor secreto.
