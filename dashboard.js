// WonderLAD - dashboard: KPI, flussi, stock e grafico.

let filtroProdottoDashboard = "TUTTI";
let chartInstance = null;

function cambiaVistaDashboard(modo, btnElem) {
    filtroProdottoDashboard = modo;
    document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
    if (btnElem) btnElem.classList.add('active');

    const titolo = document.getElementById('dashMainHeaderTitle');
    if (titolo) {
        titolo.textContent = modo === 'PANETTONI' ? 'Solo panettoni'
                           : modo === 'PANDORI' ? 'Solo pandori'
                           : 'Panoramica generale';
    }
    calcolaStatistiche(datiGlobali, configGlobale);
}

// Un ordine sta in un solo stato logistico e in un solo stato di pagamento.
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

function calcolaStatistiche(dati, config) {
    if (!config) config = CONFIG_DEFAULT;

    const vuoto = () => ({ count: 0, pan: 0, pand: 0 });
    const stats = {
        prenotato: vuoto(), preparazione: vuoto(), da_consegnare: vuoto(),
        consegnato: vuoto(), annullato: vuoto(), da_pagare: vuoto(), pagato: vuoto()
    };

    let totPanettoni = 0, totPandori = 0;   // impegnati sullo stock (annullati esclusi)
    let incassato = 0, daIncassare = 0;

    dati.forEach(o => {
        const panTot = parseInt(o.panettoni) || 0;
        const pandTot = parseInt(o.pandori) || 0;

        // Il tab attivo decide quali pezzi contare.
        const pan = (filtroProdottoDashboard === 'PANDORI') ? 0 : panTot;
        const pand = (filtroProdottoDashboard === 'PANETTONI') ? 0 : pandTot;
        if (pan + pand <= 0) return;

        const bLog = bucketLogistico(o.status);
        const bPag = bucketPagamento(o.status);

        stats[bLog].count++;
        stats[bLog].pan += pan;
        stats[bLog].pand += pand;

        if (bPag) {
            stats[bPag].count++;
            stats[bPag].pan += pan;
            stats[bPag].pand += pand;
        }

        // Gli ordini annullati non impegnano stock e non entrano negli incassi.
        if (bLog === 'annullato') return;

        totPanettoni += pan;
        totPandori += pand;

        const importo = pan * config.prezzoPanettone + pand * config.prezzoPandoro;
        if (bPag === 'pagato') incassato += importo;
        else daIncassare += importo;
    });

    const euro = (n) => '€ ' + Number(n).toLocaleString('it-IT');
    const setText = (id, testo) => { const n = document.getElementById(id); if (n) n.textContent = testo; };

    setText('lblIncassatoTotale', euro(incassato));
    setText('lblDaIncassareTotale', euro(daIncassare));

    const boxFlusso = (idCount, idSub, key) => {
        setText(idCount, stats[key].count);
        if (filtroProdottoDashboard === 'PANETTONI') setText(idSub, `🥮 ${stats[key].pan} pz`);
        else if (filtroProdottoDashboard === 'PANDORI') setText(idSub, `🍞 ${stats[key].pand} pz`);
        else setText(idSub, `🥮 ${stats[key].pan} | 🍞 ${stats[key].pand}`);
    };

    boxFlusso('countPrenotato', 'subPrenotato', 'prenotato');
    boxFlusso('countInPreparazione', 'subInPrep', 'preparazione');
    boxFlusso('countDaConsegnare', 'subDaConseg', 'da_consegnare');
    boxFlusso('countConsegnati', 'subConsegnati', 'consegnato');
    boxFlusso('countAnnullati', 'subAnnullati', 'annullato');
    boxFlusso('countDaPagare', 'subDaPagare', 'da_pagare');
    boxFlusso('countPagati', 'subPagati', 'pagato');

    const cardPan = document.getElementById('cardStockPanettoni');
    const cardPand = document.getElementById('cardStockPandori');
    if (cardPan && cardPand) {
        cardPan.style.display = (filtroProdottoDashboard === 'PANDORI') ? 'none' : '';
        cardPand.style.display = (filtroProdottoDashboard === 'PANETTONI') ? 'none' : '';
    }

    aggiornaStock('valPanettoni', 'lblTotPanettoni', 'rimanenzePanettoni', 'barPanettoni',
                  totPanettoni, config.totalePanettoni);
    aggiornaStock('valPandori', 'lblTotPandori', 'rimanenzePandori', 'barPandori',
                  totPandori, config.totalePandori);

    const alert = document.getElementById('alertScorte');
    if (alert) {
        const esauritoPan = config.totalePanettoni - totPanettoni <= 0;
        const esauritoPand = config.totalePandori - totPandori <= 0;
        if (esauritoPan || esauritoPand) {
            alert.textContent = `⚠️ Scorte esaurite: ${[esauritoPan ? 'panettoni' : null, esauritoPand ? 'pandori' : null].filter(Boolean).join(' e ')}. Chiudi le prenotazioni o aumenta lo stock.`;
            alert.style.display = 'flex';
        } else {
            alert.style.display = 'none';
        }
    }

    aggiornaGrafico(totPanettoni, totPandori);
}

function aggiornaStock(valId, lblId, rimId, barId, impegnati, totale) {
    const setText = (id, t) => { const n = document.getElementById(id); if (n) n.textContent = t; };
    setText(valId, impegnati);
    setText(lblId, `prenotati su ${totale}`);

    const rimanenza = totale - impegnati;
    setText(rimId, rimanenza >= 0 ? `Rimanenza: ${rimanenza} pz` : `Sovrapprenotato di ${Math.abs(rimanenza)} pz`);

    const bar = document.getElementById(barId);
    if (bar) {
        const perc = totale > 0 ? Math.min(100, Math.round((impegnati / totale) * 100)) : 0;
        bar.style.width = perc + '%';
    }
}

function aggiornaGrafico(panettoni, pandori) {
    const canvas = document.getElementById('graficoVendite');
    if (!canvas || typeof Chart === 'undefined') return;

    let labels = ['Panettoni', 'Pandori'];
    let data = [panettoni, pandori];
    let colors = ['#5b8e72', '#94bdad'];

    if (filtroProdottoDashboard === 'PANETTONI') { labels = ['Panettoni']; data = [panettoni]; colors = ['#5b8e72']; }
    else if (filtroProdottoDashboard === 'PANDORI') { labels = ['Pandori']; data = [pandori]; colors = ['#94bdad']; }

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Pezzi prenotati', data, backgroundColor: colors, borderRadius: 10 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function esportaPDF() {
    const vista = document.getElementById('view-dashboard');
    if (!vista || typeof html2pdf === 'undefined') return alert("Export PDF non disponibile.");

    const data = new Date().toLocaleDateString('it-IT');
    html2pdf().set({
        margin: 10,
        filename: `Dashboard_WonderLAD_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(vista).save().then(() => {
        if (typeof scriviLog === 'function') scriviLog("EXPORT", `Dashboard esportata in PDF (${data})`);
    });
}
