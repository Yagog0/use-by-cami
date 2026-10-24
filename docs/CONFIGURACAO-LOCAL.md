# Use by Cami

Para entender o código e continuar o desenvolvimento, comece pelo [guia de manutenção e fluxos](guia-do-codigo.md). Ele conecta páginas, funções, API, tabelas, configurações e testes; os arquivos próprios também têm comentários locais em português.

Loja de roupas em PHP, MySQL e JavaScript, com catálogo, filtros, sacola, pedidos, área da cliente e painel administrativo. Node é usado apenas para testes e formatação.

## Acessos locais

- [Loja](http://localhost:8080/Projetos/loja%20camile/)
- [Catálogo completo](http://localhost:8080/Projetos/loja%20camile/catalogo.php)
- [Minha conta](http://localhost:8080/Projetos/loja%20camile/conta.php)
- [Painel administrativo](http://localhost:8080/Projetos/loja%20camile/admin/)

O Apache da porta 8080 aceita conexões deste computador. Para iniciá-lo após reiniciar o Windows, execute `scripts/start-local.ps1`. O MySQL também precisa estar em execução.

## Como administrar

1. No primeiro acesso local, cadastre o administrador. Não existe senha padrão.
2. Em **Produtos e estoque**, cadastre produtos, fotos, preços e variações de tamanho/cor. Entradas somam estoque; saídas subtraem. Cada movimentação possui motivo.
3. Em **Pedidos**, consulte compras, confirme o pagamento combinado, atualize etapas e informe o rastreio. Cancelar um pedido pendente ou confirmado devolve o estoque uma única vez.
4. Em **Clientes**, busque por nome/e-mail, cadastre outras pessoas ou use **Redefinir senha** após confirmar a identidade da cliente no atendimento. Informe a nova senha e confirme sua própria senha administrativa. Os acessos anteriores da cliente são encerrados.
5. Em **Administradores**, use **Novo administrador** para adicionar outro acesso por e-mail e senha. Confirme sua senha atual. Todos os administradores têm acesso completo ao painel; contas de cliente não recebem acesso administrativo.
6. Em **Configurações**, preencha WhatsApp e Instagram. Foram deixados vazios a pedido do proprietário. O WhatsApp também será usado no botão de ajuda para recuperar acesso.

Ao cadastrar uma pessoa pelo painel, combine a entrega da senha pelo atendimento. Ela pode alterá-la em **Minha conta → Acesso e segurança**. A criação de uma cliente não troca a sessão do administrador.

## Contas e senhas

- Mínimo de **6 caracteres**, tanto para clientes quanto para administradores. O limite técnico é 72 bytes; caracteres acentuados podem ocupar mais de um byte.
- Senhas são armazenadas como hash com `password_hash()` e verificadas com `password_verify()`. A API e o painel nunca retornam o hash.
- Não há mais geração ou uso de código de recuperação de senha. **Esqueci minha senha** direciona ao atendimento da loja. Não há envio automático por e-mail.
- A coluna antiga `customers.recovery_hash` foi mantida por compatibilidade com bancos já instalados. Novas contas gravam esse campo vazio; os endpoints antigos foram desativados.
- Trocar ou redefinir a senha encerra os demais acessos da cliente. Alterar o e-mail exige a senha atual.
- Ao **redefinir** a senha pelo painel, ela se torna temporária. No próximo login, a cliente precisa escolher uma senha diferente antes de acessar dados, pedidos ou finalizar compras. A exigência permanece após recarregar a página e também aparece na sacola, preservando os itens. Cadastros normais e senhas existentes não mudam automaticamente.
- Após esta atualização, administradores conectados pelo formato antigo de sessão precisam entrar novamente.

## Como as compras funcionam

O catálogo permite combinar busca, categoria, tamanho, cor, preços e disponibilidade. **Descobrir mais peças** na página inicial abre o catálogo sem filtros. Os favoritos ficam no navegador.

Cadastro e login são obrigatórios para finalizar. A sacola oferece entrada/cadastro sem perder os itens. O preço é calculado no servidor e a criação do pedido reserva o estoque em uma transação. Repetir a mesma solicitação não gera duas compras.

A cliente acompanha pedidos, etapas e rastreio em **Minha conta**, atualiza dados e baixa seu histórico. Cada conta consulta apenas os próprios pedidos.

Frete, entrega e pagamento são combinados no atendimento: o site não cobra cartão/Pix, não calcula frete e não sincroniza rastreio automaticamente. Reservas não expiram; pedidos abandonados precisam ser cancelados no painel. O painel lista até 200 pedidos e 100 movimentações recentes; o histórico da cliente é paginado.

Compras históricas sem conta continuam podendo ser vinculadas por código privado do pedido ou pelo administrador após conferência de titularidade. Esse código histórico de compra é diferente do código de recuperação de senha removido. Novas compras já são vinculadas automaticamente.

## Pastas

| Caminho                                  | Responsabilidade                                   |
| ---------------------------------------- | -------------------------------------------------- |
| `index.php`, `catalogo.php`, `conta.php` | Entradas públicas da loja                          |
| `admin/`                                 | Entrada do painel administrativo                   |
| `api/index.php`                          | Entrada da API de produtos, estoque e pedidos      |
| `app/bootstrap.php`                      | Banco, sessão, validações e instalação             |
| `app/customer.php`                       | Contas e pedidos das clientes                      |
| `app/admin-accounts.php`                 | Cadastro de administradores/clientes e redefinição |
| `app/views/`                             | Telas PHP reutilizadas                             |
| `assets/js/`                             | Scripts da loja, contas e painel                   |
| `assets/css/`                            | Estilos organizados por área                       |
| `assets/images/`                         | Fotografias e imagens locais                       |
| `uploads/`                               | Fotos enviadas pela loja                           |
| `database/`                              | Estrutura SQL, sem dados nem credenciais           |
| `scripts/`                               | Inicialização local e exportação do schema         |
| `tests/`                                 | Testes automatizados em banco separado             |
| `docs/`                                  | Documentação técnica e revisão                     |


## Banco e manutenção

Banco real: `use_by_cami`, em `127.0.0.1:3306`. O site usa o usuário limitado `cami_app`, não root. Configuração privada: `D:/Apache24/var/use-by-cami/config.php`, fora da pasta pública. Faça backup do banco, da configuração privada e de `uploads/`.

A coluna `customers.must_change_password` registra a troca obrigatória. A migração v2 já foi aplicada neste computador. Em outro banco antigo, se o usuário da aplicação não tiver permissão `ALTER`, um administrador do banco deve executar `ALTER TABLE customers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0` uma única vez. A aplicação reconhece a coluna existente sem modificar as senhas. Instalações novas já criam a coluna.

Para exportar somente a estrutura: `D:/php/php.exe scripts/export-schema.php`. Não importe `database/schema.sql` por cima do banco existente.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run format
npm.cmd run format:check
```

Os testes usam PHP na porta 8091, Chrome instalado e SQLite temporário fora da pasta pública. Não criam contas nem pedidos na loja real. `PHP_BIN` permite escolher o executável PHP. `CAMI_TEST_CONFIG` aceita configuração de MySQL exclusivo para testes: nunca use o banco real.

A formatação é definida em `.prettierrc.json`, com Prettier e plugin PHP. A revisão está em [docs/revisao.md](revisao.md).

As consultas usam prepared statements centralizados, com parâmetros tipados e preparação nativa no MySQL. Veja os comentários no código e o padrão para novas consultas em [docs/consultas-seguras.md](consultas-seguras.md).

## API

Entrada: `api/index.php?action=...`, respostas JSON e sessão HTTP-only na mesma origem. Alterações exigem o token de `GET session` no cabeçalho `X-CSRF-Token`.

| Método   | Action                                                   | Finalidade                                                 |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| GET      | `session`, `products`                                    | Sessão, CSRF, configurações públicas e catálogo            |
| POST     | `setup`, `login`, `logout`                               | Primeiro acesso local e autenticação administrativa        |
| POST     | `checkout`                                               | Pedido; exige cliente autenticada                          |
| GET      | `dashboard`, `products&all=1`                            | Painel; exige administrador                                |
| POST     | `product`, `stock`, `settings`, `upload`                 | Gestão da loja; exige administrador                        |
| POST     | `order-status`, `order-shipping`, `order-link-customer`  | Etapas, rastreio e vínculo de pedidos; administrador       |
| POST     | `customer-register`, `customer-login`, `customer-logout` | Acesso de cliente                                          |
| GET/POST | `customer-profile`                                       | Próprio cadastro                                           |
| POST     | `customer-password`                                      | Troca da própria senha com `current_password` e `password` |
| GET      | `customer-orders`, `customer-order`, `customer-export`   | Histórico paginado, detalhes e exportação da própria conta |
| POST     | `customer-claim`                                         | Vínculo de compra histórica com código privado do pedido   |
| GET/POST | `admin-accounts`                                         | Listar/criar administradores                               |
| GET/POST | `admin-customers`                                        | Listar/criar clientes; consulta aceita `q` e `page`        |
| POST     | `admin-customer-password`                                | Redefinir senha de cliente                                 |

Os endpoints `admin-*` exigem sessão administrativa. Mutações também exigem `current_password`. Criar administrador recebe `email` e `password`; criar cliente acrescenta `name`, `phone` e `address` opcional. Redefinir senha recebe `id`, `password` e `identity_confirmed: true`. As ações registram IDs no log PHP, sem senhas. Os antigos `customer-recover` e `customer-recovery-code` retornam HTTP 410.

`checkout` recebe `customer`, `phone`, `address`, `request_key` e `items` (lista com `variant_id` e `quantity`). O e-mail vem da conta autenticada e os preços vêm do banco. Gere a chave com `crypto.randomUUID()` e mantenha-a em novas tentativas da mesma compra após falha de conexão.

## Hospedagem

Use PHP 8.2+ com PDO MySQL, fileinfo e mbstring, Apache com PHP habilitado e MySQL. Defina `CAMI_DATA_DIR` para uma pasta privada fora de `DocumentRoot`. O `config.php` deve retornar `driver`, `host`, `port`, `database`, `user` e `password`. Crie o banco vazio; a primeira chamada da API cria a estrutura. Sem configuração, usa SQLite com PDO SQLite.

Ative os `.htaccess` incluídos (`AllowOverride All` no diretório da loja) ou replique suas restrições no servidor. Os diretórios internos, dependências, resultados de teste e repositórios Git não devem ser servidos. Configure HTTPS e os dados comerciais antes de publicar.

As imagens atuais incluem exemplos gerados por IA e uma foto ilustrativa do Unsplash. Substitua fotos, preços e estoque pelos produtos reais e desative o aviso de demonstração quando estiver pronto para vender.

