# Consultas SQL e comentários de segurança

A aplicação já usava prepared statements por meio de `query()`. A revisão manteve esse modelo, adicionou parâmetros tipados e parametrizou também `LIMIT` e `OFFSET`. Os deslocamentos anteriores já eram inteiros validados; não foi identificada injeção SQL nesses pontos.

## Padrão para novas consultas

```php
$email = customer_email($dados);
$cliente = query('SELECT id,name FROM customers WHERE email=?', [$email])->fetch();
```

O comando e os dados são enviados separadamente ao PDO. Nunca monte SQL concatenando valores de formulário, URL, cookie ou sessão. Não use `addslashes()` como substituto de parâmetros e não remova apóstrofos de nomes legítimos.

`app/bootstrap.php` centraliza `prepare()`, `bindValue()` e `execute()`. Inteiros, booleanos, valores nulos e strings recebem o tipo correspondente. No MySQL, a emulação de prepared statements permanece desativada.

## Partes dinâmicas permitidas

- Filtros opcionais selecionam trechos fixos de SQL; os valores de busca/status são parâmetros.
- Ordenação e nomes de tabelas/colunas devem vir de listas fixas definidas no código. Placeholders não representam identificadores SQL.
- A exportação do schema usa apenas os nomes de tabelas da lista interna.
- `exec()` é usado em instalação/migrações e configurações SQLite com SQL definido no código, sem conteúdo de requisições.
- A busca `LIKE` aceita seus curingas usuais (`%` e `_`); eles não alteram a estrutura da consulta.

## Outras verificações

Prepared statements não substituem autorização: as consultas de pedidos também exigem o ID da cliente autenticada. Alterações exigem CSRF; operações administrativas exigem login administrativo. IDs, quantidades, páginas e status são validados antes da consulta. Erros internos não são enviados ao navegador.

Os comentários no código documentam esses limites, as transações de estoque e o fluxo das consultas. A suíte `tests/zzzz-sql-safety.spec.cjs` verifica tentativas de injeção no login, busca, IDs e paginação, além de nomes legítimos com apóstrofo. Os testes usam banco isolado.
