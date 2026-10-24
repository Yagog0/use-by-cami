/**
 * Controlador exclusivo de conta.php, dentro de uma função isolada. Aguarda camiReady de store.js;
 * utiliza a mesma API/sessão e renderiza o fragmento app/views/account-view.php. revision evita
 * aplicar respostas antigas sobre uma tela que já mudou.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
(() => {
    const names = {
        pending: 'Pedido recebido',
        confirmed: 'Confirmado',
        shipped: 'Enviado',
        delivered: 'Entregue',
        cancelled: 'Cancelado',
    };
    const params = new URLSearchParams(location.search);
    let tab = ['profile', 'security', 'claim'].includes(params.get('tab'))
        ? params.get('tab')
        : 'orders';
    // Estado local da área de conta; revision/ordersRevision permitem descartar respostas assíncronas de uma tela anterior.
    let mode = params.get('auth') === 'recover' ? 'recover' : 'login',
        orderPage = 1,
        orderStatus = '',
        busy = false,
        revision = 0,
        ordersRevision = -1,
        detailId = null;
    const formatDate = (v) =>
        new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const badge = (status) =>
        `<span class="order-badge ${escapeHTML(status)}">${escapeHTML(names[status] || status)}</span>`;
    const feedback = (message) => {
        $('#account-feedback').textContent = message;
    };
    const formError = (form, message) => ($('.form-error', form).textContent = message);
    const authInputs = () =>
        `<label class="form-field">E-mail<input name="email" type="email" autocomplete="username" required maxlength="190"></label><label class="form-field">Senha<input name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="${mode === 'login' ? 1 : 6}" maxlength="72"></label>`;
    /**
     * Limpa dados privados visíveis e mostra login, cadastro ou ajuda para recuperação. O envio
     * autentica e segue para showArea().
     */
    function showAuth() {
        revision++;
        session.customer = null;
        $('#account-loading').hidden = true;
        $('#account-auth').hidden = false;
        $('#customer-area').hidden = true;
        $('#account-password-change').hidden = true;
        $('#account-password-change').replaceChildren();
        $('#account-content').replaceChildren();
        $('#customer-order-content').replaceChildren();
        if ($('#customer-order-dialog').open) $('#customer-order-dialog').close();
        detailId = null;
        $$('[data-auth]').forEach((b) => {
            const selected = b.dataset.auth === mode;
            b.classList.toggle('selected', selected);
            b.setAttribute('aria-pressed', String(selected));
        });
        if (mode === 'recover') {
            $('#auth-form-content').innerHTML =
                '<h2>Vamos recuperar seu acesso.</h2><p>Fale com a loja para confirmar seus dados e solicitar uma nova senha. Você não precisa guardar nenhum código.</p><button class="button" id="recovery-help">Falar com a loja</button><button class="auth-forgot" id="back-to-login">Voltar para o login</button>';
            $('#recovery-help').onclick = () =>
                contactStore(
                    'Olá, Cami! Esqueci minha senha e preciso recuperar o acesso à minha conta.',
                );
            $('#back-to-login').onclick = () => {
                mode = 'login';
                showAuth();
            };
            return;
        }
        $('#auth-form-content').innerHTML =
            `<h2>${mode === 'login' ? 'Entre no seu cantinho.' : 'Vamos nos conhecer?'}</h2><p>${mode === 'login' ? 'Acompanhe as suas escolhas com carinho.' : 'Seu histórico começa aqui. Crie uma senha com pelo menos 6 caracteres.'}</p><form id="customer-auth-form">${mode === 'register' ? '<label class="form-field">Seu nome<input name="name" autocomplete="name" required maxlength="150"></label><label class="form-field">WhatsApp com DDD<input name="phone" type="tel" autocomplete="tel" required minlength="10" maxlength="30" placeholder="(11) 99999-9999"></label>' : ''}${authInputs()}${mode !== 'login' ? '<label class="form-field">Confirme a senha<input name="confirmation" type="password" autocomplete="new-password" required minlength="6" maxlength="72"></label>' : ''}<p class="form-error" role="alert"></p><button class="button" type="submit">${mode === 'login' ? 'Entrar na minha conta' : 'Criar minha conta'} <span>→</span></button></form><button class="auth-forgot" id="switch-recover">Esqueci minha senha</button>`;
        $('#switch-recover').onclick = () => {
            mode = mode === 'recover' ? 'login' : 'recover';
            showAuth();
        };
        $('#customer-auth-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target,
                b = $('button', form),
                data = Object.fromEntries(new FormData(form));
            if (mode !== 'login' && data.password !== data.confirmation)
                return formError(form, 'As senhas não conferem.');
            b.disabled = true;
            formError(form, '');
            try {
                await api('customer-' + mode, data);
                session = await api('session');
                invalidateOrder();
                await showArea();
                if (params.get('return') === 'cart') {
                    renderCart();
                    openDialog('#cart-dialog');
                }
            } catch (err) {
                formError(form, err.message);
            } finally {
                b.disabled = false;
            }
        };
    }
    $$('[data-auth]').forEach(
        (b) =>
            (b.onclick = () => {
                mode = b.dataset.auth;
                showAuth();
            }),
    );
    /**
     * Se a senha é temporária, mostra somente a troca obrigatória. Caso contrário exibe a área
     * da cliente e a aba selecionada.
     */
    async function showArea() {
        const passwordChange = $('#account-password-change');
        if (Number(session.customer?.must_change_password)) {
            revision++;
            detailId = null;
            if ($('#customer-order-dialog').open) $('#customer-order-dialog').close();
            $('#account-loading').hidden = true;
            $('#account-auth').hidden = true;
            $('#customer-area').hidden = true;
            $('#account-content').replaceChildren();
            $('#customer-order-content').replaceChildren();
            passwordChange.hidden = false;
            passwordChange.innerHTML = requiredPasswordMarkup();
            bindRequiredPassword(passwordChange, async () => {
                await showArea();
                if (params.get('return') === 'cart' || $('#cart-dialog').open) {
                    renderCart();
                    openDialog('#cart-dialog');
                }
            });
            return;
        }
        passwordChange.hidden = true;
        passwordChange.replaceChildren();
        $('#account-loading').hidden = true;
        $('#account-auth').hidden = true;
        $('#customer-area').hidden = false;
        $('#customer-first-name').textContent = session.customer.name.split(' ')[0];
        $('#customer-avatar').textContent = session.customer.name.slice(0, 1).toUpperCase();
        await renderTab();
    }
    // Navegação interna: registra a aba na URL sem recarregar a página e renderiza seu conteúdo.
    $$('[data-account-tab]').forEach(
        (b) =>
            (b.onclick = () => {
                tab = b.dataset.accountTab;
                const url = new URL(location.href);
                url.searchParams.set('tab', tab);
                history.replaceState({}, '', url);
                renderTab();
            }),
    );
    // Encerra somente a conta de cliente, limpa dados privados da tela e retorna ao formulário de entrada.
    $('#customer-logout').onclick = async () => {
        const b = $('#customer-logout');
        b.disabled = true;
        try {
            await api('customer-logout', {});
            invalidateOrder();
            try {
                sessionStorage.removeItem('cami-order-access');
            } catch {}
            mode = 'login';
            showAuth();
            toast('Você saiu da sua conta.');
        } catch (err) {
            feedback(err.message);
        } finally {
            b.disabled = false;
        }
    };
    /**
     * Atualiza aba e versão da tela; encaminha para histórico, dados, segurança ou vínculo de
     * compra antiga.
     */
    async function renderTab() {
        revision++;
        feedback('');
        $$('[data-account-tab]').forEach((b) => {
            b.classList.toggle('selected', b.dataset.accountTab === tab);
            b.setAttribute('aria-pressed', String(b.dataset.accountTab === tab));
        });
        if (tab === 'orders') {
            $('#account-content').innerHTML =
                `<section class="customer-panel"><div class="customer-panel-head"><div><h2>Meus pedidos</h2><p>Cada etapa da sua compra, bem aqui.</p></div><button id="refresh-orders">Atualizar ↻</button></div><div class="order-tools"><select id="customer-order-filter" aria-label="Filtrar meus pedidos"><option value="">Todo o histórico</option>${Object.entries(
                    names,
                )
                    .map(
                        ([key, name]) =>
                            `<option value="${key}" ${orderStatus === key ? 'selected' : ''}>${name}</option>`,
                    )
                    .join(
                        '',
                    )}</select><small id="orders-updated"></small></div><div id="customer-order-list" aria-live="polite"><p class="loading-state">Buscando seus pedidos…</p></div><div id="order-pagination" class="order-pagination"></div></section>`;
            $('#refresh-orders').onclick = () => loadOrders();
            $('#customer-order-filter').onchange = (e) => {
                orderStatus = e.target.value;
                orderPage = 1;
                loadOrders();
            };
            await loadOrders();
        } else if (tab === 'profile') renderProfile();
        else if (tab === 'security') renderSecurity();
        else renderClaim();
    }
    /**
     * Busca histórico paginado/filtrado da própria conta. Ignora respostas de telas antigas e
     * evita consultas simultâneas para a mesma versão.
     */
    async function loadOrders(quiet = false) {
        if (
            (busy && ordersRevision === revision) ||
            tab !== 'orders' ||
            !session.customer ||
            Number(session.customer.must_change_password)
        )
            return;
        busy = true;
        const current = revision;
        ordersRevision = current;
        $('#refresh-orders').disabled = true;
        try {
            const result = await api(
                `customer-orders&page=${orderPage}&status=${encodeURIComponent(orderStatus)}`,
            );
            if (current !== revision || tab !== 'orders') return;
            feedback('');
            $('#customer-order-list').innerHTML = result.orders.length
                ? result.orders
                      .map(
                          (o) =>
                              `<article class="customer-order-card"><div class="customer-order-top"><div><strong>${escapeHTML(o.reference)}</strong><small>${formatDate(o.created_at)}</small></div>${badge(o.status)}</div><div class="customer-order-body"><div class="order-thumbs">${o.items
                                  .slice(0, 2)
                                  .map(
                                      (i) =>
                                          `<img src="${escapeHTML(i.image)}" alt="${escapeHTML(i.name)}" loading="lazy">`,
                                  )
                                  .join(
                                      '',
                                  )}</div><p>${o.items.reduce((n, i) => n + Number(i.quantity), 0)} peça(s) escolhida(s)<strong>${money(o.subtotal)}</strong></p><button class="button outline" data-view-order="${o.id}">Ver pedido <span>↗</span></button></div></article>`,
                      )
                      .join('')
                : `<div class="account-empty"><span>♡</span><h3>${orderStatus ? 'Nenhum pedido nesta etapa.' : 'Suas próximas histórias começam aqui.'}</h3><p>${orderStatus ? 'Experimente consultar todo o histórico.' : 'Compras feitas com sua conta aparecerão aqui. Já comprou sem login? Use “Vincular uma compra”.'}</p><a class="button outline" href="catalogo.php">Explorar a coleção →</a></div>`;
            $$('[data-view-order]').forEach(
                (b) => (b.onclick = () => showOrder(Number(b.dataset.viewOrder))),
            );
            $('#order-pagination').innerHTML =
                result.pages > 1
                    ? `<button id="orders-prev" ${result.page <= 1 ? 'disabled' : ''}>← Anterior</button><span>${result.page} de ${result.pages}</span><button id="orders-next" ${result.page >= result.pages ? 'disabled' : ''}>Próxima →</button>`
                    : '';
            $('#orders-prev')?.addEventListener('click', () => {
                orderPage--;
                loadOrders();
            });
            $('#orders-next')?.addEventListener('click', () => {
                orderPage++;
                loadOrders();
            });
            $('#orders-updated').textContent =
                'Atualizado às ' +
                new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (err) {
            if (current === revision) {
                if (!quiet) feedback(err.message);
                if (!quiet)
                    $('#customer-order-list').innerHTML =
                        '<p class="cart-note">Não conseguimos consultar seus pedidos. Tente atualizar ou entre novamente.</p>';
            }
        } finally {
            if (ordersRevision === current) {
                busy = false;
                if ($('#refresh-orders')) $('#refresh-orders').disabled = false;
            }
        }
    }
    /**
     * Busca detalhes autorizados do pedido, monta linha do tempo e entrega. Atualizações
     * silenciosas só atingem o diálogo ainda aberto.
     */
    async function showOrder(id, quiet = false) {
        const current = revision;
        try {
            const { order: o } = await api('customer-order&id=' + id);
            if (current !== revision || !session.customer) return;
            if (quiet && (!$('#customer-order-dialog').open || detailId !== id)) return;
            detailId = id;
            const stages = ['pending', 'confirmed', 'shipped', 'delivered'],
                step = stages.indexOf(o.status);
            $('#customer-order-content').innerHTML =
                `<span class="eyebrow">ACOMPANHE SUA ESCOLHA</span><h2>${escapeHTML(o.reference)}</h2>${badge(o.status)}${
                    o.status === 'cancelled'
                        ? '<p class="order-cancelled">Este pedido foi cancelado. Para dúvidas sobre pagamento ou reembolso, fale com a loja.</p>'
                        : `<ol class="order-timeline">${stages
                              .map((s, i) => {
                                  const event = o.events.find((e) => e.status === s);
                                  return `<li class="${i <= step ? 'done' : ''} ${i === step ? 'current' : ''}">${i < step ? '✓ ' : ''}${names[s]}<small>${event ? formatDate(event.created_at) : i <= step ? 'Etapa concluída' : 'Aguardando'}</small></li>`;
                              })
                              .join('')}</ol>`
                }<div class="order-detail-items">${o.items.map((i) => `<div class="order-detail-item"><img src="${escapeHTML(i.image)}" alt="${escapeHTML(i.name)}"><div>${escapeHTML(i.name)}<small>${i.quantity} un. · ${money(i.price)} cada</small></div><strong>${money(Number(i.price) * Number(i.quantity))}</strong></div>`).join('')}</div><div class="cart-total"><span>Subtotal das peças</span><strong>${money(o.subtotal)}</strong></div><p class="cart-note">Frete e pagamento são combinados no atendimento. As etapas são atualizadas pela loja.</p><div class="order-address"><div><h3>Entrega para</h3><p>${escapeHTML(o.customer)}\n${escapeHTML(o.address)}\n${escapeHTML(o.phone)}</p></div><div><h3>Acompanhar o envio</h3>${o.shipping && (o.shipping.carrier || o.shipping.tracking_code || o.shipping.tracking_url) ? `<p>${escapeHTML(o.shipping.carrier || 'Entrega da loja')}</p>${o.shipping.tracking_code ? `<code>${escapeHTML(o.shipping.tracking_code)}</code>` : ''}${o.shipping.tracking_url ? `<a href="${escapeHTML(o.shipping.tracking_url)}" target="_blank" rel="noopener noreferrer">Abrir rastreamento ↗</a>` : '<p>Consulte a loja com o código acima.</p>'}` : '<p>O rastreio aparecerá aqui quando a loja informar os dados do envio.</p>'}</div></div><button class="button outline" id="order-help">Falar sobre este pedido ↗</button>`;
            $('#order-help').onclick = () =>
                contactStore(`Olá, Cami! Gostaria de falar sobre meu pedido ${o.reference}.`);
            if (!quiet) openDialog('#customer-order-dialog');
        } catch (err) {
            if (!quiet) feedback(err.message);
        }
    }
    /**
     * Monta edição dos dados da cliente; a mudança de e-mail exige senha atual. Após salvar,
     * atualiza session.customer.
     */
    function renderProfile() {
        const c = session.customer;
        $('#account-content').innerHTML =
            `<section class="customer-panel"><h2>Meus dados</h2><p>Deixe tudo pronto para a sua próxima escolha.</p><form class="customer-form" id="profile-form"><label class="form-field">Seu nome<input name="name" required maxlength="150" autocomplete="name" value="${escapeHTML(c.name)}"></label><label class="form-field">E-mail<input name="email" type="email" required maxlength="190" autocomplete="email" value="${escapeHTML(c.email)}"></label><label class="form-field">WhatsApp com DDD<input name="phone" type="tel" required minlength="10" maxlength="30" autocomplete="tel" value="${escapeHTML(c.phone)}"></label><label class="form-field">Endereço salvo<textarea name="address" maxlength="700" autocomplete="street-address" placeholder="CEP, rua, número, bairro, cidade e UF">${escapeHTML(c.address)}</textarea><small>Usado nas próximas compras. O endereço de pedidos já enviados não é alterado.</small></label><label class="form-field" id="email-password-field" hidden>Senha atual para alterar o e-mail<input name="current_password" type="password" autocomplete="current-password" maxlength="72"></label><p class="form-error" role="alert"></p><button class="button">Salvar meus dados</button></form><div class="data-notice">Você faz parte da Cami desde ${new Date(c.created_at).toLocaleDateString('pt-BR')}. Aqui você pode baixar os dados do seu cadastro e os pedidos vinculados à sua conta.<br><a href="api/index.php?action=customer-export" download>Baixar meus dados e histórico ↓</a></div></section>`;
        const form = $('#profile-form');
        form.elements.email.oninput = () => {
            const changed = form.elements.email.value.trim().toLowerCase() !== c.email;
            $('#email-password-field').hidden = !changed;
            form.elements.current_password.required = changed;
        };
        form.onsubmit = async (e) => {
            e.preventDefault();
            const b = $('button', form);
            b.disabled = true;
            formError(form, '');
            try {
                const result = await api(
                    'customer-profile',
                    Object.fromEntries(new FormData(form)),
                );
                session.customer = result.customer;
                await showArea();
                toast('Seus dados foram atualizados.');
            } catch (err) {
                formError(form, err.message);
            } finally {
                b.disabled = false;
            }
        };
    }
    /**
     * Monta troca voluntária de senha, exige senha atual e confirmação; a API encerra os outros
     * acessos.
     */
    function renderSecurity() {
        $('#account-content').innerHTML =
            `<section class="customer-panel"><h2>Acesso e segurança</h2><p>Uma senha só sua, para cuidar das suas informações.</p><form class="customer-form" id="password-form"><label class="form-field">Senha atual<input name="current_password" type="password" autocomplete="current-password" required maxlength="72"></label><label class="form-field">Nova senha<input name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="72"><small>Pelo menos 6 caracteres.</small></label><label class="form-field">Confirme a nova senha<input name="confirmation" type="password" autocomplete="new-password" required minlength="6" maxlength="72"></label><p class="form-error" role="alert"></p><button class="button">Alterar minha senha</button></form></section>`;
        $('#password-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target,
                data = Object.fromEntries(new FormData(form)),
                b = $('button', form);
            if (data.password !== data.confirmation)
                return formError(form, 'As senhas não conferem.');
            b.disabled = true;
            formError(form, '');
            try {
                await api('customer-password', data);
                form.reset();
                toast('Senha alterada. Outros acessos foram encerrados.');
            } catch (err) {
                formError(form, err.message);
            } finally {
                b.disabled = false;
            }
        };
    }
    /**
     * Permite vincular compra histórica com referência/código privado. Após sucesso, volta ao
     * histórico e abre o pedido vinculado.
     */
    function renderClaim() {
        let saved = {};
        try {
            saved = JSON.parse(sessionStorage.getItem('cami-order-access')) || {};
        } catch {}
        $('#account-content').innerHTML =
            `<section class="customer-panel"><h2>Vincular uma compra</h2><p>Comprou sem entrar na conta? Informe o número do pedido e o código privado que apareceu na confirmação da compra.</p><form class="customer-form" id="claim-form"><label class="form-field">Número do pedido<input name="reference" required maxlength="40" placeholder="CAMI-…" value="${escapeHTML(saved.reference || '')}" autocomplete="off"></label><label class="form-field">Código privado do pedido<input name="access_code" required maxlength="100" value="${escapeHTML(saved.access_code || '')}" autocomplete="off" spellcheck="false"></label><p class="form-error" role="alert"></p><button class="button">Adicionar ao meu histórico</button></form><div class="data-notice">Para pedidos antigos ou se você perdeu o código, fale com a loja. A equipe pode conferir seus dados e vincular a compra à sua conta.</div><button class="text-link" id="claim-help">Preciso de ajuda ↗</button></section>`;
        $('#claim-help').onclick = () =>
            contactStore(
                'Olá, Cami! Quero vincular uma compra antiga à minha conta. Pode me ajudar?',
            );
        $('#claim-form').onsubmit = async (e) => {
            e.preventDefault();
            const form = e.target,
                b = $('button', form);
            b.disabled = true;
            formError(form, '');
            try {
                const result = await api('customer-claim', Object.fromEntries(new FormData(form)));
                try {
                    sessionStorage.removeItem('cami-order-access');
                } catch {}
                tab = 'orders';
                orderPage = 1;
                orderStatus = '';
                await renderTab();
                toast('Pedido adicionado ao seu histórico.');
                showOrder(Number(result.order.id));
            } catch (err) {
                formError(form, err.message);
            } finally {
                b.disabled = false;
            }
        };
    }
    $('#customer-order-dialog').addEventListener('close', () => {
        detailId = null;
    });
    // Eventos emitidos por store.js/checkout-auth.js sincronizam a tela com login, expiração, novo pedido e senha obrigatória.
    window.addEventListener('cami:customer-expired', () => {
        mode = 'login';
        showAuth();
        toast('Sua sessão expirou. Entre novamente.');
    });
    window.addEventListener('cami:order-created', () => {
        if (session.customer && tab === 'orders') loadOrders();
    });
    window.addEventListener('cami:customer-signed-in', () => showArea());
    window.addEventListener('cami:password-required', () => showArea());
    // A cada 30 segundos, atualiza pedidos/detalhes somente com a página visível e a cliente conectada.
    setInterval(() => {
        if (document.visibilityState === 'visible' && session.customer) {
            if (tab === 'orders') loadOrders(true);
            if (detailId && $('#customer-order-dialog').open) showOrder(detailId, true);
        }
    }, 30000);
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) location.reload();
    });
    (async () => {
        if (!(await window.camiReady)) return;
        if (session.customer) await showArea();
        else showAuth();
    })();
})();
