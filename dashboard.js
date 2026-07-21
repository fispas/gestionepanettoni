let filtroProdottoDashboard = "TUTTI"; // "TUTTI", "PANETTONI", "PANDORI"

function cambiaVistaDashboard(modo, btnElem) {
    filtroProdottoDashboard = modo;
    
    document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElem) btnElem.classList.add('active');

    calcolaStatistiche(datiGlobali, impostazioniGlobali);
}

function calcolaStatistiche(dati, impostazioni) {
    let totPanettoni = 0; 
    let totPandori = 0;
    
    let ordiniDaIncassareList = [];
    let ordiniPagatiList = [];
    let ordiniNonImpostatiIncassiList = [];

    let ordiniDaPreparareList = [];
    let ordiniProntiList = [];
    let ordiniNonImpostatiLogisticaList = [];

    let metodiPagamentoStats = {
        'Cash': { count: 0, pan: 0, pand: 0 },
        'Bonifico': { count: 0, pan: 0, pand: 0 },
        'POS': { count: 0, pan: 0, pand: 0 },
        'Altro': { count: 0, pan: 0, pand: 0 }
    };

    dati.forEach(ordine => {
        if(!ordine.Nome && !ordine.Cognome) return;
        const pan = parseInt(ordine.Panettoni) || 0;
        const pand = parseInt(ordine.Pandori) || 0;

        let corrispondeFocus = true;
        if (filtroProdottoDashboard === 'PANETTONI' && pan <= 0) corrispondeFocus = false;
        if (filtroProdottoDashboard === 'PANDORI' && pand <= 0) corrispondeFocus = false;

        if (corrispondeFocus) {
            totPanettoni += pan;
            totPandori += pand;

            const status = (ordine.Status || "").toLowerCase().trim();
            const metodo = (ordine["Metodo Pagamento"] || "-").trim();

            let chiaveMetodo = 'Altro';
            if (metodo.toLowerCase().includes('cash') || metodo.toLowerCase().includes('contanti')) chiaveMetodo = 'Cash';
            else if (metodo.toLowerCase().includes('bonifico')) chiaveMetodo = 'Bonifico';
            else if (metodo.toLowerCase().includes('pos') || metodo.toLowerCase().includes('carta')) chiaveMetodo = 'POS';

            metodiPagamentoStats[chiaveMetodo].count++;
            metodiPagamentoStats[chiaveMetodo].pan += pan;
            metodiPagamentoStats[chiaveMetodo].pand += pand;

            // Categorizzazione Incassi & Saldi
            if(status.includes('da pagare') && !status.includes('consegnato') && !status.includes('annullato')) {
                ordiniDaIncassareList.push(ordine);
            } else if(status.includes('pagato') || status.includes('consegnato')) {
                ordiniPagatiList.push(ordine);
            } else {
                ordiniNonImpostatiIncassiList.push(ordine);
            }

            // Categorizzazione Logistica & Consegne
            if(status.includes('preparazione') || status.includes('prenotato')) {
                ordiniDaPreparareList.push(ordine);
            } else if(status.includes('da consegnare') || status.includes('consegnato')) {
                ordiniProntiList.push(ordine);
            } else {
                ordiniNonImpostatiLogisticaList.push(ordine);
            }
        }
    });

    let stockInizialePanettoni = parseInt(impostazioni["Totale Panettoni"]) || 0;
    let stockInizialePandori = parseInt(impostazioni["Totale Pandori"]) || 0;

    const valPan = document.getElementById('valPanettoni');
    const lblPan = document.getElementById('lblTotPanettoni');
    const rimPan = document.getElementById('rimanenzePanettoni');
    const barPan = document.getElementById('barPanettoni');

    if(valPan) valPan.textContent = totPanettoni;
    if(lblPan) lblPan.textContent = `prenotati su ${stockInizialePanettoni}`;
    if(rimPan) rimPan.textContent = `Rimanenza: ${stockInizialePanettoni - totPanettoni} pz`;
    const percPan = stockInizialePanettoni > 0 ? Math.min(100, Math.round((totPanettoni / stockInizialePanettoni) * 100)) : 0;
    if(barPan) barPan.style.width = percPan + '%';

    const valPand = document.getElementById('valPandori');
    const lblPand = document.getElementById('lblTotPandori');
    const rimPand = document.getElementById('rimanenzePandori');
    const barPand = document.getElementById('barPandori');

    if(valPand) valPand.textContent = totPandori;
    if(lblPand) lblPand.textContent = `prenotati su ${stockInizialePandori}`;
    if(rimPand) rimPand.textContent = `Rimanenza: ${stockInizialePandori - totPandori} pz`;
    const percPand = stockInizialePandori > 0 ? Math.min(100, Math.round((totPandori / stockInizialePandori) * 100)) : 0;
    if(barPand) barPand.style.width = percPand + '%';

    // Render delle sezioni nel Command Center
    renderizzaAreaCommandCenter('areaDaIncassare', ordiniDaIncassareList, 'incasso', '🔴 Priorità Finanziaria: Da Incassare');
    renderizzaAreaCommandCenter('areaPagati', ordiniPagatiList, 'pagato', '🟢 Finanza: Pagati / Chiusi');
    renderizzaAreaCommandCenter('areaNonImpostatiIncassi', ordiniNonImpostatiIncassiList, 'altro', '⚪ Incassi: Stato Non Impostato');
    
    renderizzaBoxMetodiPagamento('areaMetodiPagamento', metodiPagamentoStats);
    
    renderizzaAreaCommandCenter('areaDaPreparare', ordiniDaPreparareList, 'preparazione', '🟡 Priorità Logistica: Da Preparare');
    renderizzaAreaCommandCenter('areaPronti', ordiniProntiList, 'consegna', '🟢 Logistica: Pronti / Consegnati');
    renderizzaAreaCommandCenter('areaNonImpostatiLogistica', ordiniNonImpostatiLogisticaList, 'altro', '⚪ Logistica: Stato Non Impostato');
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
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.8rem;">
            <div style="background: var(--card-bg); padding: 0.9rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: #2e7d32; font-family: 'Quicksand', sans-serif;">💶 CASH / CONTANTI</div>
                <div style="font-size: 1.4rem; font-weight: 800; margin: 4px 0;">${metodiStats['Cash'].count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">ordini</span></div>
                <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 4px;">🥮 ${metodiStats['Cash'].pan} | 🍞 ${metodiStats['Cash'].pand}</div>
            </div>
            <div style="background: var(--card-bg); padding: 0.9rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: #2b6cb0; font-family: 'Quicksand', sans-serif;">🏦 BONIFICO</div>
                <div style="font-size: 1.4rem; font-weight: 800; margin: 4px 0;">${metodiStats['Bonifico'].count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">ordini</span></div>
                <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 4px;">🥮 ${metodiStats['Bonifico'].pan} | 🍞 ${metodiStats['Bonifico'].pand}</div>
            </div>
            <div style="background: var(--card-bg); padding: 0.9rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: #6b46c1; font-family: 'Quicksand', sans-serif;">💳 POS / CARTA</div>
                <div style="font-size: 1.4rem; font-weight: 800; margin: 4px 0;">${metodiStats['POS'].count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">ordini</span></div>
                <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 4px;">🥮 ${metodiStats['POS'].pan} | 🍞 ${metodiStats['POS'].pand}</div>
            </div>
            <div style="background: var(--card-bg); padding: 0.9rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center;">
                <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); font-family: 'Quicksand', sans-serif;">❓ NON SPECIFICATO</div>
                <div style="font-size: 1.4rem; font-weight: 800; margin: 4px 0;">${metodiStats['Altro'].count} <span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">ordini</span></div>
                <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 4px;">🥮 ${metodiStats['Altro'].pan} | 🍞 ${metodiStats['Altro'].pand}</div>
            </div>
        </div>
    `;
}

function renderizzaAreaCommandCenter(containerId, listaOrdini, tipoArea, titoloSezione) {
    let container = document.getElementById(containerId);
    
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.marginBottom = "1.5rem";
        const dashboardView = document.getElementById('view-dashboard');
        if(dashboardView) dashboardView.appendChild(container);
    }

    if (listaOrdini.length === 0) {
        container.innerHTML = `
            <div style="font-family: 'Quicksand', sans-serif; font-size: 0.95rem; font-weight: 750; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">
                ${titoloSezione} (0)
            </div>
            <div style="background: var(--card-bg); padding: 0.8rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; color: var(--text-muted); font-size: 0.85rem;">
                ✅ Nessun elemento in questa sezione.
            </div>
        `;
        return;
    }

    let righeHTML = '';
    listaOrdini.slice(0, 5).forEach(o => {
        let azioniBtn = '';
        if (tipoArea === 'incasso') {
            azioniBtn = `<button class="btn-quick-status" onclick="apriModaleSaldoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0})">💶 Incassa Subito</button>`;
        } else if (tipoArea === 'preparazione') {
            azioniBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0}, 'Da Consegnare', '${o["Metodo Pagamento"] || "-"}')">📦 Pronto</button>`;
        } else if (tipoArea === 'consegna') {
            azioniBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0}, 'Consegnato', '${o["Metodo Pagamento"] || "-"}')">✅ Consegna</button>`;
        } else {
            azioniBtn = `<button class="btn-edit" onclick="apriModaleOrdine(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0}, '${o.Status || 'Prenotato'}', '${o["Metodo Pagamento"] || "-"}')">✏️ Gestisci</button>`;
        }

        righeHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.7rem 1rem; border-radius: 12px; margin-bottom: 6px; border: 1px solid var(--border-color);">
                <div>
                    <strong>${o.Nome} ${o.Cognome}</strong> 
                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">(🥮 ${o.Panettoni || 0} | 🍞 ${o.Pandori || 0}) - <em style="color: var(--primary-dark);">${o.Status || 'Non imp.'}</em></span>
                </div>
                <div>${azioniBtn}</div>
            </div>
        `;
    });

    let coloreBordo = "var(--primary)";
    if(tipoArea === 'incasso') coloreBordo = "#c53030";
    if(tipoArea === 'preparazione') coloreBordo = "#b7791f";
    if(tipoArea === 'consegna' || tipoArea === 'pagato') coloreBordo = "#2e7d32";
    if(tipoArea === 'altro') coloreBordo = "#718096";

    container.innerHTML = `
        <div style="font-family: 'Quicksand', sans-serif; font-size: 0.95rem; font-weight: 750; color: ${coloreBordo}; margin-bottom: 0.5rem; text-transform: uppercase;">
            ${titoloSezione} (${listaOrdini.length})
        </div>
        <div style="background: var(--card-bg); padding: 0.8rem; border-radius: 16px; border: 2px solid var(--border-color);">
            ${righeHTML}
            ${listaOrdini.length > 5 ? `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;">E altri ${listaOrdini.length - 5} ordini in questa categoria...</div>` : ''}
        </div>
    `;
}

function esportaPDF() {
    if (!datiGlobali || datiGlobali.length === 0) return alert("Nessun dato da esportare!");

    const containerPDF = document.createElement('div');
    containerPDF.style.padding = '15px';
    containerPDF.style.fontFamily = 'Nunito, sans-serif';
    containerPDF.style.backgroundColor = '#ffffff';
    containerPDF.style.color = '#24352c';

    containerPDF.innerHTML = `
        <div style="text-align: center; border-bottom: 2px solid #5b8e72; padding-bottom: 12px; margin-bottom: 20px;">
            <h2 style="color: #5b8e72; margin: 0; font-family: Quicksand, sans-serif; font-size: 22px;">WonderLAD Onlus</h2>
            <p style="font-size: 13px; color: #62756d; margin: 4px 0 0 0;">Report Operativo Command Center - ${new Date().toLocaleDateString('it-IT')}</p>
        </div>
    `;

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

function eseguiTestLettura() { caricaDati(); }
