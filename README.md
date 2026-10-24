# Use by Cami

![PHP](https://img.shields.io/badge/PHP-777BB4?logo=php&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?logo=mysql&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)

Loja de roupas com catálogo, sacola, área da cliente e painel administrativo. Desenvolvida em **PHP e JavaScript**, com suporte a MySQL e SQLite. Pasta de origem: **loja camile**.

## Funcionalidades

- Catálogo com busca e filtros de categoria, tamanho, cor, preço e disponibilidade.
- Sacola, cadastro, login e criação de pedidos com reserva de estoque.
- Área da cliente com acompanhamento de pedidos e atualização de dados.
- Gestão administrativa de produtos, fotos, variações, estoque e pedidos.
- Administração de contas e exigência de troca de senha temporária.

Frete, entrega e pagamento são combinados no atendimento. O projeto não processa pagamentos com cartão/Pix nem calcula frete automaticamente.

## Executar localmente

Requisitos: **PHP 8.2+**, extensões PDO SQLite (ou PDO MySQL), fileinfo e mbstring. Node.js é opcional e serve para testes e formatação.

Exemplo para desenvolvimento no Windows PowerShell, na raiz do projeto:

```powershell
$env:CAMI_DATA_DIR = Join-Path $env:LOCALAPPDATA 'UseByCami-dev'
php -S 127.0.0.1:8000
```

Abra **http://127.0.0.1:8000**. Sem configuração de MySQL, a aplicação usa SQLite e cria a estrutura automaticamente. No primeiro acesso local ao painel, cadastre o administrador; não existe senha padrão.

O servidor embutido é destinado ao desenvolvimento local. Para hospedagem com Apache e MySQL, consulte a documentação e mantenha `CAMI_DATA_DIR` fora da pasta pública.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `index.php`, `catalogo.php`, `conta.php` | Páginas públicas |
| `admin/`, `api/` | Painel e endpoints |
| `app/` | Sessões, banco, validações e regras de negócio |
| `assets/` | Estilos, scripts e imagens demonstrativas |
| `database/` | Estrutura SQL sem dados ou credenciais |
| `tests/`, `scripts/` | Verificações e manutenção |
| `docs/` | Guias técnicos e configuração |

## Documentação

- [Guia do código e dos fluxos](docs/guia-do-codigo.md)
- [Consultas SQL e parâmetros](docs/consultas-seguras.md)
- [Revisão técnica](docs/revisao.md)
- [Referência detalhada e notas do ambiente original](docs/CONFIGURACAO-LOCAL.md)

## Desenvolvimento

```sh
npm ci
npm test
npm run format:check
```

Os testes usam banco separado. Consulte a referência detalhada para configurar PHP e o navegador exigidos pela suíte.

## Dados locais

Configurações privadas, bancos, dependências, resultados de testes e imagens enviadas para `uploads/` ficam fora do versionamento. O repositório contém o código e os recursos demonstrativos; não inclui contas, pedidos ou o banco usado no computador de origem.

## Autor

[Yago Maba · @Yagog0](https://github.com/Yagog0)
