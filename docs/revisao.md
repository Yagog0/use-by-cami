# Revisão da loja — 24/09/2026

## Atualização: senha temporária após redefinição

Redefinir a senha de uma cliente pelo painel agora marca a troca como obrigatória. Após entrar com a senha temporária, ela precisa criar outra senha (mínimo de 6 caracteres, diferente da temporária). O servidor bloqueia conta, histórico, exportação e checkout até concluir a troca. A tela também funciona na sacola sem remover as peças, e a exigência persiste ao recarregar a página.

A migração `customer-schema-v2` adicionou `customers.must_change_password` no MySQL real. A manutenção utilizou acesso administrativo apenas para adicionar a coluna; o site continua usando o usuário limitado. Conferência antes/depois confirmou que IDs, senhas e versões dos acessos existentes não foram alterados. A regra passa a valer nas próximas redefinições feitas pelo painel.

A suíte completa passou com **33 testes**, incluindo troca obrigatória na conta e na sacola, bloqueio direto na API, rejeição da senha temporária como nova senha e invalidação de outros acessos após a troca.

## Entregas

- Senhas novas com mínimo de 6 caracteres, validadas no navegador e no PHP; hashes preservados no banco.
- Código de recuperação de senha removido do cadastro, da sacola e da área da cliente. Endpoints antigos desativados.
- Recuperação pelo atendimento: o painel permite redefinir a senha após conferência da identidade e confirmação da senha administrativa. Sessões antigas da cliente são invalidadas.
- Áreas **Clientes** e **Administradores** no painel. Cadastro de clientes por nome/e-mail/telefone/endereço e cadastro de administradores por e-mail, sem trocar a conta autenticada da equipe.
- Sessões administrativas identificadas pelo administrador que entrou. As ações de criação e redefinição registram IDs no log, sem senhas.
- Formulários administrativos fecham e limpam os dados quando a sessão expira.
- Scripts e estilos separados em `assets/js/` e `assets/css/`; telas reutilizadas em `app/views/`. Links públicos preservados.
- Código formatado com Prettier e plugin PHP, comandos de formatação adicionados e documentação atualizada.
- Regras Apache ativadas para impedir acesso a arquivos de teste, dependências e repositórios Git, incluindo o repositório antigo dentro de `loja camile/`.

## Validação realizada

- Suíte completa de 30 testes aprovada em SQLite isolado: catálogo, compra, estoque, cancelamento, idempotência, autenticação, dados privados, rastreio, cadastro, recuperação assistida e layout mobile.
- Após a correção da sessão administrativa expirada, suíte de administração ampliada para 7 testes e aprovada, incluindo o novo cenário. São 31 cenários distintos no conjunto atual.
- PHP verificado com `php -l` e scripts com `node --check`.
- Loja, catálogo, conta e painel abertos no Apache real da porta 8080, sem erros de JavaScript ou falhas no carregamento de recursos.
- Conferência HTTP: páginas e recursos públicos retornam 200; arquivos internos consultados retornam 403, incluindo `playwright.config.cjs` e `loja camile/.git/HEAD`.
- Consulta somente de leitura ao MySQL real confirmou a conexão com `use_by_cami`. Nenhum cadastro, pedido ou estoque real foi alterado por esta revisão.

Os testes automatizados verificam cenários definidos; não representam garantia de ausência de qualquer falha em produção. A suíte desta revisão usa SQLite; a conferência do MySQL real foi de conexão e leitura, sem simular vendas no banco da loja.

## Configuração ainda pendente da loja

- WhatsApp e Instagram continuam vazios, conforme solicitado anteriormente. Preencha o WhatsApp em **Configurações** para o botão de recuperação abrir o atendimento.
- Fotos, produtos e aviso de demonstração precisam refletir o catálogo real antes da divulgação.
- Frete e pagamento continuam combinados manualmente. Não há cobrança automática, envio de e-mail de recuperação nem rastreio integrado à transportadora.
- Todos os administradores têm acesso completo. Esta versão não separa permissões por função.

## Preservação

As tabelas e registros existentes foram mantidos. A coluna antiga `customers.recovery_hash` permanece para compatibilidade, sem uso na recuperação. O repositório Git antigo foi preservado, sem participar da execução do site.

Uma cópia do código anterior à revisão foi guardada fora da pasta pública em `D:/Apache24/var/use-by-cami/code-before-review-20260923.zip`. Ela é uma cópia do código, não um backup do banco de dados.
