/**
 * Regressões de SQL injection em banco isolado: payloads devem permanecer texto ou ser rejeitados,
 * nunca executar comandos. Testa login, busca, IDs/status/páginas e preservação de nomes com
 * apóstrofo.
 */
const { test, expect } = require('@playwright/test');
const endpoint = (action) => '/api/index.php?action=' + action;
let admin, customer, stranger, csrf, customerCsrf, strangerCsrf;
const injection = "D'Avila'); DROP TABLE customers; --";
const post = (request, token, action, data) =>
    request.post(endpoint(action), {
        data,
        headers: { 'X-CSRF-Token': token },
    });

// Preparação da suíte: cria contextos separados e os registros necessários no banco isolado.
test.beforeAll(async ({ playwright }) => {
    admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    customer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    stranger = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    const session = await (await admin.get(endpoint('session'))).json();
    csrf = session.csrf;
    customerCsrf = (await (await customer.get(endpoint('session'))).json()).csrf;
    strangerCsrf = (await (await stranger.get(endpoint('session'))).json()).csrf;
    expect(
        (
            await post(admin, csrf, session.needsSetup ? 'setup' : 'login', {
                email: 'cami@example.com',
                password: 'TesteSeguro123!',
            })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post(customer, customerCsrf, 'customer-register', {
                name: injection,
                email: 'sql-test@example.com',
                password: 'Cami12',
                phone: '11977776666',
            })
        ).status(),
    ).toBe(201);
});
// Limpeza dos clientes HTTP usados nos cenários; o runner cuida do processo PHP.
test.afterAll(async () => {
    await admin.dispose();
    await customer.dispose();
    await stranger.dispose();
});

test('texto parecido com SQL é salvo como dado e não altera a estrutura', async () => {
    const profile = await (await customer.get(endpoint('customer-profile'))).json();
    expect(profile.customer.name).toBe(injection);
    const list = await (
        await admin.get(endpoint('admin-customers&q=sql-test%40example.com'))
    ).json();
    expect(list.total).toBe(1);
    expect(list.customers[0].name).toBe(injection);
    expect((await admin.get(endpoint('dashboard'))).status()).toBe(200);
});

test('busca parametrizada não transforma aspas ou comentários em condições SQL', async () => {
    for (const payload of ["' OR 1=1 --", "' UNION SELECT 1,2,3,4,5,6 FROM customers --"]) {
        const response = await admin.get(
            endpoint('admin-customers&q=' + encodeURIComponent(payload)),
        );
        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result.total).toBe(0);
        expect(result.customers).toEqual([]);
    }
    // Busca legítima com apóstrofo continua funcionando: não removemos caracteres do texto.
    const legitimate = await admin.get(
        endpoint('admin-customers&q=' + encodeURIComponent("D'Avila")),
    );
    expect((await legitimate.json()).customers[0].name).toBe(injection);
});

test('login não aceita tentativa de alterar a cláusula WHERE', async () => {
    for (const email of ["' OR '1'='1' --", "cami@example.com' --"]) {
        expect(
            (await post(stranger, strangerCsrf, 'login', { email, password: 'errada' })).status(),
        ).toBe(401);
        expect((await (await stranger.get(endpoint('session'))).json()).admin).toBe(false);
    }
    expect((await stranger.get(endpoint('dashboard'))).status()).toBe(401);
});

test('IDs, páginas e status adulterados são rejeitados; paginação legítima funciona', async () => {
    const payload = encodeURIComponent('1 OR 1=1');
    expect((await customer.get(endpoint('customer-order&id=' + payload))).status()).toBe(422);
    expect((await customer.get(endpoint('customer-orders&page=' + payload))).status()).toBe(422);
    expect((await admin.get(endpoint('admin-customers&page=' + payload))).status()).toBe(422);
    expect(
        (
            await customer.get(
                endpoint('customer-orders&status=' + encodeURIComponent("pending' OR 1=1 --")),
            )
        ).status(),
    ).toBe(422);
    expect(
        (await post(admin, csrf, 'order-status', { id: '1 OR 1=1', status: 'cancelled' })).status(),
    ).toBe(422);
    for (const [request, action] of [
        [admin, 'admin-customers&page=2'],
        [customer, 'customer-orders&page=2'],
    ]) {
        const response = await request.get(endpoint(action));
        expect(response.status()).toBe(200);
        expect((await response.json()).page).toBe(2);
    }
});
