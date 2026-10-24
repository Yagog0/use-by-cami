<?php
/**
 * Roteador do servidor PHP de testes iniciado por tests/run.cjs. Bloqueia caminhos internos;
 * retorna false para servir os demais arquivos. Não é o roteador do Apache real, que usa seus
 * .htaccess/configuração.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

// Router usado somente no servidor de testes local.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
if (
    preg_match(
        '~^/(app|tests|scripts|database|docs|node_modules|test-results|playwright-report)(/|$)|/\.|\.(md|json|sql|cjs|log)$~i',
        $path,
    )
) {
    http_response_code(403);
    exit();
}
return false;
