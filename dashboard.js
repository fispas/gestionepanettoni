// WonderLAD - dashboard BI componibile.
// File autosufficiente: ricostruisce sempre da zero vista, griglia e catalogo,
// ignorando quello che trova nell'HTML. Riordino dei widget per trascinamento.

(function () {
    'use strict';

    /* ======================================================
       FALLBACK
       ====================================================== */

    const CFG_FALLBACK = {
        totalePanettoni: 500, totalePandori: 500,
        prezzoPanettone: 15, prezzoPandoro: 15, ordiniAperti: true
    };

    function configDefault() {
        return (typeof CONFIG_DEFAULT !== 'undefined') ? CONFIG_DEFAULT : CFG_FALLBACK;
    }

    function utente() {
        try { return (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? utenteCorrente : null; }
        catch (e) { return null; }
    }

    const esisteFn = (f) => typeof f === 'function';

    function h(t) {
        return String(t == null ? '' : t)
            .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const fmtEuro = (n) => '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT');
    const fmtNum = (n) => Number(n || 0).toLocaleString('it-IT');

    /* ======================================================
       STATO
       ====================================================== */

    let layout = [];
    let filtri = { prodotto: 'TUTTI', periodo: 'tutto' };
    let grafici = {};
    let ultimiDati = [];
    let ultimaConfig = null;
    let pronto = false;
    let uidCaricato = null;

    /* ======================================================
       CATALOGO
       ====================================================== */

    const METRICHE = {
        incassato:      { titolo: 'Incassato',           formato: 'euro', colore: '#2e7d32' },
        daIncassare:    { titolo: 'Da incassare',        formato: 'euro', colore: '#c53030' },
        valoreTotale:   { titolo: 'Valore prenotato',    formato: 'euro', colore: '#3a6250' },
        ticketMedio:    { titolo: 'Ticket medio',        formato: 'euro', colore: '#6b46c1' },
        ordiniTotali:   { titolo: 'Ordini',              formato: 'num',  colore: '#2b6cb0' },
        pezziTotali:    { titolo: 'Pezzi prenotati',     formato: 'num',  colore: '#3a6250' },
        clientiUnici:   { titolo: 'Clienti',             formato: 'num',  colore: '#2b6cb0' },
        daConsegnare:   { titolo: 'Pezzi da consegnare', formato: 'num',  colore: '#b7791f' },
        pezziMedi:      { titolo: 'Pezzi per ordine',    formato: 'num',  colore: '#3a6250' },
        percConsegnato: { titolo: '% consegnato',        formato: 'perc', colore: '#2e7d32' },
        percPagato:     { titolo: '% pagato',            formato: 'perc', colore: '#276749' },
        percStock:      { titolo: '% stock impegnato',   formato: 'perc', colore: '#b7791f' }
    };

    const CATALOGO = {
        stock:            { nome: 'Stock',               desc: 'Pezzi impegnati sul disponibile',   size: 'm' },
        flusso:           { nome: 'Flusso logistico',    desc: 'Conteggi per stato, cliccabili',    size: 'l' },
        barStati:         { nome: 'Ordini per stato',    desc: 'Grafico a barre',                   size: 'm' },
        barProdotti:      { nome: 'Pezzi per prodotto',  desc: 'Panettoni contro pandori',          size: 'm' },
        tortaPagamenti:   { nome: 'Metodi di pagamento', desc: 'Ripartizione degli incassi',        size: 'm' },
        andamentoPezzi:   { nome: 'Pezzi al giorno',     desc: 'Serie storica',                     size: 'l' },
        andamentoOrdini:  { nome: 'Ordini al giorno',    desc: 'Serie storica',                     size: 'l' },
        andamentoIncasso: { nome: 'Incasso al giorno',   desc: 'Serie storica',                     size: 'l' },
        cumulato:         { nome: 'Pezzi cumulati',      desc: 'Quanto manca al traguardo',         size: 'l' },
        classifica:       { nome: 'Migliori clienti',    desc: 'Chi ha prenotato di piu\u0027',     size: 'm' },
        ultimiOrdini:     { nome: 'Ultimi ordini',       desc: 'Le prenotazioni piu\u0027 recenti', size: 'm' },
        daFare:           { nome: 'Cose da fare',        desc: 'Ordini che aspettano un\u0027azione', size: 'm' },
        tabellaStati:     { nome: 'Riepilogo per stato', desc: 'Ordini, pezzi e importi',           size: 'm' }
    };

    const SERIE = { andamentoPezzi: 'pezzi', andamentoOrdini: 'ordini', andamentoIncasso: 'incasso' };

    const PREDEFINITO = [
        { tipo: 'kpi', metrica: 'incassato', size: 's' },
        { tipo: 'kpi', metrica: 'daIncassare', size: 's' },
        { tipo: 'kpi', metrica: 'ordiniTotali', size: 's' },
        { tipo: 'stock', size: 'm' },
        { tipo: 'flusso', size: 'l' },
        { tipo: 'andamentoPezzi', size: 'l' },
        { tipo: 'barProdotti', size: 'm' },
        { tipo: 'tortaPagamenti', size: 'm' }
    ];

    /* ======================================================
       PERSISTENZA
       ====================================================== */

    function chiaveLocale() {
        const u = utente();
        return 'wl-dash-' + ((u && u.uid) ? u.uid : 'anon');
    }

    function normalizza(arr) {
        return (arr || [])
            .filter(w => w && (w.tipo === 'kpi' ? METRICHE[w.metrica] : CATALOGO[w.tipo]))
            .slice(0, 30)
            .map(w => ({
                id: 'w' + Math.random().toString(36).slice(2, 9),
                tipo: w.tipo,
                metrica: METRICHE[w.metrica] ? w.metrica : 'incassato',
                size: ['s', 'm', 'l'].includes(w.size)
                    ? w.size
                    : (w.tipo === 'kpi' ? 's' : (CATALOGO[w.tipo] ? CATALOGO[w.tipo].size : 'm'))
            }));
    }

    function caricaLayout() {
        const u0 = utente();
        uidCaricato = (u0 && u0.uid) ? u0.uid : null;

        let locale = null;
        try { locale = JSON.parse(localStorage.getItem(chiaveLocale())); } catch (e) { /* niente */ }
        layout = normalizza(Array.isArray(locale) && locale.length ? locale : PREDEFINITO);
        render();

        const u = utente();
        if (!u || !u.uid || typeof db === 'undefined') return;

        db.collection('preferenze').doc(u.uid).get()
            .then(doc => {
                const salvato = doc.exists ? doc.data().dashboard : null;
                if (Array.isArray(salvato) && salvato.length) { layout = normalizza(salvato); render(); }
            })
            .catch(() => { /* resta il layout locale */ });
    }

    function salvaLayout() {
        const dati = layout.map(w => ({ tipo: w.tipo, metrica: w.metrica, size: w.size }));
        try { localStorage.setItem(chiaveLocale(), JSON.stringify(dati)); } catch (e) { /* quota */ }

        const u = utente();
        if (!u || !u.uid || typeof db === 'undefined') return;

        db.collection('preferenze').doc(u.uid).set({
            dashboard: dati,
            aggiornato: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => { /* resta salvato in locale */ });
    }

    /* ======================================================
       STRUTTURA (ricostruita sempre, si ignora l'HTML)
       ====================================================== */

    function costruisciStruttura() {
        const vista = document.getElementById('view-dashboard');
        if (!vista) return false;
        if (vista.dataset.costruita === '1') return true;

        vista.innerHTML = `
            <div class="dash-toolbar">
                <div class="dash-selector-bar" id="dashFiltroProdotto">
                    <button class="dash-tab-btn active" data-prodotto="TUTTI">Tutti</button>
                    <button class="dash-tab-btn" data-prodotto="PANETTONI">🥮 Panettoni</button>
                    <button class="dash-tab-btn" data-prodotto="PANDORI">🍞 Pandori</button>
                </div>
                <div class="dash-toolbar-right">
                    <select id="dashPeriodo" class="dash-select" aria-label="Periodo">
                        <option value="tutto">Tutto lo storico</option>
                        <option value="7">Ultimi 7 giorni</option>
                        <option value="30">Ultimi 30 giorni</option>
                        <option value="mese">Mese corrente</option>
                    </select>
                    <button class="btn-pdf-header" id="btnRipristina">↺ Ripristina</button>
                    <button class="btn-pdf-header" id="btnPdf">📄 PDF</button>
                </div>
            </div>
            <div class="dash-etichetta" id="dashEtichetta"></div>
            <div class="alert-box" id="alertScorte" style="display:none;"></div>
            <div class="dash-grid" id="dashGrid"></div>`;

        vista.querySelector('#dashFiltroProdotto').addEventListener('click', ev => {
            const b = ev.target.closest('[data-prodotto]');
            if (!b) return;
            filtri.prodotto = b.dataset.prodotto;
            vista.querySelectorAll('#dashFiltroProdotto .dash-tab-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            render();
        });

        vista.querySelector('#dashPeriodo').addEventListener('change', ev => {
            filtri.periodo = ev.target.value;
            render();
        });

        vista.querySelector('#btnRipristina').addEventListener('click', () => {
            if (!confirm('Ripristinare la dashboard predefinita?')) return;
            layout = normalizza(PREDEFINITO);
            salvaLayout();
            render();
        });

        vista.querySelector('#btnPdf').addEventListener('click', esportaPDF);

        vista.dataset.costruita = '1';
        return true;
    }

    /* ======================================================
       CATALOGO WIDGET
       ====================================================== */

    function costruisciCatalogo() {
        // Se ne esiste gia' uno (anche quello vuoto lasciato nell'HTML) si butta.
        const vecchio = document.getElementById('widget-modal');
        if (vecchio) vecchio.remove();

        const modal = document.createElement('div');
        modal.id = 'widget-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Aggiungi un widget</h3>
                <p class="catalogo-titolo">Indicatori — un numero singolo</p>
                <div class="catalogo-lista" id="catalogoMetriche"></div>
                <p class="catalogo-titolo">Grafici, liste e tabelle</p>
                <div class="catalogo-lista" id="catalogoBlocchi"></div>
                <div class="modal-actions">
                    <button class="btn-cancel" id="btnChiudiCatalogo">Chiudi</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const metriche = modal.querySelector('#catalogoMetriche');
        Object.keys(METRICHE).forEach(chiave => {
            const m = METRICHE[chiave];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'catalogo-item';
            b.innerHTML = `<strong>${h(m.titolo)}</strong><span>Indicatore</span>`;
            b.addEventListener('click', () => aggiungi({ tipo: 'kpi', metrica: chiave, size: 's' }));
            metriche.appendChild(b);
        });

        const blocchi = modal.querySelector('#catalogoBlocchi');
        Object.keys(CATALOGO).forEach(tipo => {
            const def = CATALOGO[tipo];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'catalogo-item';
            b.innerHTML = `<strong>${h(def.nome)}</strong><span>${h(def.desc)}</span>`;
            b.addEventListener('click', () => aggiungi({ tipo: tipo, size: def.size }));
            blocchi.appendChild(b);
        });

        modal.querySelector('#btnChiudiCatalogo').addEventListener('click', chiudiCatalogo);
        modal.addEventListener('click', ev => { if (ev.target === modal) chiudiCatalogo(); });
        return modal;
    }

    function apriCatalogo() {
        const modal = costruisciCatalogo();
        modal.style.display = 'flex';
    }

    function chiudiCatalogo() {
        const m = document.getElementById('widget-modal');
        if (m) m.style.display = 'none';
    }

    function aggiungi(def) {
        layout.push(normalizza([def])[0]);
        salvaLayout();
        chiudiCatalogo();
        render();
    }

    /* ======================================================
       AGGREGAZIONE
       ====================================================== */

    function bucketLog(status) {
        const s = String(status || '').toLowerCase();
        if (s.includes('annullato')) return 'annullato';
        if (s.includes('consegnato')) return 'consegnato';
        if (s.includes('da consegnare')) return 'da_consegnare';
        if (s.includes('preparazione')) return 'preparazione';
        return 'prenotato';
    }

    function bucketPag(status) {
        const s = String(status || '').toLowerCase();
        if (s.includes('annullato')) return null;
        if (s.includes('pagato') || s.includes('consegnato')) return 'pagato';
        return 'da_pagare';
    }

    function dataDi(o) {
        return (o && o.timestamp && typeof o.timestamp.toDate === 'function') ? o.timestamp.toDate() : null;
    }

    function nelPeriodo(o) {
        if (filtri.periodo === 'tutto') return true;
        const d = dataDi(o);
        if (!d) return false;
        const ora = new Date();
        if (filtri.periodo === 'mese') return d.getFullYear() === ora.getFullYear() && d.getMonth() === ora.getMonth();
        return (ora - d) <= parseInt(filtri.periodo, 10) * 86400000;
    }

    function aggrega() {
        const cfg = ultimaConfig || configDefault();
        const pPan = Number(cfg.prezzoPanettone) || 0;
        const pPand = Number(cfg.prezzoPandoro) || 0;

        const a = {
            cfg: cfg,
            stati: { prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 },
            statiPezzi: { prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 },
            statiImporto: { prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 },
            metodi: {}, perGiorno: {}, classifica: {},
            incassato: 0, daIncassare: 0, valoreTotale: 0,
            panettoni: 0, pandori: 0, pezziTotali: 0,
            ordiniTotali: 0, ordiniAttivi: 0, pagati: 0,
            clienti: new Set(), ultimi: [], daFare: []
        };

        (ultimiDati || []).filter(nelPeriodo).forEach(o => {
            const panTot = parseInt(o.panettoni) || 0;
            const pandTot = parseInt(o.pandori) || 0;
            const pan = filtri.prodotto === 'PANDORI' ? 0 : panTot;
            const pand = filtri.prodotto === 'PANETTONI' ? 0 : pandTot;
            if (pan + pand <= 0) return;

            const bl = bucketLog(o.status);
            const bp = bucketPag(o.status);
            const pezzi = pan + pand;
            const importo = pan * pPan + pand * pPand;

            a.ordiniTotali++;
            a.stati[bl]++;
            a.statiPezzi[bl] += pezzi;
            a.statiImporto[bl] += importo;
            a.ultimi.push(o);

            if (bl === 'annullato') return;

            a.ordiniAttivi++;
            a.panettoni += pan;
            a.pandori += pand;
            a.pezziTotali += pezzi;
            a.valoreTotale += importo;
            a.clienti.add(((o.nome || '') + '|' + (o.telefono || '')).toLowerCase());

            if (bp === 'pagato') {
                a.pagati++;
                a.incassato += importo;
                const metodo = (o.metodoPagamento && o.metodoPagamento !== '-') ? o.metodoPagamento : 'Non indicato';
                a.metodi[metodo] = (a.metodi[metodo] || 0) + importo;
            } else {
                a.daIncassare += importo;
                a.daFare.push({ ordine: o, motivo: 'da incassare' });
            }

            if (bl === 'da_consegnare') a.daFare.push({ ordine: o, motivo: 'da consegnare' });

            const d = dataDi(o);
            if (d) {
                const k = d.toISOString().slice(0, 10);
                if (!a.perGiorno[k]) a.perGiorno[k] = { ordini: 0, pezzi: 0, incasso: 0 };
                a.perGiorno[k].ordini++;
                a.perGiorno[k].pezzi += pezzi;
                a.perGiorno[k].incasso += importo;
            }

            const nome = ((o.nome || '') + ' ' + (o.cognome || '')).trim() || '—';
            if (!a.classifica[nome]) a.classifica[nome] = { pezzi: 0, importo: 0 };
            a.classifica[nome].pezzi += pezzi;
            a.classifica[nome].importo += importo;
        });

        const stockTot = filtri.prodotto === 'PANETTONI' ? (parseInt(cfg.totalePanettoni) || 0)
                       : filtri.prodotto === 'PANDORI' ? (parseInt(cfg.totalePandori) || 0)
                       : (parseInt(cfg.totalePanettoni) || 0) + (parseInt(cfg.totalePandori) || 0);

        a.ticketMedio = a.ordiniAttivi ? Math.round(a.valoreTotale / a.ordiniAttivi) : 0;
        a.pezziMedi = a.ordiniAttivi ? Math.round(a.pezziTotali / a.ordiniAttivi * 10) / 10 : 0;
        a.clientiUnici = a.clienti.size;
        a.daConsegnare = a.statiPezzi.prenotato + a.statiPezzi.preparazione + a.statiPezzi.da_consegnare;
        a.percConsegnato = a.ordiniAttivi ? Math.round(a.stati.consegnato / a.ordiniAttivi * 100) : 0;
        a.percPagato = a.ordiniAttivi ? Math.round(a.pagati / a.ordiniAttivi * 100) : 0;
        a.percStock = stockTot ? Math.round(a.pezziTotali / stockTot * 100) : 0;
        a.ultimi.sort((x, y) => (dataDi(y) || 0) - (dataDi(x) || 0));

        return a;
    }

    /* ======================================================
       TRASCINAMENTO
       ====================================================== */

    let trascinamento = null;

    function abilitaTrascinamento(card) {
        const avvia = (ev) => {
            if (trascinamento) return;
            if (ev.button === 1 || ev.button === 2) return;
            if (ev.target.closest('.widget-azioni')) return;

            const grid = document.getElementById('dashGrid');
            trascinamento = {
                card: card, grid: grid,
                x0: ev.clientX, y0: ev.clientY,
                partito: false, pointerId: ev.pointerId
            };
            card.setPointerCapture(ev.pointerId);
        };

        // Da tutta la scheda col mouse, solo dalla maniglia col dito
        // (altrimenti su telefono non si riesce piu' a scorrere la pagina).
        card.addEventListener('pointerdown', (ev) => {
            if (ev.pointerType === 'mouse') avvia(ev);
        });
        card.querySelector('.widget-maniglia').addEventListener('pointerdown', avvia);

        card.addEventListener('pointermove', (ev) => {
            if (!trascinamento || trascinamento.card !== card) return;

            if (!trascinamento.partito) {
                if (Math.abs(ev.clientX - trascinamento.x0) + Math.abs(ev.clientY - trascinamento.y0) < 8) return;
                trascinamento.partito = true;
                card.classList.add('in-trascinamento');
                document.body.classList.add('sto-trascinando');
            }
            ev.preventDefault();

            card.style.pointerEvents = 'none';
            const sotto = document.elementFromPoint(ev.clientX, ev.clientY);
            card.style.pointerEvents = '';

            const bersaglio = sotto && sotto.closest ? sotto.closest('.widget') : null;
            if (!bersaglio || bersaglio === card || bersaglio.parentNode !== trascinamento.grid) return;
            if (bersaglio.classList.contains('widget-aggiungi')) return;

            const r = bersaglio.getBoundingClientRect();
            const dopo = (ev.clientX - r.left) > r.width / 2;
            trascinamento.grid.insertBefore(card, dopo ? bersaglio.nextSibling : bersaglio);
        });

        const concludi = (ev) => {
            if (!trascinamento || trascinamento.card !== card) return;
            const eraPartito = trascinamento.partito;
            try { card.releasePointerCapture(trascinamento.pointerId); } catch (e) { /* niente */ }
            trascinamento = null;

            card.classList.remove('in-trascinamento');
            document.body.classList.remove('sto-trascinando');
            if (!eraPartito) return;

            card.classList.add('appena-spostato');

            // Il "+" torna sempre in fondo.
            const piu = bottonePiu();
            if (piu) card.parentNode.appendChild(piu);

            riordinaDaDOM();
            salvaLayout();
            if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        };

        card.addEventListener('pointerup', concludi);
        card.addEventListener('pointercancel', concludi);

        // Dopo un trascinamento il click sul widget non deve attivare nulla.
        card.addEventListener('click', (ev) => {
            if (card.classList.contains('appena-spostato')) {
                ev.stopPropagation(); ev.preventDefault();
                card.classList.remove('appena-spostato');
            }
        }, true);
    }

    function bottonePiu() {
        const grid = document.getElementById('dashGrid');
        return grid ? grid.querySelector('.widget-aggiungi') : null;
    }

    function riordinaDaDOM() {
        const grid = document.getElementById('dashGrid');
        if (!grid) return;
        const ordine = Array.prototype.slice.call(grid.querySelectorAll('.widget[data-id]'))
            .map(c => c.dataset.id);
        layout.sort((a, b) => ordine.indexOf(a.id) - ordine.indexOf(b.id));
    }

    /* ======================================================
       RENDER
       ====================================================== */

    function render() {
        if (trascinamento) return;   // mai ridisegnare durante un trascinamento
        if (!costruisciStruttura()) return;

        const grid = document.getElementById('dashGrid');
        if (!grid) return;

        Object.keys(grafici).forEach(k => { try { grafici[k].destroy(); } catch (e) { /* niente */ } });
        grafici = {};

        const a = aggrega();

        const et = document.getElementById('dashEtichetta');
        if (et) {
            const p = { tutto: 'tutto lo storico', '7': 'ultimi 7 giorni', '30': 'ultimi 30 giorni', mese: 'mese corrente' }[filtri.periodo];
            const pr = { TUTTI: 'tutti i prodotti', PANETTONI: 'solo panettoni', PANDORI: 'solo pandori' }[filtri.prodotto];
            et.textContent = p + ' · ' + pr + ' · ' + a.ordiniTotali + ' ordini';
        }

        avvisoScorte(a);
        grid.innerHTML = '';

        layout.forEach(w => {
            const card = document.createElement('div');
            card.className = 'widget size-' + w.size;
            card.dataset.id = w.id;

            const maniglia = document.createElement('div');
            maniglia.className = 'widget-maniglia';
            maniglia.title = 'Trascina per spostare';
            maniglia.textContent = '⠿';
            card.appendChild(maniglia);

            const azioni = document.createElement('div');
            azioni.className = 'widget-azioni';
            azioni.innerHTML = `<button type="button" data-cmd="size" title="Larghezza">${w.size.toUpperCase()}</button>
                                <button type="button" data-cmd="via" title="Rimuovi" class="tool-danger">✕</button>`;
            azioni.addEventListener('click', ev => {
                const cmd = ev.target.dataset.cmd;
                if (!cmd) return;
                ev.stopPropagation();
                if (cmd === 'size') {
                    const o = ['s', 'm', 'l'];
                    w.size = o[(o.indexOf(w.size) + 1) % 3];
                } else if (cmd === 'via') {
                    const i = layout.indexOf(w);
                    if (i >= 0) layout.splice(i, 1);
                }
                salvaLayout();
                render();
            });
            card.appendChild(azioni);

            const corpo = document.createElement('div');
            corpo.className = 'widget-body';
            card.appendChild(corpo);
            grid.appendChild(card);

            try { disegna(w, corpo, a); }
            catch (e) { corpo.innerHTML = '<p class="widget-vuoto">Widget non disponibile.</p>'; }

            abilitaTrascinamento(card);
        });

        const piu = document.createElement('button');
        piu.type = 'button';
        piu.className = 'widget widget-aggiungi size-s';
        piu.innerHTML = '<span class="piu-segno">+</span><span class="piu-testo">Aggiungi widget</span>';
        piu.addEventListener('click', apriCatalogo);
        grid.appendChild(piu);

        if (esisteFn(window.applicaPermessi)) window.applicaPermessi();
    }

    /* ======================================================
       PEZZI DI WIDGET
       ====================================================== */

    function titolo(corpo, testo, sotto) {
        const d = document.createElement('div');
        d.className = 'widget-head';
        d.innerHTML = `<span class="widget-title">${h(testo)}</span>` + (sotto ? `<span class="widget-sub">${h(sotto)}</span>` : '');
        corpo.appendChild(d);
    }

    function vuoto(corpo, testo) {
        const p = document.createElement('p');
        p.className = 'widget-vuoto';
        p.textContent = testo;
        corpo.appendChild(p);
    }

    function grafico(w, corpo, cfg, altezza) {
        if (typeof Chart === 'undefined') return vuoto(corpo, 'Libreria grafici non caricata.');
        const wrap = document.createElement('div');
        wrap.className = 'widget-chart';
        wrap.style.height = (altezza || 200) + 'px';
        const cv = document.createElement('canvas');
        wrap.appendChild(cv);
        corpo.appendChild(wrap);
        cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, cfg.options || {});
        grafici[w.id] = new Chart(cv.getContext('2d'), cfg);
    }

    function lista(corpo, righe) {
        const ul = document.createElement('ul');
        ul.className = 'lista-widget';
        righe.forEach(r => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${h(r[0])}${r[2] ? `<em>${h(r[2])}</em>` : ''}</span><strong>${h(r[1])}</strong>`;
            ul.appendChild(li);
        });
        corpo.appendChild(ul);
    }

    function serieTemporale(w, corpo, a, campo, etichetta) {
        titolo(corpo, etichetta);
        const giorni = Object.keys(a.perGiorno).sort();
        if (!giorni.length) return vuoto(corpo, 'Nessun dato nel periodo selezionato.');
        grafico(w, corpo, {
            type: 'line',
            data: {
                labels: giorni.map(g => g.slice(8, 10) + '/' + g.slice(5, 7)),
                datasets: [{
                    data: giorni.map(g => Math.round(a.perGiorno[g][campo])),
                    borderColor: '#5b8e72', backgroundColor: 'rgba(91,142,114,0.12)',
                    fill: true, tension: 0.3, pointRadius: giorni.length > 30 ? 0 : 3
                }]
            },
            options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
        }, 220);
    }

    function disegna(w, corpo, a) {
        if (w.tipo === 'kpi') {
            const m = METRICHE[w.metrica];
            const v = a[w.metrica] || 0;
            const testo = m.formato === 'euro' ? fmtEuro(v) : m.formato === 'perc' ? v + '%' : fmtNum(v);
            corpo.innerHTML = `<div class="kpi-block">
                    <div class="kpi-label">${h(m.titolo)}</div>
                    <div class="kpi-value" style="color:${m.colore}">${h(testo)}</div>
                </div>`;
            return;
        }

        if (SERIE[w.tipo]) return serieTemporale(w, corpo, a, SERIE[w.tipo], CATALOGO[w.tipo].nome);

        switch (w.tipo) {

            case 'stock': {
                titolo(corpo, 'Stock');
                const righe = [];
                if (filtri.prodotto !== 'PANDORI') righe.push(['🥮 Panettoni', a.panettoni, parseInt(a.cfg.totalePanettoni) || 0]);
                if (filtri.prodotto !== 'PANETTONI') righe.push(['🍞 Pandori', a.pandori, parseInt(a.cfg.totalePandori) || 0]);

                righe.forEach(r => {
                    const nome = r[0], impegnati = r[1], totale = r[2];
                    const perc = totale > 0 ? Math.min(100, Math.round(impegnati / totale * 100)) : 0;
                    const rim = totale - impegnati;
                    const b = document.createElement('div');
                    b.className = 'stock-riga';
                    b.innerHTML = `
                        <div class="stock-riga-head">
                            <span class="stock-title">${h(nome)}</span>
                            <button class="stock-edit-btn admin-only" type="button">Modifica</button>
                        </div>
                        <div class="stock-numbers">
                            <span class="stock-main-val">${impegnati}</span>
                            <span class="stock-sub-val">prenotati su ${totale}</span>
                        </div>
                        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${perc}%"></div></div>
                        <div class="stock-sub-val">${rim >= 0 ? 'Rimanenza: ' + rim + ' pz' : 'Sovrapprenotato di ' + Math.abs(rim) + ' pz'}</div>`;
                    b.querySelector('button').addEventListener('click', () => {
                        if (esisteFn(window.apriModaleStock)) window.apriModaleStock();
                    });
                    corpo.appendChild(b);
                });
                break;
            }

            case 'flusso': {
                titolo(corpo, 'Flusso logistico', 'clicca per filtrare gli ordini');
                const voci = [
                    ['Prenotati', 'prenotato', 'card-st-prenotato', 'Prenotato - Da Pagare'],
                    ['In preparazione', 'preparazione', 'card-st-prep', 'In Preparazione'],
                    ['Da consegnare', 'da_consegnare', 'card-st-consegna', 'Da Consegnare'],
                    ['Consegnati', 'consegnato', 'card-st-consegnato', 'Consegnato'],
                    ['Annullati', 'annullato', 'card-st-annullato', 'Annullato']
                ];
                const grid = document.createElement('div');
                grid.className = 'flow-grid';
                voci.forEach(v => {
                    const c = document.createElement('div');
                    c.className = 'flow-card ' + v[2];
                    c.innerHTML = `<div class="flow-card-title">${h(v[0])}</div>
                                   <div class="flow-card-count">${a.stati[v[1]]}</div>
                                   <div class="flow-card-sub">${a.statiPezzi[v[1]]} pz</div>`;
                    c.addEventListener('click', () => {
                        if (esisteFn(window.navigaVersoFiltro)) window.navigaVersoFiltro(v[3]);
                    });
                    grid.appendChild(c);
                });
                corpo.appendChild(grid);
                break;
            }

            case 'barStati':
                titolo(corpo, 'Ordini per stato');
                grafico(w, corpo, {
                    type: 'bar',
                    data: {
                        labels: ['Prenotati', 'In prep.', 'Da conseg.', 'Consegnati', 'Annullati'],
                        datasets: [{
                            data: ['prenotato', 'preparazione', 'da_consegnare', 'consegnato', 'annullato'].map(k => a.stati[k]),
                            backgroundColor: ['#2b6cb0', '#b7791f', '#6b46c1', '#2e7d32', '#a0aec0'], borderRadius: 8
                        }]
                    },
                    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
                });
                break;

            case 'barProdotti': {
                titolo(corpo, 'Pezzi per prodotto');
                const et = [], vl = [], col = [];
                if (filtri.prodotto !== 'PANDORI') { et.push('Panettoni'); vl.push(a.panettoni); col.push('#5b8e72'); }
                if (filtri.prodotto !== 'PANETTONI') { et.push('Pandori'); vl.push(a.pandori); col.push('#94bdad'); }
                grafico(w, corpo, {
                    type: 'bar',
                    data: { labels: et, datasets: [{ data: vl, backgroundColor: col, borderRadius: 10 }] },
                    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
                });
                break;
            }

            case 'tortaPagamenti': {
                titolo(corpo, 'Incassi per metodo');
                const et = Object.keys(a.metodi);
                if (!et.length) return vuoto(corpo, 'Nessun incasso registrato nel periodo.');
                grafico(w, corpo, {
                    type: 'doughnut',
                    data: { labels: et, datasets: [{ data: et.map(k => Math.round(a.metodi[k])), backgroundColor: ['#5b8e72', '#94bdad', '#b7791f', '#cbd5e0'] }] },
                    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
                });
                break;
            }

            case 'cumulato': {
                titolo(corpo, 'Pezzi cumulati', 'progressione verso il totale disponibile');
                const giorni = Object.keys(a.perGiorno).sort();
                if (!giorni.length) return vuoto(corpo, 'Nessun dato nel periodo selezionato.');
                let somma = 0;
                const serie = giorni.map(g => (somma += a.perGiorno[g].pezzi));
                const obiettivo = filtri.prodotto === 'PANETTONI' ? (parseInt(a.cfg.totalePanettoni) || 0)
                                : filtri.prodotto === 'PANDORI' ? (parseInt(a.cfg.totalePandori) || 0)
                                : (parseInt(a.cfg.totalePanettoni) || 0) + (parseInt(a.cfg.totalePandori) || 0);
                grafico(w, corpo, {
                    type: 'line',
                    data: {
                        labels: giorni.map(g => g.slice(8, 10) + '/' + g.slice(5, 7)),
                        datasets: [
                            { label: 'Cumulato', data: serie, borderColor: '#5b8e72', backgroundColor: 'rgba(91,142,114,0.12)', fill: true, tension: 0.3, pointRadius: 0 },
                            { label: 'Disponibili', data: giorni.map(() => obiettivo), borderColor: '#c53030', borderDash: [6, 4], pointRadius: 0, fill: false }
                        ]
                    },
                    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } }
                }, 220);
                break;
            }

            case 'classifica': {
                titolo(corpo, 'Migliori clienti', 'per pezzi prenotati');
                const top = Object.keys(a.classifica)
                    .map(n => [n, a.classifica[n]])
                    .sort((x, y) => y[1].pezzi - x[1].pezzi).slice(0, 8);
                if (!top.length) return vuoto(corpo, 'Nessun ordine nel periodo.');
                lista(corpo, top.map(t => [t[0], t[1].pezzi + ' pz · ' + fmtEuro(t[1].importo)]));
                break;
            }

            case 'ultimiOrdini': {
                titolo(corpo, 'Ultimi ordini');
                const rec = a.ultimi.slice(0, 8);
                if (!rec.length) return vuoto(corpo, 'Nessun ordine nel periodo.');
                lista(corpo, rec.map(o => {
                    const d = dataDi(o);
                    return [
                        ((o.nome || '') + ' ' + (o.cognome || '')).trim() || '—',
                        ((parseInt(o.panettoni) || 0) + (parseInt(o.pandori) || 0)) + ' pz',
                        d ? d.toLocaleDateString('it-IT') : ''
                    ];
                }));
                break;
            }

            case 'daFare':
                titolo(corpo, 'Cose da fare', 'ordini che aspettano un\u0027azione');
                if (!a.daFare.length) return vuoto(corpo, 'Tutto in ordine.');
                lista(corpo, a.daFare.slice(0, 10).map(v => [
                    ((v.ordine.nome || '') + ' ' + (v.ordine.cognome || '')).trim() || '—',
                    v.motivo,
                    v.ordine.codice || ''
                ]));
                break;

            case 'tabellaStati': {
                titolo(corpo, 'Riepilogo per stato');
                const nomi = {
                    prenotato: 'Prenotati', preparazione: 'In preparazione',
                    da_consegnare: 'Da consegnare', consegnato: 'Consegnati', annullato: 'Annullati'
                };
                lista(corpo, Object.keys(nomi).map(k => [
                    nomi[k],
                    a.stati[k] + ' ord · ' + a.statiPezzi[k] + ' pz · ' + fmtEuro(a.statiImporto[k])
                ]));
                break;
            }

            default:
                vuoto(corpo, 'Widget sconosciuto.');
        }
    }

    function avvisoScorte(a) {
        const box = document.getElementById('alertScorte');
        if (!box) return;
        const mancanti = [];
        if ((parseInt(a.cfg.totalePanettoni) || 0) - a.panettoni <= 0) mancanti.push('panettoni');
        if ((parseInt(a.cfg.totalePandori) || 0) - a.pandori <= 0) mancanti.push('pandori');

        if (mancanti.length && filtri.periodo === 'tutto') {
            box.textContent = '⚠️ Scorte esaurite: ' + mancanti.join(' e ') + '. Chiudi le prenotazioni o aumenta lo stock.';
            box.style.display = 'flex';
        } else {
            box.style.display = 'none';
        }
    }

    /* ======================================================
       API PUBBLICA
       ====================================================== */

    function calcolaStatistiche(dati, config) {
        ultimiDati = Array.isArray(dati) ? dati : [];
        if (config) ultimaConfig = config;

        // Al login (o al cambio utente) si ricaricano le preferenze di chi entra.
        const u = utente();
        const uid = (u && u.uid) ? u.uid : null;
        if (!pronto || uid !== uidCaricato) { pronto = true; caricaLayout(); return; }

        render();
    }

    function esportaPDF() {
        const vista = document.getElementById('view-dashboard');
        if (!vista || typeof html2pdf === 'undefined') return alert('Export PDF non disponibile.');
        html2pdf().set({
            margin: 10,
            filename: 'Dashboard_WonderLAD_' + new Date().toISOString().slice(0, 10) + '.pdf',
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        }).from(vista).save();
    }

    window.calcolaStatistiche = calcolaStatistiche;
    window.esportaPDF = esportaPDF;
    window.apriCatalogoWidget = apriCatalogo;
    window.cambiaVistaDashboard = function (m) { filtri.prodotto = m; render(); };
    window.impostaFiltroProdotto = function (v) { filtri.prodotto = v; render(); };
    window.impostaFiltroPeriodo = function (v) { filtri.periodo = v; render(); };
    window.toggleModificaLayout = function () { /* non serve piu' */ };
    window.ripristinaLayout = function () {
        if (!confirm('Ripristinare la dashboard predefinita?')) return;
        layout = normalizza(PREDEFINITO);
        salvaLayout();
        render();
    };

    /* ======================================================
       CSS (viaggia con il file)
       ====================================================== */

    const stile = document.createElement('style');
    stile.textContent = `
.dash-toolbar { display:flex; flex-wrap:wrap; gap:.8rem; align-items:center; justify-content:space-between; margin-bottom:.6rem; }
.dash-toolbar .dash-selector-bar { margin-bottom:0; flex:1 1 260px; }
.dash-toolbar-right { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
.dash-select { padding:.5rem .8rem; border:2px solid var(--border-color); border-radius:10px; font-family:'Quicksand',sans-serif; font-weight:700; font-size:.8rem; background:var(--card-bg); color:var(--text-main); cursor:pointer; }
.dash-etichetta { font-size:.78rem; color:var(--text-muted); font-weight:700; margin-bottom:1rem; font-family:'Quicksand',sans-serif; }
.dash-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:1rem; margin-bottom:1.5rem; align-items:start; }
.widget { background:var(--card-bg); border:2px solid var(--border-color); border-radius:20px; padding:2.3rem 1.1rem 1.1rem; position:relative; min-width:0; }
.widget.size-s { grid-column:span 2; }
.widget.size-m { grid-column:span 3; }
.widget.size-l { grid-column:span 6; }
.widget.in-trascinamento { opacity:.55; border-style:dashed; border-color:var(--primary); box-shadow:0 8px 24px rgba(91,142,114,.18); }
body.sto-trascinando { user-select:none; cursor:grabbing; }
.widget-maniglia { position:absolute; top:.5rem; left:.7rem; color:#c3d3ca; font-size:1rem; line-height:1; cursor:grab; opacity:0; transition:opacity .15s; touch-action:none; padding:2px 4px; }
.widget:hover .widget-maniglia { opacity:1; }
.widget.in-trascinamento .widget-maniglia { cursor:grabbing; opacity:1; }
.widget-azioni { position:absolute; top:.45rem; right:.6rem; display:flex; gap:4px; opacity:0; transition:opacity .15s; }
.widget:hover .widget-azioni, .widget-azioni:focus-within { opacity:1; }
.widget-azioni button { background:#f0f4f1; border:1px solid var(--border-color); color:var(--primary-dark); min-width:26px; height:24px; border-radius:8px; cursor:pointer; font-size:.7rem; font-weight:800; font-family:'Quicksand',sans-serif; padding:0 5px; }
.widget-azioni .tool-danger { background:#fce8e6; color:#c53030; border-color:#f5c6cb; }
.widget-head { display:flex; flex-direction:column; margin-bottom:.8rem; }
.widget-title { font-family:'Quicksand',sans-serif; font-weight:800; font-size:.95rem; color:var(--text-main); }
.widget-sub { font-size:.72rem; color:var(--text-muted); font-weight:700; }
.widget-body > .flow-grid { margin-bottom:0; }
.widget-chart { position:relative; width:100%; }
.widget-vuoto { color:var(--text-muted); font-size:.85rem; text-align:center; padding:1.5rem 0; margin:0; }
.widget-aggiungi { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-height:120px; border-style:dashed; border-color:var(--accent-soft); background:var(--accent-light); cursor:pointer; padding:1.1rem; font-family:'Quicksand',sans-serif; color:var(--primary-dark); }
.widget-aggiungi:hover { border-color:var(--primary); background:#e2efe8; }
.piu-segno { font-size:2rem; font-weight:800; line-height:1; }
.piu-testo { font-size:.8rem; font-weight:800; }
.kpi-block { text-align:center; padding:.2rem 0 .4rem; }
.kpi-label { font-size:.78rem; font-weight:800; font-family:'Quicksand',sans-serif; color:var(--text-muted); }
.kpi-value { font-size:1.9rem; font-weight:800; font-family:'Quicksand',sans-serif; line-height:1.2; }
.stock-riga + .stock-riga { margin-top:1.2rem; padding-top:1.2rem; border-top:1px solid var(--border-color); }
.stock-riga-head { display:flex; justify-content:space-between; align-items:center; }
.lista-widget { list-style:none; margin:0; padding:0; }
.lista-widget li { display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding:.5rem 0; border-bottom:1px solid var(--border-color); font-size:.88rem; }
.lista-widget li:last-child { border-bottom:none; }
.lista-widget em { display:block; font-size:.72rem; color:var(--text-muted); font-style:normal; font-weight:700; }
.lista-widget strong { white-space:nowrap; color:var(--primary-dark); font-size:.82rem; }
#widget-modal .modal-content { max-width:600px; max-height:85vh; overflow-y:auto; }
.catalogo-lista { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:.6rem; margin-bottom:1.2rem; }
.catalogo-item { text-align:left; background:#f7faf8; border:2px solid var(--border-color); border-radius:14px; padding:.7rem .8rem; cursor:pointer; display:flex; flex-direction:column; gap:2px; }
.catalogo-item:hover { border-color:var(--primary); background:var(--accent-light); }
.catalogo-item strong { font-family:'Quicksand',sans-serif; font-size:.88rem; color:var(--text-main); }
.catalogo-item span { font-size:.73rem; color:var(--text-muted); font-weight:600; }
.catalogo-titolo { font-family:'Quicksand',sans-serif; font-weight:800; font-size:.8rem; color:var(--text-muted); margin:0 0 .5rem; }
@media screen and (max-width:900px) {
  .dash-grid { grid-template-columns:repeat(2,1fr); }
  .widget.size-s { grid-column:span 1; }
  .widget.size-m, .widget.size-l { grid-column:span 2; }
}
@media screen and (max-width:560px) {
  .dash-grid { grid-template-columns:1fr; }
  .widget.size-s, .widget.size-m, .widget.size-l { grid-column:span 1; }
  .widget-maniglia, .widget-azioni { opacity:1; }
}`;
    document.head.appendChild(stile);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { if (!pronto) { pronto = true; caricaLayout(); } });
    } else {
        setTimeout(() => { if (!pronto) { pronto = true; caricaLayout(); } }, 0);
    }

})();
