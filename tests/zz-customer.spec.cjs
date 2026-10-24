/**
 * Cenários de clientes: cadastro/login, titularidade, checkout, histórico, dados, senha, rastreio e
 * mobile. beforeAll prepara contas/contextos e produto; os testes seriais utilizam esses registros
 * no banco isolado.
 */
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
let admin, alice, bob, guest, stale, guestOrder, ownedOrder, variant, product;
const contexts = [];
const endpoint = (a) => '/api/index.php?action=' + a;
const password = 'Cami12';
const post = (ctx, action, data) =>
    ctx.request.post(endpoint(action), { data, headers: { 'X-CSRF-Token': ctx.csrf } });
const get = async (ctx, action) => (await ctx.request.get(endpoint(action))).json();
const checkoutData = () => ({
    customer: 'Alice Cliente',
    email: 'alice@example.com',
    phone: '11999999999',
    address: 'Rua Antiga, 10, São Paulo, SP',
    request_key: randomUUID(),
    items: [{ variant_id: Number(variant.id), quantity: 1 }],
});
test.describe.configure({ mode: 'serial' });
// Preparação da suíte: cria contextos separados e os registros necessários no banco isolado.
test.beforeAll(async ({ playwright }) => {
    async function context() {
        const request = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
        const session = await (await request.get(endpoint('session'))).json();
        const ctx = { request, csrf: session.csrf };
        contexts.push(ctx);
        return ctx;
    }
    admin = await context();
    alice = await context();
    bob = await context();
    guest = await context();
    stale = await context();
    const session = await get(admin, 'session');
    expect(
        (
            await post(admin, session.needsSetup ? 'setup' : 'login', {
                email: 'cami@example.com',
                password: 'TesteSeguro123!',
            })
        ).status(),
    ).toBe(200);
    const created = await post(admin, 'product', {
        name: 'Vestido Teste Filtros',
        category: 'Vestidos',
        description: 'Uma peça para validar filtros combinados.',
        price: 15000,
        old_price: 17000,
        image: 'assets/images/dress.jpg',
        active: 1,
        featured: 0,
    });
    product = (await created.json()).id;
    await post(admin, 'stock', {
        product_id: product,
        size: 'P',
        color: 'Preto',
        delta: 0,
        reason: 'Teste variação esgotada',
    });
    await post(admin, 'stock', {
        product_id: product,
        size: 'M',
        color: 'Areia',
        delta: 8,
        reason: 'Teste variação disponível',
    });
    variant = (await get(guest, 'products')).products
        .find((p) => Number(p.id) === product)
        .variants.find((v) => v.size === 'M');
});
// Limpeza dos clientes HTTP usados nos cenários; o runner cuida do processo PHP.
test.afterAll(async () => {
    for (const c of contexts) await c.request.dispose();
});

test('contas exigem login e CSRF, cadastro não expõe senhas', async () => {
    expect((await guest.request.get(endpoint('customer-orders'))).status()).toBe(401);
    expect((await guest.request.post(endpoint('customer-register'), { data: {} })).status()).toBe(
        403,
    );
    const a = await post(alice, 'customer-register', {
        name: 'Alice Cliente',
        email: 'alice@example.com',
        phone: '11999999999',
        password,
    });
    expect(a.status()).toBe(201);
    const data = await a.json();
    expect(data.recovery_code).toBeUndefined();
    expect(data.customer.password).toBeUndefined();
    expect(data.customer.recovery_hash).toBeUndefined();
    expect(
        (
            await post(bob, 'customer-register', {
                name: 'Bob Cliente',
                email: 'bob@example.com',
                phone: '21999999999',
                password,
            })
        ).status(),
    ).toBe(201);
    expect(
        (await post(stale, 'customer-login', { email: 'alice@example.com', password })).status(),
    ).toBe(200);
});
test('checkout sem login é bloqueado sem criar pedido nem baixar estoque', async () => {
    const before = (await get(admin, 'dashboard')).orders.length;
    const stockBefore = (await get(guest, 'products')).products
        .find((p) => Number(p.id) === product)
        .variants.find((v) => Number(v.id) === Number(variant.id)).stock;
    expect((await post(guest, 'checkout', checkoutData())).status()).toBe(401);
    expect((await post(admin, 'checkout', checkoutData())).status()).toBe(401);
    expect((await get(admin, 'dashboard')).orders).toHaveLength(before);
    expect(
        (await get(guest, 'products')).products
            .find((p) => Number(p.id) === product)
            .variants.find((v) => Number(v.id) === Number(variant.id)).stock,
    ).toBe(stockBefore);
});
test('compra antiga sem login ainda pode ser vinculada com código privado válido', async () => {
    guestOrder = { reference: 'CAMI-LEGACY-A', access_code: 'a'.repeat(48) };
    expect((await get(alice, 'customer-orders')).total).toBe(0);
    expect(
        (
            await post(alice, 'customer-claim', {
                reference: guestOrder.reference,
                access_code: 'errado',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(alice, 'customer-claim', {
                reference: guestOrder.reference,
                access_code: guestOrder.access_code,
            })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post(bob, 'customer-claim', {
                reference: guestOrder.reference,
                access_code: guestOrder.access_code,
            })
        ).status(),
    ).toBe(422);
    expect((await get(alice, 'customer-orders')).total).toBe(1);
});
test('checkout usa a identidade autenticada e outra conta não acessa pedido nem exportação', async () => {
    const data = { ...checkoutData(), email: 'bob@example.com', customer_id: 99999 };
    const r = await post(alice, 'checkout', data);
    expect(r.status()).toBe(201);
    ownedOrder = (await r.json()).order;
    expect(ownedOrder.linked).toBe(true);
    expect(ownedOrder.access_code).toBeNull();
    expect((await post(alice, 'checkout', data)).status()).toBe(200);
    expect((await post(guest, 'checkout', data)).status()).toBe(401);
    const detail = (await get(alice, 'customer-order&id=' + ownedOrder.id)).order;
    expect(detail.email).toBe('alice@example.com');
    expect(detail.request_key).toBeUndefined();
    expect(detail.items).toHaveLength(1);
    expect((await bob.request.get(endpoint('customer-order&id=' + ownedOrder.id))).status()).toBe(
        404,
    );
    expect((await get(bob, 'customer-orders')).total).toBe(0);
    expect((await get(bob, 'customer-export')).orders).toHaveLength(0);
    const exported = await get(alice, 'customer-export');
    expect(exported.orders).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain('token_hash');
    expect(exported.customer.password).toBeUndefined();
});
test('rastreio validado e quatro etapas aparecem para a cliente', async () => {
    expect(
        (
            await post(bob, 'order-shipping', {
                id: ownedOrder.id,
                carrier: 'Teste',
                tracking_code: '123',
                tracking_url: '',
            })
        ).status(),
    ).toBe(401);
    expect(
        (
            await post(admin, 'order-shipping', {
                id: ownedOrder.id,
                carrier: 'Correios',
                tracking_code: 'BR123456789',
                tracking_url: 'javascript:alert(1)',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(admin, 'order-shipping', {
                id: ownedOrder.id,
                carrier: 'Correios',
                tracking_code: 'BR123456789',
                tracking_url: 'https://rastreamento.correios.com.br/',
            })
        ).status(),
    ).toBe(200);
    for (const status of ['confirmed', 'shipped', 'delivered'])
        expect((await post(admin, 'order-status', { id: ownedOrder.id, status })).status()).toBe(
            200,
        );
    const order = (await get(alice, 'customer-order&id=' + ownedOrder.id)).order;
    expect(order.status).toBe('delivered');
    expect(order.events.map((e) => e.status)).toEqual([
        'pending',
        'confirmed',
        'shipped',
        'delivered',
    ]);
    expect(order.shipping.tracking_code).toBe('BR123456789');
    expect(
        (await post(admin, 'order-status', { id: ownedOrder.id, status: 'cancelled' })).status(),
    ).toBe(409);
});
test('dados atualizados preservam endereço do pedido e e-mail exige senha atual', async () => {
    const data = {
        name: 'Alice Atualizada',
        email: 'alice-nova@example.com',
        phone: '11911111111',
        address: 'Rua Nova, 20',
    };
    expect((await post(alice, 'customer-profile', data)).status()).toBe(422);
    expect(
        (await post(alice, 'customer-profile', { ...data, current_password: password })).status(),
    ).toBe(200);
    expect((await get(alice, 'customer-profile')).customer.address).toBe('Rua Nova, 20');
    expect((await get(alice, 'customer-order&id=' + ownedOrder.id)).order.address).toBe(
        'Rua Antiga, 10, São Paulo, SP',
    );
    expect((await stale.request.get(endpoint('customer-profile'))).status()).toBe(401);
});
test('troca de senha invalida outros acessos e recuperação antiga foi removida', async () => {
    expect(
        (
            await post(stale, 'customer-login', { email: 'alice-nova@example.com', password })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post(alice, 'customer-password', {
                current_password: password,
                password: '12345',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(alice, 'customer-password', {
                current_password: 'errada',
                password: 'Nova12',
            })
        ).status(),
    ).toBe(422);
    expect(
        (
            await post(alice, 'customer-password', {
                current_password: password,
                password: 'Nova12',
            })
        ).status(),
    ).toBe(200);
    expect((await stale.request.get(endpoint('customer-profile'))).status()).toBe(401);
    expect(
        (
            await post(stale, 'customer-recover', {
                email: 'alice-nova@example.com',
                recovery_code: 'antigo',
                password,
            })
        ).status(),
    ).toBe(410);
    expect(
        (await post(alice, 'customer-recovery-code', { current_password: 'Nova12' })).status(),
    ).toBe(410);
});
test('somente a loja pode vincular uma compra antiga sem código', async () => {
    const order = (await get(admin, 'dashboard')).orders.find(
        (o) => o.reference === 'CAMI-LEGACY-B',
    );
    expect(
        (
            await post(bob, 'order-link-customer', { id: order.id, email: 'bob@example.com' })
        ).status(),
    ).toBe(401);
    expect(
        (
            await post(admin, 'order-link-customer', { id: order.id, email: 'bob@example.com' })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post(admin, 'order-link-customer', {
                id: order.id,
                email: 'alice-nova@example.com',
            })
        ).status(),
    ).toBe(409);
    expect((await get(bob, 'customer-orders')).total).toBe(1);
});
test('filtros combinam mesma variação, preço, busca, URL e limpeza', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/catalogo.php?q=Teste+Filtros&size=P&color=Areia&stock=1');
    await expect(page.locator('#result-count')).toHaveText('0 peças encontradas');
    await page.locator('#catalog-filters [name=size]').selectOption('M');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.locator('#catalog-filters [name=max]').fill('100');
    await page.locator('#catalog-filters [name=max]').blur();
    await expect(page.locator('.product-card')).toHaveCount(0);
    await page.locator('#catalog-filters [name=max]').fill('160');
    await page.locator('#catalog-filters [name=max]').blur();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('#catalog-filters [name=color]')).toHaveValue('Areia');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.locator('#catalog-filters [name=min]').fill('200');
    await page.locator('#catalog-filters [name=min]').blur();
    await expect(page.locator('#filter-error')).toContainText('máximo');
    await page.locator('.reset-filters').click();
    await expect(page.locator('#catalog-filters [name=q]')).toHaveValue('');
    await expect(page).toHaveURL(/catalogo.php$/);
    expect(errors).toEqual([]);
});
test('cliente cadastra, compra, acompanha pedido, edita dados e sai no navegador', async ({
    page,
}, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/conta.php');
    await page.locator('[data-auth=register]').click();
    const form = page.locator('#customer-auth-form');
    await form.locator('[name=name]').fill('Clara Navegador');
    await form.locator('[name=phone]').fill('11912345678');
    await form.locator('[name=email]').fill('clara@example.com');
    await form.locator('[name=password]').fill(password);
    await form.locator('[name=confirmation]').fill(password);
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#customer-area')).toBeVisible();
    await expect(page.locator('#recovery-notice')).toHaveCount(0);
    await page.goto('/catalogo.php?category=Blusas');
    await page.locator('.buy-button').first().click();
    await page.locator('#add-to-cart').click();
    await expect(page.locator('#checkout-form [name=email]')).toHaveValue('clara@example.com');
    await expect(page.locator('#checkout-form [name=email]')).toHaveAttribute('readonly', '');
    await page.locator('#checkout-form [name=address]').fill('Rua da Clara, 55, Centro, SP');
    await page.locator('#checkout-form button[type=submit]').click();
    await expect(page.locator('.success')).toBeVisible();
    await page.getByRole('link', { name: 'Acompanhar meus pedidos' }).click();
    await expect(page.locator('.customer-order-card')).toHaveCount(1);
    await page.locator('[data-view-order]').click();
    await expect(page.locator('#customer-order-dialog')).toContainText('Rua da Clara');
    await page.screenshot({ path: testInfo.outputPath('conta-pedido.png'), fullPage: true });
    await page.locator('#customer-order-dialog [data-close]').click();
    await page.locator('[data-account-tab=profile]').click();
    await page.locator('#profile-form [name=address]').fill('Rua do novo endereço, 70');
    await page.locator('#profile-form button').click();
    await expect(page.locator('#toast')).toContainText('atualizados');
    await page.locator('#customer-logout').click();
    await expect(page.locator('#account-auth')).toBeVisible();
    await expect(page.locator('#account-content')).toBeEmpty();
    expect(errors).toEqual([]);
});
test('painel salva rastreio e atualiza o acompanhamento da cliente', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('[name=email]').fill('cami@example.com');
    await page.locator('[name=password]').fill('TesteSeguro123!');
    await page.locator('#auth-submit').click();
    await page.locator('[data-tab=orders]').click();
    await page.locator('[data-order]').first().click();
    await expect(page.locator('#shipping-form')).toBeVisible();
    await page.locator('#shipping-form [name=carrier]').fill('Entrega local');
    await page.locator('#shipping-form [name=tracking_code]').fill('LOCAL-001');
    await page.locator('#shipping-form button').click();
    await expect(page.locator('#toast')).toContainText('Rastreio atualizado');
    await page.locator('[data-status=confirmed]').click();
    await expect(page.locator('#editor-dialog')).not.toBeVisible();
});
test('catálogo e conta no celular sem transbordamento e com filtros recolhíveis', async ({
    page,
}, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo.php');
    await page.locator('#catalog-filters [name=category]').selectOption('Conjuntos');
    await page.locator('#catalog-filters button[type=submit]').click();
    await expect(page.locator('#filter-panel')).not.toHaveAttribute('open', '');
    await expect(page.locator('.product-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: testInfo.outputPath('catalogo-mobile.png'), fullPage: true });
    await page.goto('/conta.php');
    await page.locator('#customer-auth-form [name=email]').fill('clara@example.com');
    await page.locator('#customer-auth-form [name=password]').fill(password);
    await page.locator('#customer-auth-form button').click();
    await expect(page.locator('.customer-order-card')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.locator('[data-view-order]').click();
    await expect(page.locator('#customer-order-dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: testInfo.outputPath('pedido-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
});
test('cadastro na sacola libera a entrega e mantém as peças no celular', async ({
    page,
}, testInfo) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/catalogo.php?category=Vestidos');
    await page.locator('.buy-button:not([disabled])').first().click();
    await page.locator('#add-to-cart').click();
    await expect(page.locator('#checkout-form')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enviar meu pedido' })).toHaveCount(0);
    await page.locator('[data-checkout-mode=register]').click();
    const form = page.locator('#checkout-auth-form');
    await form.locator('[name=name]').fill('Diana Sacola');
    await form.locator('[name=phone]').fill('11977777777');
    await form.locator('[name=email]').fill('diana@example.com');
    await form.locator('[name=password]').fill(password);
    await form.locator('[name=confirmation]').fill('OutraSenha12345!');
    await form.locator('button[type=submit]').click();
    await expect(form.locator('.form-error')).toContainText('não conferem');
    await page.screenshot({
        path: testInfo.outputPath('cadastro-sacola-mobile.png'),
        fullPage: true,
    });
    await form.locator('[name=confirmation]').fill(password);
    await form.locator('button[type=submit]').click();
    await expect(page.locator('#checkout-form [name=email]')).toHaveValue('diana@example.com');
    await expect(page.locator('#checkout-form [name=customer]')).toHaveValue('Diana Sacola');
    await expect(page.locator('.checkout-recovery')).toHaveCount(0);
    await expect(page.locator('#cart-count')).toHaveText('1');
    await page.locator('#checkout-form [name=address]').fill('Rua Diana, 5, Centro, São Paulo, SP');
    await page.locator('#checkout-form button[type=submit]').click();
    await expect(page.locator('.success')).toBeVisible();
    expect((await (await page.request.get(endpoint('customer-orders'))).json()).total).toBe(1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});
test('login inválido não libera a compra e sessão expirada exige novo acesso', async ({ page }) => {
    await page.goto('/catalogo.php?category=Blusas');
    await page.locator('.buy-button').first().click();
    await page.locator('#add-to-cart').click();
    let form = page.locator('#checkout-auth-form');
    await form.locator('[name=email]').fill('clara@example.com');
    await form.locator('[name=password]').fill('senha errada');
    await form.locator('button').click();
    await expect(form.locator('.form-error')).toContainText('incorretos');
    await expect(page.locator('#checkout-form')).toHaveCount(0);
    await form.locator('[name=password]').fill(password);
    await form.locator('button').click();
    await page.locator('#checkout-form [name=address]').fill('Endereço preservado após expiração');
    const session = await (await page.request.get(endpoint('session'))).json();
    const before = (await (await page.request.get(endpoint('customer-orders'))).json()).total;
    await page.request.post(endpoint('customer-logout'), {
        data: {},
        headers: { 'X-CSRF-Token': session.csrf },
    });
    await page.locator('#checkout-form button[type=submit]').click();
    await expect(page.locator('#checkout-auth-form')).toBeVisible();
    await expect(page.locator('#checkout-form')).toHaveCount(0);
    await expect(page.locator('#cart-count')).toHaveText('1');
    form = page.locator('#checkout-auth-form');
    await form.locator('[name=email]').fill('clara@example.com');
    await form.locator('[name=password]').fill(password);
    await form.locator('button').click();
    await expect(page.locator('#checkout-form [name=address]')).toHaveValue(
        'Endereço preservado após expiração',
    );
    expect((await (await page.request.get(endpoint('customer-orders'))).json()).total).toBe(before);
});
