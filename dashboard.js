let filtroProdottoDashboard = "TUTTI"; // "TUTTI", "PANETTONI", "PANDORI"

function cambiaVistaDashboard(modo, btnElem) {
    filtroProdottoDashboard = modo;
    
    document.querySelectorAll('.dash-tab-btn').forEach(b => b.classList.remove('active'));
    if(btnElem) btnElem.classList.add('active');

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
        if(btn.textContent.includes('Ordini')) {
            switchView('ordini', btn);
        }
    });
}

function calcolaStatistiche(dati, impostazioni) {
    let totPanettoni = 0; let totPandori = 0;
    let ordiniDaPagareNonConsegnati = 0;
    
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
                ordiniDaPagareNonConsegnati++;
            }
        }
    });

    const impostaBoxFlow = (idCount, idSub, key) => {
        const elCount = document.getElementById(idCount);
        const elSub = document.getElementById(idSub);
        if(elCount) elCount.textContent = stats[key].count;
        if(elSub) elSub.textContent = `🥮 ${stats[key].pan} | 🍞 ${stats[key].pand}`;
    };

    impostaBoxFlow('countPrenotato', 'subPrenotato', 'prenotato');
    impostaBoxFlow('countDaPagare', 'subDaPagare', 'da_pagare');
    impostaBoxFlow('countPagati', 'subPagati', 'pagato');
    impostaBoxFlow('countInPreparazione', 'subInPrep', 'preparazione');
    impostaBoxFlow('countDaConsegnare', 'subDaConseg', 'da_consegnare');
    impostaBoxFlow('countConsegnati', 'subConsegnati', 'consegnato');
    impostaBoxFlow('countAnnullati', 'subAnnullati', 'annullato');

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

    const alertContainer = document.getElementById('alertContainer');
    if(alertContainer) {
        if(ordiniDaPagareNonConsegnati > 0) {
            alertContainer.innerHTML = `
                <div class="alert-box">
                    <span>⚠️</span>
                    <span>Area Finanziaria: ci sono <strong>${ordiniDaPagareNonConsegnati} ordini</strong> in sospeso con stato "Da Pagare" da riscuotere.</span>
                </div>
            `;
        } else {
            alertContainer.innerHTML = '';
        }
    }
}

function esportaPDF() {
    if (!datiGlobali || datiGlobali.length === 0) return alert("Nessun dato da esportare!");

    const containerPDF = document.createElement('div');
    containerPDF.style.padding = '15px';
    containerPDF.style.fontFamily = 'Nunito, sans-serif';
    containerPDF.style.backgroundColor = '#ffffff';
    containerPDF.style.color = '#24352c';

    let page1 = `
        <div style="page-break-after: always; break-after: page;">
            <div style="text-align: center; border-bottom: 2px solid #5b8e72; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div style="text-align: left;">
                    <h2 style="color: #5b8e72; margin: 0; font-family: Quicksand, sans-serif; font-size: 22px;">WonderLAD Onlus</h2>
                    <p style="font-size: 13px; color: #62756d; margin: 4px 0 0 0;">Report Operativo - ${new Date().toLocaleDateString('it-IT')}</p>
                </div>
                <img src="https://www.wonderlad.org/wp-content/uploads/2020/05/logo-wonderlad.png" style="height: 38px;" />
            </div>

            <h3 style="color: #5b8e72; font-family: Quicksand, sans-serif; margin-bottom: 10px; font-size: 16px;">Riepilogo Scorte</h3>
            <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                <div style="flex: 1; border: 2px solid #5b8e72; padding: 12px; border-radius: 12px; text-align: center; background: #f6fff8;">
                    <div style="font-size: 11px; font-weight: bold; color: #62756d;">PANETTONI PRENOTATI</div>
                    <div style="font-size: 24px; font-weight: bold; color: #5b8e72; margin: 4px 0;">${document.getElementById('valPanettoni').textContent}</div>
                    <div style="font-size: 11px; color: #62756d;">${document.getElementById('rimanenzePanettoni').textContent}</div>
                </div>
                <div style="flex: 1; border: 2px solid #94bdad; padding: 12px; border-radius: 12px; text-align: center; background: #eaf4f0;">
                    <div style="font-size: 11px; font-weight: bold; color: #62756d;">PANDORI PRENOTATI</div>
                    <div style="font-size: 24px; font-weight: bold; color: #3a6250; margin: 4px 0;">${document.getElementById('valPandori').textContent}</div>
                    <div style="font-size: 11px; color: #62756d;">${document.getElementById('rimanenzePandori').textContent}</div>
                </div>
            </div>
        </div>
    `;

    containerPDF.innerHTML = page1;

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
