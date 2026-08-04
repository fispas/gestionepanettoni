let filtroProdottoDashboard = "TUTTI";
let chartInstance = null;

function cambiaVistaDashboard(modo, btnElem) {
    filtroProdottoDashboard = modo;
    document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElem) btnElem.classList.add('active');
    
    const headerLbl = document.getElementById('dashMainHeaderTitle');
    if(modo === 'PANETTONI') headerLbl.textContent = 'Focus Panettoni';
    else if(modo === 'PANDORI') headerLbl.textContent = 'Focus Pandori';
    else headerLbl.textContent = 'Panoramica Generale';

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
        'Cash': { count: 0, pan: 0, pand: 0 },
        'Bonifico': { count: 0, pan: 0, pand: 0 },
        'POS': { count: 0, pan: 0, pand: 0 },
        'Altro': { count: 0, pan: 0, pand: 0 }
    };

    dati.forEach(ordine => {
        if(!ordine.nome && !ordine.cognome) return;
        const pan = parseInt(ordine.panettoni) || 0;
        const pand = parseInt(ordine.pandori) || 0;

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

            metodiPagamentoStats[chiaveMetodo].count++;
            metodiPagamentoStats[chiaveMetodo].pan += pan;
            metodiPagamentoStats[chiaveMetodo].pand += pand;

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
            if(status.includes('preparazione') || status.includes('prenotato') || status.includes('da pagare')) {
                ordiniDaPreparareList.push(ordine);
            }
        }
    });

    const impostaBoxFlow = (idCount, idSub, key) => {
        document.getElementById(idCount).textContent = stats[key].count;
        document.getElementById(idSub).textContent = `🥮 ${stats[key].pan} | 🍞 ${stats[key].pand}`;
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

    renderizzaAreaCommandCenter('areaDaIncassare', ordiniDaIncassareList, 'incasso', '🔴 Priorità Finanziaria: Da Incassare', 'Prenotato - Da Pagare');
    renderizzaBoxMetodiPagamento('areaMetodiPagamento', metodiPagamentoStats);
    renderizzaAreaCommandCenter('areaDaPreparare', ordiniDaPreparareList, 'preparazione', '🟡 Priorità Logistica: Da Preparare', 'In Preparazione');
    aggiornaGrafico(totPanettoni, totPandori);
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
        <div style="font-family: 'Quicksand', sans-serif; font-size: 0.95rem; font-weight: 750; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">
            💳 Dettaglio Metodi di Pagamento Impostati
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.8rem;">
            ${['Cash', 'Bonifico', 'POS', 'Altro'].map(m => `
                <div onclick="navigaVersoFiltro('Tutti')" style="background: var(--card-bg); padding: 0.9rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; cursor: pointer; transition: transform 0.15s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    <div style="font-size: 0.75rem; font-weight: 800; color: ${m==='Cash'?'#2e7d32':m==='Bonifico'?'#2b6cb0':m==='POS'?'#6b46c1':'var(--text-muted)'}; font-family: 'Quicksand', sans-serif;">
                        ${m==='Cash'?'💶 CASH':m==='Bonifico'?'🏦 BONIFICO':m==='POS'?'💳 POS':'❓ NON SPEC.'}
                    </div>
                    <div style="font-size: 1.4rem; font-weight: 800; margin: 4px 0;">${metodiStats[m].count}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 4px;">🥮 ${metodiStats[m].pan} | 🍞 ${metodiStats[m].pand}</div>
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
            <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="font-family: 'Quicksand', sans-serif; font-size: 0.95rem; font-weight: 750; color: ${coloreBordo}; margin-bottom: 0.5rem; text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <span>${titoloSezione} (0)</span>
                <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">🔍 Filtra</span>
            </div>
            <div style="background: var(--card-bg); padding: 0.8rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                ✅ Nessun elemento critico.
            </div>
        `;
        return;
    }

    let righeHTML = '';
    listaOrdini.slice(0, 4).forEach(o => {
        let azioneRapida = tipoArea === 'incasso' 
            ? `<button class="btn-quick-status" onclick="event.stopPropagation(); apriModaleSaldoRapido('${o.id}')">💶 Incassa</button>`
            : `<button class="btn-quick-status" onclick="event.stopPropagation(); cambiaStatoRapido('${o.id}', 'Da Consegnare', '${o.metodoPagamento || "-"}')">📦 Pronto</button>`;

        righeHTML += `
            <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.6rem 0.9rem; border-radius: 12px; margin-bottom: 6px; border: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#f0f4f1'" onmouseout="this.style.background='#fff'">
                <div>
                    <strong>${o.nome} ${o.cognome}</strong> 
                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 6px;">(🥮 ${o.panettoni || 0} | 🍞 ${o.pandori || 0})</span>
                </div>
                <div>${azioneRapida}</div>
            </div>
        `;
    });

    container.innerHTML = `
        <div onclick="navigaVersoFiltro('${statoFiltroTarget}')" style="font-family: 'Quicksand', sans-serif; font-size: 0.95rem; font-weight: 750; color: ${coloreBordo}; margin-bottom: 0.5rem; text-transform: uppercase; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
            <span>${titoloSezione} (${listaOrdini.length})</span>
            <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">🔍 Vedi tutti nel filtro ➡️</span>
        </div>
        <div style="background: var(--card-bg); padding: 0.8rem; border-radius: 16px; border: 2px solid var(--border-color);">
            ${righeHTML}
            ${listaOrdini.length > 4 ? `<div onclick="event.stopPropagation(); navigaVersoFiltro('${statoFiltroTarget}')" style="text-align: center; font-size: 0.8rem; color: var(--primary); font-weight: bold; margin-top: 6px; cursor: pointer;">Visualizza tutti gli altri ${listaOrdini.length - 4} ordini ➡️</div>` : ''}
        </div>
    `;
}

function aggiornaGrafico(panettoni, pandori) {
    const ctx = document.getElementById('graficoVendite').getContext('2d');
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Panettoni', 'Pandori'], datasets: [{ label: 'Prenotazioni Totali', data: [panettoni, pandori], backgroundColor: ['#5b8e72', '#94bdad'], borderRadius: 10 }] },
        options: { responsive: true, plugins: { legend: { display: false }, title: { display: true, text: 'Confronto Prenotazioni Dolci', font: { family: 'Quicksand', size: 15 } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function esportaPDF() {
    if (!datiGlobali || datiGlobali.length === 0) return alert("Nessun dato da esportare!");

    const containerPDF = document.createElement('div');
    containerPDF.style.padding = '15px';
    containerPDF.style.fontFamily = 'Nunito, sans-serif';
    containerPDF.style.backgroundColor = '#ffffff';
    containerPDF.style.color = '#24352c';

    const chartCanvas = document.getElementById('graficoVendite');
    const chartImageSrc = chartCanvas ? chartCanvas.toDataURL('image/png') : '';

    let page1 = `
        <div style="page-break-after: always; break-after: page;">
            <div style="text-align: center; border-bottom: 2px solid #5b8e72; padding-bottom: 12px; margin-bottom: 20px;">
                <h2 style="color: #5b8e72; margin: 0; font-family: Quicksand, sans-serif; font-size: 22px;">WonderLAD Onlus</h2>
                <p style="font-size: 13px; color: #62756d; margin: 4px 0 0 0;">Report Generale e Statistiche - ${new Date().toLocaleDateString('it-IT')}</p>
            </div>
            <h3 style="color: #5b8e72; font-family: Quicksand, sans-serif; margin-bottom: 10px; font-size: 16px;">Andamento Grafico</h3>
            <div style="text-align: center;">
                ${chartImageSrc ? `<img src="${chartImageSrc}" style="max-width: 100%; height: auto; max-height: 220px;" />` : ''}
            </div>
        </div>
    `;

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

    let page2 = `
        <div>
            <div style="text-align: center; border-bottom: 2px solid #5b8e72; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="color: #5b8e72; margin: 0; font-family: Quicksand, sans-serif; font-size: 18px;">Elenco Completo Ordini Registrati</h3>
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
        </div>
    `;

    containerPDF.innerHTML = page1 + page2;
    const opt = {
        margin:       10,
        filename:     `Report_WonderLAD_${new Date().toISOString().slice(0,10)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
    };
    html2pdf().from(containerPDF).set(opt).save();
}
