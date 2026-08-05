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
    
    let ordiniDaIncassareList = [];
    let ordiniDaPreparareList = [];

    let stats = {
        'prenotato': { count: 0, pan: 0, pand: 0 },
        'da_pagare': { count: 0, pan: 0, pand: 0 },
        'pagato': { count: 0, pan: 0, pand: 0 },
        'preparazione': { count: 0, pan: 0, pand: 0 },
        'da_consegnare': { count: 0, pan: 0, pand: 0 },
        'consegnato': { count: 0, pan: 0, pand: 0 },
        'annullato': { count: 0, pan: 0, pand: 0 }
    };

    let metodiPagamentoStats = {
        'Cash': { count: 0, pan: 0, pand: 0, euro: 0 },
        'Bonifico': { count: 0, pan: 0, pand: 0, euro: 0 },
        'POS': { count: 0, pan: 0, pand: 0, euro: 0 },
        'Altro': { count: 0, pan: 0, pand: 0, euro: 0 }
    };

    dati.forEach(ordine => {
        if(!ordine.nome && !ordine.cognome) return;
        const pan = parseInt(ordine.panettoni) || 0;
        const pand = parseInt(ordine.pandori) || 0;
        const importoOrdine = (pan + pand) * PREZZO_UNITA;

        let corrispondeFocus = true;
        if (filtroProdottoDashboard === 'PANETTONI' && pan <= 0) corrispondeFocus = false;
        if (filtroProdottoDashboard === 'PANDORI' && pand <= 0) corrispondeFocus = false;

        if (corrispondeFocus) {
            totPanettoni += pan;
            totPandori += pand;

            const status = (ordine.status || "").toLowerCase().trim();
            const metodo = (ordine.metodoPagamento || "-").trim();

            let chiaveMetodo = 'Altro';
            if (metodo.toLowerCase().includes('cash') || metodo.toLowerCase().includes('contanti')) chiaveMetodo = 'Cash';
            else if (metodo.toLowerCase().includes('bonifico')) chiaveMetodo = 'Bonifico';
            else if (metodo.toLowerCase().includes('pos') || metodo.toLowerCase().includes('carta')) chiaveMetodo = 'POS';

            if (status.includes('pagato') || status.includes('consegnato')) {
                incassatoTotale += importoOrdine;
                metodiPagamentoStats[chiaveMetodo].count++;
                metodiPagamentoStats[chiaveMetodo].pan += pan;
                metodiPagamentoStats[chiaveMetodo].pand += pand;
                metodiPagamentoStats[chiaveMetodo].euro += importoOrdine;
            } else if (!status.includes('annullato')) {
                daIncassareTotale += importoOrdine;
            }

            const sommaStato = (key) => {
                stats[key].count++;
                stats[key].pan += pan;
                stats[key].pand += pand;
            };

            if(status === 'prenotato') sommaStato('prenotato');
            if(status.includes('da pagare')) sommaStato('da_pagare');
            if(status.includes('pagato')) sommaStato('pagato');
            if(status.includes('preparazione')) sommaStato('preparazione');
            if(status.includes('da consegnare')) sommaStato('da_consegnare');
            if(status.includes('consegnato')) sommaStato('consegnato');
            if(status.includes('annullato')) sommaStato('annullato');

            if(status.includes('da pagare') && !status.includes('consegnato') && !status.includes('annullato')) {
                ordiniDaIncassareList.push(ordine);
            } 
            if(status.includes('preparazione') || status.includes('prenotato')) {
                ordiniDaPreparareList.push(ordine);
            }
        }
    });

    const impostaBoxFlow = (idCount, idSub, key) => {
        if(document.getElementById(idCount)) document.getElementById(idCount).textContent = stats[key].count;
        if(document.getElementById(idSub)) document.getElementById(idSub).textContent = `🥮 ${stats[key].pan} | 🍞 ${stats[key].pand}`;
    };

    impostaBoxFlow('countPrenotato', 'subPrenotato', 'prenotato');
    impostaBoxFlow('countDaPagare', 'subDaPagare', 'da_pagare');
    impostaBoxFlow('countPagati', 'subPagati', 'pagato');
    impostaBoxFlow('countInPreparazione', 'subInPrep', 'preparazione');
    impostaBoxFlow('countDaConsegnare', 'subDaConseg', 'da_consegnare');
    impostaBoxFlow('countConsegnati', 'subConsegnati', 'consegnato');
    impostaBoxFlow('countAnnullati', 'subAnnullati', 'annullato');

    let stockInizialePanettoni = parseInt(impostazioni["Totale Panettoni"]) || 500;
    let stockInizialePandori = parseInt(impostazioni["Totale Pandori"]) || 500;

    const updateStockUI = (valId, lblId, rimId, barId, totVal, stockInit) => {
        if(document.getElementById(valId)) document.getElementById(valId).textContent = totVal;
        if(document.getElementById(lblId)) document.getElementById(lblId).textContent = `prenotati su ${stockInit}`;
        if(document.getElementById(rimId)) document.getElementById(rimId).textContent = `Rimanenza: ${stockInit - totVal} pz`;
        const perc = stockInit > 0 ? Math.min(100, Math.round((totVal / stockInit) * 100)) : 0;
        if(document.getElementById(barId)) document.getElementById(barId).style.width = perc + '%';
    };

    updateStockUI('valPanettoni', 'lblTotPanettoni', 'rimanenzePanettoni', 'barPanettoni', totPanettoni, stockInizialePanettoni);
    updateStockUI('valPandori', 'lblTotPandori', 'rimanenzePandori', 'barPandori', totPandori, stockInizialePandori);

    renderizzaKpiFinanziari('areaKpiFinanziari', incassatoTotale, daIncassareTotale);
    renderizzaAreaCommandCenter('areaDaIncassare', ordiniDaIncassareList, 'incasso', '🔴 Priorità Finanziaria: Da Incassare', 'Prenotato - Da Pagare');
    renderizzaBoxMetodiPagamento('areaMetodiPagamento', metodiPagamentoStats);
    renderizzaAreaCommandCenter('areaDaPreparare', ordiniDaPreparareList, 'preparazione', '🟡 Priorità Logistica: Da Preparare', 'In Preparazione');
    
    if(document.getElementById('graficoVendite')) {
        aggiornaGrafico(totPanettoni, totPandori);
    }
}

function renderizzaKpiFinanziari(containerId, incassato, daIncassare) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.marginBottom = "1.2rem";
        const dashboardView = document.getElementById('view-dashboard');
        if(dashboardView) {
            const selectorBar = dashboardView.querySelector('.dash-selector-bar');
            if(selectorBar) selectorBar.after(container);
            else dashboardView.prepend(container);
        }
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div style="background: var(--card-bg); padding: 1rem; border-radius: 16px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: #2e7d32; font-family: 'Quicksand', sans-serif;">💶 INCASSATO TOTALE</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #2e7d32; margin-top: 2px;">€ ${incassato.toLocaleString('it-IT')}</div>
            </div>
            <div style="background: var(--card-bg); padding: 1rem; border-radius: 16px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: #c53030; font-family: 'Quicksand', sans-serif;">⏳ DA INCASSARE</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #c53030; margin-top: 2px;">€ ${daIncassare.toLocaleString('it-IT')}</div>
            </div>
        </div>
    `;
}

function renderizzaBoxMetodiPagamento(containerId, metodiStats) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.marginBottom = "1.5rem";
        const dashboardView = document.getElementById('view-dashboard');
        if(dashboardView) {
            const areaIncasso = document.getElementById('areaDaIncassare');
            if (areaIncasso) areaIncasso.after(container);
            else dashboardView.appendChild(container);
        }
    }

    container.innerHTML = `
        <div style="font-family: 'Quicksand', sans-serif; font-size: 0.85rem; font-weight: 750; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">
            💳 Metodi Incasso Registrati
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem;">
            ${['Cash', 'Bonifico', 'POS'].map(m => `
                <div onclick="navigaVersoFiltro('Tutti')" style="background: var(--card-bg); padding: 0.7rem 0.4rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; cursor: pointer;">
                    <div style="font-size: 0.7rem; font-weight: 800; color: ${m==='Cash'?'#2e7d32':m==='Bonifico'?'#2b6cb0':'#6b46c1'}; font-family: 'Quicksand', sans-serif;">
                        ${m==='Cash'?'💶 CASH':m==='Bonifico'?'🏦 BONIFICO':'💳 POS'}
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 800; margin: 2px 0;">€${metodiStats[m].euro}</div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 3px;">${metodiStats[m].count} ordini</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderizzaAreaCommandCenter(containerId, listaOrdini, tipoArea, titoloSezione, statoFiltroTarget) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.marginBottom = "1.5rem";
        const dashboardView = document.getElementById('view-dashboard');
        if(dashboardView) dashboardView.appendChild(container);
    }

    let coloreBordo = tipoArea === 'incasso' ? "#c53030" : "#b7791f";

    if (listaOrdini.length === 0) {
        container.innerHTML = `
            <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="font-family: 'Quicksand', sans-serif; font-size: 0.85rem; font-weight: 750; color: ${coloreBordo}; margin-bottom: 0.4rem; text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between;">
                <span>${titoloSezione} (0)</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">🔍 Vedi</span>
            </div>
            <div style="background: var(--card-bg); padding: 0.8rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                ✅ Nessun ordine in attesa.
            </div>
        `;
        return;
    }

    let righeHTML = '';
    listaOrdini.slice(0, 3).forEach(o => {
        let azioneRapida = tipoArea === 'incasso' 
            ? `<button class="btn-quick-status" onclick="event.stopPropagation(); apriModaleSaldoRapido('${o.id}')">💶 Incassa</button>`
            : `<button class="btn-quick-status" onclick="event.stopPropagation(); cambiaStatoRapido('${o.id}', 'Da Consegnare', '${o.metodoPagamento || "-"}')">📦 Pronto</button>`;

        righeHTML += `
            <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.6rem 0.8rem; border-radius: 12px; margin-bottom: 6px; border: 1px solid var(--border-color); cursor: pointer;">
                <div>
                    <strong style="font-size:0.9rem;">${o.nome} ${o.cognome}</strong> 
                    <div style="font-size: 0.75rem; color: var(--text-muted);">🥮 ${o.panettoni || 0} | 🍞 ${o.pandori || 0}</div>
                </div>
                <div>${azioneRapida}</div>
            </div>
        `;
    });

    container.innerHTML = `
        <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="font-family: 'Quicksand', sans-serif; font-size: 0.85rem; font-weight: 750; color: ${coloreBordo}; margin-bottom: 0.4rem; text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
            <span>${titoloSezione} (${listaOrdini.length})</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Vedi tutti ➡️</span>
        </div>
        <div style="background: var(--card-bg); padding: 0.6rem; border-radius: 16px; border: 2px solid var(--border-color);">
            ${righeHTML}
        </div>
    `;
}

function aggiornaGrafico(panettoni, pandori) {
    const canvas = document.getElementById('graficoVendite');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Panettoni', 'Pandori'], datasets: [{ label: 'Prenotazioni', data: [panettoni, pandori], backgroundColor: ['#5b8e72', '#94bdad'], borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function esportaPDF() {
    if (!datiGlobali || datiGlobali.length === 0) return alert("Nessun dato da esportare!");

    const containerPDF = document.createElement('div');
    containerPDF.style.padding = '15px';
    containerPDF.style.fontFamily = 'Nunito, sans-serif';
    containerPDF.style.backgroundColor = '#ffffff';

    let rowsTableHTML = '';
    datiGlobali.forEach((o, i) => {
        let dStr = '-';
        if(o.timestamp && o.timestamp.toDate) {
            const d = o.timestamp.toDate();
            dStr = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
        }
        rowsTableHTML += `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f6fff8'};">
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${dStr}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; font-weight: bold;">${o.nome || ''} ${o.cognome || ''}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${o.telefono || '-'}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; text-align: center;">${o.panettoni || 0}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; text-align: center;">${o.pandori || 0}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px; font-weight: bold;">${o.status || 'Prenotato'}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${o.metodoPagamento || '-'}</td>
            </tr>
        `;
    });

    containerPDF.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #5b8e72; padding-bottom: 10px; margin-bottom: 15px;">
            <h3 style="color: #5b8e72; margin: 0; font-family: Quicksand, sans-serif; font-size: 18px;">Elenco Completo Ordini WonderLAD</h3>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
                <tr style="background: #5b8e72; color: white;">
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Data</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Cliente</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Telefono</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: center;">Pan</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: center;">Pand</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Stato</th>
                    <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Pagamento</th>
                </tr>
            </thead>
            <tbody>${rowsTableHTML}</tbody>
        </table>
    `;

    const opt = {
        margin: 10,
        filename: `Report_WonderLAD_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(containerPDF).set(opt).save();
}
