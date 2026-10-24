<?php
/**
 * Gestão de acessos, chamada por api/index.php para ações admin-*. Lista/cria administradores e
 * clientes e permite redefinir a senha de uma cliente após conferência no atendimento.
 * Guia geral: docs/guia-do-codigo.md.
 */
declare(strict_types=1);

/**
 * Revalida a senha do administrador atual e limita tentativas. Retorna o autor da ação para
 * registrar seu ID no log.
 */
function confirm_admin_password(array $data): array
{
    admin();
    customer_limit('admin-account-change', 15);
    $account = query('SELECT * FROM admins WHERE id=?', [$_SESSION['admin_id']])->fetch();
    if (!password_verify((string) ($data['current_password'] ?? ''), $account['password'])) {
        fail('Confirme sua senha de administrador para continuar.', 422);
    }
    return $account;
}

/**
 * Exige administrador em todas as rotas. Mutações também exigem sua senha; respostas nunca
 * incluem hashes e redefinições invalidam sessões antigas.
 */
function admin_account_routes(string $action, string $method): void
{
    admin();
    // GET lista acessos administrativos; POST confirma senha do autor e cria outro administrador com hash.
    if ($action === 'admin-accounts' && $method === 'GET') {
        json_response(['admins' => query('SELECT id,email FROM admins ORDER BY id')->fetchAll()]);
    }
    // GET lista acessos administrativos; POST confirma senha do autor e cria outro administrador com hash.
    if ($action === 'admin-accounts' && $method === 'POST') {
        $data = body();
        $actor = confirm_admin_password($data);
        $email = customer_email($data);
        $password = account_password($data);
        try {
            query('INSERT INTO admins (email,password) VALUES (?,?)', [
                $email,
                password_hash($password, PASSWORD_DEFAULT),
            ]);
        } catch (PDOException $error) {
            if (query('SELECT id FROM admins WHERE email=?', [$email])->fetch()) {
                fail('Já existe um administrador com esse e-mail.', 409);
            }
            throw $error;
        }
        $id = (int) db()->lastInsertId();
        error_log("Admin {$actor['id']} created admin $id");
        json_response(['admin' => ['id' => $id, 'email' => $email]], 201);
    }
    // GET busca clientes por nome/e-mail com paginação; POST confirma senha administrativa e cadastra sem trocar a sessão.
    if ($action === 'admin-customers' && $method === 'GET') {
        $search = trim((string) ($_GET['q'] ?? ''));
        if (strlen($search) > 190) {
            fail('Busca muito longa.');
        }
        $page = integer($_GET['page'] ?? 1, 1, 100000);
        // Só a cláusula fixa varia; o texto de busca continua fora da estrutura SQL.
        $where = $search === '' ? '' : ' WHERE name LIKE ? OR email LIKE ?';
        $params = $search === '' ? [] : ['%' . $search . '%', '%' . $search . '%'];
        $total = (int) query('SELECT COUNT(*) FROM customers' . $where, $params)->fetchColumn();
        $offset = ($page - 1) * 20;
        $rows = query(
            'SELECT id,name,email,phone,address,created_at FROM customers' .
                $where .
                ' ORDER BY id DESC LIMIT ? OFFSET ?',
            [...$params, 20, $offset],
        )->fetchAll();
        json_response([
            'customers' => $rows,
            'total' => $total,
            'page' => $page,
            'pages' => max(1, (int) ceil($total / 20)),
        ]);
    }
    // GET busca clientes por nome/e-mail com paginação; POST confirma senha administrativa e cadastra sem trocar a sessão.
    if ($action === 'admin-customers' && $method === 'POST') {
        $data = body();
        $actor = confirm_admin_password($data);
        $customer = create_customer($data);
        error_log("Admin {$actor['id']} created customer {$customer['id']}");
        json_response(['customer' => customer_profile($customer)], 201);
    }
    // POST: exige confirmação de identidade e senha administrativa; define senha temporária e encerra acessos antigos da cliente.
    if ($action === 'admin-customer-password' && $method === 'POST') {
        $data = body();
        $actor = confirm_admin_password($data);
        $id = integer($data['id'] ?? 0, 1, PHP_INT_MAX);
        if (($data['identity_confirmed'] ?? false) !== true) {
            fail('Confirme a identidade da cliente antes de redefinir a senha.');
        }
        $password = account_password($data);
        $updated = query(
            'UPDATE customers SET password=?,recovery_hash=?,must_change_password=1,auth_version=auth_version+1 WHERE id=?',
            [password_hash($password, PASSWORD_DEFAULT), '', $id],
        );
        if (!$updated->rowCount()) {
            fail('Cliente não encontrada.', 404);
        }
        error_log("Admin {$actor['id']} reset password for customer $id");
        json_response(['ok' => true]);
    }
    fail('Recurso não encontrado.', 404);
}
