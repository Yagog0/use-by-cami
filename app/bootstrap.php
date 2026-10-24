<?php
/**
 * Inicialização compartilhada por páginas, API e ferramentas CLI. Configura sessão/cabeçalhos, abre
 * o banco privado e oferece validações. Não contém credenciais; config() lê a pasta privada.
 * Guia geral: docs/guia-do-codigo.md.
 */
declare(strict_types=1);
date_default_timezone_set('America/Sao_Paulo');
ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header(
    "Content-Security-Policy: default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
);
const ROOT = __DIR__ . '/..';
define('DATA_DIR', getenv('CAMI_DATA_DIR') ?: dirname(__DIR__, 4) . '/var/use-by-cami');
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0700, true);
}
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
/**
 * Lê a configuração privada; sem arquivo, seleciona SQLite. O retorno é usado somente por db().
 */
function config(): array
{
    return is_file(DATA_DIR . '/config.php')
        ? require DATA_DIR . '/config.php'
        : ['driver' => 'sqlite'];
}
/**
 * Retorna a mesma conexão PDO durante a requisição. Configura exceções, prepared statements
 * nativos e integridade SQLite.
 */
function db(): PDO
{
    static $db;
    if ($db) {
        return $db;
    }
    $c = config();
    $db =
        ($c['driver'] ?? '') === 'mysql'
            ? new PDO(
                "mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4",
                $c['user'],
                $c['password'],
            )
            : new PDO('sqlite:' . DATA_DIR . '/store.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    // No MySQL, o banco prepara o SQL; os valores não são interpolados pelo PDO.
    $db->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    if ($db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $db->exec('PRAGMA foreign_keys=ON');
        $db->exec('PRAGMA busy_timeout=10000');
    }
    return $db;
}
/**
 * Centraliza prepared statements. O SQL deve conter somente estrutura definida
 * pelo código; dados externos vão em $params, nos lugares marcados com "?".
 * Exemplo: query('SELECT id FROM customers WHERE email=?', [$email]).
 * Nomes de tabelas/colunas não aceitam parâmetros: use uma lista fixa no código.
 * Retorna PDOStatement para consultar resultados ou a quantidade de linhas afetadas.
 */
function query(string $sql, array $params = []): PDOStatement
{
    $s = db()->prepare($sql);
    foreach ($params as $key => $value) {
        // Tipos explícitos permitem usar inteiros também em LIMIT/OFFSET no MySQL.
        $type = match (true) {
            is_int($value) => PDO::PARAM_INT,
            is_bool($value) => PDO::PARAM_BOOL,
            $value === null => PDO::PARAM_NULL,
            default => PDO::PARAM_STR,
        };
        if (!is_scalar($value) && $value !== null) {
            throw new InvalidArgumentException('Parâmetro SQL deve ser escalar ou null.');
        }
        $s->bindValue(is_int($key) ? $key + 1 : ':' . ltrim($key, ':'), $value, $type);
    }
    $s->execute();
    return $s;
}
/**
 * Envia JSON com status HTTP, proíbe cache e encerra a execução; nenhuma rota continua depois
 * desta chamada.
 */
function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}
/**
 * Encerra a requisição com uma mensagem pública de erro. O status padrão 422 indica dados
 * inválidos.
 */
function fail(string $message, int $status = 422): never
{
    json_response(['error' => $message], $status);
}
/**
 * Decodifica o corpo JSON enviado pelo navegador; rejeita corpos que não resultam em um array
 * PHP.
 */
function body(): array
{
    $b = json_decode(file_get_contents('php://input'), true);
    if (!is_array($b)) {
        fail('Dados inválidos.');
    }
    return $b;
}
/**
 * Compara o token da requisição com o da sessão antes de executar alterações no banco.
 */
function csrf(): void
{
    // CSRF complementa a autenticação; não substitui parâmetros SQL ou permissões.
    if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['csrf'] ?? ''))) {
        fail('Sua sessão expirou. Atualize a página.', 403);
    }
}
/**
 * Busca o administrador pelo ID da sessão. Retorna null se não houver uma conta administrativa
 * válida.
 */
function current_admin(): ?array
{
    if (empty($_SESSION['admin_id'])) {
        return null;
    }
    return query('SELECT id,email FROM admins WHERE id=?', [$_SESSION['admin_id']])->fetch() ?:
        null;
}
/**
 * Barreira de autorização: interrompe com HTTP 401 quando não existe administrador conectado.
 */
function admin(): void
{
    if (!current_admin()) {
        fail('Entre no painel para continuar.', 401);
    }
}
/**
 * Valida a nova senha: mínimo de 6 caracteres Unicode e máximo de 72 bytes. Não gera hash; isso
 * ocorre ao salvar.
 */
function account_password(array $data, string $key = 'password'): string
{
    $password = (string) ($data[$key] ?? '');
    $length = preg_match_all('/./us', $password);
    if ($length === false || $length < 6 || strlen($password) > 72) {
        fail('A senha deve ter pelo menos 6 caracteres e no máximo 72 bytes.');
    }
    return $password;
}
/**
 * Identifica acesso pelo loopback para restringir a criação do primeiro administrador ao
 * computador local.
 */
function local_request(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
}
/**
 * Converte linhas de settings em um mapa nome => valor para o painel e a apresentação pública da
 * loja.
 */
function settings(): array
{
    $result = [];
    foreach (query('SELECT * FROM settings')->fetchAll() as $s) {
        $result[$s['name']] = $s['value'];
    }
    return $result;
}
/**
 * Obtém e apara um campo textual, verifica presença e limite em bytes; retorna o texto para uso
 * como parâmetro SQL.
 */
function text_field(array $data, string $key, int $max = 150, bool $required = true): string
{
    $v = trim((string) ($data[$key] ?? ''));
    if (($required && $v === '') || strlen($v) > $max) {
        fail('Confira o campo: ' . $key);
    }
    return $v;
}
/**
 * Retorna inteiro somente se o valor for válido e estiver no intervalo permitido; usado em IDs,
 * estoque e paginação.
 */
function integer(mixed $v, int $min, int $max): int
{
    // Valida IDs, quantidades e páginas antes de enviá-los como parâmetros ao banco.
    if (filter_var($v, FILTER_VALIDATE_INT) === false || (int) $v < $min || (int) $v > $max) {
        fail('Número fora do intervalo permitido.');
    }
    return (int) $v;
}
/**
 * Cria a estrutura inicial e, se ainda não houver catálogo/configurações, insere os exemplos de
 * app/seed.php.
 */
function migrate(): void
{
    // DDL de instalação: exec() recebe apenas SQL fixo, nunca dados da requisição.
    $mysql = db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $mysql ? 'INTEGER PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    foreach (
        [
            "CREATE TABLE IF NOT EXISTS admins (id $id, email VARCHAR(190) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL)",
            'CREATE TABLE IF NOT EXISTS settings (name VARCHAR(80) PRIMARY KEY, value TEXT NOT NULL)',
            "CREATE TABLE IF NOT EXISTS products (id $id, name VARCHAR(150) NOT NULL, category VARCHAR(80) NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL, old_price INTEGER NOT NULL DEFAULT 0, image VARCHAR(500) NOT NULL, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1)",
            "CREATE TABLE IF NOT EXISTS variants (id $id, product_id INTEGER NOT NULL, size VARCHAR(20) NOT NULL, color VARCHAR(60) NOT NULL, stock INTEGER NOT NULL DEFAULT 0, UNIQUE(product_id,size,color), FOREIGN KEY(product_id) REFERENCES products(id))",
            "CREATE TABLE IF NOT EXISTS orders (id $id, reference VARCHAR(40) NOT NULL UNIQUE, request_key VARCHAR(80) NOT NULL UNIQUE, customer VARCHAR(150) NOT NULL, email VARCHAR(190) NOT NULL, phone VARCHAR(30) NOT NULL, address TEXT NOT NULL, subtotal INTEGER NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at VARCHAR(30) NOT NULL)",
            "CREATE TABLE IF NOT EXISTS order_items (id $id, order_id INTEGER NOT NULL, variant_id INTEGER NOT NULL, name VARCHAR(250) NOT NULL, quantity INTEGER NOT NULL, price INTEGER NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(variant_id) REFERENCES variants(id))",
            "CREATE TABLE IF NOT EXISTS movements (id $id, variant_id INTEGER NOT NULL, delta INTEGER NOT NULL, reason VARCHAR(250) NOT NULL, created_at VARCHAR(30) NOT NULL, FOREIGN KEY(variant_id) REFERENCES variants(id))",
            'CREATE TABLE IF NOT EXISTS login_attempts (ip VARCHAR(64) PRIMARY KEY, attempts INTEGER NOT NULL, last_attempt INTEGER NOT NULL)',
        ]
        as $sql
    ) {
        db()->exec($sql . ($mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : ''));
    }
    if (!query('SELECT COUNT(*) FROM settings')->fetchColumn()) {
        foreach (
            [
                'brand' => 'Use by Cami',
                'whatsapp' => '',
                'instagram' => '',
                'notice' => 'Um carinho em forma de look. Conheça a nossa coleção.',
                'demo' => '1',
            ]
            as $k => $v
        ) {
            query('INSERT INTO settings (name,value) VALUES (?,?)', [$k, $v]);
        }
    }
    if (!query('SELECT COUNT(*) FROM products')->fetchColumn()) {
        $products = require __DIR__ . '/seed.php';
        db()->beginTransaction();
        foreach ($products as $p) {
            query(
                'INSERT INTO products (name,category,description,price,old_price,image,featured) VALUES (?,?,?,?,?,?,?)',
                array_slice($p, 0, 7),
            );
            $pid = (int) db()->lastInsertId();
            foreach (['P', 'M', 'G'] as $size) {
                query('INSERT INTO variants (product_id,size,color,stock) VALUES (?,?,?,?)', [
                    $pid,
                    $size,
                    $p[7],
                    5,
                ]);
                $vid = (int) db()->lastInsertId();
                query(
                    'INSERT INTO movements (variant_id,delta,reason,created_at) VALUES (?,?,?,?)',
                    [$vid, 5, 'Estoque demonstrativo inicial', date('c')],
                );
            }
        }
        db()->commit();
    }
}
