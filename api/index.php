<?php
/**
 * Entrada HTTP da API. Carrega bootstrap/domínios, executa migrações e verifica CSRF antes de
 * despachar action + método. Rotas públicas/cliente vêm primeiro; após admin(), as demais exigem
 * administrador. Cada json_response() encerra a requisição. Exceções são registradas no log, com
 * rollback e mensagem genérica ao navegador.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

require __DIR__ . '/../app/bootstrap.php';
require __DIR__ . '/../app/customer.php';
require __DIR__ . '/../app/admin-accounts.php';
try {
    if (!is_file(DATA_DIR . '/installed')) {
        $initLock = fopen(DATA_DIR . '/install.lock', 'c');
        flock($initLock, LOCK_EX);
        if (!is_file(DATA_DIR . '/installed')) {
            migrate();
            file_put_contents(DATA_DIR . '/installed', date('c'));
        }
        flock($initLock, LOCK_UN);
        fclose($initLock);
    }
    migrate_customers();
    migrate_customer_password_change();
    $action = $_GET['action'] ?? 'products';
    $method = $_SERVER['REQUEST_METHOD'];
    // Toda alteração exige CSRF; cada rota também verifica a conta necessária.
    if ($method !== 'GET') {
        csrf();
    }
    if (str_starts_with($action, 'admin-')) {
        admin_account_routes($action, $method);
    }
    if (str_starts_with($action, 'customer-')) {
        customer_routes($action, $method);
    }
    // GET público: fornece CSRF, situação dos acessos e configurações para iniciar as telas.
    if ($action === 'session' && $method === 'GET') {
        $customer = current_customer();
        json_response([
            'csrf' => $_SESSION['csrf'],
            'customer' => $customer ? customer_profile($customer) : null,
            'admin' => (bool) current_admin(),
            'needsSetup' => !(bool) query('SELECT COUNT(*) FROM admins')->fetchColumn(),
            'local' => local_request(),
            'settings' => settings(),
        ]);
    }
    // GET: catálogo ativo público; all=1 exige administrador. Acrescenta variações de cada produto.
    if ($action === 'products' && $method === 'GET') {
        $all = !empty($_GET['all']);
        if ($all) {
            admin();
        }
        $products = query(
            'SELECT * FROM products' .
                ($all ? '' : ' WHERE active=1') .
                ' ORDER BY featured DESC,id ASC',
        )->fetchAll();
        foreach ($products as &$p) {
            $p['variants'] = query('SELECT * FROM variants WHERE product_id=? ORDER BY id', [
                $p['id'],
            ])->fetchAll();
        }
        json_response(['products' => $products]);
    }
    // POST local: cria o primeiro administrador, protegido por lock para evitar dois cadastros iniciais.
    if ($action === 'setup' && $method === 'POST') {
        if (!local_request()) {
            fail('O primeiro acesso deve ser configurado neste computador.', 403);
        }
        $lock = fopen(DATA_DIR . '/setup.lock', 'c');
        flock($lock, LOCK_EX);
        if (query('SELECT COUNT(*) FROM admins')->fetchColumn()) {
            fail('A loja já possui administrador.', 403);
        }
        $b = body();
        $email = text_field($b, 'email', 190);
        $password = account_password($b);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            fail('Informe um e-mail válido.');
        }
        query('INSERT INTO admins (email,password) VALUES (?,?)', [
            $email,
            password_hash($password, PASSWORD_DEFAULT),
        ]);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) db()->lastInsertId();
        json_response(['ok' => true]);
    }
    // POST: valida senha administrativa, limita tentativas e grava admin_id após renovar a sessão.
    if ($action === 'login' && $method === 'POST') {
        $b = body();
        $ip = $_SERVER['REMOTE_ADDR'];
        $a = query('SELECT * FROM login_attempts WHERE ip=?', [$ip])->fetch();
        if ($a && (int) $a['attempts'] >= 6 && time() - (int) $a['last_attempt'] < 900) {
            fail('Muitas tentativas. Aguarde 15 minutos.', 429);
        }
        $u = query('SELECT * FROM admins WHERE email=?', [text_field($b, 'email', 190)])->fetch();
        if (!$u || !password_verify((string) ($b['password'] ?? ''), $u['password'])) {
            if ($a) {
                query('UPDATE login_attempts SET attempts=?,last_attempt=? WHERE ip=?', [
                    time() - (int) $a['last_attempt'] >= 900 ? 1 : (int) $a['attempts'] + 1,
                    time(),
                    $ip,
                ]);
            } else {
                query('INSERT INTO login_attempts VALUES (?,?,?)', [$ip, 1, time()]);
            }
            fail('E-mail ou senha incorretos.', 401);
        }
        query('DELETE FROM login_attempts WHERE ip=?', [$ip]);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $u['id'];
        json_response(['ok' => true]);
    }
    // POST: encerra somente o acesso administrativo, preservando uma possível sessão de cliente.
    if ($action === 'logout' && $method === 'POST') {
        unset($_SESSION['admin'], $_SESSION['admin_id']);
        session_regenerate_id(true);
        json_response(['ok' => true]);
    }
    // POST de cliente: valida entrega/itens, reconhece repetição da chave e grava reserva, pedido, itens e vínculo em transação.
    if ($action === 'checkout' && $method === 'POST') {
        $account = current_customer(true);
        $b = body();
        if (
            !empty($b['account_id']) &&
            (!$account || (int) $b['account_id'] !== (int) $account['id'])
        ) {
            fail('Sua sessão mudou. Entre novamente na sua conta antes de enviar o pedido.', 401);
        }
        $customer = text_field($b, 'customer');
        $email = $account['email'];
        $phone = preg_replace('/\D/', '', text_field($b, 'phone', 30));
        $address = text_field($b, 'address', 700);
        if (
            !filter_var($email, FILTER_VALIDATE_EMAIL) ||
            strlen($phone) < 10 ||
            strlen($phone) > 13
        ) {
            fail('Confira seu e-mail e telefone.');
        }
        $key = text_field($b, 'request_key', 80);
        if (!preg_match('/^[a-f0-9-]{32,80}$/', $key)) {
            fail('Identificador de pedido inválido.');
        }
        $prior = query('SELECT id,reference,subtotal FROM orders WHERE request_key=?', [
            $key,
        ])->fetch();
        if ($prior) {
            $owner = query('SELECT customer_id FROM customer_orders WHERE order_id=?', [
                $prior['id'],
            ])->fetchColumn();
            if (!$owner || (int) $owner !== (int) $account['id']) {
                fail('Este pedido não pertence à sua conta.', 409);
            }
            $prior['access_code'] = null;
            $prior['linked'] = true;
            json_response(['order' => $prior]);
        }
        $items = $b['items'] ?? [];
        if (!is_array($items) || count($items) < 1 || count($items) > 30) {
            fail('Sua sacola deve conter entre 1 e 30 itens.');
        }
        $quantities = [];
        foreach ($items as $i) {
            $vid = integer($i['variant_id'] ?? 0, 1, PHP_INT_MAX);
            $q = integer($i['quantity'] ?? 0, 1, 20);
            $quantities[$vid] = ($quantities[$vid] ?? 0) + $q;
            if ($quantities[$vid] > 20) {
                fail('Limite de 20 unidades por variação.');
            }
        }
        // Ordem estável e transação: uma falha desfaz o pedido e suas reservas.
        ksort($quantities);
        db()->beginTransaction();
        $lines = [];
        $total = 0;
        foreach ($quantities as $vid => $q) {
            $v = query(
                'SELECT v.*,p.name,p.price,p.active FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=?',
                [$vid],
            )->fetch();
            if (
                !$v ||
                !$v['active'] ||
                // Atualização condicional evita vender estoque já reservado por outra compra.
                !query('UPDATE variants SET stock=stock-? WHERE id=? AND stock>=?', [
                    $q,
                    $vid,
                    $q,
                ])->rowCount()
            ) {
                db()->rollBack();
                fail('Uma peça ficou sem estoque. Atualize sua sacola.', 409);
            }
            $lines[] = [
                $vid,
                $v['name'] . ' • ' . $v['color'] . ' / ' . $v['size'],
                $q,
                (int) $v['price'],
            ];
            $total += (int) $v['price'] * $q;
        }
        $ref = 'CAMI-' . strtoupper(bin2hex(random_bytes(5)));
        query(
            'INSERT INTO orders (reference,request_key,customer,email,phone,address,subtotal,created_at) VALUES (?,?,?,?,?,?,?,?)',
            [$ref, $key, $customer, $email, $phone, $address, $total, date('c')],
        );
        $oid = (int) db()->lastInsertId();
        query('INSERT INTO customer_orders (order_id,customer_id) VALUES (?,?)', [
            $oid,
            $account['id'],
        ]);
        query('INSERT INTO order_events (order_id,status,created_at) VALUES (?,?,?)', [
            $oid,
            'pending',
            date('c'),
        ]);
        foreach ($lines as $line) {
            query(
                'INSERT INTO order_items (order_id,variant_id,name,quantity,price) VALUES (?,?,?,?,?)',
                [$oid, ...$line],
            );
            query('INSERT INTO movements (variant_id,delta,reason,created_at) VALUES (?,?,?,?)', [
                $line[0],
                -$line[2],
                'Pedido ' . $ref,
                date('c'),
            ]);
        }
        db()->commit();
        json_response(
            [
                'order' => [
                    'id' => $oid,
                    'reference' => $ref,
                    'subtotal' => $total,
                    'access_code' => null,
                    'linked' => true,
                ],
            ],
            201,
        );
    }
    admin();
    // GET administrativo: retorna até 200 pedidos, seus detalhes, 100 movimentações e configurações.
    if ($action === 'dashboard' && $method === 'GET') {
        $orders = query('SELECT * FROM orders ORDER BY id DESC LIMIT 200')->fetchAll();
        foreach ($orders as &$o) {
            $o['items'] = query('SELECT * FROM order_items WHERE order_id=?', [
                $o['id'],
            ])->fetchAll();
            $o['shipping'] =
                query(
                    'SELECT carrier,tracking_code,tracking_url FROM order_shipping WHERE order_id=?',
                    [$o['id']],
                )->fetch() ?:
                null;
            $o['account_email'] =
                query(
                    'SELECT c.email FROM customers c JOIN customer_orders co ON co.customer_id=c.id WHERE co.order_id=?',
                    [$o['id']],
                )->fetchColumn() ?:
                null;
        }
        json_response([
            'orders' => $orders,
            'movements' => query(
                'SELECT m.*,p.name,v.size,v.color FROM movements m JOIN variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id ORDER BY m.id DESC LIMIT 100',
            )->fetchAll(),
            'settings' => settings(),
        ]);
    }
    // POST administrativo: valida preço em centavos, foto e campos; insere uma peça ou atualiza a existente.
    if ($action === 'product' && $method === 'POST') {
        $b = body();
        $id = integer($b['id'] ?? 0, 0, PHP_INT_MAX);
        $image = text_field($b, 'image', 500);
        if (
            !preg_match(
                '~^(assets/images/[a-zA-Z0-9_.-]+|uploads/[a-f0-9]+\.(?:jpg|png|webp))$~',
                $image,
            )
        ) {
            fail('Envie uma foto pelo botão de upload.');
        }
        $values = [
            text_field($b, 'name'),
            text_field($b, 'category', 80),
            text_field($b, 'description', 4000),
            integer($b['price'] ?? 0, 1, 10000000),
            integer($b['old_price'] ?? 0, 0, 10000000),
            $image,
            !empty($b['featured']) ? 1 : 0,
            !empty($b['active']) ? 1 : 0,
        ];
        if ($id) {
            if (!query('SELECT id FROM products WHERE id=?', [$id])->fetch()) {
                fail('Produto não encontrado.', 404);
            }
            query(
                'UPDATE products SET name=?,category=?,description=?,price=?,old_price=?,image=?,featured=?,active=? WHERE id=?',
                [...$values, $id],
            );
        } else {
            query(
                'INSERT INTO products (name,category,description,price,old_price,image,featured,active) VALUES (?,?,?,?,?,?,?,?)',
                $values,
            );
            $id = (int) db()->lastInsertId();
        }
        json_response(['ok' => true, 'id' => $id]);
    }
    // POST administrativo: identifica/cria a variação, aplica delta sem permitir saldo negativo e grava movimentação.
    if ($action === 'stock' && $method === 'POST') {
        $b = body();
        $pid = integer($b['product_id'] ?? 0, 1, PHP_INT_MAX);
        $size = text_field($b, 'size', 20);
        $color = text_field($b, 'color', 60);
        $delta = integer($b['delta'] ?? 0, -100000, 100000);
        $reason = text_field($b, 'reason', 200);
        if (!query('SELECT id FROM products WHERE id=?', [$pid])->fetch()) {
            fail('Produto não encontrado.', 404);
        }
        db()->beginTransaction();
        $v = query('SELECT * FROM variants WHERE product_id=? AND size=? AND color=?', [
            $pid,
            $size,
            $color,
        ])->fetch();
        if (!$v) {
            if ($delta < 0) {
                db()->rollBack();
                fail('O estoque não pode ser negativo.');
            }
            query('INSERT INTO variants (product_id,size,color,stock) VALUES (?,?,?,0)', [
                $pid,
                $size,
                $color,
            ]);
            $vid = (int) db()->lastInsertId();
        } else {
            $vid = (int) $v['id'];
        }
        if (
            $delta !== 0 &&
            !query('UPDATE variants SET stock=stock+? WHERE id=? AND stock+?>=0', [
                $delta,
                $vid,
                $delta,
            ])->rowCount()
        ) {
            db()->rollBack();
            fail('Não há estoque suficiente para essa saída.', 409);
        }
        query('INSERT INTO movements (variant_id,delta,reason,created_at) VALUES (?,?,?,?)', [
            $vid,
            $delta,
            $reason,
            date('c'),
        ]);
        db()->commit();
        json_response(['ok' => true]);
    }
    // POST administrativo: permite somente transições previstas. Cancelamento devolve estoque e registra evento na mesma transação.
    if ($action === 'order-status' && $method === 'POST') {
        $b = body();
        $id = integer($b['id'] ?? 0, 1, PHP_INT_MAX);
        $status = $b['status'] ?? '';
        db()->beginTransaction();
        $o = query('SELECT * FROM orders WHERE id=?', [$id])->fetch();
        $allowed = [
            'pending' => ['confirmed', 'cancelled'],
            'confirmed' => ['shipped', 'cancelled'],
            'shipped' => ['delivered'],
            'delivered' => [],
            'cancelled' => [],
        ];
        if (!$o || !in_array($status, $allowed[$o['status']] ?? [], true)) {
            db()->rollBack();
            fail('Essa mudança de status não é permitida.', 409);
        }
        if (
            !query('UPDATE orders SET status=? WHERE id=? AND status=?', [
                $status,
                $id,
                $o['status'],
            ])->rowCount()
        ) {
            db()->rollBack();
            fail('O pedido foi alterado. Atualize a página.', 409);
        }
        if ($status === 'cancelled') {
            foreach (
                query('SELECT * FROM order_items WHERE order_id=? ORDER BY variant_id', [
                    $id,
                ])->fetchAll()
                as $i
            ) {
                query('UPDATE variants SET stock=stock+? WHERE id=?', [
                    $i['quantity'],
                    $i['variant_id'],
                ]);
                query(
                    'INSERT INTO movements (variant_id,delta,reason,created_at) VALUES (?,?,?,?)',
                    [
                        $i['variant_id'],
                        $i['quantity'],
                        'Cancelamento ' . $o['reference'],
                        date('c'),
                    ],
                );
            }
        }
        query('INSERT INTO order_events (order_id,status,created_at) VALUES (?,?,?)', [
            $id,
            $status,
            date('c'),
        ]);
        db()->commit();
        json_response(['ok' => true]);
    }
    // POST administrativo: grava transportadora, código e URL HTTPS; dados serão consultados pela cliente.
    if ($action === 'order-shipping' && $method === 'POST') {
        $b = body();
        $id = integer($b['id'] ?? 0, 1, PHP_INT_MAX);
        if (!query('SELECT id FROM orders WHERE id=?', [$id])->fetch()) {
            fail('Pedido não encontrado.', 404);
        }
        $carrier = text_field($b, 'carrier', 100, false);
        $code = text_field($b, 'tracking_code', 100, false);
        $url = text_field($b, 'tracking_url', 500, false);
        if (
            $url !== '' &&
            (!filter_var($url, FILTER_VALIDATE_URL) ||
                strtolower((string) parse_url($url, PHP_URL_SCHEME)) !== 'https' ||
                parse_url($url, PHP_URL_USER) ||
                parse_url($url, PHP_URL_PASS))
        ) {
            fail('Use um link HTTPS válido para acompanhar a entrega.');
        }
        // Escolhe apenas entre dois comandos fixos, conforme o driver do banco.
        $sql =
            db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
                ? 'INSERT INTO order_shipping (order_id,carrier,tracking_code,tracking_url,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE carrier=VALUES(carrier),tracking_code=VALUES(tracking_code),tracking_url=VALUES(tracking_url),updated_at=VALUES(updated_at)'
                : 'INSERT INTO order_shipping (order_id,carrier,tracking_code,tracking_url,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET carrier=excluded.carrier,tracking_code=excluded.tracking_code,tracking_url=excluded.tracking_url,updated_at=excluded.updated_at';
        query($sql, [$id, $carrier, $code, $url, date('c')]);
        json_response(['ok' => true]);
    }
    // POST administrativo: vincula compra histórica ao cadastro conferido, sem transferir uma compra já vinculada.
    if ($action === 'order-link-customer' && $method === 'POST') {
        $b = body();
        $id = integer($b['id'] ?? 0, 1, PHP_INT_MAX);
        $email = customer_email($b);
        $c = query('SELECT id FROM customers WHERE email=?', [$email])->fetch();
        if (!$c || !query('SELECT id FROM orders WHERE id=?', [$id])->fetch()) {
            fail('Confira o pedido e o e-mail de uma conta já cadastrada.');
        }
        db()->beginTransaction();
        try {
            query('INSERT INTO customer_orders (order_id,customer_id) VALUES (?,?)', [
                $id,
                $c['id'],
            ]);
        } catch (PDOException $e) {
            db()->rollBack();
            fail('O pedido já está vinculado a uma conta.', 409);
        }
        query('DELETE FROM order_access WHERE order_id=?', [$id]);
        db()->commit();
        json_response(['ok' => true]);
    }
    // POST administrativo: salva somente configurações previstas e valida contatos antes de disponibilizá-los na vitrine.
    if ($action === 'settings' && $method === 'POST') {
        $b = body();
        $phone = preg_replace('/\D/', '', text_field($b, 'whatsapp', 30, false));
        if ($phone !== '' && !preg_match('/^55\d{10,11}$/', $phone)) {
            fail('Use 55 + DDD + número para o WhatsApp.');
        }
        $instagram = text_field($b, 'instagram', 80, false);
        if ($instagram !== '' && !preg_match('/^[a-zA-Z0-9_.]{1,30}$/', $instagram)) {
            fail('Informe apenas o usuário do Instagram, sem @.');
        }
        foreach (
            [
                'whatsapp' => $phone,
                'instagram' => $instagram,
                'notice' => text_field($b, 'notice', 200),
                'demo' => !empty($b['demo']) ? '1' : '0',
            ]
            as $k => $v
        ) {
            query('UPDATE settings SET value=? WHERE name=?', [$v, $k]);
        }
        json_response(['ok' => true]);
    }
    // POST multipart administrativo: valida tamanho/MIME/imagem e salva com nome aleatório; retorna caminho, não conteúdo executável.
    if ($action === 'upload' && $method === 'POST') {
        $f = $_FILES['image'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK || $f['size'] > 5 * 1024 * 1024) {
            fail('Envie uma imagem JPG, PNG ou WebP de até 5 MB.');
        }
        $mime = new finfo(FILEINFO_MIME_TYPE)->file($f['tmp_name']);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? null;
        if (!$ext || !getimagesize($f['tmp_name'])) {
            fail('Imagem inválida.');
        }
        $name = 'uploads/' . bin2hex(random_bytes(16)) . '.' . $ext;
        if (!is_dir(ROOT . '/uploads')) {
            mkdir(ROOT . '/uploads', 0755, true);
        }
        if (!move_uploaded_file($f['tmp_name'], ROOT . '/' . $name)) {
            fail('Não foi possível salvar a imagem.', 500);
        }
        json_response(['image' => $name]);
    }
    fail('Recurso não encontrado.', 404);
} catch (Throwable $e) {
    try {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
    } catch (Throwable) {
    }
    error_log((string) $e);
    json_response(
        [
            'error' =>
                'Não foi possível concluir a operação. Tente novamente; se persistir, verifique o log do PHP.',
        ],
        500,
    );
}
