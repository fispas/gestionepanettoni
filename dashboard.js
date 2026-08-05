let filtroProdottoDashboard = "TUTTI";
let chartInstance = null;

function cambiaVistaDashboard(modo, btnElem) {
    filtroProdottoDashboard = modo;
    document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElem) btnElem.classList.add('active');
    
    const headerLbl = document.getElementById('dashMainHeaderTitle');
    if(headerLbl) {
        if(modo === 'PANETTONI') headerLbl.textContent = 'Focus Panettoni';
        else if(modo === 'PANDORI') headerLbl.textContent = 'Focus Pandori';
        else headerLbl.textContent = 'Panoramica Generale';
    }

    calcolaStatistiche(datiGlobali, impostazioniGlobali);
}

function navigaVersoFiltro(stato) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .filter-chips .chip').forEach(c => {
        if(c.textContent.toLowerCase() === stato.toLowerCase() || (stato === 'Prenotato' && c.textContent.toLowerCase() === 'prenotati')) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    filtraOrdini();
    const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
    navButtons.forEach(btn => {
        if(btn.textContent.includes('Ordini')) switchView('ordini', btn);
    });
}

function calcolaStatistiche(dati, impostazioni) {
    let totPanettoni = 0; 
    let totPandori = 0;
    const PREZZO_UNITA = 15;

    let incassatoTotale = 0;
    let daIncassareTotale = 0;

    let stats = {
        'prenotato': { count: 0, pan: 0, pand: 0 },
        'da_pagare': { count: 0, pan: 0, pand: 0 },
        'pagato': { count: 0, pan: 0, pand: 0 },
        'preparazione': { count: 0, pan: 0, pand: 0 },
        'da_consegnare': { count: 0, pan: 0, pand: 0 },
        'consegnato': { count: 0, pan: 0, pand: 0 },
        'annullato': { count: 0, pan: 0, pand: 0 }
    };

    dati.forEach(ordine => {
        if(!ordine.nome && !ordine.cognome) return;
        
        const pan = parseInt(ordine.panettoni) || 0;
        const pand = parseInt(ordine.pandori) || 0;

        // Determina quali quantitativi prendere in considerazione in base al Tab attivo
        let panConsiderati = (filtroProdottoDashboard === 'PANDORI') ? 0 : pan;
        let pandConsiderati = (filtroProdottoDashboard === 'PANETTONI') ? 0 : pand;
        
        let pezziFocusTotali = panConsiderati + pandConsiderati;

        // Se nel Tab "Panettoni" l'ordine non ha panettoni (o viceversa per Pandori), lo saltiamo
        if (pezziFocusTotali <= 0) return;

        totPanettoni += panConsiderati;
        totPandori += pandConsiderati;

        const importoOrdineFocus = pezziFocusTotali * PREZZO_UNITA;
        const status = (ordine.status || "").toLowerCase().trim();

        if (status.includes('pagato') || status.includes('consegnato')) {
            incassatoTotale += importoOrdineFocus;
        } else if (!status.includes('annullato')) {
            daIncassareTotale += importoOrdineFocus;
        }

        const sommaStato = (key) => {
            stats[key].count++;
            stats[key].pan += panConsiderati;
            stats[key].pand += pandConsiderati;
        };

        if(status === 'prenotato') sommaStato('prenotato');
        if(status.includes('da pagare')) sommaStato('da_pagare');
        if(status.includes('pagato')) sommaStato('pagato');
        if(status.includes('preparazione')) sommaStato('preparazione');
        if(status.includes('da consegnare')) sommaStato('da_consegnare');
        if(status.includes('consegnato')) sommaStato('consegnato');
        if(status.includes('annullato')) sommaStato('annullato');
    });

    // Aggiornamento Box Incassi in €
    if(document.getElementById('lblIncassatoTotale')) {
        document.getElementById('lblIncassatoTotale').textContent = `€ ${incassatoTotale.toLocaleString('it-IT')}`;
    }
    if(document.getElementById('lblDaIncassareTotale')) {
        document.getElementById('lblDaIncassareTotale').textContent = `€ ${daIncassareTotale.toLocaleString('it-IT')}`;
    }

    // Aggiornamento Conteggi Flussi Logici
    const impostaBoxFlow = (idCount, idSub, key) => {
        if(document.getElementById(idCount)) document.getElementById(idCount).textContent = stats[key].count;
        if(document.getElementById(idSub)) {
            if (filtroProdottoDashboard === 'PANETTONI') {
                document.getElementById(idSub).textContent = `🥮 ${stats[key].pan} pz`;
            } else if (filtroProdottoDashboard === 'PANDORI') {
                document.getElementById(idSub).textContent = `🍞 ${stats[key].pand} pz`;
            } else {
                document.getElementById(idSub).textContent = `🥮 ${stats[key].pan} | 🍞 ${stats[key].pand}`;
            }
        }
    };

    impostaBoxFlow('countPrenotato', 'subPrenotato', 'prenotato');
    impostaBoxFlow('countDaPagare', 'subDaPagare', 'da_pagare');
    impostaBoxFlow('countPagati', 'subPagati', 'pagato');
    impostaBoxFlow('countInPreparazione', 'subInPrep', 'preparazione');
    impostaBoxFlow('countDaConsegnare', 'subDaConseg', 'da_consegnare');
    impostaBoxFlow('countConsegnati', 'subConsegnati', 'consegnato');
    impostaBoxFlow('countAnnullati', 'subAnnullati', 'annullato');

    // Visibilità e calcolo Stock dinamico
    let stockInizialePanettoni = parseInt(impostazioni["Totale Panettoni"]) || 500;
    let stockInizialePandori = parseInt(impostazioni["Totale Pandori"]) || 500;

    const cardPanettoni = document.getElementById('cardStockPanettoni');
    const cardPandori = document.getElementById('cardStockPandori');

    if (cardPanettoni && cardPandori) {
        if (filtroProdottoDashboard === 'PANETTONI') {
            cardPanettoni.style.display = 'block';
            cardPandori.style.display = 'none';
        } else if (filtroProdottoDashboard === 'PANDORI') {
            cardPanettoni.style.display = 'none';
            cardPandori.style.display = 'block';
        } else {
            cardPanettoni.style.display = 'block';
            cardPandori.style.display = 'block';
        }
    }

    const updateStockUI = (valId, lblId, rimId, barId, totVal, stockInit) => {
        if(document.getElementById(valId)) document.getElementById(valId).textContent = totVal;
        if(document.getElementById(lblId)) document.getElementById(lblId).textContent = `prenotati su ${stockInit}`;
        if(document.getElementById(rimId)) document.getElementById(rimId).textContent = `Rimanenza: ${stockInit - totVal} pz`;
        const perc = stockInit > 0 ? Math.min(100, Math.round((totVal / stockInit) * 100)) : 0;
        if(document.getElementById(barId)) document.getElementById(barId).style.width = perc + '%';
    };

    updateStockUI('valPanettoni', 'lblTotPanettoni', 'rimanenzePanettoni', 'barPanettoni', totPanettoni, stockInizialePanettoni);
    updateStockUI('valPandori', 'lblTotPandori', 'rimanenzePandori', 'barPandori', totPandori, stockInizialePandori);

    aggiornaGrafico(totPanettoni, totPandori);
}

function aggiornaGrafico(panettoni, pandori) {
    const canvas = document.getElementById('graficoVendite');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(chartInstance) chartInstance.destroy();
    
    let labels = ['Panettoni', 'Pandori'];
    let data = [panettoni, pandori];
    let colors = ['#5b8e72', '#94bdad'];

    if (filtroProdottoDashboard === 'PANETTONI') {
        labels = ['Panettoni'];
        data = [panettoni];
        colors = ['#5b8e72'];
    } else if (filtroProdottoDashboard === 'PANDORI') {
        labels = ['Pandori'];
        data = [pandori];
        colors = ['#94bdad'];
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Prenotazioni', data: data, backgroundColor: colors, borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}
