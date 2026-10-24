/**
 * Etapa de identificação/entrega da sacola. Usa estado e funções de store.js; a troca obrigatória
 * usa password-change.js. checkoutDraft conserva a entrega durante uma reautenticação da mesma
 * conta.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
let checkoutDraft = null;

/**
 * Devolve o HTML adequado ao estado atual: troca obrigatória, entrada/cadastro ou formulário de
 * entrega.
 */
function checkoutSection(unavailable) {
    if (Number(session.customer?.must_change_password)) {
        return `<section class="checkout-form" id="checkout-password-change">${requiredPasswordMarkup()}</section>`;
    }
    if (!session.customer)
        return `<section class="checkout-form checkout-signin" aria-labelledby="checkout-heading"><h3 id="checkout-heading">Vamos preparar seu pedido?</h3><p class="checkout-signin-intro">Para finalizar sua compra, entre na sua conta ou faça seu cadastro. Suas peças continuam na sacola.</p><div class="account-auth-tabs" role="group" aria-label="Acesso para finalizar a compra"><button type="button" data-checkout-mode="login" class="selected" aria-pressed="true">Entrar na conta</button><button type="button" data-checkout-mode="register" aria-pressed="false">Criar cadastro</button></div><div id="checkout-auth-content"></div></section>`;
    return `<form class="checkout-form" id="checkout-form"><h3>Vamos preparar seu pedido?</h3><div class="checkout-account">Você está na conta de <strong>${escapeHTML(session.customer.name)}</strong>. Seu pedido ficará salvo no seu histórico.</div><label class="form-field">Seu nome<input name="customer" autocomplete="name" required maxlength="150"></label><label class="form-field">E-mail<input name="email" type="email" autocomplete="email" required maxlength="190" readonly></label><label class="form-field">WhatsApp com DDD<input name="phone" type="tel" autocomplete="tel" placeholder="(11) 99999-9999" required minlength="10" maxlength="30"></label><label class="form-field">Endereço de entrega<textarea name="address" autocomplete="street-address" placeholder="CEP, rua, número, complemento, bairro, cidade e UF" required maxlength="700"></textarea></label><p class="cart-note">Seus dados serão usados para atender e entregar este pedido. <button type="button" class="remove-item" id="checkout-privacy">Saiba mais</button></p><p id="checkout-error" class="form-error" role="alert"></p><button class="button" type="submit" ${unavailable ? 'disabled' : ''}>Enviar meu pedido <svg><use href="#i-arrow"/></svg></button></form>`;
}

/**
 * Conecta eventos ao HTML recém-criado. Preenche dados autenticados e recupera rascunho somente
 * para o mesmo ID de cliente.
 */
function bindCheckoutSection() {
    if (Number(session.customer?.must_change_password)) {
        bindRequiredPassword($('#checkout-password-change'), () => {
            renderCart();
            window.dispatchEvent(new CustomEvent('cami:customer-signed-in'));
        });
        return;
    }
    if (!session.customer) {
        renderCheckoutAuth('login');
        return;
    }
    const form = $('#checkout-form');
    const draft =
        checkoutDraft?.accountId === Number(session.customer.id) ? checkoutDraft.data : {};
    for (const [name, value] of Object.entries({
        customer: draft.customer ?? session.customer.name,
        email: session.customer.email,
        phone: draft.phone ?? session.customer.phone,
        address: draft.address ?? session.customer.address,
    }))
        form.elements.namedItem(name).value = value;
    form.addEventListener('submit', checkout);
    $('#checkout-privacy').onclick = () => showInfo('privacy');
}

/**
 * Alterna entrar/cadastrar na própria sacola, valida confirmação e autentica pela API. Reabre a
 * etapa sem perder os itens.
 */
function renderCheckoutAuth(mode) {
    const register = mode === 'register';
    $$('[data-checkout-mode]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.checkoutMode === mode);
        b.setAttribute('aria-pressed', String(b.dataset.checkoutMode === mode));
        b.onclick = () => renderCheckoutAuth(b.dataset.checkoutMode);
    });
    $('#checkout-auth-content').innerHTML =
        `<form id="checkout-auth-form">${register ? '<label class="form-field">Seu nome<input name="name" autocomplete="name" required maxlength="150"></label><label class="form-field">WhatsApp com DDD<input name="phone" type="tel" autocomplete="tel" required minlength="10" maxlength="30" placeholder="(11) 99999-9999"></label>' : ''}<label class="form-field">E-mail<input name="email" type="email" autocomplete="username" required maxlength="190"></label><label class="form-field">${register ? 'Crie uma senha' : 'Senha'}<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? 6 : 1}" maxlength="72">${register ? '<small>Pelo menos 6 caracteres.</small>' : ''}</label>${register ? '<label class="form-field">Confirme a senha<input name="confirmation" type="password" autocomplete="new-password" required minlength="6" maxlength="72"></label>' : ''}<p class="form-error" role="alert"></p><button type="submit" class="button">${register ? 'Criar cadastro e continuar' : 'Entrar e continuar'} <span>→</span></button></form>${register ? '' : '<a class="auth-forgot" href="conta.php?return=cart&auth=recover">Esqueci minha senha</a>'}`;
    let busy = false;
    $('#checkout-auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.target,
            data = Object.fromEntries(new FormData(form)),
            error = $('.form-error', form);
        error.textContent = '';
        if (register && data.password !== data.confirmation) {
            error.textContent = 'As senhas não conferem.';
            return;
        }
        busy = true;
        const buttons = $$('[data-checkout-mode],#checkout-auth-form button');
        buttons.forEach((b) => (b.disabled = true));
        try {
            await api(register ? 'customer-register' : 'customer-login', data);
            session = await api('session');
            invalidateOrder();
            renderCart();
            window.dispatchEvent(new CustomEvent('cami:customer-signed-in'));
            ($('#checkout-form') || $('#checkout-password-change')).scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
            toast(
                Number(session.customer?.must_change_password)
                    ? 'Crie uma nova senha para continuar.'
                    : register
                      ? 'Cadastro criado! Agora confira a entrega.'
                      : 'Você entrou! Confira os dados de entrega.',
            );
        } catch (err) {
            error.textContent = err.message;
        } finally {
            busy = false;
            buttons.forEach((b) => (b.disabled = false));
        }
    });
}
