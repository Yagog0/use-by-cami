/**
 * Base do painel admin/index.php. Carrega antes de admin-orders.js e admin-accounts.js, que
 * reutilizam seus helpers/estado. API usa ../api/index.php; render() troca somente o conteúdo da
 * aba.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
// Helpers próprios do painel. Esta página não carrega store.js; não misturar os dois conjuntos de variáveis globais.
const $ = (s, r = document) => r.querySelector(s),
    $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const money = (v) =>
    (Number(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (v) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const statusNames = {
    pending: 'Aguardando atendimento',
    confirmed: 'Confirmado',
    shipped: 'Enviado',
    delivered: 'Entregue',
    cancelled: 'Cancelado',
};
// Estado do painel em memória: load() preenche produtos, pedidos, movimentos e configurações; tab decide a tela.
let session = {},
    products = [],
    orders = [],
    movements = [],
    settings = {},
    tab = 'overview';
/**
 * Mostra confirmação temporária no painel, reiniciando o tempo de fechamento.
 */
function toast(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($('#toast').hidden = true), 4000);
}
/**
 * Envia GET ou POST com CSRF (JSON ou FormData para fotos). Em HTTP 401 fecha a área privada e
 * exige login.
 */
async function api(action, data) {
    const form = data instanceof FormData;
    const r = await fetch('../api/index.php?action=' + action, {
        method: data ? 'POST' : 'GET',
        headers: data
            ? {
                  'X-CSRF-Token': session.csrf,
                  ...(form ? {} : { 'Content-Type': 'application/json' }),
              }
            : {},
        body: data ? (form ? data : JSON.stringify(data)) : undefined,
    });
    let b;
    try {
        b = await r.json();
    } catch {
        throw new Error('Servidor indisponível. Atualize a página.');
    }
    if (!r.ok) {
        if (r.status === 401 && action !== 'login') {
            session.admin = false;
            showAuth();
        }
        throw new Error(b.error || 'Não foi possível concluir.');
    }
    return b;
}
/**
 * Fecha editor, limpa conteúdo privado e mostra login ou criação do primeiro acesso local.
 */
function showAuth() {
    if ($('#editor-dialog').open) $('#editor-dialog').close();
    $('#editor-content').replaceChildren();
    $('#admin-content').replaceChildren();
    $('#auth-view').hidden = false;
    $('#admin-view').hidden = true;
    const setup = session.needsSetup;
    $('#auth-title').textContent = setup ? 'Seu primeiro acesso.' : 'Bem-vinda, Cami.';
    $('#auth-description').textContent = setup
        ? 'Crie seu acesso exclusivo para administrar a loja. A senha precisa ter pelo menos 6 caracteres.'
        : 'Entre para cuidar dos seus produtos, pedidos e estoque.';
    $('#auth-submit').textContent = setup ? 'Criar meu acesso' : 'Entrar no painel';
    $('#auth-submit').disabled = setup && !session.local;
    $('[name=password]').minLength = setup ? 6 : 1;
    $('[name=password]').autocomplete = setup ? 'new-password' : 'current-password';
    if (setup && !session.local)
        $('#auth-error').textContent =
            'Configure o primeiro acesso usando localhost neste computador.';
}
// Entrada do painel: envia credenciais, busca a nova sessão e só então carrega os dados administrativos.
$('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('#auth-submit');
    b.disabled = true;
    $('#auth-error').textContent = '';
    try {
        await api(
            session.needsSetup ? 'setup' : 'login',
            Object.fromEntries(new FormData(e.target)),
        );
        session = await api('session');
        e.target.reset();
        await load();
    } catch (err) {
        $('#auth-error').textContent = err.message;
    } finally {
        b.disabled = false;
    }
});
// Saída explícita invalida a sessão administrativa no servidor antes de recarregar a página.
$('#logout').onclick = async () => {
    try {
        await api('logout', {});
        location.reload();
    } catch (e) {
        toast(e.message);
    }
};
// Botões laterais trocam o estado tab; render() chama o controlador responsável pelo conteúdo.
$$('[data-tab]').forEach(
    (b) =>
        (b.onclick = () => {
            tab = b.dataset.tab;
            render();
        }),
);
$$('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));
/**
 * Preenche e abre o editor reutilizado para produtos, estoque, pedidos e contas.
 */
function dialog(html) {
    $('#editor-content').innerHTML = html;
    $('#editor-dialog').showModal();
}
/**
 * Apresenta erro no editor; se ele já fechou por expiração de sessão, usa uma mensagem
 * temporária.
 */
function errorInForm(err) {
    if ($('#editor-error')) $('#editor-error').textContent = err.message;
    else toast(err.message);
}
/**
 * Busca catálogo completo e dashboard em paralelo; atualiza estado, mostra painel e renderiza a
 * aba atual.
 */
async function load() {
    const [p, d] = await Promise.all([api('products&all=1'), api('dashboard')]);
    products = p.products;
    orders = d.orders;
    movements = d.movements;
    settings = d.settings;
    $('#auth-view').hidden = true;
    $('#admin-view').hidden = false;
    $('#admin-date').textContent = new Date().toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    render();
}
const stock = (p) => p.variants.reduce((s, v) => s + Number(v.stock), 0);
/**
 * Sincroniza seleção/título da aba e chama seu renderizador; Clientes/Administradores são
 * fornecidos por admin-accounts.js.
 */
function render() {
    $$('[data-tab]').forEach((b) => b.classList.toggle('selected', b.dataset.tab === tab));
    $('#page-title').textContent = {
        overview: 'Um olhar sobre sua loja.',
        products: 'Suas peças, seu cuidado.',
        orders: 'Cada pedido, um carinho.',
        movements: 'Tudo no seu lugar.',
        settings: 'A loja com o seu jeitinho.',
        customers: 'As pessoas da sua loja.',
        admins: 'Quem cuida da sua loja.',
    }[tab];
    ({
        overview: renderOverview,
        products: renderProducts,
        orders: renderOrders,
        movements: renderMovements,
        settings: renderSettings,
        customers: renderCustomers,
        admins: renderAdmins,
    })[tab]();
}
/**
 * Recebe pedidos e devolve linhas escapadas para a tabela administrativa.
 */
function orderRows(list) {
    return list
        .map(
            (o) =>
                `<tr><td><strong>${esc(o.reference)}</strong><small>${date(o.created_at)}</small></td><td>${esc(o.customer)}<small>${esc(o.phone)}</small></td><td>${money(o.subtotal)}</td><td><span class="status ${o.status}">${statusNames[o.status]}</span></td><td><button class="link-button" data-order="${o.id}">Ver pedido</button></td></tr>`,
        )
        .join('');
}
/**
 * Envolve as linhas na tabela ou mostra estado vazio quando ainda não existem pedidos.
 */
function orderTable(list) {
    return list.length
        ? `<div class="table-scroll"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Subtotal</th><th>Status</th><th></th></tr></thead><tbody>${orderRows(list)}</tbody></table></div>`
        : '<div class="empty-admin">Os pedidos aparecerão aqui assim que alguém escolher suas peças.</div>';
}
/**
 * Liga botões data-order à abertura do pedido correspondente em showOrder().
 */
function bindOrders() {
    $$('[data-order]').forEach((b) => (b.onclick = () => showOrder(Number(b.dataset.order))));
}
let refreshingLatestOrders = false;
/**
 * Consulta dashboard a cada ciclo de 5 minutos na visão geral; substitui apenas a lista ainda
 * presente, preservando editores e outras abas.
 */
async function refreshLatestOrders() {
    const container = $('#latest-orders');
    if (!session.admin || tab !== 'overview' || !container || refreshingLatestOrders) return;
    refreshingLatestOrders = true;
    try {
        const result = await api('dashboard');
        if (!container.isConnected || tab !== 'overview') return;
        orders = result.orders;
        container.innerHTML = orderTable(orders.slice(0, 5));
        bindOrders();
        $('#latest-orders-update').textContent =
            'Atualizado às ' + new Date().toLocaleTimeString('pt-BR') + ' · A cada 5 minutos.';
    } catch (error) {
        if (container.isConnected) {
            $('#latest-orders-update').textContent =
                'Não foi possível atualizar agora. Tentaremos novamente em 5 minutos.';
        }
    } finally {
        refreshingLatestOrders = false;
    }
}
// Agendamento de 5 minutos; a função evita chamadas simultâneas e não atualiza abas diferentes da visão geral.
setInterval(refreshLatestOrders, 5 * 60 * 1000);
/**
 * Monta indicadores, últimos pedidos e alerta de estoque usando o estado carregado; liga atalhos
 * para Pedidos e Configurações.
 */
function renderOverview() {
    const pending = orders.filter((o) => o.status === 'pending').length,
        confirmed = orders
            .filter((o) => ['confirmed', 'shipped', 'delivered'].includes(o.status))
            .reduce((s, o) => s + Number(o.subtotal), 0),
        units = products.reduce((s, p) => s + stock(p), 0),
        low = products.filter((p) => Number(p.active) && stock(p) <= 3);
    $('#admin-content').innerHTML =
        `${!settings.whatsapp ? '<div class="panel quick-start"><span>♡</span><div><h2>Vamos deixar tudo com a sua cara?</h2><p>Adicione seu WhatsApp e Instagram para receber suas clientes.</p></div><button class="button small" id="go-settings">Configurar loja ↗</button></div>' : ''}<div class="stats"><div class="stat"><small>Pedidos aguardando</small><strong>${pending}</strong><span>Prontos para receber atenção</span></div><div class="stat"><small>Pedidos confirmados</small><strong>${money(confirmed)}</strong><span>Subtotal, sem frete · até 200 pedidos</span></div><div class="stat"><small>Peças no estoque</small><strong>${units}</strong><span>Somando todas as variações</span></div><div class="stat"><small>Produtos cadastrados</small><strong>${products.length}</strong><span>${products.filter((p) => Number(p.active)).length} disponíveis na vitrine</span></div></div><section class="panel"><div class="panel-top"><h2>Os últimos pedidos</h2><button class="link-button" id="go-orders">Ver todos ↗</button></div><div id="latest-orders">${orderTable(orders.slice(0, 5))}</div><p class="intro-note" id="latest-orders-update" role="status">Atualiza automaticamente a cada 5 minutos.</p></section><section class="panel"><h2>Atenção ao estoque</h2>${low.length ? low.map((p) => `<p><strong>${esc(p.name)}</strong> · ${stock(p)} unidade(s) restante(s)</p>`).join('') : '<p>Por aqui está tudo em dia. Seus produtos ativos têm mais de 3 unidades.</p>'}</section>${settings.demo === '1' ? '<p class="intro-note">Sua vitrine contém produtos demonstrativos. Edite as peças, envie suas fotos e ajuste o estoque antes de divulgar.</p>' : ''}`;
    $('#go-settings')?.addEventListener('click', () => {
        tab = 'settings';
        render();
    });
    $('#go-orders').onclick = () => {
        tab = 'orders';
        render();
    };
    bindOrders();
}
/**
 * Lista catálogo administrativo com busca local e botões para editar produto ou movimentar
 * estoque.
 */
function renderProducts() {
    $('#admin-content').innerHTML =
        `<section class="panel"><div class="panel-top"><h2>Catálogo e estoque</h2><input type="search" id="product-search" placeholder="Buscar uma peça…" aria-label="Buscar produto"><button class="button small" id="new-product">+ Nova peça</button></div><div class="table-scroll"><table><thead><tr><th>Produto</th><th>Preço</th><th>Estoque</th><th>Vitrine</th><th>Ações</th></tr></thead><tbody id="product-rows"></tbody></table></div></section>`;
    const rows = () => {
        $('#product-rows').innerHTML =
            products
                .filter((p) =>
                    p.name.toLowerCase().includes($('#product-search').value.toLowerCase()),
                )
                .map(
                    (p) =>
                        `<tr><td><div class="table-product"><img src="../${esc(p.image)}" alt=""><div><strong>${esc(p.name)}</strong><small>${esc(p.category)}</small></div></div></td><td>${money(p.price)}</td><td class="${stock(p) <= 3 ? 'low-stock' : ''}">${stock(p)} un.<small>${p.variants.length} variações</small></td><td><span class="status ${Number(p.active) ? 'active' : 'inactive'}">${Number(p.active) ? 'Ativo' : 'Oculto'}</span></td><td><div class="table-actions"><button data-edit="${p.id}">Editar</button><button data-stock="${p.id}">Estoque</button></div></td></tr>`,
                )
                .join('') || '<tr><td colspan="5">Nenhuma peça encontrada.</td></tr>';
        $$('[data-edit]').forEach((b) => (b.onclick = () => editProduct(Number(b.dataset.edit))));
        $$('[data-stock]').forEach((b) => (b.onclick = () => editStock(Number(b.dataset.stock))));
    };
    rows();
    $('#product-search').oninput = rows;
    $('#new-product').onclick = () => editProduct();
}
/**
 * Monta formulário de criação/edição; upload envia FormData e retorna caminho. Ao salvar peça
 * nova, abre suas variações de estoque.
 */
function editProduct(id) {
    const p = products.find((p) => Number(p.id) === id) || {
        id: 0,
        name: '',
        category: 'Vestidos',
        description: '',
        price: 0,
        old_price: 0,
        image: 'assets/images/dress.jpg',
        active: 1,
        featured: 0,
    };
    dialog(
        `<span class="eyebrow">CATÁLOGO</span><h2>${id ? 'Editar peça' : 'Um novo amor para a vitrine'}</h2><form id="product-form"><input type="hidden" name="id" value="${p.id}"><input type="hidden" name="image" value="${esc(p.image)}"><div class="upload-preview"><img id="preview" src="../${esc(p.image)}" alt="Foto da peça"><div><label for="photo-upload" class="file-input-label">Foto do produto</label><input id="photo-upload" type="file" accept="image/jpeg,image/png,image/webp"><p>JPG, PNG ou WebP. Até 5 MB. Prefira fotos verticais.</p><p id="upload-status" role="status"></p></div></div><div class="form-grid"><label class="form-field full">Nome da peça<input name="name" required maxlength="150" value="${esc(p.name)}"></label><label class="form-field">Categoria<select name="category">${['Vestidos', 'Conjuntos', 'Blusas', 'Calças', 'Saias', 'Acessórios'].map((c) => `<option ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="form-field">Preço (R$)<input type="number" name="price" step="0.01" min="0.01" max="100000" required value="${(p.price / 100).toFixed(2)}"></label><label class="form-field">Preço anterior (R$, opcional)<input type="number" name="old_price" step="0.01" min="0" max="100000" value="${(p.old_price / 100).toFixed(2)}"></label><label class="form-field full">Descrição<textarea name="description" required maxlength="4000">${esc(p.description)}</textarea></label></div><label class="check-field"><input type="checkbox" name="active" ${Number(p.active) ? 'checked' : ''}> Mostrar na vitrine</label><label class="check-field"><input type="checkbox" name="featured" ${Number(p.featured) ? 'checked' : ''}> Destacar na coleção</label><p id="editor-error" class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Salvar peça</button></div></form>`,
    );
    let uploading = false;
    $('#photo-upload').onchange = async (e) => {
        if (!e.target.files[0]) return;
        uploading = true;
        $('#product-form button[type=submit]').disabled = true;
        $('#upload-status').textContent = 'Enviando foto…';
        try {
            const f = new FormData();
            f.append('image', e.target.files[0]);
            const result = await api('upload', f);
            $('#product-form [name=image]').value = result.image;
            $('#preview').src = '../' + result.image;
            $('#upload-status').textContent = 'Foto enviada.';
        } catch (err) {
            errorInForm(err);
            $('#upload-status').textContent = 'Não foi possível enviar.';
        } finally {
            uploading = false;
            $('#product-form button[type=submit]').disabled = false;
        }
    };
    $('#product-form').onsubmit = async (e) => {
        e.preventDefault();
        if (uploading) return;
        const b = $('button[type=submit]', e.target);
        b.disabled = true;
        try {
            const data = Object.fromEntries(new FormData(e.target));
            data.price = Math.round(Number(data.price) * 100);
            data.old_price = Math.round(Number(data.old_price) * 100);
            const result = await api('product', data);
            $('#editor-dialog').close();
            await load();
            toast('Peça salva com carinho.');
            if (!id) editStock(Number(result.id));
        } catch (err) {
            errorInForm(err);
        } finally {
            b.disabled = false;
        }
    };
}
/**
 * Monta entradas/saídas por tamanho e cor; a API soma delta à quantidade atual e registra o
 * motivo.
 */
function editStock(id) {
    const p = products.find((p) => Number(p.id) === id);
    dialog(
        `<span class="eyebrow">TAMANHOS, CORES E QUANTIDADES</span><h2>${esc(p.name)}</h2><div>${p.variants.map((v) => `<div class="variant-row"><span>${esc(v.color)} / ${esc(v.size)}</span><strong>${v.stock} un.</strong><button class="link-button" data-fill="${v.id}">Movimentar</button></div>`).join('') || '<p class="intro-note">Adicione a primeira cor e tamanho abaixo.</p>'}</div><form id="stock-form" class="stock-form"><div class="form-grid"><label class="form-field">Tamanho<input name="size" required maxlength="20" placeholder="P, M, G, Único…"></label><label class="form-field">Cor<input name="color" required maxlength="60" placeholder="Areia, Preto…"></label><label class="form-field">Entrada (+) ou saída (−)<input name="delta" type="number" step="1" min="-100000" max="100000" required placeholder="Ex.: 5 ou -2"></label><label class="form-field">Motivo<input name="reason" required maxlength="200" placeholder="Reposição, ajuste, venda na loja…"></label></div><p class="intro-note">Use a mesma cor e tamanho para ajustar uma variação existente. Uma combinação nova cria uma variação. Quantidades são somadas ou subtraídas do estoque atual.</p><p id="editor-error" class="form-error" role="alert"></p><div class="form-actions"><button class="button">Salvar movimentação</button></div></form>`,
    );
    $$('[data-fill]').forEach(
        (b) =>
            (b.onclick = () => {
                const v = p.variants.find((v) => Number(v.id) === Number(b.dataset.fill));
                $('#stock-form [name=size]').value = v.size;
                $('#stock-form [name=color]').value = v.color;
                $('#stock-form [name=delta]').focus();
            }),
    );
    $('#stock-form').onsubmit = async (e) => {
        e.preventDefault();
        const b = $('button', e.target);
        b.disabled = true;
        try {
            await api('stock', { ...Object.fromEntries(new FormData(e.target)), product_id: id });
            $('#editor-dialog').close();
            await load();
            toast('Estoque atualizado.');
        } catch (err) {
            errorInForm(err);
        } finally {
            b.disabled = false;
        }
    };
}
/**
 * Mostra os pedidos carregados pelo dashboard e permite filtrar status localmente.
 */
function renderOrders() {
    $('#admin-content').innerHTML =
        `<section class="panel"><div class="panel-top"><h2>Pedidos recebidos</h2><select id="order-filter" aria-label="Filtrar pedidos"><option value="">Todos os status</option>${Object.entries(
            statusNames,
        )
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join(
                '',
            )}</select></div><div id="orders-table"></div><p class="intro-note">Exibindo até os 200 pedidos mais recentes. Valores não incluem frete e não representam confirmação automática de pagamento.</p></section>`;
    const update = () => {
        $('#orders-table').innerHTML = orderTable(
            orders.filter(
                (o) => !$('#order-filter').value || o.status === $('#order-filter').value,
            ),
        );
        bindOrders();
    };
    $('#order-filter').onchange = update;
    update();
}
/**
 * Abre compra, itens e ações de status; inclui rastreio/vínculo via admin-orders.js. Cancelar
 * pede confirmação e devolve estoque na API.
 */
function showOrder(id) {
    const o = orders.find((o) => Number(o.id) === id);
    dialog(
        `<span class="eyebrow">PEDIDO</span><h2>${esc(o.reference)}</h2><span class="status ${o.status}">${statusNames[o.status]}</span><dl class="order-detail"><dt>Cliente</dt><dd>${esc(o.customer)}</dd><dt>Contato</dt><dd>${esc(o.email)} · ${esc(o.phone)}</dd><dt>Endereço</dt><dd>${esc(o.address)}</dd><dt>Recebido em</dt><dd>${date(o.created_at)}</dd></dl><div class="table-scroll"><table><thead><tr><th>Peça</th><th>Qtd.</th><th>Valor unitário</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${i.quantity}</td><td>${money(i.price)}</td></tr>`).join('')}</tbody></table></div><div class="cart-total"><span>Subtotal</span><strong>${money(o.subtotal)}</strong></div><p class="intro-note">Frete e pagamento a combinar com a cliente. Confirme o pagamento antes de marcar como confirmado.</p><p id="editor-error" class="form-error" role="alert"></p><div class="order-actions">${o.status === 'pending' ? '<button class="button small" data-status="confirmed">Confirmar pedido</button>' : ''}${o.status === 'confirmed' ? '<button class="button small" data-status="shipped">Marcar como enviado</button>' : ''}${o.status === 'shipped' ? '<button class="button small" data-status="delivered">Marcar como entregue</button>' : ''}${['pending', 'confirmed'].includes(o.status) ? '<button class="button outline small" data-status="cancelled">Cancelar e devolver estoque</button>' : ''}<a class="button outline small" href="https://wa.me/${(o.phone.length <= 11 ? '55' : '') + o.phone}?text=${encodeURIComponent('Olá, ' + o.customer + '! Vamos falar sobre seu pedido ' + o.reference + ' na Use by Cami?')}" target="_blank" rel="noopener noreferrer">Falar com cliente ↗</a></div>`,
    );
    renderOrderExtras(o);
    $$('[data-status]').forEach(
        (b) =>
            (b.onclick = async () => {
                if (
                    b.dataset.status === 'cancelled' &&
                    !confirm('Cancelar este pedido e devolver todas as peças ao estoque?')
                )
                    return;
                b.disabled = true;
                try {
                    await api('order-status', { id, status: b.dataset.status });
                    $('#editor-dialog').close();
                    await load();
                    toast('Pedido atualizado.');
                } catch (err) {
                    errorInForm(err);
                    b.disabled = false;
                }
            }),
    );
}
/**
 * Mostra as últimas movimentações de estoque recebidas do dashboard, incluindo motivos e
 * quantidades.
 */
function renderMovements() {
    $('#admin-content').innerHTML =
        `<section class="panel"><h2>Histórico do estoque</h2><p>As últimas 100 movimentações: entradas, saídas, pedidos e cancelamentos.</p><div class="table-scroll"><table><thead><tr><th>Quando</th><th>Peça</th><th>Quantidade</th><th>Motivo</th></tr></thead><tbody>${movements.map((m) => `<tr><td>${date(m.created_at)}</td><td>${esc(m.name)}<small>${esc(m.color)} / ${esc(m.size)}</small></td><td class="${m.delta >= 0 ? 'movement-positive' : 'movement-negative'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td>${esc(m.reason)}</td></tr>`).join('') || '<tr><td colspan="4">Ainda não há movimentações.</td></tr>'}</tbody></table></div></section>`;
}
/**
 * Edita contatos, aviso do topo e indicação de demonstração; salva via settings e recarrega o
 * painel.
 */
function renderSettings() {
    $('#admin-content').innerHTML =
        `<section class="panel"><h2>Os detalhes da sua loja</h2><form id="settings-form" class="settings-form"><label class="form-field">WhatsApp da loja<input name="whatsapp" type="tel" value="${esc(settings.whatsapp)}" placeholder="5511999999999" maxlength="30"><small>55 + DDD + número. Pode deixar vazio para configurar depois.</small></label><label class="form-field">Instagram<input name="instagram" value="${esc(settings.instagram)}" placeholder="usebycami" maxlength="30"><small>Apenas o usuário, sem @.</small></label><label class="form-field">Mensagem no topo da loja<input name="notice" value="${esc(settings.notice)}" required maxlength="200"></label><label class="check-field"><input type="checkbox" name="demo" ${settings.demo === '1' ? 'checked' : ''}> Mostrar aviso de produtos demonstrativos</label><p class="intro-note">Desative o aviso quando fotos, preços, descrições e quantidades corresponderem aos seus produtos reais.</p><p id="settings-error" class="form-error" role="alert"></p><button class="button">Salvar configurações</button></form></section>`;
    $('#settings-form').onsubmit = async (e) => {
        e.preventDefault();
        const b = $('button', e.target);
        b.disabled = true;
        try {
            await api('settings', Object.fromEntries(new FormData(e.target)));
            await load();
            toast('Sua loja foi atualizada.');
        } catch (err) {
            $('#settings-error').textContent = err.message;
        } finally {
            b.disabled = false;
        }
    };
}
// Inicialização: consulta session; mostra login se necessário ou chama load() para abrir o painel.
(async () => {
    try {
        session = await api('session');
        if (session.admin) await load();
        else showAuth();
    } catch (e) {
        $('#auth-error').textContent = e.message;
        $('#auth-submit').textContent = 'Atualize a página para tentar novamente';
        $('#auth-submit').disabled = true;
    }
})();
