/**
 * Abas Clientes e Administradores do painel. Usa api/dialog/esc definidos em admin.js. Busca de
 * clientes é paginada no servidor; customerRequest descarta respostas antigas após troca de tela.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';

let customerSearch = '',
    customerPage = 1,
    customerRequest = 0;

// Trechos HTML compartilhados do editor; confirmação da nova senha é distinta da senha administrativa do autor.
const newPasswordFields = () =>
    `<label class="form-field">Nova senha<input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="72" required><small>Pelo menos 6 caracteres.</small></label><label class="form-field">Confirme a nova senha<input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="72" required></label>`;
const adminConfirmation = () =>
    `<label class="form-field">Sua senha de administrador<input name="current_password" type="password" autocomplete="current-password" maxlength="72" required><small>Confirme seu acesso para salvar esta alteração.</small></label>`;

/**
 * Busca apenas IDs/e-mails administrativos, monta lista e conecta Novo administrador ao editor
 * compartilhado.
 */
async function renderAdmins() {
    $('#admin-content').innerHTML =
        '<section class="panel"><h2>Administradores</h2><p role="status">Carregando acessos…</p></section>';
    try {
        const result = await api('admin-accounts');
        if (tab !== 'admins') return;
        $('#admin-content').innerHTML =
            `<section class="panel"><div class="panel-top"><h2>Administradores</h2><button class="button small" id="new-admin">+ Novo administrador</button></div><p>Cada pessoa entra com seu próprio e-mail e senha. Todos os administradores têm acesso completo à loja, inclusive aos clientes e à criação de outros administradores.</p><div class="table-scroll"><table><thead><tr><th>E-mail</th><th>Acesso</th></tr></thead><tbody>${result.admins.map((a) => `<tr><td>${esc(a.email)}</td><td>Administrador</td></tr>`).join('')}</tbody></table></div></section>`;
        $('#new-admin').onclick = () => accountEditor('admin');
    } catch (error) {
        if (tab === 'admins') showAccountLoadError(error, renderAdmins);
    }
}

/**
 * Consulta admin-customers com busca/página; desenha cadastros e ações de redefinição, ignorando
 * resposta se a aba mudou.
 */
async function renderCustomers() {
    const request = ++customerRequest;
    $('#admin-content').innerHTML =
        '<section class="panel"><h2>Clientes</h2><p role="status">Carregando cadastros…</p></section>';
    try {
        const result = await api(
            `admin-customers&q=${encodeURIComponent(customerSearch)}&page=${customerPage}`,
        );
        if (tab !== 'customers' || request !== customerRequest) return;
        $('#admin-content').innerHTML =
            `<section class="panel"><div class="panel-top"><h2>Clientes</h2><button class="button small" id="new-customer">+ Cadastrar cliente</button></div><form id="customer-search-form" class="account-search"><label class="form-field">Buscar por nome ou e-mail<input type="search" name="q" maxlength="190" value="${esc(customerSearch)}"></label><button class="button small">Buscar</button></form><p>${result.total} cadastro(s) encontrado(s).</p><div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Contato</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>${result.customers.map((c) => `<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.email)}</small></td><td>${esc(c.phone)}</td><td>${date(c.created_at)}</td><td><button class="link-button" data-customer-reset="${c.id}">Redefinir senha</button></td></tr>`).join('') || '<tr><td colspan="4">Nenhuma cliente encontrada.</td></tr>'}</tbody></table></div><div class="account-pagination"><button class="button outline small" id="customers-prev" ${result.page <= 1 ? 'disabled' : ''}>Anterior</button><span>${result.page} de ${result.pages}</span><button class="button outline small" id="customers-next" ${result.page >= result.pages ? 'disabled' : ''}>Próxima</button></div></section>`;
        $('#new-customer').onclick = () => accountEditor('customer');
        $('#customer-search-form').onsubmit = (e) => {
            e.preventDefault();
            customerSearch = e.target.elements.q.value.trim();
            customerPage = 1;
            renderCustomers();
        };
        $('#customers-prev').onclick = () => {
            customerPage--;
            renderCustomers();
        };
        $('#customers-next').onclick = () => {
            customerPage++;
            renderCustomers();
        };
        $$('[data-customer-reset]').forEach(
            (button) =>
                (button.onclick = () =>
                    accountEditor(
                        'reset',
                        result.customers.find(
                            (c) => Number(c.id) === Number(button.dataset.customerReset),
                        ),
                    )),
        );
    } catch (error) {
        if (tab === 'customers' && request === customerRequest)
            showAccountLoadError(error, renderCustomers);
    }
}

/**
 * Mostra falha da listagem com botão que executa a função retry fornecida pelo chamador.
 */
function showAccountLoadError(error, retry) {
    $('#admin-content').innerHTML =
        `<section class="panel"><p class="form-error" role="alert">${esc(error.message)}</p><button class="button outline" id="retry-accounts">Tentar novamente</button></section>`;
    $('#retry-accounts').onclick = retry;
}

/**
 * Recebe tipo admin/customer/reset e cliente opcional. Valida confirmação, pede senha
 * administrativa e envia a rota correspondente; limpa senhas após sucesso.
 */
function accountEditor(kind, customer = null) {
    const isCustomer = kind === 'customer',
        reset = kind === 'reset';
    const title = reset
        ? 'Redefinir senha da cliente'
        : isCustomer
          ? 'Cadastrar cliente'
          : 'Novo administrador';
    dialog(
        `<span class="eyebrow">ACESSOS DA LOJA</span><h2>${title}</h2>${reset ? `<p><strong>${esc(customer.name)}</strong><br>${esc(customer.email)}</p><p>Confirme a identidade da cliente pelo atendimento antes de alterar o acesso. Os acessos anteriores serão encerrados. Informe a senha temporária pelo atendimento. No próximo login, a cliente será obrigada a criar uma senha diferente antes de acessar a conta ou comprar.</p>` : ''}<form id="account-editor-form">${isCustomer ? '<label class="form-field">Nome da cliente<input name="name" maxlength="150" autocomplete="off" required></label><label class="form-field">WhatsApp com DDD<input name="phone" type="tel" minlength="10" maxlength="30" autocomplete="off" required></label><label class="form-field">Endereço (opcional)<textarea name="address" maxlength="700" autocomplete="off"></textarea></label>' : ''}${reset ? '' : '<label class="form-field">E-mail<input name="email" type="email" maxlength="190" autocomplete="off" required></label>'}${newPasswordFields()}${reset ? '<label class="check-field"><input name="identity_confirmed" type="checkbox" required> Conferi a identidade da cliente pelo atendimento.</label>' : ''}${adminConfirmation()}<p class="form-error" id="editor-error" role="alert"></p><button class="button" type="submit">${reset ? 'Redefinir senha' : 'Salvar cadastro'}</button></form>`,
    );
    $('#account-editor-form').onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target,
            data = Object.fromEntries(new FormData(form)),
            button = $('button[type=submit]', form);
        $('#editor-error').textContent = '';
        if (data.password !== data.confirmation) {
            errorInForm(new Error('As senhas não conferem.'));
            return;
        }
        if (reset) {
            data.id = customer.id;
            data.identity_confirmed = form.elements.identity_confirmed.checked;
        }
        button.disabled = true;
        try {
            await api(
                reset
                    ? 'admin-customer-password'
                    : isCustomer
                      ? 'admin-customers'
                      : 'admin-accounts',
                data,
            );
            form.reset();
            $('#editor-dialog').close();
            $('#editor-content').replaceChildren();
            toast(
                reset
                    ? 'Senha temporária definida. A cliente deverá trocá-la ao entrar.'
                    : 'Cadastro criado com sucesso.',
            );
            if (kind === 'admin') await renderAdmins();
            else {
                if (isCustomer) {
                    customerPage = 1;
                    customerSearch = '';
                }
                await renderCustomers();
            }
        } catch (error) {
            errorInForm(error);
        } finally {
            button.disabled = false;
        }
    };
}
