<?php
/**
 * Entrada da área da cliente: ativa $accountPage e reutiliza index.php. O layout inclui
 * app/views/account-view.php e assets/js/account.js; a API verifica a autenticação real.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

$accountPage = true;
require __DIR__ . '/index.php';
