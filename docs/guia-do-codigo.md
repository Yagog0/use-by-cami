# Guia do código para manutenção

Este é o ponto de entrada para quem vai alterar a loja. Os arquivos próprios do projeto têm comentários em português sobre responsabilidades, funções, rotas, eventos e blocos visuais. Leia este mapa antes de modificar um fluxo que passa por vários arquivos.

## 1. Como uma página funciona

1. O navegador pede uma página ao Apache.
2. O PHP inclui `app/bootstrap.php`, que configura sessão, cabeçalhos e helpers. A conexão com o banco é aberta quando `db()` é necessária.
3. A página devolve HTML com áreas identificadas por `id` e `data-*` e carrega CSS/JavaScript locais.
4. O JavaScript consulta `api/index.php?action=...`. O navegador envia o cookie da sessão; alterações também enviam `X-CSRF-Token`.
5. A API valida acesso e dados, executa consultas preparadas e responde JSON. `json_response()` e `fail()` encerram a execução daquela requisição.
6. O JavaScript atualiza o trecho da página correspondente ou mostra a mensagem de erro.

Os scripts não acessam MySQL diretamente. Esconder um botão ou uma seção com `hidden` também não concede nem remove permissões: a API precisa conferir cada operação.

## 2. Entradas e dependências

| Entrada           | O que renderiza                                      | Código principal no navegador                        |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `index.php`       | Página inicial, navegação, coleção e diálogos comuns | `assets/js/store.js`                                 |
| `catalogo.php`    | Define `$catalogPage=true` e inclui `index.php`      | `store.js` + `catalog.js`                            |
| `conta.php`       | Define `$accountPage=true` e inclui `index.php`      | `store.js` + `account.js`                            |
| `admin/index.php` | Login administrativo, menu, conteúdo e editor        | `admin.js` + `admin-orders.js` + `admin-accounts.js` |
| `api/index.php`   | JSON, sem layout de página                           | PHP e domínios em `app/`                             |

Na loja, a ordem de scripts é `store.js`, `password-change.js`, `checkout-auth.js` e, quando aplicável, `catalog.js` ou `account.js`. Os arquivos usam helpers e estado compartilhados; não reorganize essa ordem sem revisar as dependências. `window.camiReady` permite à conta aguardar os dados iniciais.

O painel tem helpers próprios em `admin.js`. Ele não carrega `store.js`: ambos definem nomes semelhantes como `$`, `api` e `session`, mas em páginas diferentes.

## 3. Onde alterar cada funcionalidade

| Funcionalidade                  | Arquivos de apresentação                                                           | Servidor/tabelas                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Campanha, cabeçalho e rodapé    | `index.php`, `assets/css/style.css`                                                | Contatos/aviso vêm de `settings`                                                 |
| Busca e filtros                 | `app/views/catalog-filters.php`, `assets/js/catalog.js`, `assets/css/customer.css` | `products` retorna catálogo e variações; filtros são aplicados no navegador      |
| Cartão, detalhe e favorito      | `assets/js/store.js`                                                               | `products`, `variants`; favoritos são locais                                     |
| Sacola e entrega                | `store.js`, `checkout-auth.js`                                                     | `checkout` em `api/index.php`                                                    |
| Login/cadastro da cliente       | `account.js`, `checkout-auth.js`                                                   | `app/customer.php`, tabela `customers`                                           |
| Senha temporária                | `password-change.js`, `account.js`, `checkout-auth.js`                             | `admin-customer-password`, `customer-password`, `customers.must_change_password` |
| Histórico e detalhes            | `app/views/account-view.php`, `account.js`                                         | `customer_orders`, `orders`, `order_items`, `order_events`, `order_shipping`     |
| Produtos, fotos e estoque       | `admin.js`, `assets/css/admin.css`                                                 | Ações `product`, `upload`, `stock`; `products`, `variants`, `movements`          |
| Etapas, cancelamento e rastreio | `admin.js`, `admin-orders.js`                                                      | `order-status`, `order-shipping`                                                 |
| Clientes e administradores      | `admin-accounts.js`                                                                | `app/admin-accounts.php`, `customers`, `admins`                                  |
| Últimos pedidos automáticos     | `admin.js` → `refreshLatestOrders()`                                               | GET `dashboard` a cada 5 minutos na visão geral                                  |

Os fragmentos em `app/views/` contêm a estrutura inicial; grande parte dos formulários/cartões é criada por JavaScript. Se não encontrar o texto de um botão no PHP, procure em `assets/js/`.

## 4. Caminho de uma compra

1. `init()` de `store.js` busca sessão e produtos; `renderProducts()` cria cartões.
2. Clicar numa peça chama `showProduct(id)`. A cliente escolhe uma variação de tamanho/cor.
3. Adicionar à sacola grava `{variant_id, quantity}` no estado/localStorage. Isso ainda não reserva estoque.
4. `renderCart()` mostra os itens; `checkoutSection()` escolhe entre login/cadastro, troca obrigatória e entrega.
5. `checkout()` envia a sacola e a entrega. O e-mail é definido pela conta autenticada no servidor; o subtotal é recalculado com os preços do banco.
6. O servidor valida a chave de idempotência. Se a mesma compra já foi criada para a mesma conta, devolve o pedido existente.
7. Em transação, reduz estoque por atualização condicional, cria `orders`, `order_items`, vínculo em `customer_orders`, evento inicial e movimentações.
8. Se um item falhar, a transação desfaz todas as reservas. Somente após sucesso o navegador limpa a sacola e oferece acompanhar o pedido/WhatsApp.

Valores monetários no banco/API são **centavos inteiros**. Campos de preço do painel trabalham em reais e convertem antes de enviar. Não calcule o preço autorizado apenas no navegador.

## 5. Identidade e senhas

| Estado                 | Local                              | Finalidade                                      |
| ---------------------- | ---------------------------------- | ----------------------------------------------- |
| `admin_id`             | Sessão PHP                         | Identifica o administrador conectado            |
| `customer_id`          | Sessão PHP                         | Identifica a cliente conectada                  |
| `customer_version`     | Sessão PHP                         | Precisa corresponder a `customers.auth_version` |
| `csrf`                 | Sessão PHP, entregue por `session` | Confirma a origem das alterações da interface   |
| `must_change_password` | Banco, refletido no perfil da API  | Exige trocar a senha temporária                 |

Cliente e administrador são acessos separados e podem coexistir na sessão. Sair de um deles não transforma o outro nem o remove automaticamente.

Senhas são validadas com mínimo de 6 caracteres e máximo de 72 bytes, salvas com `password_hash()` e comparadas com `password_verify()`. Não há consulta da senha original. Os perfis enviados ao navegador excluem hashes.

Ao redefinir a senha de uma cliente pelo painel:

1. A equipe confirma a identidade no atendimento e informa sua própria senha administrativa.
2. A API salva o hash temporário, marca `must_change_password=1` e incrementa `auth_version`.
3. A cliente entra com a senha temporária, mas não pode consultar a conta/pedidos nem finalizar compra.
4. `password-change.js` exige senha nova e confirmação; a API rejeita repetir a temporária.
5. A troca limpa a marca e incrementa novamente a versão. A sessão que concluiu a troca recebe a nova versão; as anteriores deixam de valer.

Criar uma cliente pelo painel é uma operação diferente de redefinir senha: não troca a sessão da equipe e não marca automaticamente a senha como temporária na implementação atual.

## 6. Banco e relações

| Tabela              | Responsabilidade e ligação                                                             |
| ------------------- | -------------------------------------------------------------------------------------- |
| `admins`            | Contas administrativas; independentes de clientes                                      |
| `customers`         | Cadastro e autenticação da cliente                                                     |
| `settings`          | Pares nome/valor de contatos e apresentação                                            |
| `products`          | Cadastro da peça, preço, imagem, destaque e visibilidade                               |
| `variants`          | Pertence a `products`; combina tamanho/cor e guarda estoque                            |
| `orders`            | Cabeçalho, subtotal, estado e retrato da entrega na compra                             |
| `order_items`       | Pertence a `orders` e referencia a variação; preserva nome/preço da compra             |
| `customer_orders`   | Liga pedido à cliente proprietária; autoriza acesso ao histórico                       |
| `order_events`      | Histórico de etapas do pedido com data                                                 |
| `order_shipping`    | Transportadora, código e link de rastreio por pedido                                   |
| `movements`         | Deltas positivos/negativos do estoque com motivo                                       |
| `login_attempts`    | Limite de tentativas de login administrativo                                           |
| `customer_attempts` | Limites por finalidade/IP para ações sensíveis                                         |
| `order_access`      | Códigos privados de compras históricas, armazenados como hash e consumidos ao vincular |

Editar endereço no cadastro não altera o endereço de pedidos existentes. Uma compra também não passa para outra pessoa porque o e-mail mudou: a autorização depende dos IDs em `customer_orders`.

`customers.recovery_hash` é uma coluna legada mantida por compatibilidade. A recuperação por código foi removida; o atendimento usa a redefinição administrativa. Não confundir com o código privado de compras históricas em `order_access`.

### Etapas e estoque

O fluxo normal é `pending → confirmed → shipped → delivered`. `pending` e `confirmed` podem ir para `cancelled`, devolvendo estoque uma única vez. As transições são verificadas na API; somente mudar etiquetas no navegador não altera o pedido.

A loja combina pagamento e frete manualmente. Não há cobrança automática, sincronização com transportadoras ou expiração automática de reservas.

### Instalação e migrações

- `bootstrap.php:migrate()` cria tabelas iniciais e exemplos; `installed` registra que a instalação terminou.
- `customer.php:migrate_customers()` cria tabelas de contas/histórico e usa `customer-schema-v1`.
- `migrate_customer_password_change()` garante a coluna de senha temporária e usa `customer-schema-v2`.
- Os arquivos marcadores/locks ficam em `DATA_DIR`, fora da pasta pública. Não os apague para tentar corrigir dados sem entender a migração.
- `database/schema.sql` é uma exportação de estrutura, não um script de atualização para importar sobre a loja existente.

Configuração real: `D:/Apache24/var/use-by-cami/config.php`. A aplicação usa o usuário limitado da loja. Um banco antigo pode precisar que o administrador do banco aplique `ALTER TABLE` da migração; não coloque credenciais administrativas no site para contornar permissões.

## 7. Estado do navegador e eventos

| Item                             | Onde fica                | Uso                                                        |
| -------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `cami-cart`                      | `localStorage`           | Itens da sacola entre visitas                              |
| `cami-favorites`                 | `localStorage`           | Favoritos deste navegador                                  |
| `cami-order-key`                 | `sessionStorage`         | Identifica uma tentativa de compra para evitar duplicidade |
| `cami-order-access`              | `sessionStorage`, legado | Apoio ao vínculo de compras históricas                     |
| `checkoutDraft`                  | Memória da página        | Preserva entrega durante novo login da mesma cliente       |
| Filtros, ordenação, aba da conta | URL                      | Permitem compartilhar pesquisa/restaurar navegação         |

Eventos internos como `cami:customer-expired`, `cami:customer-signed-in`, `cami:password-required` e `cami:order-created` sincronizam conta e sacola. Quando alterar o login, confira os ouvintes em `account.js`, não apenas o formulário que enviou os dados.

O histórico da cliente atualiza a cada 30 segundos quando a página está visível. A visão geral administrativa consulta os últimos pedidos a cada 5 minutos e substitui apenas a lista, preservando editores abertos. Essas consultas não alteram status nem estoque.

## 8. CSS, HTML e imagens

- `style.css`: base, identidade, navegação, cartões, sacola e diálogos compartilhados.
- `customer.css`: filtros, login, conta, histórico e formulários de identificação/troca de senha.
- `admin.css`: layout do painel, tabelas, indicadores e editores.
- Media queries no fim dos arquivos adaptam componentes por largura. A ordem importa: regras posteriores complementam/substituem as anteriores.
- IDs e atributos `data-*` ligam HTML e JavaScript. Renomear um exige atualizar os seletores correspondentes.
- `assets/logo.svg` e `assets/favicon.svg` são vetores locais; `assets/images/` contém imagens da vitrine e `uploads/` recebe fotos do painel.
- Imagens binárias não comportam comentários de código. Fotos demonstrativas não representam estoque real.

## 9. Scripts, configuração e arquivos gerados

| Arquivo/pasta                         | Como interpretar                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `scripts/start-local.ps1`             | Verifica a API e inicia Apache local em janela oculta; MySQL é separado                 |
| `scripts/export-schema.php`           | CLI que sobrescreve `database/schema.sql` com estrutura atual, sem registros            |
| `.htaccess` e os das subpastas        | Bloqueiam acesso a código interno/arquivos de manutenção e restringem uploads           |
| `package.json`                        | Comandos npm e dependências de desenvolvimento; não é necessário Node para servir PHP   |
| `package-lock.json`                   | Versões exatas resolvidas pelo npm; gerado, não deve ser comentado/alterado manualmente |
| `.prettierrc.json`                    | Plugin PHP, versão sintática, aspas, indentação, largura e fim de linha da formatação   |
| `.prettierignore`                     | Exclui bibliotecas, imagens, resultados, uploads e repositório antigo da formatação     |
| `.gitignore`                          | Evita versionar dependências, resultados, uploads e segredos locais                     |
| `playwright.config.cjs`               | Chrome, servidor isolado, um worker, relatórios e traces                                |
| `node_modules/`                       | Bibliotecas externas; instalar pelo npm, não comentar ou editar o código distribuído    |
| `test-results/`, `playwright-report/` | Saídas geradas de teste, não fazem parte da aplicação                                   |
| `loja camile/`                        | Repositório antigo independente, preservado e fora do funcionamento da loja             |

JSON não aceita comentários. Por isso, a explicação de suas configurações fica aqui, preservando arquivos válidos para npm e Prettier.

## 10. Como validar uma alteração

```powershell
npm.cmd test
npm.cmd run format
npm.cmd run format:check
D:/php/php.exe -l app/customer.php
```

`tests/run.cjs` cria uma pasta temporária privada e inicia PHP em `127.0.0.1:8091`. Por padrão, o banco é SQLite isolado. Com `CAMI_TEST_CONFIG`, o banco MySQL indicado deve ser exclusivo de teste; nunca indique o banco real. O runner não apaga automaticamente os registros desse MySQL.

As suítes cobrem loja/estoque, cliente, contas administrativas, senha obrigatória e SQL injection. Algumas são seriais porque um cenário utiliza o cadastro ou pedido criado pelo anterior. `tests/seed-legacy.php` gera compras antigas somente no ambiente de testes, sem reabrir checkout anônimo.

Depois de alterar autenticação, valide conta e sacola. Depois de alterar estoque, valide pedido repetido, falha parcial e cancelamento. Depois de alterar layout, confira celular e computador. Erros internos da API vão para o log PHP; o navegador recebe mensagem genérica, sem detalhes de conexão.

## 11. Regras para quem continuar o projeto

- Use `query($sql, $params)` e mantenha valores externos separados do SQL. Consulte [consultas-seguras.md](consultas-seguras.md).
- Escape texto externo antes de inseri-lo como HTML: `escapeHTML()` na loja e `esc()` no painel.
- Preserve as verificações de conta, CSRF, senha temporária e titularidade também no servidor.
- Mantenha alteração de estoque, pedido e histórico na mesma transação quando fizerem parte da mesma operação.
- Não salve credenciais no código público e não exponha hashes nos retornos da API.
- Atualize os comentários e este mapa quando mudar uma responsabilidade, rota ou fluxo. Comentários desatualizados podem induzir manutenção incorreta.
