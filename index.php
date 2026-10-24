<?php
/**
 * Layout comum das páginas públicas. catalogo.php e conta.php definem flags antes deste include.
 * PHP entrega a estrutura e os scripts defer montam os dados pela API; este arquivo não grava
 * pedidos. IDs e data-attributes são contratos usados pelos scripts em assets/js/.
 * Mapa de navegação e manutenção: docs/guia-do-codigo.md.
 */

require __DIR__ . '/app/bootstrap.php';
$catalogPage = $catalogPage ?? false;
$accountPage = $accountPage ?? false;
if ($accountPage) {
    header('Cache-Control: no-store');
}
?>
<!doctype html>
<html lang="pt-BR">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Use by Cami. Moda feminina escolhida com carinho para você se vestir de si mesma. Conheça a coleção.">
    <meta name="theme-color" content="#571c28">
    <title><?= $accountPage
        ? 'Minha conta'
        : ($catalogPage
            ? 'Encontre seu look'
            : 'Vista sua essência') ?> — Use by Cami</title>
    <?php if ($accountPage): ?>
        <meta name="robots" content="noindex,nofollow"><?php endif; ?>
    <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
    <!-- Estilos base primeiro; customer.css acrescenta catálogo, conta e autenticação da sacola. -->
<link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/customer.css">
    <!-- Ordem de dependência: store fornece helpers/estado; senha e sacola usam esses helpers; catálogo/conta carregam somente na página correspondente. -->
<script src="assets/js/store.js" defer></script>
    <script src="assets/js/password-change.js" defer></script>
    <script src="assets/js/checkout-auth.js" defer></script>
    <?php if ($catalogPage): ?><script src="assets/js/catalog.js" defer></script><?php endif; ?>
    <?php if ($accountPage): ?><script src="assets/js/account.js" defer></script><?php endif; ?>
</head>

<body data-page="<?= $accountPage ? 'account' : ($catalogPage ? 'catalog' : 'home') ?>">
    <div class="announcement"><span class="announcement-star">✧</span><span id="notice">Um carinho em forma de look. Conheça a nossa coleção.</span><span class="announcement-star">✧</span></div>
    <!-- Navegação comum: links abrem páginas; botões de busca, favoritos e sacola são controlados por store.js. -->
<header class="site-header">
        <div class="header-inner"><button class="icon-button mobile-menu" id="menu-toggle" aria-label="Abrir menu" aria-expanded="false"><svg>
                    <use href="#i-menu" />
                </svg></button><a class="wordmark" href="./" aria-label="Use by Cami, início"><span class="mini-monogram">U<span>C</span><i>♥</i></span><span>USE BY CAMI<small>FEITO PARA SER VOCÊ</small></span></a>
            <nav id="main-nav" aria-label="Menu principal"><a href="catalogo.php" class="<?= $catalogPage
                ? 'nav-active'
                : '' ?>">Coleção</a><a href="catalogo.php?category=Vestidos">Vestidos</a><a href="catalogo.php?category=Conjuntos">Conjuntos</a><a href="catalogo.php?category=Blusas">Blusas</a><a href="conta.php">Meus pedidos</a></nav>
            <div class="header-actions"><button class="icon-button" id="search-toggle" aria-label="Buscar peças"><svg>
                        <use href="#i-search" />
                    </svg></button><button class="icon-button" id="favorites-toggle" aria-label="Ver favoritos" aria-pressed="false"><svg>
                        <use href="#i-heart" />
                    </svg></button><a class="icon-button account-link" href="conta.php" aria-label="Minha conta"><svg>
                        <use href="#i-user" />
                    </svg></a><button class="icon-button bag-button" id="cart-toggle" aria-label="Abrir sacola"><svg>
                        <use href="#i-bag" />
                    </svg><span id="cart-count">0</span></button></div>
        </div>
        <form class="search-bar" id="search-form" hidden><label class="sr-only" for="search-input">O que você está procurando?</label><input id="search-input" type="search" placeholder="Encontre sua próxima peça favorita…"><button class="button small" type="submit">Buscar</button><button type="button" class="icon-button" id="search-close" aria-label="Fechar busca">×</button></form>
    </header>
    <!-- A flag da página escolhe área de conta ou vitrine. O catálogo reutiliza a vitrine e acrescenta filtros próprios. -->
<main>
        <?php if ($accountPage):
            require __DIR__ . '/app/views/account-view.php';
        else:
             ?>
            <?php if (!$catalogPage): ?>
                <!-- Campanha exibida somente na página inicial; o link conduz à coleção desta mesma página. -->
<section class="hero">
                    <div class="hero-copy">
                        <div class="eyebrow"><span></span>NOVA COLEÇÃO</div>
                        <h1>Vista sua<br><em>essência.</em></h1>
                        <p>Peças que abraçam seu estilo.<br>Detalhes que fazem você se sentir única.</p><a href="#colecao" class="button">Encontre seu novo amor <svg>
                                <use href="#i-arrow" />
                            </svg></a>
                        <div class="hero-caption"><span>♡</span> ESCOLHIDO COM CARINHO, PARA VOCÊ</div>
                    </div>
                    <div class="hero-image"><img src="assets/images/campaign.png" alt="Inspiração de moda feminina para a coleção Use by Cami" fetchpriority="high">
                        <div class="image-label"><span>Leve, feminina.</span><em>Inteiramente você.</em></div><span class="hero-stamp">USE BY CAMI <b>♡</b> COM CARINHO</span>
                    </div><span class="hero-side">SUA MELHOR VERSÃO É SER VOCÊ.</span>
                </section>
                <div class="benefits">
                    <div><svg>
                            <use href="#i-truck" />
                        </svg><span><strong>De nós, para você</strong><small>Entrega combinada no atendimento</small></span></div>
                    <div><svg>
                            <use href="#i-heart" />
                        </svg><span><strong>Escolhido com carinho</strong><small>Detalhes que fazem a diferença</small></span></div>
                    <div><svg>
                            <use href="#i-chat" />
                        </svg><span><strong>Bem pertinho de você</strong><small>Atendimento pelo WhatsApp</small></span></div>
                    <div><svg>
                            <use href="#i-box" />
                        </svg><span><strong>Um presente em cada pedido</strong><small>Seu look merece esse cuidado</small></span></div>
                </div>
            <?php endif; ?>
            <section class="collection section-wrap <?= $catalogPage
                ? 'catalog-page'
                : '' ?>" id="colecao">
                <?php if (
                    $catalogPage
                ): ?><div class="breadcrumbs"><a href="./">Início</a><span>/</span>Coleção</div><?php endif; ?>
                <div class="section-heading">
                    <div>
                        <div class="eyebrow">SEU PRÓXIMO LOOK FAVORITO</div>
                        <?php if ($catalogPage): ?><h1>Um look que é <em>a sua cara.</em></h1>
                            <p class="catalog-intro">Encontre suas favoritas. Do seu tamanho, do seu jeito.</p><?php else: ?><h2>Novidades para <em>se apaixonar</em></h2><?php endif; ?>
                    </div><a href="catalogo.php" id="view-all">Ver toda a coleção <span>↗</span></a>
                </div>
                <?php if ($catalogPage): ?><div class="catalog-layout"><?php require __DIR__ .
    '/app/views/catalog-filters.php'; ?><div class="catalog-results"><?php endif; ?>
                        <div class="catalog-toolbar">
                            <?php if (
                                $catalogPage
                            ): ?><p id="result-count" role="status">Carregando peças…</p><?php else: ?>
                                <div class="filters" role="group" aria-label="Categorias"><button class="filter active" data-category="">Todas as peças</button><button class="filter" data-category="Vestidos">Vestidos</button><button class="filter" data-category="Conjuntos">Conjuntos</button><button class="filter" data-category="Blusas">Blusas</button><button class="filter" data-category="sale">Últimas oportunidades</button></div><?php endif; ?><label class="sort-label"><span class="sr-only">Ordenar peças</span><select id="sort">
                                    <option value="featured">Destaques</option>
                                    <option value="low">Menor preço</option>
                                    <option value="high">Maior preço</option>
                                    <option value="new">Mais recentes</option>
                                </select></label>
                        </div>
                        <div id="catalog-message" class="catalog-message" hidden></div>
                        <!-- Área substituída por renderProducts(): cartões, resultado vazio ou erro de carregamento. -->
<div class="product-grid" id="products" aria-live="polite">
                            <div class="loading-state">Preparando suas próximas peças favoritas…</div>
                        </div><?php if (
                            $catalogPage
                        ): ?><button class="button outline load-more" id="show-more" hidden>Descobrir mais peças <span>↓</span></button><?php else: ?><a class="button outline load-more" id="show-more" href="catalogo.php" hidden>Descobrir mais peças <span>→</span></a><?php endif; ?>
                        <?php if ($catalogPage): ?>
                        </div>
                    </div><?php endif; ?>
                <p class="demo-note" id="demo-note" hidden>Vitrine demonstrativa · fotos ilustrativas e produtos de exemplo.</p>
            </section>
            <?php if (!$catalogPage): ?><section class="editorial" id="essencia">
                    <div class="editorial-visual"><img src="assets/images/dress.jpg" alt="Detalhes de uma composição feminina delicada" loading="lazy"><span class="editorial-note">a beleza de<br><em>ser você.</em></span></div>
                    <div class="editorial-copy">
                        <div class="eyebrow">MUITO ALÉM DE VESTIR</div>
                        <h2>Um toque de carinho.<br><em>Um tanto de você.</em></h2>
                        <p>Acreditamos na beleza que nasce quando você se sente bem. Na peça que vira favorita, no detalhe que encanta e na liberdade de vestir quem você é.</p>
                        <p>A Use by Cami nasceu para fazer parte desses momentos. De um dia comum a uma ocasião especial, com leveza, feminilidade e afeto.</p><a href="#colecao" class="text-link">Conheça nossas escolhas <span>↗</span></a><span class="signature">Com carinho, Cami ♡</span>
                    </div>
                </section>
            <?php endif; ?>
            <section class="contact-strip section-wrap"><svg>
                    <use href="#i-chat" />
                </svg>
                <div>
                    <div class="eyebrow">VAMOS CONVERSAR?</div>
                    <h2>Te ajudamos a encontrar <em>seu look.</em></h2>
                    <p>Dúvidas sobre tamanhos, peças ou seu pedido? Estamos por aqui.</p>
                </div><button class="button outline" data-contact>Fale com a Cami <svg>
                        <use href="#i-arrow" />
                    </svg></button>
            </section>
        <?php
        endif; ?>
    </main>
    <!-- Rodapé compartilhado: navegação e contatos. Instagram só é habilitado quando configurado pela loja. -->
<footer>
        <div class="footer-main section-wrap">
            <div class="footer-brand"><img src="assets/logo.svg" alt="Use by Cami" width="150" height="119">
                <p>Moda com afeto.<br>Para todos os seus momentos.</p>
            </div>
            <div>
                <h3>Explore</h3><a href="catalogo.php">Toda a coleção</a><a href="catalogo.php?category=Vestidos">Vestidos</a><a href="catalogo.php?category=Conjuntos">Conjuntos</a><a href="catalogo.php?category=Blusas">Blusas</a>
            </div>
            <div>
                <h3>Podemos ajudar?</h3><a href="conta.php">Minha conta e pedidos</a><button data-info="delivery">Entrega e pedidos</button><button data-info="sizes">Guia de tamanhos</button><button data-info="privacy">Privacidade</button><button data-contact>Fale com a gente</button>
            </div>
            <div class="footer-social">
                <h3>Mais pertinho de você</h3>
                <p>Novidades, inspirações e muito carinho.</p><a id="instagram-link" href="#" hidden>Instagram ↗</a><button data-contact>WhatsApp ↗</button><span class="footer-love">FEITO COM ♡ PARA VOCÊ</span>
            </div>
        </div>
        <div class="footer-bottom section-wrap"><span>© <?= date(
            'Y',
        ) ?> Use by Cami. Todos os direitos reservados.</span><a href="admin/">Área da loja ↗</a></div>
    </footer>
    <button class="floating-contact" data-contact aria-label="Atendimento pelo WhatsApp"><svg>
            <use href="#i-chat" />
        </svg></button>
    <div class="toast" id="toast" role="status" hidden></div>
    <!-- Diálogo de peça preenchido por showProduct(); a escolha adiciona variação à sacola local. -->
<dialog id="product-dialog" class="product-dialog"><button class="dialog-close icon-button" data-close aria-label="Fechar">×</button>
        <div id="product-detail"></div>
    </dialog>
    <!-- Sacola: renderCart() monta itens e checkout-auth.js escolhe login, senha obrigatória ou entrega. -->
<dialog id="cart-dialog" class="cart-dialog">
        <div class="drawer-heading">
            <div><span class="eyebrow">SUAS ESCOLHAS</span>
                <h2>Minha sacola <span>♡</span></h2>
            </div><button class="icon-button" data-close aria-label="Fechar sacola">×</button>
        </div>
        <div id="cart-content"></div>
    </dialog>
    <dialog id="info-dialog" class="info-dialog"><button class="dialog-close icon-button" data-close aria-label="Fechar">×</button>
        <div id="info-content"></div>
    </dialog>
    <!-- Biblioteca de ícones referenciada pelos elementos use; não representa conteúdo separado de navegação. -->
<svg class="svg-symbols" xmlns="http://www.w3.org/2000/svg">
        <symbol id="i-user" viewBox="0 0 24 24">
            <circle cx="12" cy="7" r="4" />
            <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
        </symbol>
        <symbol id="i-bag" viewBox="0 0 24 24">
            <path d="M5 7h14l1 14H4L5 7Z" />
            <path d="M8 8V6a4 4 0 0 1 8 0v2" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="7.5" />
            <path d="m16 16 5 5" />
        </symbol>
        <symbol id="i-heart" viewBox="0 0 24 24">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
        </symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24">
            <path d="M3 12h17m-6-6 6 6-6 6" />
        </symbol>
        <symbol id="i-menu" viewBox="0 0 24 24">
            <path d="M3 6h18M3 12h18M3 18h18" />
        </symbol>
        <symbol id="i-truck" viewBox="0 0 24 24">
            <path d="M1 5h13v12H1zm13 5h5l4 4v3h-9" />
            <circle cx="5" cy="19" r="2" />
            <circle cx="18" cy="19" r="2" />
        </symbol>
        <symbol id="i-chat" viewBox="0 0 24 24">
            <path d="M21 11.5a9 9 0 0 1-13 8.1L3 21l1.4-5A9 9 0 1 1 21 11.5Z" />
            <path d="M8 7c-2 5 4 10 8 8l-2-3-2 1-2-2 1-2-3-2Z" />
        </symbol>
        <symbol id="i-box" viewBox="0 0 24 24">
            <path d="m3 7 9-4 9 4v12l-9 3-9-3V7Zm0 0 9 4 9-4M12 11v11M8 5l9 4v5" />
        </symbol>
    </svg>
</body>

</html>
