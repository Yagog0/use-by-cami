<?php
/**
 * Domínio da cliente, chamado pela API. Contém migrações, sessão da cliente e rotas customer-*.
 * Mantém separado o acesso administrativo e verifica a titularidade dos pedidos.
 * Guia geral: docs/guia-do-codigo.md.
 */
declare(strict_types=1);

// As tabelas complementares são criadas preservando os pedidos e o estoque existentes.
/**
 * Migração v1: cria tabelas complementares sem apagar compras existentes. Arquivo marcador e
 * lock impedem repetir a instalação.
 */
function migrate_customers(): void
{
    if (is_file(DATA_DIR . '/customer-schema-v1')) {
        return;
    }
    $lock = fopen(DATA_DIR . '/customer-migration.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        if (is_file(DATA_DIR . '/customer-schema-v1')) {
            return;
        }
        $mysql = db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $id = $mysql ? 'INTEGER PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $suffix = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
        foreach (
            [
                "CREATE TABLE IF NOT EXISTS customers (id $id, name VARCHAR(150) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, phone VARCHAR(30) NOT NULL, address TEXT NOT NULL, recovery_hash VARCHAR(64) NOT NULL, auth_version INTEGER NOT NULL DEFAULT 1, created_at VARCHAR(30) NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 0)",
                'CREATE TABLE IF NOT EXISTS customer_orders (order_id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(customer_id) REFERENCES customers(id))',
                'CREATE TABLE IF NOT EXISTS order_access (order_id INTEGER PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id))',
                "CREATE TABLE IF NOT EXISTS order_events (id $id, order_id INTEGER NOT NULL, status VARCHAR(30) NOT NULL, created_at VARCHAR(30) NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id))",
                'CREATE TABLE IF NOT EXISTS order_shipping (order_id INTEGER PRIMARY KEY, carrier VARCHAR(100) NOT NULL, tracking_code VARCHAR(100) NOT NULL, tracking_url VARCHAR(500) NOT NULL, updated_at VARCHAR(30) NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id))',
                'CREATE TABLE IF NOT EXISTS customer_attempts (identifier VARCHAR(64) PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL)',
            ]
            as $sql
        ) {
            db()->exec($sql . $suffix);
        }
        // Pedidos anteriores não possuem datas históricas de etapas intermediárias; não inventar essas datas.
        query(
            "INSERT INTO order_events (order_id,status,created_at) SELECT o.id,'pending',o.created_at FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id=o.id)",
        );
        file_put_contents(DATA_DIR . '/customer-schema-v1', date('c'));
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/**
 * Migração v2: adiciona a obrigação de trocar senha. Reconhece a coluna já criada e só então
 * registra o marcador.
 */
function migrate_customer_password_change(): void
{
    if (is_file(DATA_DIR . '/customer-schema-v2')) {
        return;
    }
    $lock = fopen(DATA_DIR . '/customer-migration.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        if (is_file(DATA_DIR . '/customer-schema-v2')) {
            return;
        }
        $mysql = db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $columns = $mysql
            ? query('SHOW COLUMNS FROM customers')->fetchAll(PDO::FETCH_COLUMN)
            : array_column(query('PRAGMA table_info(customers)')->fetchAll(), 'name');
        if (!in_array('must_change_password', $columns, true)) {
            db()->exec(
                'ALTER TABLE customers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0',
            );
        }
        file_put_contents(DATA_DIR . '/customer-schema-v2', date('c'));
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/**
 * Seleciona os campos públicos do cadastro que podem sair na resposta; exclui hash da senha e
 * dados internos de autenticação.
 */
function customer_profile(array $row): array
{
    return array_intersect_key(
        $row,
        array_flip([
            'id',
            'name',
            'email',
            'phone',
            'address',
            'created_at',
            'must_change_password',
        ]),
    );
}
/**
 * Lê a cliente da sessão e compara auth_version. Quando exigido, bloqueia ausência de login ou
 * senha temporária; apenas a troca de senha pode liberar a exceção.
 */
function current_customer(bool $required = false, bool $allowTemporaryPassword = false): ?array
{
    $customer = null;
    if (!empty($_SESSION['customer_id'])) {
        $row = query('SELECT * FROM customers WHERE id=?', [$_SESSION['customer_id']])->fetch();
        if ($row && (int) $row['auth_version'] === (int) ($_SESSION['customer_version'] ?? 0)) {
            $customer = $row;
        } else {
            unset($_SESSION['customer_id'], $_SESSION['customer_version']);
        }
    }
    if (!$customer && $required) {
        fail('Entre na sua conta para continuar.', 401);
    }
    if ($required && !$allowTemporaryPassword && !empty($customer['must_change_password'])) {
        json_response(
            [
                'error' => 'Crie uma nova senha para continuar.',
                'code' => 'password_change_required',
            ],
            403,
        );
    }
    return $customer;
}
/**
 * Renova o ID da sessão e grava ID/versão da cliente autenticada; não altera o administrador
 * conectado.
 */
function customer_sign_in(array $row): void
{
    session_regenerate_id(true);
    $_SESSION['customer_id'] = (int) $row['id'];
    $_SESSION['customer_version'] = (int) $row['auth_version'];
}
/**
 * Normaliza o e-mail para minúsculas e valida o formato antes de consultar ou salvar.
 */
function customer_email(array $b): string
{
    $email = strtolower(text_field($b, 'email', 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Informe um e-mail válido.');
    }
    return $email;
}
/**
 * Aplica a regra de senha compartilhada do bootstrap ao campo solicitado do corpo JSON.
 */
function customer_password(array $b, string $key = 'password'): string
{
    return account_password($b, $key);
}
/**
 * Remove a máscara do telefone e verifica o tamanho; devolve somente dígitos para cadastro e
 * contato.
 */
function customer_phone(array $b): string
{
    $phone = preg_replace('/\D/', '', text_field($b, 'phone', 30));
    if (strlen($phone) < 10 || strlen($phone) > 13) {
        fail('Informe o telefone com DDD.');
    }
    return $phone;
}
/**
 * Conta tentativas por finalidade e IP em janela de tempo. Exceder o limite encerra a requisição
 * com HTTP 429.
 */
function customer_limit(string $purpose, int $limit = 15, int $window = 900): void
{
    $key = hash('sha256', $purpose . '|' . ($_SERVER['REMOTE_ADDR'] ?? 'local'));
    $now = time();
    if (db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        query(
            'INSERT INTO customer_attempts (identifier,attempts,window_start) VALUES (?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(window_start<?,1,attempts+1), window_start=IF(window_start<?,?,window_start)',
            [$key, $now, $now - $window, $now - $window, $now],
        );
    } else {
        query(
            'INSERT INTO customer_attempts (identifier,attempts,window_start) VALUES (?,1,?) ON CONFLICT(identifier) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start<? THEN ? ELSE window_start END',
            [$key, $now, $now - $window, $now - $window, $now],
        );
    }
    if (
        (int) query('SELECT attempts FROM customer_attempts WHERE identifier=?', [
            $key,
        ])->fetchColumn() > $limit
    ) {
        fail('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', 429);
    }
}
/**
 * Recebe ID de pedido e cliente; devolve detalhes somente quando customer_orders comprova o
 * vínculo entre ambos.
 */
function owned_order(int $id, int $customerId): array
{
    // Além do ID parametrizado, exige o vínculo com a cliente autenticada.
    $order = query(
        'SELECT o.id,o.reference,o.customer,o.email,o.phone,o.address,o.subtotal,o.status,o.created_at FROM orders o JOIN customer_orders c ON c.order_id=o.id WHERE o.id=? AND c.customer_id=?',
        [$id, $customerId],
    )->fetch();
    if (!$order) {
        fail('Pedido não encontrado na sua conta.', 404);
    }
    return decorate_customer_order($order);
}
/**
 * Acrescenta itens, eventos e rastreio ao pedido já autorizado para compor a resposta da API.
 */
function decorate_customer_order(array $order): array
{
    $order['items'] = query(
        'SELECT i.name,i.quantity,i.price,p.image FROM order_items i JOIN variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id WHERE i.order_id=? ORDER BY i.id',
        [$order['id']],
    )->fetchAll();
    $order['events'] = query(
        'SELECT status,created_at FROM order_events WHERE order_id=? ORDER BY id',
        [$order['id']],
    )->fetchAll();
    $order['shipping'] =
        query(
            'SELECT carrier,tracking_code,tracking_url,updated_at FROM order_shipping WHERE order_id=?',
            [$order['id']],
        )->fetch() ?:
        null;
    return $order;
}

/**
 * Valida cadastro, gera hash e insere customers. Retorna a linha criada; não autentica sozinha,
 * pois também atende ao painel.
 */
function create_customer(array $data): array
{
    $email = customer_email($data);
    $password = customer_password($data);
    $name = text_field($data, 'name');
    $phone = customer_phone($data);
    $address = text_field($data, 'address', 700, false);
    try {
        // recovery_hash permanece somente para compatibilidade com bancos já instalados.
        query(
            'INSERT INTO customers (name,email,password,phone,address,recovery_hash,created_at) VALUES (?,?,?,?,?,?,?)',
            [
                $name,
                $email,
                password_hash($password, PASSWORD_DEFAULT),
                $phone,
                $address,
                '',
                date('c'),
            ],
        );
    } catch (PDOException $error) {
        if (query('SELECT id FROM customers WHERE email=?', [$email])->fetch()) {
            fail('Já existe uma conta com esse e-mail.', 409);
        }
        throw $error;
    }
    return query('SELECT * FROM customers WHERE id=?', [(int) db()->lastInsertId()])->fetch();
}

/**
 * Despacha ações customer-* por método HTTP. Cadastro/login/logout vêm antes da barreira da
 * conta; demais ações exigem titularidade e senha definitiva.
 */
function customer_routes(string $action, string $method): void
{
    if (in_array($action, ['customer-recover', 'customer-recovery-code'], true)) {
        fail('A recuperação de senha agora é feita pelo atendimento da loja.', 410);
    }
    // POST público: limita tentativas, cria cadastro com hash e inicia sessão da nova cliente.
    if ($action === 'customer-register' && $method === 'POST') {
        customer_limit('register', 8, 3600);
        $b = body();
        $row = create_customer($b);
        customer_sign_in($row);
        json_response(['customer' => customer_profile($row)], 201);
    }
    // POST público: verifica credenciais e inicia sessão; senha temporária continua marcada até a troca obrigatória.
    if ($action === 'customer-login' && $method === 'POST') {
        customer_limit('login');
        $b = body();
        $email = customer_email($b);
        $row = query('SELECT * FROM customers WHERE email=?', [$email])->fetch();
        $hash = $row['password'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        if (!password_verify((string) ($b['password'] ?? ''), $hash) || !$row) {
            fail('E-mail ou senha incorretos.', 401);
        }
        customer_sign_in($row);
        json_response(['customer' => customer_profile($row)]);
    }
    // POST: encerra somente a sessão da cliente e renova o identificador do cookie.
    if ($action === 'customer-logout' && $method === 'POST') {
        unset($_SESSION['customer_id'], $_SESSION['customer_version']);
        session_regenerate_id(true);
        json_response(['ok' => true]);
    }
    $customer = current_customer(true, $action === 'customer-password' && $method === 'POST');
    // GET retorna dados autorizados; POST atualiza o cadastro e exige senha atual se o e-mail mudar.
    if ($action === 'customer-profile' && $method === 'GET') {
        json_response(['customer' => customer_profile($customer)]);
    }
    // GET retorna dados autorizados; POST atualiza o cadastro e exige senha atual se o e-mail mudar.
    if ($action === 'customer-profile' && $method === 'POST') {
        $b = body();
        $name = text_field($b, 'name');
        $phone = customer_phone($b);
        $address = text_field($b, 'address', 700, false);
        $email = isset($b['email']) ? customer_email($b) : $customer['email'];
        $changedEmail = $email !== $customer['email'];
        if ($changedEmail) {
            customer_limit('email', 8);
            if (!password_verify((string) ($b['current_password'] ?? ''), $customer['password'])) {
                fail('Informe sua senha atual para alterar o e-mail.');
            }
        }
        try {
            $updated = query(
                'UPDATE customers SET name=?,phone=?,address=?,email=?,auth_version=auth_version+? WHERE id=? AND auth_version=?',
                [
                    $name,
                    $phone,
                    $address,
                    $email,
                    $changedEmail ? 1 : 0,
                    $customer['id'],
                    $customer['auth_version'],
                ],
            );
        } catch (PDOException $e) {
            if (
                query('SELECT id FROM customers WHERE email=? AND id<>?', [
                    $email,
                    $customer['id'],
                ])->fetch()
            ) {
                fail('Este e-mail já está sendo usado por outra conta.', 409);
            }
            throw $e;
        }
        if ($changedEmail) {
            if (!$updated->rowCount()) {
                fail('Sua sessão mudou. Entre novamente.', 409);
            }
            $_SESSION['customer_version'] = (int) $customer['auth_version'] + 1;
            session_regenerate_id(true);
        }
        json_response([
            'customer' => customer_profile(
                query('SELECT * FROM customers WHERE id=?', [$customer['id']])->fetch(),
            ),
        ]);
    }
    // POST: verifica senha atual, rejeita reutilizar a temporária e salva nova senha, liberando acesso e invalidando sessões anteriores.
    if ($action === 'customer-password' && $method === 'POST') {
        customer_limit('password', 8);
        $b = body();
        $password = customer_password($b);
        if (!password_verify((string) ($b['current_password'] ?? ''), $customer['password'])) {
            fail('A senha atual está incorreta.');
        }
        if (
            !empty($customer['must_change_password']) &&
            password_verify($password, $customer['password'])
        ) {
            fail('Escolha uma senha diferente da senha temporária.');
        }
        $changed = query(
            'UPDATE customers SET password=?,must_change_password=0,auth_version=auth_version+1 WHERE id=? AND auth_version=?',
            [
                password_hash($password, PASSWORD_DEFAULT),
                $customer['id'],
                $customer['auth_version'],
            ],
        );
        if (!$changed->rowCount()) {
            fail('Seu acesso foi atualizado. Entre novamente.', 409);
        }
        $_SESSION['customer_version'] = (int) $customer['auth_version'] + 1;
        session_regenerate_id(true);
        json_response(['ok' => true]);
    }
    // POST: consome uma única vez o código privado de compra antiga e cria seu vínculo com a cliente autenticada.
    if ($action === 'customer-claim' && $method === 'POST') {
        customer_limit('claim', 12);
        $b = body();
        $reference = strtoupper(text_field($b, 'reference', 40));
        $hash = hash('sha256', text_field($b, 'access_code', 100));
        $order = query(
            'SELECT o.id,a.token_hash FROM orders o JOIN order_access a ON a.order_id=o.id WHERE o.reference=?',
            [$reference],
        )->fetch();
        if (!$order || !hash_equals($order['token_hash'], $hash)) {
            fail('Confira o número do pedido e o código privado.', 422);
        }
        db()->beginTransaction();
        // O código só pode ser usado uma vez: consumi-lo e atribuir a compra formam uma única transação.
        $removed = query('DELETE FROM order_access WHERE order_id=? AND token_hash=?', [
            $order['id'],
            $hash,
        ]);
        if (!$removed->rowCount()) {
            db()->rollBack();
            fail('Pedido já vinculado ou código utilizado.', 409);
        }
        try {
            query('INSERT INTO customer_orders (order_id,customer_id) VALUES (?,?)', [
                $order['id'],
                $customer['id'],
            ]);
        } catch (PDOException $e) {
            db()->rollBack();
            fail('Este pedido já está vinculado a uma conta.', 409);
        }
        db()->commit();
        json_response(['order' => owned_order((int) $order['id'], (int) $customer['id'])]);
    }
    // GET: filtra e pagina apenas pedidos vinculados à cliente conectada; retorna itens, etapas e rastreio.
    if ($action === 'customer-orders' && $method === 'GET') {
        $page = integer($_GET['page'] ?? 1, 1, 100000);
        $status = (string) ($_GET['status'] ?? '');
        if (
            !in_array(
                $status,
                ['', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
                true,
            )
        ) {
            fail('Status inválido.');
        }
        // As partes concatenadas abaixo são fixas; status e IDs são parâmetros.
        $params = [$customer['id']];
        $where = ' WHERE c.customer_id=?';
        if ($status !== '') {
            $where .= ' AND o.status=?';
            $params[] = $status;
        }
        $total = (int) query(
            'SELECT COUNT(*) FROM orders o JOIN customer_orders c ON c.order_id=o.id' . $where,
            $params,
        )->fetchColumn();
        $offset = ($page - 1) * 12;
        $rows = query(
            'SELECT o.id,o.reference,o.customer,o.subtotal,o.status,o.created_at FROM orders o JOIN customer_orders c ON c.order_id=o.id' .
                $where .
                ' ORDER BY o.id DESC LIMIT ? OFFSET ?',
            [...$params, 12, $offset],
        )->fetchAll();
        json_response([
            'orders' => array_map('decorate_customer_order', $rows),
            'total' => $total,
            'page' => $page,
            'pages' => max(1, (int) ceil($total / 12)),
        ]);
    }
    // GET: valida o ID e consulta um pedido próprio; pedido de outra conta não é revelado.
    if ($action === 'customer-order' && $method === 'GET') {
        json_response([
            'order' => owned_order(
                integer($_GET['id'] ?? 0, 1, PHP_INT_MAX),
                (int) $customer['id'],
            ),
        ]);
    }
    // GET: baixa cadastro e histórico próprios como JSON, sem senha, hashes ou dados de outras clientes.
    if ($action === 'customer-export' && $method === 'GET') {
        $rows = query(
            'SELECT o.id,o.reference,o.customer,o.email,o.phone,o.address,o.subtotal,o.status,o.created_at FROM orders o JOIN customer_orders c ON c.order_id=o.id WHERE c.customer_id=? ORDER BY o.id DESC',
            [$customer['id']],
        )->fetchAll();
        header('Content-Disposition: attachment; filename="meus-dados-use-by-cami.json"');
        json_response([
            'exported_at' => date('c'),
            'customer' => customer_profile($customer),
            'orders' => array_map('decorate_customer_order', $rows),
        ]);
    }
    fail('Recurso não encontrado.', 404);
}
