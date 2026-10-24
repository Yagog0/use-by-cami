/**
 * Executor de testes: cria diretório privado temporário, inicia PHP na porta 8091, aguarda a API,
 * prepara fixtures e executa Playwright. Encerra PHP e remove a cópia de config ao terminar.
 * CAMI_TEST_CONFIG deve apontar somente a um banco de teste; não há limpeza automática dos dados
 * desse MySQL.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Cada execução recebe pasta privada própria; por padrão bootstrap usa SQLite nessa pasta.
const data = fs.mkdtempSync(
    path.join(process.env.TEMP || require('node:os').tmpdir(), 'cami-tests-'),
);
// Configuração MySQL opcional é copiada: o operador deve fornecer um banco exclusivo de teste.
if (process.env.CAMI_TEST_CONFIG)
    fs.copyFileSync(process.env.CAMI_TEST_CONFIG, path.join(data, 'config.php'));
const php = process.env.PHP_BIN || 'D:/php/php.exe';
// Servidor PHP isolado: CAMI_DATA_DIR aponta a pasta temporária e router.php protege caminhos internos.
const server = spawn(
    php,
    ['-S', '127.0.0.1:8091', '-t', root, path.join(__dirname, 'router.php')],
    { cwd: root, env: { ...process.env, CAMI_DATA_DIR: data }, windowsHide: true, stdio: 'ignore' },
);
server.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});
(async () => {
    try {
        // Aguarda inicialização da API antes de criar fixtures e executar o navegador.
        let ready = false;
        for (let n = 0; n < 40; n++) {
            try {
                const r = await fetch('http://127.0.0.1:8091/api/index.php?action=session');
                if (r.ok) {
                    ready = true;
                    break;
                }
            } catch {}
            await new Promise((r) => setTimeout(r, 150));
        }
        if (!ready) throw Error('Servidor de testes não iniciou.');
        fs.writeFileSync(path.join(data, 'allow-test-fixtures'), '1');
        const fixtures = spawnSync(php, [path.join(__dirname, 'seed-legacy.php')], {
            cwd: root,
            env: { ...process.env, CAMI_DATA_DIR: data },
            windowsHide: true,
            stdio: 'inherit',
        });
        if (fixtures.status !== 0) throw Error('Falha nas fixtures históricas');
        // Executa o CLI Playwright com os argumentos adicionais recebidos por npm test.
        const result = spawnSync(
            process.execPath,
            [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)],
            { cwd: root, env: process.env, stdio: 'inherit', windowsHide: true },
        );
        process.exitCode = result.status ?? 1;
    } catch (e) {
        console.error(e);
        process.exitCode = 1;
    } finally {
        // Finalização mesmo após erro: encerra PHP e remove eventual cópia privada da configuração.
        server.kill();
        const copiedConfig = path.join(data, 'config.php');
        if (fs.existsSync(copiedConfig)) fs.unlinkSync(copiedConfig);
    }
})();
