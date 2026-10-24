<?php
/**
 * Prepara duas compras históricas no banco de teste para validar vínculo com contas. Exige CLI,
 * CAMI_DATA_DIR e marcador de fixtures; não deve ser usado com configuração do banco real.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

// Fixtures históricas: somente CLI com marcador de teste; CAMI_DATA_DIR deve ser exclusivo dos testes.
if (
    PHP_SAPI !== 'cli' ||
    !getenv('CAMI_DATA_DIR') ||
    !is_file(getenv('CAMI_DATA_DIR') . '/allow-test-fixtures')
) {
    exit(1);
}
require __DIR__ . '/../app/bootstrap.php';
$v = query('SELECT id FROM variants ORDER BY id LIMIT 1')->fetchColumn();
foreach (['CAMI-LEGACY-A', 'CAMI-LEGACY-B'] as $reference) {
    if (query('SELECT id FROM orders WHERE reference=?', [$reference])->fetch()) {
        continue;
    }
    query(
        'INSERT INTO orders (reference,request_key,customer,email,phone,address,subtotal,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [
            $reference,
            bin2hex(random_bytes(20)),
            'Cliente anterior',
            'alice@example.com',
            '11999999999',
            'Endereço do pedido antigo',
            10000,
            date('c'),
        ],
    );
    $id = (int) db()->lastInsertId();
    query('INSERT INTO order_items (order_id,variant_id,name,quantity,price) VALUES (?,?,?,?,?)', [
        $id,
        $v,
        'Peça histórica',
        1,
        10000,
    ]);
    query('INSERT INTO order_events (order_id,status,created_at) VALUES (?,?,?)', [
        $id,
        'pending',
        date('c'),
    ]);
    query('INSERT INTO order_access (order_id,token_hash) VALUES (?,?)', [
        $id,
        hash('sha256', str_repeat('a', 48)),
    ]);
}
