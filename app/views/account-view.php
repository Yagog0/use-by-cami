<!-- Fragmento incluído por index.php quando accountPage está ativo. account.js alterna carregamento, autenticação, senha obrigatória e área privada; conteúdos de abas/pedidos chegam pela API. Não usar hidden como controle de permissão. -->
<section class="account-page section-wrap">
    <div class="breadcrumbs"><a href="./">Início</a><span>/</span>Minha conta</div>
    <div class="account-heading"><div><span class="eyebrow">SEU CANTINHO NA CAMI</span><h1>Bom ter você <em>por aqui.</em></h1><p>Seus pedidos, suas escolhas e seus dados. Tudo pertinho de você.</p></div><span class="account-flower" aria-hidden="true">♡</span></div>
    <div id="account-loading" class="loading-state" role="status">Preparando seu cantinho…</div>
    <!-- Bloqueio de senha temporária; password-change.js envia customer-password antes de liberar a área privada. -->
<div id="account-password-change" class="customer-panel" hidden></div>
    <!-- Login/cadastro e ajuda de recuperação; account.js monta o formulário conforme o modo escolhido. -->
<div id="account-auth" class="customer-auth" hidden>
        <div class="auth-story"><span class="eyebrow">MAIS DO QUE UMA COMPRA</span><h2>Cada escolha conta<br><em>uma história.</em></h2><p>Entre para acompanhar os seus pedidos e revisitar as peças que já ganharam um lugar no seu guarda-roupa.</p><ul><li>Acompanhe cada etapa do pedido</li><li>Consulte seu histórico de compras</li><li>Salve seus dados para a próxima visita</li></ul><span class="signature">Com carinho, Cami ♡</span></div>
        <div class="customer-auth-card"><div class="account-auth-tabs" role="group" aria-label="Acesso à conta"><button class="selected" data-auth="login" aria-pressed="true">Já sou cliente</button><button data-auth="register" aria-pressed="false">Quero me cadastrar</button></div><div id="auth-form-content"></div></div>
    </div>
    <!-- Menu e conteúdo autenticados: histórico, dados, segurança e vínculo de compras antigas. -->
<div id="customer-area" class="customer-layout" hidden>
        <aside class="customer-sidebar"><div class="customer-welcome"><span id="customer-avatar">C</span><p>Olá, <strong id="customer-first-name"></strong><small>Seu estilo tem lugar aqui.</small></p></div><div class="customer-nav" role="group" aria-label="Minha conta"><button data-account-tab="orders" class="selected">Meus pedidos <span>↗</span></button><button data-account-tab="profile">Meus dados <span>↗</span></button><button data-account-tab="security">Acesso e segurança <span>↗</span></button><button data-account-tab="claim">Vincular uma compra <span>+</span></button><a href="catalogo.php?favorites=1">Minhas peças favoritas <span>♡</span></a><button id="customer-logout">Sair da conta</button></div><p class="account-assistance">Precisa de uma mãozinha?<button data-contact>Fale com a Cami ↗</button></p></aside>
        <div class="customer-main"><div id="account-feedback" class="form-error" role="alert"></div><div id="account-content"></div></div>
    </div>
</section>
<!-- Detalhes consultados por customer-order, sempre autorizados pelo vínculo no servidor. -->
<dialog id="customer-order-dialog" class="customer-order-dialog"><button class="dialog-close icon-button" data-close aria-label="Fechar pedido">×</button><div id="customer-order-content"></div></dialog>
