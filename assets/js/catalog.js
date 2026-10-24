/**
 * Filtros exclusivos de catalogo.php, expostos em window.camiCatalog para store.js. O catálogo vem
 * da API; esta camada filtra em memória e guarda a pesquisa na URL, sem fazer SQL.
 * Guia geral: docs/guia-do-codigo.md.
 */
'use strict';
window.camiCatalog = (() => {
    const form = $('#catalog-filters');
    let limit = 12;
    // Helpers do formulário: localizar campo, normalizar texto sem acentos e obter valores atuais.
    const field = (name) => form.elements.namedItem(name);
    const fold = (value) =>
        String(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    const read = () => Object.fromEntries(new FormData(form));
    /**
     * Converte filtros em parâmetros da URL; push cria entrada no histórico, replace apenas
     * atualiza a atual.
     */
    function sync(push = false) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(read()))
            if (value !== '') params.set(key, value === 'on' ? '1' : value);
        if ($('#sort').value !== 'featured') params.set('sort', $('#sort').value);
        if (onlyFavorites) params.set('favorites', '1');
        const url = 'catalogo.php' + (params.size ? '?' + params.toString() : '');
        history[push ? 'pushState' : 'replaceState']({}, '', url);
    }
    /**
     * Restaura formulário, ordenação e favoritos a partir da URL. Usado ao iniciar e ao
     * voltar/avançar no navegador.
     */
    function fromUrl() {
        const params = new URLSearchParams(location.search);
        for (const name of ['q', 'category', 'size', 'color', 'min', 'max']) {
            const element = field(name),
                value = params.get(name) || '';
            if (
                element.tagName === 'SELECT' &&
                value &&
                !Array.from(element.options).some((o) => o.value === value)
            ) {
                element.add(new Option(value, value));
            }
            element.value = value;
        }
        for (const name of ['stock', 'sale']) field(name).checked = params.get(name) === '1';
        const sort = params.get('sort');
        $('#sort').value = ['low', 'high', 'new'].includes(sort) ? sort : 'featured';
        onlyFavorites = params.get('favorites') === '1';
        $('#favorites-toggle').setAttribute('aria-pressed', String(onlyFavorites));
        $('#search-input').value = field('q').value;
        search = '';
        category = '';
        limit = 12;
    }
    /**
     * Valida limites de preço e campos HTML; mostra erro e impede aplicar uma faixa incoerente.
     */
    function valid() {
        const f = read();
        let error = '';
        if (!form.checkValidity()) error = 'Confira os valores dos filtros.';
        else if (f.min !== '' && f.max !== '' && Number(f.min) > Number(f.max))
            error = 'O preço máximo deve ser maior ou igual ao mínimo.';
        $('#filter-error').textContent = error;
        return !error;
    }
    /**
     * Valida, reinicia a quantidade visível, sincroniza URL e pede a store.js para desenhar os
     * resultados.
     */
    function apply(push = false) {
        if (!valid()) return;
        limit = 12;
        sync(push);
        renderProducts();
    }
    /**
     * Limpa todos os filtros e a seleção de favoritos; restaura destaques, URL e lista inicial.
     */
    function reset() {
        for (const name of ['q', 'category', 'size', 'color', 'min', 'max']) field(name).value = '';
        for (const name of ['stock', 'sale']) field(name).checked = false;
        onlyFavorites = false;
        search = '';
        category = '';
        $('#search-input').value = '';
        $('#sort').value = 'featured';
        $('#favorites-toggle').setAttribute('aria-pressed', 'false');
        $('#filter-error').textContent = '';
        limit = 12;
        sync(true);
        renderProducts();
    }
    // No celular, aplicar filtros recolhe o painel e leva aos resultados; alterações e voltar/avançar mantêm a URL sincronizada.
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!valid()) return;
        apply(true);
        if (innerWidth <= 800) {
            $('#filter-panel').open = false;
            $('#result-count').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
    form.addEventListener('reset', (e) => {
        e.preventDefault();
        reset();
    });
    form.addEventListener('change', () => apply());
    window.addEventListener('popstate', () => {
        fromUrl();
        renderProducts();
    });
    return {
        // API pública consumida por store.js: opções dos filtros vêm dos produtos/variações ativos.
        initialize() {
            const values = {
                category: products.map((p) => p.category),
                size: products.flatMap((p) => p.variants.map((v) => v.size)),
                color: products.flatMap((p) => p.variants.map((v) => v.color)),
            };
            for (const [name, options] of Object.entries(values))
                for (const value of [...new Set(options)].sort((a, b) =>
                    a.localeCompare(b, 'pt-BR'),
                ))
                    field(name).add(new Option(value, value));
            fromUrl();
        },
        // Retorna apenas produtos correspondentes; tamanho, cor e disponibilidade precisam existir juntos na mesma variação.
        filter(list) {
            if (!valid()) return [];
            const f = read(),
                term = fold(f.q.trim());
            return list.filter((p) => {
                if (f.category && p.category !== f.category) return false;
                if (
                    term &&
                    !fold(
                        `${p.name} ${p.category} ${p.description} ${p.variants.map((v) => v.color).join(' ')}`,
                    ).includes(term)
                )
                    return false;
                if (f.min !== '' && Number(p.price) < Math.round(Number(f.min) * 100)) return false;
                if (f.max !== '' && Number(p.price) > Math.round(Number(f.max) * 100)) return false;
                if (f.sale && Number(p.old_price) <= Number(p.price)) return false;
                // Todos os critérios de variação precisam corresponder à mesma combinação de tamanho/cor.
                if (
                    (f.size || f.color || f.stock) &&
                    !p.variants.some(
                        (v) =>
                            (!f.size || v.size === f.size) &&
                            (!f.color || v.color === f.color) &&
                            (!f.stock || Number(v.stock) > 0),
                    )
                )
                    return false;
                return true;
            });
        },
        // Atualiza a contagem acessível e o resumo dos filtros sem modificar o catálogo original.
        meta(count) {
            const f = read();
            $('#result-count').textContent =
                `${count} ${count === 1 ? 'peça encontrada' : 'peças encontradas'}`;
            const labels = [
                f.q ? `Busca: “${f.q}”` : '',
                f.category,
                f.size ? `Tamanho ${f.size}` : '',
                f.color,
                f.stock ? 'Em estoque' : '',
                f.sale ? 'Preços especiais' : '',
                onlyFavorites ? 'Favoritos' : '',
            ].filter(Boolean);
            $('#catalog-message').hidden = !labels.length;
            $('#catalog-message').textContent = labels.join(' · ');
        },
        // Permite que a busca global do cabeçalho alimente este formulário e redesenhe a coleção.
        setSearch(q) {
            field('q').value = q;
            apply(true);
            $('#colecao').scrollIntoView({ behavior: 'smooth' });
        },
        reset,
        sync,
        // Paginação visual: limit() informa o corte atual; more() libera mais 12 cartões, sem nova consulta ao banco.
        limit: () => limit,
        more: () => (limit += 12),
    };
})();
