/**
 * Cenários de administração de contas e senha temporária. Valida CSRF, reautenticação, cadastro,
 * redefinição, bloqueio de acesso e troca obrigatória na conta/sacola. A ordem serial preserva as
 * transições das senhas testadas.
 */
const { test, expect } = require('@playwright/test');
let admin, visitor, customer, csrf, visitorCsrf, customerCsrf, customerId;
const endpoint = (action) => '/api/index.php?action=' + action;
const post = (ctx, token, action, data) =>
    ctx.post(endpoint(action), { data, headers: { 'X-CSRF-Token': token } });
const adminPost = (action, data) =>
    post(admin, csrf, action, { current_password: 'TesteSeguro123!', ...data });
test.describe.configure({ mode: 'serial' });
// Preparação da suíte: cria contextos separados e os registros necessários no banco isolado.
test.beforeAll(async ({ playwright }) => {
    admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    visitor = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    customer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    const session = await (await admin.get(endpoint('session'))).json();
    csrf = session.csrf;
    visitorCsrf = (await (await visitor.get(endpoint('session'))).json()).csrf;
    customerCsrf = (await (await customer.get(endpoint('session'))).json()).csrf;
    expect(
        (
            await post(admin, csrf, session.needsSetup ? 'setup' : 'login', {
                email: 'cami@example.com',
                password: 'TesteSeguro123!',
            })
        ).status(),
    ).toBe(200);
});
// Limpeza dos clientes HTTP usados nos cenários; o runner cuida do processo PHP.
test.afterAll(async () => {
    await admin.dispose();
    await visitor.dispose();
    await customer.dispose();
});

test('somente administradores autenticados gerenciam contas e confirmam a senha', async () => {
    for (const action of ['admin-accounts', 'admin-customers'])
        expect((await visitor.get(endpoint(action))).status()).toBe(401);
    expect(
        (
            await post(visitor, visitorCsrf, 'admin-accounts', {
                email: 'intruso@example.com',
                password: 'Cami12',
            })
        ).status(),
    ).toBe(401);
    expect((await admin.post(endpoint('admin-accounts'), { data: {} })).status()).toBe(403);
    expect(
        (
            await adminPost('admin-accounts', {
                email: 'teste@example.com',
                password: 'Cami12',
                current_password: 'errada',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await adminPost('admin-accounts', { email: 'teste@example.com', password: '12345' })
        ).status(),
    ).toBe(422);
    expect(
        (
            await adminPost('admin-accounts', { email: 'teste@example.com', password: 'ááááá' })
        ).status(),
    ).toBe(422);
});
test('novo administrador entra com senha de seis caracteres e duplicata é rejeitada', async () => {
    const created = await adminPost('admin-accounts', {
        email: 'EQUIPE@example.com',
        password: 'Cami12',
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).admin.password).toBeUndefined();
    expect(
        (
            await adminPost('admin-accounts', { email: 'equipe@example.com', password: 'Cami12' })
        ).status(),
    ).toBe(409);
    expect(
        (
            await post(visitor, visitorCsrf, 'login', {
                email: 'equipe@example.com',
                password: 'Cami12',
            })
        ).status(),
    ).toBe(200);
    expect((await visitor.get(endpoint('dashboard'))).status()).toBe(200);
    const list = await (await visitor.get(endpoint('admin-accounts'))).json();
    expect(list.admins.some((a) => a.email === 'equipe@example.com')).toBe(true);
    expect(JSON.stringify(list)).not.toContain('password');
    await post(visitor, visitorCsrf, 'logout', {});
});
test('cadastro pelo painel preserva a sessão da equipe e não concede acesso administrativo à cliente', async () => {
    const created = await adminPost('admin-customers', {
        name: 'Cliente Atendimento',
        email: 'atendimento@example.com',
        phone: '11988887777',
        address: 'Rua da Cliente, 42',
        password: 'Cami12',
    });
    expect(created.status()).toBe(201);
    const body = await created.json();
    customerId = body.customer.id;
    expect(body.customer.password).toBeUndefined();
    expect(body.recovery_code).toBeUndefined();
    const session = await (await admin.get(endpoint('session'))).json();
    expect(session.admin).toBe(true);
    expect(session.customer).toBeNull();
    expect(
        (
            await post(customer, customerCsrf, 'customer-login', {
                email: 'atendimento@example.com',
                password: 'Cami12',
            })
        ).status(),
    ).toBe(200);
    expect((await customer.get(endpoint('admin-customers'))).status()).toBe(401);
    expect(
        (
            await post(customer, customerCsrf, 'admin-customer-password', {
                id: customerId,
                password: 'Outra1',
                identity_confirmed: true,
            })
        ).status(),
    ).toBe(401);
    const list = await (await admin.get(endpoint('admin-customers&q=atendimento'))).json();
    expect(list.total).toBe(1);
    expect(list.customers[0].address).toBe('Rua da Cliente, 42');
    expect(JSON.stringify(list)).not.toContain('recovery_hash');
});
test('redefinição exige conferência da identidade e encerra sessões anteriores', async () => {
    expect(
        (
            await adminPost('admin-customer-password', { id: customerId, password: 'Nova12' })
        ).status(),
    ).toBe(422);
    expect(
        (
            await adminPost('admin-customer-password', {
                id: customerId,
                password: 'Nova12',
                identity_confirmed: true,
            })
        ).status(),
    ).toBe(200);
    expect((await customer.get(endpoint('customer-profile'))).status()).toBe(401);
    expect(
        (
            await post(customer, customerCsrf, 'customer-login', {
                email: 'atendimento@example.com',
                password: 'Cami12',
            })
        ).status(),
    ).toBe(401);
    expect(
        (
            await post(customer, customerCsrf, 'customer-login', {
                email: 'atendimento@example.com',
                password: 'Nova12',
            })
        ).status(),
    ).toBe(200);
    const restrictedSession = await (await customer.get(endpoint('session'))).json();
    expect(Number(restrictedSession.customer.must_change_password)).toBe(1);
    for (const action of [
        'customer-profile',
        'customer-orders',
        'customer-export',
        'customer-order&id=1',
    ]) {
        const response = await customer.get(endpoint(action));
        expect(response.status()).toBe(403);
        expect((await response.json()).code).toBe('password_change_required');
    }
    for (const action of ['checkout', 'customer-profile', 'customer-claim']) {
        expect((await post(customer, customerCsrf, action, {})).status()).toBe(403);
    }
    expect(
        (
            await post(visitor, visitorCsrf, 'customer-login', {
                email: 'atendimento@example.com',
                password: 'Nova12',
            })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post(customer, customerCsrf, 'customer-password', {
                current_password: 'Nova12',
                password: 'Nova12',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(customer, customerCsrf, 'customer-password', {
                current_password: 'Errada',
                password: 'Final12',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(customer, customerCsrf, 'customer-password', {
                current_password: 'Nova12',
                password: 'Final12',
            })
        ).status(),
    ).toBe(200);
    expect((await visitor.get(endpoint('customer-profile'))).status()).toBe(401);
    expect((await customer.get(endpoint('customer-orders'))).status()).toBe(200);
    expect(
        Number(
            (await (await customer.get(endpoint('session'))).json()).customer.must_change_password,
        ),
    ).toBe(0);
    expect(
        (
            await post(visitor, visitorCsrf, 'customer-login', {
                email: 'atendimento@example.com',
                password: 'Nova12',
            })
        ).status(),
    ).toBe(401);
});
test('painel cadastra cliente, redefine senha e adiciona administrador no navegador', async ({
    page,
}, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/admin/');
    await page.locator('[name=email]').fill('cami@example.com');
    await page.locator('[name=password]').fill('TesteSeguro123!');
    await page.locator('#auth-submit').click();
    await page.locator('[data-tab=customers]').click();
    await page.locator('#new-customer').click();
    let form = page.locator('#account-editor-form');
    await form.locator('[name=name]').fill('Cliente do Painel');
    await form.locator('[name=phone]').fill('11955554444');
    await form.locator('[name=email]').fill('painel@example.com');
    await form.locator('[name=password]').fill('Cami12');
    await form.locator('[name=confirmation]').fill('Cami12');
    await form.locator('[name=current_password]').fill('TesteSeguro123!');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#editor-dialog')).not.toBeVisible();
    await page.locator('#customer-search-form input').fill('painel@example.com');
    await page.locator('#customer-search-form button').click();
    await expect(page.locator('[data-customer-reset]')).toHaveCount(1);
    await page.locator('[data-customer-reset]').click();
    form = page.locator('#account-editor-form');
    await form.locator('[name=password]').fill('Nova12');
    await form.locator('[name=confirmation]').fill('Nova12');
    await form.locator('[name=identity_confirmed]').check();
    await form.locator('[name=current_password]').fill('TesteSeguro123!');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#editor-dialog')).not.toBeVisible();
    await page.locator('[data-tab=admins]').click();
    await page.locator('#new-admin').click();
    form = page.locator('#account-editor-form');
    await form.locator('[name=email]').fill('equipe-ui@example.com');
    await form.locator('[name=password]').fill('Cami12');
    await form.locator('[name=confirmation]').fill('Cami12');
    await form.locator('[name=current_password]').fill('TesteSeguro123!');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#editor-dialog')).not.toBeVisible();
    await expect(page.locator('#admin-content')).toContainText('equipe-ui@example.com');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({
        path: testInfo.outputPath('administradores-mobile.png'),
        fullPage: true,
    });
    expect(errors).toEqual([]);
});
test('esqueci minha senha oferece atendimento sem pedir código', async ({ page }) => {
    await page.goto('/conta.php');
    await page.locator('#switch-recover').click();
    await expect(page.locator('#recovery-help')).toBeVisible();
    await expect(page.locator('[name=recovery_code]')).toHaveCount(0);
    await expect(page.locator('#customer-auth-form')).toHaveCount(0);
    await page.locator('#back-to-login').click();
    await expect(page.locator('#customer-auth-form')).toBeVisible();
});

test('sessão administrativa expirada fecha o formulário e exige novo login', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin/');
    await page.locator('[name=email]').fill('cami@example.com');
    await page.locator('[name=password]').fill('TesteSeguro123!');
    await page.locator('#auth-submit').click();
    await page.locator('[data-tab=admins]').click();
    await page.locator('#new-admin').click();
    const form = page.locator('#account-editor-form');
    await form.locator('[name=email]').fill('nao-criar@example.com');
    await form.locator('[name=password]').fill('Cami12');
    await form.locator('[name=confirmation]').fill('Cami12');
    await form.locator('[name=current_password]').fill('TesteSeguro123!');
    const session = await (await page.request.get(endpoint('session'))).json();
    await post(page.request, session.csrf, 'logout', {});
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#editor-dialog')).not.toBeVisible();
    await expect(page.locator('#editor-content')).toBeEmpty();
    await expect(page.locator('#auth-view')).toBeVisible();
    await expect(page.locator('#admin-view')).toBeHidden();
    expect(errors).toEqual([]);
});

test('cliente precisa trocar a senha temporária ao entrar e após recarregar a conta', async ({
    page,
}, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/conta.php?tab=profile');
    await page.locator('#customer-auth-form [name=email]').fill('painel@example.com');
    await page.locator('#customer-auth-form [name=password]').fill('Nova12');
    await page.locator('#customer-auth-form button').click();
    await expect(page.locator('#account-password-change')).toBeVisible();
    await expect(page.locator('#customer-area')).toBeHidden();
    await page.reload();
    await expect(page.locator('#account-password-change')).toBeVisible();
    const form = page.locator('#account-password-change form');
    await form.locator('[name=current_password]').fill('Nova12');
    await form.locator('[name=password]').fill('Final34');
    await form.locator('[name=confirmation]').fill('Final35');
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.form-error')).toContainText('não conferem');
    await page.screenshot({
        path: testInfo.outputPath('troca-obrigatoria-mobile.png'),
        fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await form.locator('[name=confirmation]').fill('Final34');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#customer-area')).toBeVisible();
    await expect(page.locator('#account-password-change')).toBeHidden();
    await expect(page.locator('#profile-form [name=email]')).toHaveValue('painel@example.com');
    expect(errors).toEqual([]);
});

test('troca obrigatória na sacola preserva as peças e libera o checkout', async ({ page }) => {
    const list = await (await admin.get(endpoint('admin-customers&q=painel@example.com'))).json();
    expect(
        (
            await adminPost('admin-customer-password', {
                id: list.customers[0].id,
                password: 'Temp56',
                identity_confirmed: true,
            })
        ).status(),
    ).toBe(200);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/catalogo.php?category=Blusas');
    await page.locator('.buy-button:not([disabled])').first().click();
    await page.locator('#add-to-cart').click();
    await page.locator('#checkout-auth-form [name=email]').fill('painel@example.com');
    await page.locator('#checkout-auth-form [name=password]').fill('Temp56');
    await page.locator('#checkout-auth-form button').click();
    await expect(page.locator('#checkout-password-change')).toBeVisible();
    await expect(page.locator('#checkout-form')).toHaveCount(0);
    await expect(page.locator('#cart-count')).toHaveText('1');
    const form = page.locator('#checkout-password-change form');
    await form.locator('[name=current_password]').fill('Temp56');
    await form.locator('[name=password]').fill('Final56');
    await form.locator('[name=confirmation]').fill('Final56');
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#checkout-form')).toBeVisible();
    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#checkout-form [name=email]')).toHaveValue('painel@example.com');
    expect(errors).toEqual([]);
});
