/**
 * Complemento do diálogo de pedido aberto por admin.js. As informações salvas aparecem depois no
 * histórico da cliente; não há integração automática com a transportadora.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
/**
 * Recebe pedido do dashboard, anexa formulários de rastreio e vínculo. Envia order-shipping ou
 * order-link-customer e atualiza a interface após sucesso.
 */
function renderOrderExtras(order) {
    const shipping = order.shipping || {};
    $('#editor-content').insertAdjacentHTML(
        'beforeend',
        `<section class="order-extra"><h3>Dados de rastreio</h3><p class="intro-note">Estas informações aparecem na área do cliente. O link abre o site da transportadora; os status do pedido são atualizados pela loja.</p><form id="shipping-form"><div class="form-grid"><label class="form-field">Transportadora<input name="carrier" maxlength="100" value="${esc(shipping.carrier || '')}" placeholder="Correios, transportadora ou entrega local"></label><label class="form-field">Código de rastreio<input name="tracking_code" maxlength="100" value="${esc(shipping.tracking_code || '')}"></label><label class="form-field full">Link HTTPS para acompanhar<input name="tracking_url" type="url" maxlength="500" value="${esc(shipping.tracking_url || '')}" placeholder="https://…"></label></div><p class="form-error" role="alert"></p><button class="button outline small">Salvar rastreio</button></form></section><section class="order-extra"><h3>Conta da cliente</h3>${order.account_email ? `<p class="intro-note">Pedido vinculado a <strong>${esc(order.account_email)}</strong>.</p>` : `<p class="intro-note">Para uma compra antiga ou sem código privado, confira a titularidade com a cliente e informe o e-mail da conta que ela criou.</p><form id="link-customer-form"><label class="form-field">E-mail da conta<input name="email" type="email" required maxlength="190" placeholder="cliente@exemplo.com"></label><p class="form-error" role="alert"></p><button class="button outline small">Vincular à conta</button></form>`}</section>`,
    );
    $('#shipping-form').onsubmit = async (e) => {
        e.preventDefault();
        const f = e.target,
            b = $('button', f);
        b.disabled = true;
        $('.form-error', f).textContent = '';
        try {
            const data = Object.fromEntries(new FormData(f));
            await api('order-shipping', { id: order.id, ...data });
            order.shipping = data;
            toast('Rastreio atualizado para a cliente.');
        } catch (err) {
            $('.form-error', f).textContent = err.message;
        } finally {
            b.disabled = false;
        }
    };
    $('#link-customer-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target,
            b = $('button', f),
            email = f.elements.email.value;
        if (
            !confirm(
                `Vincular o pedido ${order.reference} à conta ${email}? A cliente terá acesso aos dados desta compra.`,
            )
        )
            return;
        b.disabled = true;
        $('.form-error', f).textContent = '';
        try {
            await api('order-link-customer', { id: order.id, email });
            $('#editor-dialog').close();
            await load();
            toast('Pedido vinculado à conta.');
        } catch (err) {
            $('.form-error', f).textContent = err.message;
        } finally {
            b.disabled = false;
        }
    });
}
