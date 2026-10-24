<!-- Fragmento do catálogo. Os nomes q/category/size/color/min/max/stock/sale correspondem aos parâmetros de catalog.js e da URL. Opções de categoria/cor/tamanho são preenchidas pelo catálogo ativo; data-contact é atendido por store.js. -->
<aside class="catalog-sidebar" aria-label="Filtros da coleção">
    <details open id="filter-panel">
        <summary>Encontre sua peça <span>Filtros +</span></summary>
        <form id="catalog-filters">
            <label class="form-field">O que você procura?<input type="search" name="q" placeholder="Vestido, blusa, conjunto…" maxlength="120"></label>
            <label class="form-field">Tipo de roupa<select name="category"><option value="">Todos os tipos</option></select></label>
            <div class="filter-pair">
                <label class="form-field">Tamanho<select name="size"><option value="">Todos</option></select></label>
                <label class="form-field">Cor<select name="color"><option value="">Todas</option></select></label>
            </div>
            <fieldset class="price-filter"><legend>Faixa de preço</legend><div class="filter-pair"><label class="form-field">De (R$)<input name="min" type="number" min="0" max="100000" step="0.01" placeholder="0,00" inputmode="decimal"></label><label class="form-field">Até (R$)<input name="max" type="number" min="0" max="100000" step="0.01" placeholder="Sem limite" inputmode="decimal"></label></div></fieldset>
            <label class="filter-check"><input name="stock" type="checkbox"> Somente em estoque</label>
            <label class="filter-check"><input name="sale" type="checkbox"> Preços especiais</label>
            <p id="filter-error" class="form-error" role="alert"></p>
            <button class="button" type="submit">Encontrar meu look <span>→</span></button>
            <button class="reset-filters" type="reset">Limpar filtros</button>
        </form>
    </details>
    <div class="filter-help"><span>♡</span><h3>Uma ajudinha na escolha?</h3><p>A Cami te ajuda a encontrar o tamanho e a peça ideais.</p><button class="text-link" data-contact>Vamos conversar ↗</button></div>
</aside>
