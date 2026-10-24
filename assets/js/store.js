/**
 * Base das páginas públicas. Carregada primeiro por index.php e compartilhada com catálogo, conta e
 * sacola. Busca session/products, mantém itens/favoritos no navegador e chama api/index.php.
 * Valores monetários vindos da API são centavos.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
// Helpers DOM compartilhados: $ retorna o primeiro elemento; $ devolve uma lista para percorrer.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const isCatalog = document.body.dataset.page === 'catalog';
// Formatação visual: centavos viram reais; escapeHTML impede interpretar dados de produtos/clientes como marcação.
const money = (v) =>
    (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHTML = (v) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
// Leitura tolerante a localStorage bloqueado ou JSON inválido; dados locais não são fonte de preço/estoque.
const readSaved = (key, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
};
// Estado persistente do navegador: sacola contém IDs de variação/quantidades; favoritos contêm IDs de produto.
let cart = readSaved('cami-cart', []),
    favorites = readSaved('cami-favorites', []);
if (!Array.isArray(cart)) cart = [];
if (!Array.isArray(favorites)) favorites = [];
cart = cart.filter(
    (i) =>
        Number.isInteger(i.variant_id) &&
        Number.isInteger(i.quantity) &&
        i.quantity > 0 &&
        i.quantity <= 20,
);
let products = [],
    session = {},
    category = '',
    search = '',
    onlyFavorites = false,
    expanded = false,
    submitting = false;
/**
 * Persiste sacola e favoritos no localStorage e atualiza o contador visual. Não reserva estoque;
 * a reserva ocorre no checkout da API.
 */
function save() {
    try {
        localStorage.setItem('cami-cart', JSON.stringify(cart));
        localStorage.setItem('cami-favorites', JSON.stringify(favorites));
    } catch {}
    $('#cart-count').textContent = cart.reduce((s, i) => s + i.quantity, 0);
}
/**
 * Mostra uma mensagem breve e reinicia seu temporizador de fechamento, sem navegar para outra
 * página.
 */
function toast(message) {
    const t = $('#toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 4000);
}
/**
 * GET quando não há dados; POST JSON com CSRF quando há. Retorna JSON ou lança erro; sinaliza
 * sessão expirada/troca obrigatória para account.js.
 */
async function api(action, data) {
    const r = await fetch('api/index.php?action=' + action, {
        method: data ? 'POST' : 'GET',
        headers: data ? { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf } : {},
        body: data ? JSON.stringify(data) : undefined,
    });
    let result;
    try {
        result = await r.json();
    } catch {
        throw new Error('O servidor não respondeu. Tente novamente.');
    }
    if (!r.ok) {
        if (result.code === 'password_change_required') {
            if (session.customer) session.customer.must_change_password = 1;
            window.dispatchEvent(new CustomEvent('cami:password-required'));
        }
        if (r.status === 401 && action.startsWith('customer-') && action !== 'customer-login')
            window.dispatchEvent(new CustomEvent('cami:customer-expired'));
        const error = new Error(result.error || 'Não foi possível concluir.');
        error.status = r.status;
        error.code = result.code;
        throw error;
    }
    return result;
}
/**
 * Abre o diálogo indicado pelo seletor somente se ainda não estiver aberto.
 */
function openDialog(id) {
    const d = $(id);
    if (!d.open) d.showModal();
}
// Eventos comuns dos diálogos: fechar pelo botão ou por clique fora do conteúdo.
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
        if (e.target === d) {
            const r = d.getBoundingClientRect();
            if (
                e.clientX < r.left ||
                e.clientX > r.right ||
                e.clientY < r.top ||
                e.clientY > r.bottom
            )
                d.close();
        }
    }),
);
/**
 * Aplica uma categoria à vitrine inicial, limpa favoritos selecionados, fecha o menu mobile e
 * redesenha as peças.
 */
function chooseCategory(value) {
    category = value;
    onlyFavorites = false;
    expanded = false;
    $('#favorites-toggle').setAttribute('aria-pressed', 'false');
    $$('[data-category]').forEach((b) =>
        b.classList.toggle(
            b.classList.contains('filter') ? 'active' : 'nav-active',
            b.dataset.category === value,
        ),
    );
    renderProducts();
    $('#main-nav').classList.remove('open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
}
$$('[data-category]').forEach((b) =>
    b.addEventListener('click', () => chooseCategory(b.dataset.category)),
);
// Navegação mobile: alterna o menu e mantém aria-expanded sincronizado para leitores de tela.
$('#menu-toggle').addEventListener('click', () => {
    const isOpen = $('#main-nav').classList.toggle('open');
    $('#menu-toggle').setAttribute('aria-expanded', String(isOpen));
});
// Busca: os controles exibem/limpam o campo; no catálogo encaminham o termo a camiCatalog.
$('#search-toggle').addEventListener('click', () => {
    $('#search-form').hidden = !$('#search-form').hidden;
    if (!$('#search-form').hidden) $('#search-input').focus();
});
$('#search-close').addEventListener('click', () => {
    $('#search-form').hidden = true;
    search = '';
    $('#search-input').value = '';
    renderProducts();
});
$('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#search-input').value.trim();
    if (isCatalog) {
        window.camiCatalog.setSearch(q);
        return;
    }
    location.href = 'catalogo.php?q=' + encodeURIComponent(q);
});
$('#sort')?.addEventListener('change', () => {
    if (isCatalog) window.camiCatalog.sync();
    renderProducts();
});
if (isCatalog)
    $('#show-more')?.addEventListener('click', () => {
        window.camiCatalog.more();
        renderProducts();
    });
// Favoritos: alterna filtro local; quando necessário navega ao catálogo com favorites=1.
$('#favorites-toggle').addEventListener('click', () => {
    if (!$('#products')) {
        location.href = 'catalogo.php?favorites=1';
        return;
    }
    onlyFavorites = !onlyFavorites;
    $('#favorites-toggle').setAttribute('aria-pressed', String(onlyFavorites));
    expanded = true;
    if (isCatalog) window.camiCatalog.sync();
    renderProducts();
    $('#colecao').scrollIntoView({ behavior: 'smooth' });
});
/**
 * Recebe um produto com variações e devolve o HTML do cartão; escapa conteúdo externo antes de
 * inseri-lo na página.
 */
function card(p) {
    const stock = p.variants.reduce((s, v) => s + Number(v.stock), 0),
        sizes = [...new Set(p.variants.filter((v) => Number(v.stock) > 0).map((v) => v.size))];
    return `<article class="product-card"><div class="product-photo"><a href="#produto-${p.id}" data-product="${p.id}" aria-label="Ver ${escapeHTML(p.name)}"><img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}" loading="lazy" width="450" height="600"></a><span class="product-tag ${Number(p.old_price) > Number(p.price) ? 'sale' : ''}">${stock === 0 ? 'ESGOTADO' : Number(p.old_price) > Number(p.price) ? 'PREÇO ESPECIAL' : 'NOVA COLEÇÃO'}</span><button class="favorite-button ${favorites.includes(Number(p.id)) ? 'selected' : ''}" data-favorite="${p.id}" aria-label="Favoritar ${escapeHTML(p.name)}" aria-pressed="${favorites.includes(Number(p.id))}"><svg><use href="#i-heart"/></svg></button>${sizes.length ? `<span class="product-sizes">${sizes.map(escapeHTML).join(' &nbsp; · &nbsp; ')}</span>` : ''}</div><div class="product-info"><div class="product-category">${escapeHTML(p.category)}</div><h3><a href="#produto-${p.id}" data-product="${p.id}">${escapeHTML(p.name)}</a></h3><div class="price-line"><span class="price">${money(p.price)}</span>${Number(p.old_price) > Number(p.price) ? `<span class="old-price">${money(p.old_price)}</span>` : ''}</div><p class="payment-caption">Pagamento combinado no atendimento</p><button class="buy-button" data-product="${p.id}" ${stock ? '' : 'disabled'}><svg><use href="#i-bag"/></svg>${stock ? 'Escolher minha peça' : 'Peça esgotada'}</button><button class="product-contact" data-product-contact="${p.id}">♡ Tire suas dúvidas com a Cami</button></div></article>`;
}
/**
 * Filtra e ordena os produtos em memória; no catálogo delega filtros avançados a camiCatalog e
 * atualiza a quantidade visível.
 */
function renderProducts() {
    if (!$('#products')) return;
    let list =
        isCatalog && window.camiCatalog
            ? window.camiCatalog.filter(products)
            : products.filter(
                  (p) =>
                      (category === '' ||
                          (category === 'sale' && Number(p.old_price) > Number(p.price)) ||
                          p.category === category) &&
                      `${p.name} ${p.category} ${p.description}`
                          .toLocaleLowerCase('pt-BR')
                          .includes(search.toLocaleLowerCase('pt-BR')),
              );
    list = list.filter((p) => !onlyFavorites || favorites.includes(Number(p.id)));
    const sort = $('#sort').value;
    if (sort === 'low') list.sort((a, b) => a.price - b.price);
    if (sort === 'high') list.sort((a, b) => b.price - a.price);
    if (sort === 'new') list.sort((a, b) => b.id - a.id);
    const msg = $('#catalog-message');
    msg.hidden = !search && !onlyFavorites;
    msg.textContent = onlyFavorites
        ? 'Suas peças favoritas ♡'
        : `${list.length} peça(s) para “${search}”`;
    const limit = isCatalog ? window.camiCatalog.limit() : expanded ? list.length : 4;
    $('#products').innerHTML = list.length
        ? list.slice(0, limit).map(card).join('')
        : '<div class="empty-state"><h3>Ainda não encontramos esse look.</h3><p>Que tal experimentar outra cor, tamanho ou faixa de preço?</p><button class="button outline" id="clear-filters">Limpar filtros</button></div>';
    $('#show-more').hidden = list.length <= limit;
    if (isCatalog) window.camiCatalog.meta(list.length);
    $('#clear-filters')?.addEventListener('click', () => {
        if (isCatalog) {
            window.camiCatalog.reset();
            return;
        }
        search = '';
        $('#search-input').value = '';
        chooseCategory('');
    });
}
// Delegação de cliques: os cartões são recriados, então um único listener no contêiner atende detalhes, favorito e contato.
$('#products')?.addEventListener('click', (e) => {
    const product = e.target.closest('[data-product]'),
        fav = e.target.closest('[data-favorite]'),
        contact = e.target.closest('[data-product-contact]');
    if (product) {
        e.preventDefault();
        showProduct(Number(product.dataset.product));
    }
    if (fav) {
        const id = Number(fav.dataset.favorite);
        favorites = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id];
        save();
        renderProducts();
    }
    if (contact) {
        const p = products.find((p) => Number(p.id) === Number(contact.dataset.productContact));
        contactStore(`Olá, Cami! Gostaria de saber mais sobre ${p.name}.`);
    }
});
/**
 * Abre detalhes, permite escolher variação disponível e adiciona a escolha à sacola local;
 * depois abre a sacola.
 */
function showProduct(id) {
    const p = products.find((p) => Number(p.id) === id);
    if (!p) return;
    let selected = p.variants.find((v) => Number(v.stock) > 0);
    $('#product-detail').innerHTML =
        `<div class="detail-grid"><img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.name)}"><div class="detail-copy"><span class="eyebrow">${escapeHTML(p.category)}</span><h2>${escapeHTML(p.name)}</h2><div class="price-line"><span class="price">${money(p.price)}</span>${Number(p.old_price) > Number(p.price) ? `<span class="old-price">${money(p.old_price)}</span>` : ''}</div><p>${escapeHTML(p.description)}</p><label>Escolha a cor e o tamanho</label><div class="variant-options">${p.variants.map((v) => `<button data-variant="${v.id}" ${Number(v.stock) > 0 ? '' : 'disabled'} class="${v === selected ? 'selected' : ''}" aria-pressed="${v === selected}">${escapeHTML(v.color)} · ${escapeHTML(v.size)}</button>`).join('')}</div><div class="stock-label" id="detail-stock"></div><button class="button" id="add-to-cart" ${selected ? '' : 'disabled'}><svg><use href="#i-bag"/></svg>Adicionar à sacola</button><button class="text-link" id="detail-contact">Precisa de ajuda com o tamanho? ↗</button></div></div>`;
    const stockLabel = () => {
        $('#detail-stock').textContent = selected
            ? `${selected.stock} unidade(s) disponível(is).`
            : 'Essa peça está esgotada.';
    };
    stockLabel();
    $$('[data-variant]').forEach((b) =>
        b.addEventListener('click', () => {
            selected = p.variants.find((v) => Number(v.id) === Number(b.dataset.variant));
            $$('[data-variant]').forEach((x) => {
                x.classList.toggle('selected', x === b);
                x.setAttribute('aria-pressed', String(x === b));
            });
            stockLabel();
        }),
    );
    $('#add-to-cart').addEventListener('click', () => {
        if (!selected) return;
        const existing = cart.find((i) => i.variant_id === Number(selected.id));
        if ((existing?.quantity ?? 0) >= Math.min(Number(selected.stock), 20))
            return toast('Você já adicionou a quantidade disponível.');
        if (existing) existing.quantity++;
        else cart.push({ variant_id: Number(selected.id), quantity: 1 });
        invalidateOrder();
        save();
        $('#product-dialog').close();
        renderCart();
        openDialog('#cart-dialog');
    });
    $('#detail-contact').addEventListener('click', () =>
        contactStore(`Olá, Cami! Pode me ajudar com o tamanho de ${p.name}?`),
    );
    openDialog('#product-dialog');
}
/**
 * Relaciona variant_id da sacola com produto/variação do catálogo atual; retorna null se a peça
 * deixou de existir.
 */
function resolveItem(item) {
    for (const p of products) {
        const v = p.variants.find((v) => Number(v.id) === item.variant_id);
        if (v) return { ...item, p, v };
    }
    return null;
}
/**
 * Descarta a chave da tentativa anterior quando a compra muda, para que a próxima compra tenha
 * identidade própria.
 */
function invalidateOrder() {
    try {
        sessionStorage.removeItem('cami-order-key');
    } catch {}
}
/**
 * Recupera ou cria UUID no sessionStorage. Reutilizar a chave em uma nova tentativa evita criar
 * dois pedidos por falha de rede.
 */
function orderKey() {
    let k;
    try {
        k = sessionStorage.getItem('cami-order-key');
    } catch {}
    if (!k) {
        k = crypto.randomUUID();
        try {
            sessionStorage.setItem('cami-order-key', k);
        } catch {}
    }
    return k;
}
// Abrir sacola sempre redesenha os itens usando o catálogo atual antes de exibir o diálogo.
$('#cart-toggle').addEventListener('click', () => {
    renderCart();
    openDialog('#cart-dialog');
});
/**
 * Recalcula a sacola a partir do catálogo, monta controles de quantidade e delega
 * login/entrega/senha temporária a checkout-auth.js.
 */
function renderCart() {
    const list = cart.map(resolveItem),
        valid = list.filter(Boolean),
        unavailable = list.some((i, n) => !i || Number(i.v.stock) < cart[n].quantity);
    if (!cart.length) {
        $('#cart-content').innerHTML =
            '<div class="empty-state"><h3>Sua sacola espera um carinho.</h3><p>Que tal encontrar uma peça que é a sua cara?</p><button class="button" id="back-to-store">Explorar a coleção</button></div>';
        $('#back-to-store').onclick = () => {
            $('#cart-dialog').close();
            if ($('#colecao')) $('#colecao').scrollIntoView();
            else location.href = 'catalogo.php';
        };
        return;
    }
    const total = valid.reduce((s, i) => s + Number(i.p.price) * i.quantity, 0);
    $('#cart-content').innerHTML =
        list
            .map((i, n) =>
                i
                    ? `<div class="cart-item"><img src="${escapeHTML(i.p.image)}" alt="${escapeHTML(i.p.name)}"><div><h3>${escapeHTML(i.p.name)}</h3><small>${escapeHTML(i.v.color)} / ${escapeHTML(i.v.size)}</small><span class="price">${money(i.p.price)}</span><div class="quantity"><button data-quantity="${n}" data-delta="-1" aria-label="Diminuir quantidade">−</button><span>${i.quantity}</span><button data-quantity="${n}" data-delta="1" aria-label="Aumentar quantidade" ${i.quantity >= Math.min(Number(i.v.stock), 20) ? 'disabled' : ''}>+</button></div>${Number(i.v.stock) < i.quantity ? '<p class="form-error">Quantidade indisponível. Ajuste ou remova.</p>' : ''}</div><button class="remove-item" data-remove="${n}" aria-label="Remover ${escapeHTML(i.p.name)}">Remover</button></div>`
                    : `<div class="cart-item"><p>Peça indisponível</p><button class="remove-item" data-remove="${n}">Remover</button></div>`,
            )
            .join('') +
        `<div class="cart-total"><span>Subtotal</span><strong>${money(total)}</strong></div><p class="cart-note">Frete e forma de pagamento serão combinados no atendimento. Enviar o pedido reserva suas peças, mas não realiza cobrança.</p>${checkoutSection(unavailable)}`;
    $$('[data-remove]').forEach(
        (b) =>
            (b.onclick = () => {
                cart.splice(Number(b.dataset.remove), 1);
                invalidateOrder();
                save();
                renderCart();
            }),
    );
    $$('[data-quantity]').forEach(
        (b) =>
            (b.onclick = () => {
                const i = cart[Number(b.dataset.quantity)];
                i.quantity += Number(b.dataset.delta);
                if (i.quantity <= 0) cart = cart.filter((x) => x !== i);
                invalidateOrder();
                save();
                renderCart();
            }),
    );
    bindCheckoutSection();
}

/**
 * Envia itens e entrega à API; somente após confirmação limpa a sacola. Preserva dados para novo
 * login e mantém a chave em falhas de envio.
 */
async function checkout(e) {
    e.preventDefault();
    if (submitting) return;
    const form = e.target,
        button = $('button[type=submit]', form),
        error = $('#checkout-error');
    button.disabled = true;
    button.textContent = 'Reservando suas peças…';
    submitting = true;
    const data = Object.fromEntries(new FormData(form));
    try {
        const result = await api('checkout', {
            ...data,
            items: cart,
            request_key: orderKey(),
            account_id: session.customer?.id ?? null,
        });
        const order = result.order;
        cart = [];
        checkoutDraft = null;
        save();
        invalidateOrder();
        $('#cart-content').innerHTML =
            `<div class="success"><span>♡</span><h2>Seu pedido chegou<br>com carinho.</h2><p>Anote seu número para acompanhar o atendimento:</p><strong>${escapeHTML(order.reference)}</strong><p>Subtotal: ${money(order.subtotal)}<br>Frete a combinar. Pagamento ainda não realizado.</p><a class="button" href="conta.php">Acompanhar meus pedidos ↗</a>${session.settings.whatsapp ? '<button class="button outline" id="order-whatsapp">Continuar no WhatsApp ↗</button>' : '<p>A loja recebeu seu pedido e poderá entrar em contato pelo telefone informado.</p>'}<button class="button outline" id="finish-order">Continuar explorando</button></div>`;
        $('#order-whatsapp')?.addEventListener('click', () =>
            contactStore(
                `Olá, Cami! Fiz o pedido ${order.reference}, no valor de ${money(order.subtotal)} (frete a combinar). Quero combinar pagamento e entrega.`,
            ),
        );
        $('#finish-order').onclick = () => $('#cart-dialog').close();
        window.dispatchEvent(new CustomEvent('cami:order-created'));
        try {
            products = (await api('products')).products;
            renderProducts();
        } catch {}
    } catch (err) {
        if (err.code === 'password_change_required') {
            checkoutDraft = { accountId: Number(session.customer?.id), data };
            renderCart();
            toast('Crie uma nova senha para finalizar a compra.');
        } else if (err.status === 401) {
            checkoutDraft = { accountId: Number(session.customer?.id), data };
            session.customer = null;
            renderCart();
            toast('Entre na sua conta para finalizar a compra.');
        } else {
            error.textContent = err.message;
            button.disabled = false;
            button.textContent = 'Tentar enviar novamente';
        }
    } finally {
        submitting = false;
    }
}
/**
 * Abre WhatsApp com mensagem preenchida, sem enviá-la automaticamente. Se não configurado, exibe
 * orientação local.
 */
function contactStore(message = 'Olá, Cami! Gostaria de ajuda para escolher meu look.') {
    if (!session.settings?.whatsapp) {
        showInfo('contact');
        return;
    }
    window.open(
        'https://wa.me/' + session.settings.whatsapp + '?text=' + encodeURIComponent(message),
        '_blank',
        'noopener,noreferrer',
    );
}
const info = {
    delivery: [
        'Entrega e pedidos',
        'Ao enviar um pedido, suas peças são reservadas no estoque. O pagamento, o valor do frete e o prazo de entrega são combinados com a loja durante o atendimento. Não há cobrança automática pelo site. Guarde o número do pedido para falar com a gente.',
    ],
    sizes: [
        'Um tamanho que abraça você',
        'Os tamanhos disponíveis aparecem em cada peça. Como a modelagem varia, fale com a loja para conferir medidas de busto, cintura, quadril e comprimento antes de concluir seu pedido.',
    ],
    privacy: [
        'Cuidamos dos seus dados',
        'Ao fazer um pedido, coletamos nome, e-mail, telefone e endereço para processar a compra e organizar a entrega. A sacola e seus favoritos ficam salvos neste navegador. Não coletamos dados de cartão. Para solicitar informações, correção ou exclusão dos seus dados, entre em contato com a loja.',
    ],
    contact: [
        'Vamos conversar ♡',
        'O canal de WhatsApp da loja ainda está sendo preparado. Você já pode enviar seu pedido pela sacola e informar seu telefone para retorno.',
    ],
};
/**
 * Mostra uma das mensagens institucionais fixas no diálogo de informações.
 */
function showInfo(key) {
    const [title, description] = info[key];
    $('#info-content').innerHTML =
        `<span class="eyebrow">USE BY CAMI</span><h2>${title}</h2><p>${description}</p>`;
    openDialog('#info-dialog');
}
$$('[data-contact]').forEach((b) => (b.onclick = () => contactStore()));
$$('[data-info]').forEach((b) => (b.onclick = () => showInfo(b.dataset.info)));
/**
 * Carrega sessão e produtos, aplica contatos/aviso e monta a vitrine. Retorna sucesso para
 * window.camiReady, aguardado por account.js.
 */
async function init() {
    save();
    try {
        [session, { products }] = await Promise.all([api('session'), api('products')]);
        $('#notice').textContent = session.settings.notice;
        if ($('#demo-note')) $('#demo-note').hidden = session.settings.demo !== '1';
        if (session.settings.instagram) {
            $('#instagram-link').href =
                'https://www.instagram.com/' + encodeURIComponent(session.settings.instagram) + '/';
            $('#instagram-link').target = '_blank';
            $('#instagram-link').rel = 'noopener noreferrer';
            $('#instagram-link').hidden = false;
        }
        if (isCatalog) window.camiCatalog.initialize();
        renderProducts();
        return true;
    } catch (e) {
        const target = $('#products') || $('#account-loading');
        target.innerHTML =
            '<div class="empty-state"><h3>Não conseguimos carregar esta página.</h3><p id="load-error"></p><button class="button" id="retry">Tentar novamente</button></div>';
        $('#load-error').textContent = e.message;
        $('#retry').onclick = () => location.reload();
        return false;
    }
}
// Contrato de inicialização: account.js aguarda esta Promise para não usar sessão/produtos antes da resposta da API.
window.camiReady = init();
