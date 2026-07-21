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
    
    // Contenitori per le liste di azione rapida
    let ordiniDaIncassareList = [];
    let ordiniDaPreparareList = [];
    let ordiniProntiList = [];

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

            const status = (ordine.Status || "").toLowerCase();

            // Categorizzazione per il Command Center Operativo
            if(status.includes('da pagare') && !status.includes('consegnato') && !status.includes('annullato')) {
                ordiniDaIncassareList.push(ordine);
            } else if(status.includes('preparazione') || status.includes('prenotato')) {
                ordiniDaPreparareList.push(ordine);
            } else if(status.includes('da consegnare') || status.includes('consegnato')) {
                ordiniProntiList.push(ordine);
            }
        }
    });

    // 1. Aggiornamento Scorte e Rimanenze
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

    // 2. Rendering delle Aree di Azione del Command Center nella Dashboard
    renderizzaAreaCommandCenter('areaDaIncassare', ordiniDaIncassareList, 'incasso');
    renderizzaAreaCommandCenter('areaDaPreparare', ordiniDaPreparareList, 'preparazione');
    renderizzaAreaCommandCenter('areaPronti', ordiniProntiList, 'consegna');
}

function renderizzaAreaCommandCenter(containerId, listaOrdini, tipoArea) {
    let container = document.getElementById(containerId);
    
    // Se il container non esiste ancora nell'HTML, lo creiamo al volo dinamicamente
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.marginBottom = "1.5rem";
        // Lo inseriamo subito dopo la barra di selezione nella vista dashboard
        const dashboardView = document.getElementById('view-dashboard');
        if(dashboardView) dashboardView.appendChild(container);
    }

    if (listaOrdini.length === 0) {
        container.innerHTML = `
            <div style="background: var(--card-bg); padding: 1rem; border-radius: 14px; border: 2px solid var(--border-color); text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                ✅ Nessun elemento critico in questa sezione.
            </div>
        `;
        return;
    }

    let righeHTML = '';
    listaOrdini.slice(0, 5).forEach(o => { // Mostriamo i primi 5 più urgenti per mantenere la dashboard pulita
        let azioniBtn = '';
        if (tipoArea === 'incasso') {
            azioniBtn = `<button class="btn-quick-status" onclick="apriModaleSaldoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0})">💶 Incassa Subito</button>`;
        } else if (tipoArea === 'preparazione') {
            azioniBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0}, 'Da Consegnare', '${o["Metodo Pagamento"] || "-"}')">📦 Pronto</button>`;
        } else {
            azioniBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido(${o.rowNumber}, ${o.Panettoni || 0}, ${o.Pandori || 0}, 'Consegnato', '${o["Metodo Pagamento"] || "-"}')">✅ Consegna</button>`;
        }

        righeHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 0.7rem 1rem; border-radius: 12px; margin-bottom: 6px; border: 1px solid var(--border-color);">
                <div>
                    <strong>${o.Nome} ${o.Cognome}</strong> 
                    <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 8px;">(🥮 ${o.Panettoni || 0} | 🍞 ${o.Pandori || 0})</span>
                </div>
                <div>${azioniBtn}</div>
            </div>
        `;
    });

    let titoloSezione = "📌 Azioni Richieste";
    let coloreBordo = "var(--primary)";
    if(tipoArea === 'incasso') { titoloSezione = "🔴 Priorità Finanziaria: Da Incassare"; coloreBordo = "#c53030"; }
    if(tipoArea === 'preparazione') { titoloSezione = "🟡 Priorità Logistica: Da Preparare"; coloreBordo = "#b7791f"; }
    if(tipoArea === 'consegna') { titoloSezione = "🟢 Operativi: Pronti / In Consegna"; coloreBordo = "#2e7d32"; }

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
