/**
 * Componente compartilhado por account.js e checkout-auth.js para senha temporária. Depende de
 * store.js e não decide a navegação final: cada chamador fornece onSaved.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';

/**
 * Devolve o formulário da troca obrigatória: senha temporária, nova senha, confirmação e saída
 * da conta.
 */
function requiredPasswordMarkup() {
    return `<h2>Crie sua nova senha</h2><p>A loja redefiniu seu acesso com uma senha temporária. Escolha uma senha só sua para continuar na conta ou finalizar a compra.</p><form class="customer-form" data-required-password><label class="form-field">Senha temporária<input name="current_password" type="password" autocomplete="current-password" required maxlength="72"></label><label class="form-field">Nova senha<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="72" required><small>Pelo menos 6 caracteres. Escolha uma senha diferente da temporária.</small></label><label class="form-field">Confirme a nova senha<input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="72" required></label><p class="form-error" role="alert"></p><button class="button" type="submit">Salvar nova senha e continuar</button><button class="text-link" type="button" data-password-logout>Sair da conta</button></form>`;
}

/**
 * Liga o formulário ao POST customer-password. Depois atualiza a sessão e chama onSaved para
 * liberar conta/sacola; erros permanecem no formulário.
 */
function bindRequiredPassword(container, onSaved) {
    const form = $('[data-required-password]', container);
    form.onsubmit = async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const error = $('.form-error', form),
            buttons = $$('button', form);
        error.textContent = '';
        if (data.password !== data.confirmation) {
            error.textContent = 'As senhas não conferem.';
            return;
        }
        buttons.forEach((button) => (button.disabled = true));
        try {
            await api('customer-password', data);
            session = await api('session');
            invalidateOrder();
            form.reset();
            await onSaved();
            toast('Nova senha salva! Seu acesso está liberado.');
        } catch (errorResponse) {
            error.textContent = errorResponse.message;
        } finally {
            buttons.forEach((button) => (button.disabled = false));
        }
    };
    $('[data-password-logout]', form).onclick = async () => {
        try {
            await api('customer-logout', {});
            location.reload();
        } catch (error) {
            $('.form-error', form).textContent = error.message;
        }
    };
}
