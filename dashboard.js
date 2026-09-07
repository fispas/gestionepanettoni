// WonderLAD - dashboard componibile.
// Ogni utente compone la propria griglia di widget; il layout vive in
// preferenze/{uid} su Firestore, con fallback su localStorage.

/* ==========================================================
   STATO
   ========================================================== */

let layoutDashboard = [];
let modificaLayout = false;
let filtriDashboard = { prodotto: 'TUTTI', periodo: 'tutto' };
let grafici = {};              // idWidget -> istanza Chart
let ultimiDati = [];
let ultimaConfig = null;
let layoutCaricato = false;

/* ==========================================================
   CATALOGO WIDGET
   ========================================================== */

const METRICHE = {
    incassato:      { titolo: 'Incassato',            formato: 'euro', colore: '#2e7d32' },
    daIncassare:    { titolo: 'Da incassare',         formato: 'euro', colore: '#c53030' },
    valoreTotale:   { titolo: 'Valore prenotato',     formato: 'euro', colore: '#3a6250' },
    ordiniTotali:   { titolo: 'Ordini',               formato: 'num',  colore: '#2b6cb0' },
    pezziTotali:    { titolo: 'Pezzi prenotati',      formato: 'num',  colore: '#3a6250' },
    ticketMedio:    { titolo: 'Ticket medio',         formato: 'euro', colore: '#6b46c1' },
    clientiUnici:   { titolo: 'Clienti',              formato: 'num',  colore: '#2b6cb0' },
    daConsegnare:   { titolo: 'Pezzi da consegnare',  formato: 'num',  colore: '#b7791f' },
    percConsegnato: { titolo: 'Consegnato',           formato: 'perc', colore: '#2e7d32' },
    percPagato:     { titolo: 'Pagato',               formato: 'perc', colore: '#276749' }
};

const CATALOGO = {
    kpi:            { nome: 'Indicatore',            descrizione: 'Un numero secco a scelta.',        sizeDefault: 's' },
    stock:          { nome: 'Stock',                 descrizione: 'Pezzi impegnati sul disponibile.', sizeDefault: 'm' },
    flusso:         { nome: 'Flusso logistico',      descrizione: 'Conteggi per stato, cliccabili.',  sizeDefault: 'l' },
    barStati:       { nome: 'Ordini per stato',      descrizione: 'Grafico a barre.',                 sizeDefault: 'm' },
    barProdotti:    { nome: 'Pezzi per prodotto',    descrizione: 'Panettoni contro pandori.',        sizeDefault: 'm' },
    tortaPagamenti: { nome: 'Metodi di pagamento',   descrizione: 'Ripartizione degli incassi.',      sizeDefault: 'm' },
    andamento:      { nome: 'Andamento giornaliero', descrizione: 'Serie storica nel periodo.',       sizeDefault: 'l' },
    classifica:     { nome: 'Migliori clienti',      descrizione: 'Chi ha prenotato di più.',         sizeDefault: 'm' },
    ultimiOrdini:   { nome: 'Ultimi ordini',         descrizione: 'Le prenotazioni più recenti.',     sizeDefault: 'm' }
};

const LAYOUT_PREDEFINITO = [
    { tipo: 'kpi', metrica: 'incassato', size: 's' },
    { tipo: 'kpi', metrica: 'daIncassare', size: 's' },
    { tipo: 'kpi', metrica: 'ordiniTotali', size: 's' },
    { tipo: 'stock', size: 'm' },
    { tipo: 'flusso', size: 'l' },
    { tipo: 'andamento', serie: 'pezzi', size: 'l' },
    { tipo: 'barProdotti', size: 'm' },
    { tipo: 'tortaPagamenti', size: 'm' }
];

/* ==========================================================
   PERSISTENZA LAYOUT
   ========================================================== */

function chiaveLocale() {
    return 'wl-dashboard-' + (typeof utenteCorrente !== 'undefined' ? utenteCorrente.uid : 'anon');
}

function caricaLayout() {
    let locale = null;
    try { locale = JSON.parse(localStorage.getItem(chiaveLocale())); } catch (e) { /* ignora */ }

    layoutDashboard = normalizzaLayout(locale || LAYOUT_PREDEFINITO);
    layoutCaricato = true;
    renderDashboard();

    if (typeof utenteCorrente === 'undefined' || !utenteCorrente.uid) return;

    db.collection("preferenze").doc(utenteCorrente.uid).get()
        .then(doc => {
            if (doc.exists && Array.isArray(doc.data().dashboard)) {
                layoutDashboard = normalizzaLayout(doc.data().dashboard);
                renderDashboard();
            }
        })
        .catch(() => { /* si resta sul layout locale */ });
}

function normalizzaLayout(arr) {
    return (arr || [])
        .filter(w => w && CATALOGO[w.tipo])
        .slice(0, 24)
        .map((w, i) => ({
            id: 'w' + i + '-' + Math.random().toString(36).slice(2, 7),
            tipo: w.tipo,
            size: ['s', 'm', 'l'].includes(w.size) ? w.size : CATALOGO[w.tipo].sizeDefault,
            metrica: METRICHE[w.metrica] ? w.metrica : 'incassato',
            serie: ['ordini', 'pezzi', 'incasso'].includes(w.serie) ? w.serie : 'pezzi'
        }));
}

function salvaLayout() {
    const daSalvare = layoutDashboard.map(w => ({
        tipo: w.tipo, size: w.size, metrica: w.metrica, serie: w.serie
    }));

    try { localStorage.setItem(chiaveLocale(), JSON.stringify(daSalvare)); } catch (e) { /* quota */ }

    if (typeof utenteCorrente === 'undefined' || !utenteCorrente.uid) return;

    db.collection("preferenze").doc(utenteCorrente.uid).set({
        dashboard: daSalvare,
        aggiornato: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => { /* resta salvato in locale */ });
}

/* ==========================================================
   CALCOLO DATI
   ========================================================== */

function bucketLogistico(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('annullato')) return 'annullato';
    if (s.includes('consegnato')) return 'consegnato';
    if (s.includes('da consegnare')) return 'da_consegnare';
    if (s.includes('preparazione')) return 'preparazione';
    return 'prenotato';
}

function bucketPagamento(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('annullato')) return null;
    if (s.includes('pagato') || s.includes('consegnato')) return 'pagato';
    return 'da_pagare';
}

function dataOrdine(o) {
    return (o.timestamp && typeof o.timestamp.toDate === 'function') ? o.timestamp.toDate() : null;
}

function dentroPeriodo(o) {
    if (filtriDashboard.periodo === 'tutto') return true;
    const d = dataOrdine(o);
    if (!d) return false;

    const ora = new Date();
    if (filtriDashboard.periodo === 'mese') {
        return d.getFullYear() === ora.getFullYear() && d.getMonth() === ora.getMonth();
    }
    return (ora - d) <= parseInt(filtriDashboard.periodo, 10) * 86400000;
}

// Aggregato unico su cui si appoggiano tutti i widget.
function aggrega(dati, config) {
    const cfg = config || CONFIG_DEFAULT;
    const prezzoPan = cfg.prezzoPanettone;
    const prezzoPand = cfg.prezzoPandoro;

    const a = {
        config: cfg,
        stati: { prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 },
        statiPezzi: { prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 },
        pagamenti: { da_pagare: 0, pagato: 0 },
        metodi: {},
        incassato: 0, daIncassare: 0, valoreTotale: 0,
        panettoni: 0, pandori: 0, pezziTotali: 0,
        ordiniTotali: 0, ordiniAttivi: 0,
        clienti: new Set(),
        perGiorno: {},
        classifica: {},
        ultimi: []
    };

    dati.filter(dentroPeriodo).forEach(o => {
        const panTot = parseInt(o.panettoni) || 0;
        const pandTot = parseInt(o.pandori) || 0;

        const pan = filtriDashboard.prodotto === 'PANDORI' ? 0 : panTot;
        const pand = filtriDashboard.prodotto === 'PANETTONI' ? 0 : pandTot;
        if (pan + pand <= 0) return;

        const bLog = bucketLogistico(o.status);
        const bPag = bucketPagamento(o.status);
        const pezzi = pan + pand;
        const importo = pan * prezzoPan + pand * prezzoPand;

        a.ordiniTotali++;
        a.stati[bLog]++;
        a.statiPezzi[bLog] += pezzi;
        a.ultimi.push(o);

        if (bLog === 'annullato') return;   // gli annullati non pesano su nulla

        a.ordiniAttivi++;
        a.panettoni += pan;
        a.pandori += pand;
        a.pezziTotali += pezzi;
        a.valoreTotale += importo;
        a.clienti.add(`${(o.nome || '').toLowerCase()}|${o.telefono || ''}`);

        if (bPag === 'pagato') {
            a.pagamenti.pagato++;
            a.incassato += importo;
            const metodo = (o.metodoPagamento && o.metodoPagamento !== '-') ? o.metodoPagamento : 'Non indicato';
            a.metodi[metodo] = (a.metodi[metodo] || 0) + importo;
        } else {
            a.pagamenti.da_pagare++;
            a.daIncassare += importo;
        }

        const d = dataOrdine(o);
        if (d) {
            const k = d.toISOString().slice(0, 10);
            if (!a.perGiorno[k]) a.perGiorno[k] = { ordini: 0, pezzi: 0, incasso: 0 };
            a.perGiorno[k].ordini++;
            a.perGiorno[k].pezzi += pezzi;
            a.perGiorno[k].incasso += importo;
        }

        const cliente = `${o.nome || ''} ${o.cognome || ''}`.trim() || '—';
        if (!a.classifica[cliente]) a.classifica[cliente] = { pezzi: 0, importo: 0 };
        a.classifica[cliente].pezzi += pezzi;
        a.classifica[cliente].importo += importo;
    });

    a.ticketMedio = a.ordiniAttivi ? Math.round(a.valoreTotale / a.ordiniAttivi) : 0;
    a.clientiUnici = a.clienti.size;
    a.daConsegnare = a.statiPezzi.prenotato + a.statiPezzi.preparazione + a.statiPezzi.da_consegnare;
    a.percConsegnato = a.ordiniAttivi ? Math.round(a.stati.consegnato / a.ordiniAttivi * 100) : 0;
    a.percPagato = a.ordiniAttivi ? Math.round(a.pagamenti.pagato / a.ordiniAttivi * 100) : 0;
    a.ultimi.sort((x, y) => (dataOrdine(y) || 0) - (dataOrdine(x) || 0));

    return a;
}

/* ==========================================================
   PUNTO DI INGRESSO (chiamato da app.js a ogni snapshot)
   ========================================================== */

function calcolaStatistiche(dati, config) {
    ultimiDati = dati || [];
    ultimaConfig = config || CONFIG_DEFAULT;
    if (!layoutCaricato) { caricaLayout(); return; }
    renderDashboard();
}

/* ==========================================================
   RENDER
   ========================================================== */

function renderDashboard() {
    const griglia = document.getElementById('dashGrid');
    if (!griglia) return;

    Object.values(grafici).forEach(c => c.destroy());
    grafici = {};

    const a = aggrega(ultimiDati, ultimaConfig);
    aggiornaAvvisoScorte(a);

    const lbl = document.getElementById('dashEtichettaFiltri');
    if (lbl) lbl.textContent = etichettaFiltri();

    griglia.innerHTML = '';
    griglia.classList.toggle('in-modifica', modificaLayout);

    if (!layoutDashboard.length) {
        griglia.innerHTML = `<p class="dash-vuota">Nessun widget. Premi <strong>Personalizza</strong> e aggiungi quello che ti serve.</p>`;
        return;
    }

    layoutDashboard.forEach((w, indice) => {
        const card = document.createElement('div');
        card.className = `widget size-${w.size}`;
        if (modificaLayout) card.appendChild(barraStrumenti(w, indice));

        const corpo = document.createElement('div');
        corpo.className = 'widget-body';
        card.appendChild(corpo);
        griglia.appendChild(card);

        try {
            disegnaWidget(w, corpo, a);
        } catch (e) {
            corpo.innerHTML = `<p class="widget-vuoto">Widget non disponibile.</p>`;
        }
    });

    if (typeof applicaPermessi === 'function') applicaPermessi();
}

function barraStrumenti(w, indice) {
    const barra = document.createElement('div');
    barra.className = 'widget-tools';
    barra.innerHTML = `
        <button data-cmd="prima" title="Sposta prima" ${indice === 0 ? 'disabled' : ''}>◀</button>
        <button data-cmd="dopo" title="Sposta dopo" ${indice === layoutDashboard.length - 1 ? 'disabled' : ''}>▶</button>
        <button data-cmd="size" title="Cambia larghezza">${w.size.toUpperCase()}</button>
        <button data-cmd="rimuovi" title="Rimuovi" class="tool-danger">✕</button>`;

    barra.addEventListener('click', ev => {
        const cmd = ev.target.dataset.cmd;
        if (!cmd) return;

        if (cmd === 'prima' && indice > 0) {
            [layoutDashboard[indice - 1], layoutDashboard[indice]] = [layoutDashboard[indice], layoutDashboard[indice - 1]];
        } else if (cmd === 'dopo' && indice < layoutDashboard.length - 1) {
            [layoutDashboard[indice + 1], layoutDashboard[indice]] = [layoutDashboard[indice], layoutDashboard[indice + 1]];
        } else if (cmd === 'size') {
            const ordine = ['s', 'm', 'l'];
            w.size = ordine[(ordine.indexOf(w.size) + 1) % 3];
        } else if (cmd === 'rimuovi') {
            layoutDashboard.splice(indice, 1);
        }
        salvaLayout();
        renderDashboard();
    });
    return barra;
}

function intestazione(corpo, titolo, sottotitolo) {
    const h = document.createElement('div');
    h.className = 'widget-head';
    h.innerHTML = `<span class="widget-title">${esc(titolo)}</span>` +
                  (sottotitolo ? `<span class="widget-sub">${esc(sottotitolo)}</span>` : '');
    corpo.appendChild(h);
}

function canvasWidget(corpo, altezza) {
    const wrap = document.createElement('div');
    wrap.className = 'widget-chart';
    wrap.style.height = (altezza || 200) + 'px';
    const cv = document.createElement('canvas');
    wrap.appendChild(cv);
    corpo.appendChild(wrap);
    return cv;
}

function nuovoGrafico(w, canvas, cfg) {
    if (typeof Chart === 'undefined') return;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: false }, cfg.options || {});
    grafici[w.id] = new Chart(canvas.getContext('2d'), cfg);
}

function messaggioVuoto(corpo, testo) {
    const p = document.createElement('p');
    p.className = 'widget-vuoto';
    p.textContent = testo;
    corpo.appendChild(p);
}

const fmtEuro = (n) => '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT');
const fmtNum = (n) => Number(n || 0).toLocaleString('it-IT');

/* ==========================================================
   I SINGOLI WIDGET
   ========================================================== */

function disegnaWidget(w, corpo, a) {
    switch (w.tipo) {

        case 'kpi': {
            const m = METRICHE[w.metrica];
            const val = a[w.metrica] || 0;
            const testo = m.formato === 'euro' ? fmtEuro(val)
                        : m.formato === 'perc' ? val + '%'
                        : fmtNum(val);
            corpo.innerHTML = `
                <div class="kpi-block">
                    <div class="kpi-label">${esc(m.titolo)}</div>
                    <div class="kpi-value" style="color:${m.colore}">${esc(testo)}</div>
                </div>`;
            break;
        }

        case 'stock': {
            intestazione(corpo, 'Stock');
            const righe = [];
            if (filtriDashboard.prodotto !== 'PANDORI') righe.push(['🥮 Panettoni', a.panettoni, a.config.totalePanettoni]);
            if (filtriDashboard.prodotto !== 'PANETTONI') righe.push(['🍞 Pandori', a.pandori, a.config.totalePandori]);

            righe.forEach(([nome, impegnati, totale]) => {
                const perc = totale > 0 ? Math.min(100, Math.round(impegnati / totale * 100)) : 0;
                const rimanenza = totale - impegnati;
                const blocco = document.createElement('div');
                blocco.className = 'stock-riga';
                blocco.innerHTML = `
                    <div class="stock-riga-head">
                        <span class="stock-title">${esc(nome)}</span>
                        <button class="stock-edit-btn admin-only" data-apri-stock="1">Modifica</button>
                    </div>
                    <div class="stock-numbers">
                        <span class="stock-main-val">${impegnati}</span>
                        <span class="stock-sub-val">prenotati su ${totale}</span>
                    </div>
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${perc}%"></div></div>
                    <div class="stock-sub-val">${rimanenza >= 0 ? 'Rimanenza: ' + rimanenza + ' pz' : 'Sovrapprenotato di ' + Math.abs(rimanenza) + ' pz'}</div>`;
                blocco.querySelector('[data-apri-stock]').addEventListener('click', () => apriModaleStock());
                corpo.appendChild(blocco);
            });
            break;
        }

        case 'flusso': {
            intestazione(corpo, 'Flusso logistico', 'clicca per filtrare gli ordini');
            const voci = [
                ['Prenotati', 'prenotato', 'card-st-prenotato', 'Prenotato - Da Pagare'],
                ['In preparazione', 'preparazione', 'card-st-prep', 'In Preparazione'],
                ['Da consegnare', 'da_consegnare', 'card-st-consegna', 'Da Consegnare'],
                ['Consegnati', 'consegnato', 'card-st-consegnato', 'Consegnato'],
                ['Annullati', 'annullato', 'card-st-annullato', 'Annullato']
            ];
            const grid = document.createElement('div');
            grid.className = 'flow-grid';
            voci.forEach(([titolo, chiave, classe, filtro]) => {
                const c = document.createElement('div');
                c.className = 'flow-card ' + classe;
                c.innerHTML = `
                    <div class="flow-card-title">${esc(titolo)}</div>
                    <div class="flow-card-count">${a.stati[chiave]}</div>
                    <div class="flow-card-sub">${a.statiPezzi[chiave]} pz</div>`;
                c.addEventListener('click', () => navigaVersoFiltro(filtro));
                grid.appendChild(c);
            });
            corpo.appendChild(grid);
            break;
        }

        case 'barStati': {
            intestazione(corpo, 'Ordini per stato');
            const valori = ['prenotato', 'preparazione', 'da_consegnare', 'consegnato', 'annullato'].map(k => a.stati[k]);
            nuovoGrafico(w, canvasWidget(corpo), {
                type: 'bar',
                data: {
                    labels: ['Prenotati', 'In prep.', 'Da conseg.', 'Consegnati', 'Annullati'],
                    datasets: [{ data: valori, backgroundColor: ['#2b6cb0', '#b7791f', '#6b46c1', '#2e7d32', '#a0aec0'], borderRadius: 8 }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
            break;
        }

        case 'barProdotti': {
            intestazione(corpo, 'Pezzi per prodotto');
            const et = [], vl = [], col = [];
            if (filtriDashboard.prodotto !== 'PANDORI') { et.push('Panettoni'); vl.push(a.panettoni); col.push('#5b8e72'); }
            if (filtriDashboard.prodotto !== 'PANETTONI') { et.push('Pandori'); vl.push(a.pandori); col.push('#94bdad'); }
            nuovoGrafico(w, canvasWidget(corpo), {
                type: 'bar',
                data: { labels: et, datasets: [{ data: vl, backgroundColor: col, borderRadius: 10 }] },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
            break;
        }

        case 'tortaPagamenti': {
            intestazione(corpo, 'Incassi per metodo');
            const et = Object.keys(a.metodi);
            if (!et.length) { messaggioVuoto(corpo, 'Nessun incasso registrato nel periodo.'); break; }
            nuovoGrafico(w, canvasWidget(corpo), {
                type: 'doughnut',
                data: { labels: et, datasets: [{ data: et.map(k => Math.round(a.metodi[k])), backgroundColor: ['#5b8e72', '#94bdad', '#b7791f', '#cbd5e0'] }] },
                options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
            });
            break;
        }

        case 'andamento': {
            const nomeSerie = { ordini: 'Ordini al giorno', pezzi: 'Pezzi al giorno', incasso: 'Incasso al giorno' }[w.serie];
            intestazione(corpo, nomeSerie);
            const giorni = Object.keys(a.perGiorno).sort();
            if (!giorni.length) { messaggioVuoto(corpo, 'Nessun dato nel periodo selezionato.'); break; }
            nuovoGrafico(w, canvasWidget(corpo, 220), {
                type: 'line',
                data: {
                    labels: giorni.map(g => g.slice(8, 10) + '/' + g.slice(5, 7)),
                    datasets: [{
                        data: giorni.map(g => Math.round(a.perGiorno[g][w.serie])),
                        borderColor: '#5b8e72',
                        backgroundColor: 'rgba(91,142,114,0.12)',
                        fill: true, tension: 0.3,
                        pointRadius: giorni.length > 30 ? 0 : 3
                    }]
                },
                options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
            });
            break;
        }

        case 'classifica': {
            intestazione(corpo, 'Migliori clienti', 'per pezzi prenotati');
            const top = Object.entries(a.classifica).sort((x, y) => y[1].pezzi - x[1].pezzi).slice(0, 8);
            if (!top.length) { messaggioVuoto(corpo, 'Nessun ordine nel periodo.'); break; }
            const ul = document.createElement('ul');
            ul.className = 'lista-widget';
            top.forEach(([nome, v]) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${esc(nome)}</span><strong>${v.pezzi} pz · ${esc(fmtEuro(v.importo))}</strong>`;
                ul.appendChild(li);
            });
            corpo.appendChild(ul);
            break;
        }

        case 'ultimiOrdini': {
            intestazione(corpo, 'Ultimi ordini');
            const recenti = a.ultimi.slice(0, 8);
            if (!recenti.length) { messaggioVuoto(corpo, 'Nessun ordine nel periodo.'); break; }
            const ul = document.createElement('ul');
            ul.className = 'lista-widget';
            recenti.forEach(o => {
                const d = dataOrdine(o);
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${esc(((o.nome || '') + ' ' + (o.cognome || '')).trim())}
                        <em>${d ? esc(d.toLocaleDateString('it-IT')) : ''}</em></span>
                    <strong>${(parseInt(o.panettoni) || 0) + (parseInt(o.pandori) || 0)} pz</strong>`;
                ul.appendChild(li);
            });
            corpo.appendChild(ul);
            break;
        }
    }
}

function etichettaFiltri() {
    const p = { tutto: 'tutti i periodi', '7': 'ultimi 7 giorni', '30': 'ultimi 30 giorni', mese: 'mese corrente' }[filtriDashboard.periodo];
    const pr = { TUTTI: 'tutti i prodotti', PANETTONI: 'solo panettoni', PANDORI: 'solo pandori' }[filtriDashboard.prodotto];
    return `${p} · ${pr}`;
}

function aggiornaAvvisoScorte(a) {
    const box = document.getElementById('alertScorte');
    if (!box) return;

    const mancanti = [];
    if (a.config.totalePanettoni - a.panettoni <= 0) mancanti.push('panettoni');
    if (a.config.totalePandori - a.pandori <= 0) mancanti.push('pandori');

    if (mancanti.length && filtriDashboard.periodo === 'tutto') {
        box.textContent = `⚠️ Scorte esaurite: ${mancanti.join(' e ')}. Chiudi le prenotazioni o aumenta lo stock.`;
        box.style.display = 'flex';
    } else {
        box.style.display = 'none';
    }
}

/* ==========================================================
   BARRA STRUMENTI
   ========================================================== */

function impostaFiltroProdotto(valore, btn) {
    filtriDashboard.prodotto = valore;
    document.querySelectorAll('#dashFiltroProdotto .dash-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderDashboard();
}

function impostaFiltroPeriodo(valore) {
    filtriDashboard.periodo = valore;
    renderDashboard();
}

function toggleModificaLayout() {
    modificaLayout = !modificaLayout;
    document.getElementById('btnPersonalizza').textContent = modificaLayout ? '✓ Fine' : '⚙️ Personalizza';
    document.getElementById('barraAggiunta').style.display = modificaLayout ? 'flex' : 'none';
    renderDashboard();
}

function apriCatalogoWidget() {
    const lista = document.getElementById('catalogoLista');
    lista.innerHTML = '';

    Object.entries(CATALOGO).forEach(([tipo, def]) => {
        const riga = document.createElement('button');
        riga.className = 'catalogo-item';
        riga.innerHTML = `<strong>${esc(def.nome)}</strong><span>${esc(def.descrizione)}</span>`;
        riga.addEventListener('click', () => {
            if (tipo === 'kpi') return mostraSceltaMetrica();
            if (tipo === 'andamento') return mostraSceltaSerie();
            aggiungiWidget({ tipo: tipo, size: def.sizeDefault });
        });
        lista.appendChild(riga);
    });

    document.getElementById('catalogoScelta').style.display = 'none';
    document.getElementById('widget-modal').style.display = 'flex';
}

function mostraSceltaMetrica() {
    const box = document.getElementById('catalogoScelta');
    box.innerHTML = '<p class="catalogo-titolo">Quale indicatore?</p>';
    const chips = document.createElement('div');
    chips.className = 'filter-chips';
    Object.entries(METRICHE).forEach(([chiave, m]) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = m.titolo;
        b.addEventListener('click', () => aggiungiWidget({ tipo: 'kpi', metrica: chiave, size: 's' }));
        chips.appendChild(b);
    });
    box.appendChild(chips);
    box.style.display = 'block';
}

function mostraSceltaSerie() {
    const box = document.getElementById('catalogoScelta');
    box.innerHTML = '<p class="catalogo-titolo">Cosa vuoi vedere nel tempo?</p>';
    const chips = document.createElement('div');
    chips.className = 'filter-chips';
    [['ordini', 'Ordini'], ['pezzi', 'Pezzi'], ['incasso', 'Incasso']].forEach(([chiave, etichetta]) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = etichetta;
        b.addEventListener('click', () => aggiungiWidget({ tipo: 'andamento', serie: chiave, size: 'l' }));
        chips.appendChild(b);
    });
    box.appendChild(chips);
    box.style.display = 'block';
}

function aggiungiWidget(def) {
    layoutDashboard.push(normalizzaLayout([def])[0]);
    salvaLayout();
    chiudiModale('widget-modal');
    renderDashboard();
}

function ripristinaLayout() {
    if (!confirm("Ripristinare la dashboard predefinita?")) return;
    layoutDashboard = normalizzaLayout(LAYOUT_PREDEFINITO);
    salvaLayout();
    renderDashboard();
}

/* ==========================================================
   EXPORT PDF
   ========================================================== */

function esportaPDF() {
    const vista = document.getElementById('view-dashboard');
    if (!vista || typeof html2pdf === 'undefined') return alert("Export PDF non disponibile.");
    if (modificaLayout) toggleModificaLayout();

    html2pdf().set({
        margin: 10,
        filename: `Dashboard_WonderLAD_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(vista).save().then(() => {
        if (typeof scriviLog === 'function') scriviLog("EXPORT", "Dashboard esportata in PDF");
    });
}
