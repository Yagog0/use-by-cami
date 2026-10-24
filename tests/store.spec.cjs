/**
 * Cenários da loja e estoque: setup, autorização, criação de produtos, reserva, idempotência,
 * rollback, cancelamento, disputa de estoque e navegação. Executa em série porque os cenários
 * reutilizam produto/pedido criados anteriormente; os contextos separam administrador e
 * compradoras.
 */
const { test, expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
let admin, buyer, csrf, buyerCsrf, product, variant, order;
const endpoint = (a) => '/api/index.php?action=' + a;
const payload = (items) => ({
    customer: 'Cliente de Teste',
    email: 'teste@example.com',
    phone: '11999999999',
    address: 'Rua de teste, 10, Centro, São Paulo, SP, 01001000',
    request_key: randomUUID(),
    items,
});
const post = (a, b) => admin.post(endpoint(a), { data: b, headers: { 'X-CSRF-Token': csrf } });
const checkout = (b) =>
    buyer.post(endpoint('checkout'), { data: b, headers: { 'X-CSRF-Token': buyerCsrf } });
test.describe.configure({ mode: 'serial' });
// Preparação da suíte: cria contextos separados e os registros necessários no banco isolado.
test.beforeAll(async ({ playwright }) => {
    admin = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    buyer = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    csrf = (await (await admin.get(endpoint('session'))).json()).csrf;
    buyerCsrf = (await (await buyer.get(endpoint('session'))).json()).csrf;
    expect(
        (
            await buyer.post(endpoint('customer-register'), {
                data: {
                    name: 'Compradora Teste',
                    email: 'buyer@example.com',
                    phone: '11999999999',
                    password: 'BuyerSeguro123!',
                },
                headers: { 'X-CSRF-Token': buyerCsrf },
            })
        ).status(),
    ).toBe(201);
});
// Limpeza dos clientes HTTP usados nos cenários; o runner cuida do processo PHP.
test.afterAll(async () => {
    await admin.dispose();
    await buyer.dispose();
});
test('acesso administrativo protegido, CSRF e configuração inicial', async () => {
    expect((await buyer.get(endpoint('dashboard'))).status()).toBe(401);
    expect((await buyer.post(endpoint('settings'), { data: {} })).status()).toBe(403);
    expect(
        (await post('setup', { email: 'cami@example.com', password: 'TesteSeguro123!' })).status(),
    ).toBe(200);
    expect(
        (await post('setup', { email: 'other@example.com', password: 'TesteSeguro123!' })).status(),
    ).toBe(403);
});
test('cadastro, variações e limite de estoque', async () => {
    const r = await post('product', {
        name: 'Peça de teste',
        category: 'Vestidos',
        description: 'Apenas para testes',
        price: 12345,
        old_price: 0,
        image: 'assets/images/dress.jpg',
        active: true,
        featured: false,
    });
    expect(r.status()).toBe(200);
    product = (await r.json()).id;
    expect(
        (
            await post('stock', {
                product_id: product,
                size: 'M',
                color: 'Areia',
                delta: 3,
                reason: 'Teste',
            })
        ).status(),
    ).toBe(200);
    expect(
        (
            await post('stock', {
                product_id: product,
                size: 'M',
                color: 'Areia',
                delta: -4,
                reason: 'Saída inválida',
            })
        ).status(),
    ).toBe(409);
    variant = (await (await admin.get(endpoint('products&all=1'))).json()).products.find(
        (p) => Number(p.id) === product,
    ).variants[0];
    expect(Number(variant.stock)).toBe(3);
});
test('pedido usa preço do servidor e repetição não baixa estoque duas vezes', async () => {
    const b = payload([{ variant_id: Number(variant.id), quantity: 2, price: 1 }]);
    const r = await checkout(b);
    expect(r.status()).toBe(201);
    order = (await r.json()).order;
    expect(order.subtotal).toBe(24690);
    const repeated = await checkout(b);
    expect(repeated.status()).toBe(200);
    expect((await repeated.json()).order.reference).toBe(order.reference);
    const p = (await (await buyer.get(endpoint('products'))).json()).products.find(
        (p) => Number(p.id) === product,
    );
    expect(Number(p.variants[0].stock)).toBe(1);
});
test('pedido com item indisponível desfaz todas as reservas', async () => {
    const list = (await (await buyer.get(endpoint('products'))).json()).products;
    const first = list[0].variants[0],
        before = Number(first.stock);
    expect(
        (
            await checkout(
                payload([
                    { variant_id: Number(first.id), quantity: 1 },
                    { variant_id: Number(variant.id), quantity: 2 },
                ]),
            )
        ).status(),
    ).toBe(409);
    const updated = (await (await buyer.get(endpoint('products'))).json()).products;
    expect(Number(updated[0].variants[0].stock)).toBe(before);
});
test('cancelamento devolve peças uma única vez', async () => {
    const orders = (await (await admin.get(endpoint('dashboard'))).json()).orders;
    const o = orders.find((o) => o.reference === order.reference);
    expect((await post('order-status', { id: o.id, status: 'cancelled' })).status()).toBe(200);
    expect((await post('order-status', { id: o.id, status: 'cancelled' })).status()).toBe(409);
    const p = (await (await buyer.get(endpoint('products'))).json()).products.find(
        (p) => Number(p.id) === product,
    );
    expect(Number(p.variants[0].stock)).toBe(3);
});
test('quantidades negativas e uploads executáveis são rejeitados', async () => {
    expect(
        (await checkout(payload([{ variant_id: Number(variant.id), quantity: -1 }]))).status(),
    ).toBe(422);
    const r = await admin.post(endpoint('upload'), {
        headers: { 'X-CSRF-Token': csrf },
        multipart: {
            image: {
                name: 'evil.php',
                mimeType: 'image/jpeg',
                buffer: Buffer.from('<?php echo 1;'),
            },
        },
    });
    expect(r.status()).toBe(422);
});
test('duas clientes disputando o último estoque não vendem além do disponível', async ({
    playwright,
}) => {
    const another = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:8091' });
    const token = (await (await another.get(endpoint('session'))).json()).csrf;
    expect(
        (
            await another.post(endpoint('customer-register'), {
                data: {
                    name: 'Outra Cliente',
                    email: 'other-buyer@example.com',
                    phone: '11999999999',
                    password: 'BuyerSeguro123!',
                },
                headers: { 'X-CSRF-Token': token },
            })
        ).status(),
    ).toBe(201);
    const requests = await Promise.all([
        checkout(payload([{ variant_id: Number(variant.id), quantity: 3 }])),
        another.post(endpoint('checkout'), {
            data: payload([{ variant_id: Number(variant.id), quantity: 3 }]),
            headers: { 'X-CSRF-Token': token },
        }),
    ]);
    expect(requests.map((r) => r.status()).sort()).toEqual([201, 409]);
    await another.dispose();
});
test('vitrine, filtros, busca, favoritos e envio de pedido pelo navegador', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(4);
    await page.locator('.filter[data-category=Conjuntos]').click();
    await expect(page.locator('.product-card')).toHaveCount(2);
    await page.locator('#view-all').click();
    await expect(page.locator('.product-card')).toHaveCount(9);
    await page.locator('.favorite-button').first().click();
    await page.locator('#favorites-toggle').click();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.locator('#favorites-toggle').click();
    await page.locator('#search-toggle').click();
    await page.locator('#search-input').fill('Aurora');
    await page.locator('#search-form button[type=submit]').click();
    await expect(page.locator('.product-card')).toHaveCount(1);
    await page.locator('.buy-button').first().click();
    await page.locator('#add-to-cart').click();
    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#checkout-form')).toHaveCount(0);
    await page.locator('#checkout-auth-form [name=email]').fill('buyer@example.com');
    await page.locator('#checkout-auth-form [name=password]').fill('BuyerSeguro123!');
    await page.locator('#checkout-auth-form button').click();
    await page.locator('#checkout-form [name=customer]').fill('Cliente Navegador');
    await expect(page.locator('#checkout-form [name=email]')).toHaveValue('buyer@example.com');
    await page.locator('#checkout-form [name=phone]').fill('11988888888');
    await page
        .locator('#checkout-form [name=address]')
        .fill('Rua Teste, 10, Centro, São Paulo, SP, 01001000');
    await page.locator('#checkout-form button[type=submit]').click();
    await expect(page.locator('.success')).toContainText('Seu pedido chegou');
    await expect(page.locator('#cart-count')).toHaveText('0');
    expect(errors).toEqual([]);
});
test('painel permite login, configurações e edição sem erro de JavaScript', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/admin/');
    await page.locator('[name=email]').fill('cami@example.com');
    await page.locator('[name=password]').fill('TesteSeguro123!');
    await page.locator('#auth-submit').click();
    await expect(page.locator('#admin-view')).toBeVisible();
    await page.locator('[data-tab=settings]').click();
    await page.locator('[name=whatsapp]').fill('5511999999999');
    await page.locator('[name=instagram]').fill('usebycami');
    await page.locator('#settings-form button').click();
    await expect(page.locator('#toast')).toContainText('atualizada');
    await page.locator('[data-tab=products]').click();
    await page.locator('[data-edit]').first().click();
    await expect(page.locator('#product-form')).toBeVisible();
    expect(errors).toEqual([]);
});
test('layout mobile sem rolagem horizontal e menu acessível', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.locator('#menu-toggle').click();
    await expect(page.locator('#main-nav')).toBeVisible();
    await page.locator('#main-nav').getByRole('link', { name: 'Blusas' }).click();
    await expect(page.locator('.product-card')).toHaveCount(2);
    await expect(page.locator('#main-nav')).not.toBeVisible();
    await page.locator('.buy-button').first().click();
    await page.locator('#add-to-cart').click();
    await expect(page.locator('#cart-dialog')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});
