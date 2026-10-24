<?php
/**
 * Ferramenta somente CLI: lê SHOW CREATE TABLE no MySQL e recria database/schema.sql sem registros
 * ou credenciais. A lista de tabelas é fixa. Exportar substitui o arquivo gerado, incluindo
 * comentários manuais nele; consulte também docs/guia-do-codigo.md.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}
require __DIR__ . '/../app/bootstrap.php';
if (db()->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql') {
    fwrite(STDERR, "Use o MySQL para exportar o schema.\n");
    exit(1);
}
$sql =
    "-- Use by Cami: estrutura sem dados nem credenciais\n-- Crie/selecione seu banco antes da importação.\nSET NAMES utf8mb4;\n\n";
foreach (
    [
        'admins',
        'settings',
        'products',
        'variants',
        'orders',
        'order_items',
        'movements',
        'login_attempts',
        'customers',
        'customer_orders',
        'order_access',
        'order_events',
        'order_shipping',
        'customer_attempts',
    ]
    as $table
) {
    // Identificador vem exclusivamente da lista fixa acima, nunca de entrada externa.
    $row = query('SHOW CREATE TABLE `' . $table . '`')->fetch();
    $sql .= preg_replace('/ AUTO_INCREMENT=\d+/', '', $row['Create Table']) . ";\n\n";
}
if (!is_dir(ROOT . '/database')) {
    mkdir(ROOT . '/database', 0755, true);
}
file_put_contents(ROOT . '/database/schema.sql', $sql);
echo "Estrutura exportada para database/schema.sql\n";
