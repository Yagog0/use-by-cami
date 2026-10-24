/**
 * Configuração do Playwright consumida por tests/run.cjs: Chrome instalado, uma execução por vez e
 * baseURL do PHP isolado. Testes de fluxo compartilham fixtures; não aumentar workers sem isolar os
 * bancos por worker. Falhas conservam trace em test-results/.
 */
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
    testDir: './tests',
    testMatch: '*.spec.cjs',
    workers: 1,
    fullyParallel: false,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:8091',
        channel: 'chrome',
        headless: true,
        trace: 'retain-on-failure',
    },
    timeout: 30000,
});
