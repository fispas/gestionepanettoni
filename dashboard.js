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

    let stockInizialePanettoni = parseInt(impostazioni["Totale Panettoni"]) || 0;
    let stockInizialePandori = parseInt(impostazioni["Totale Pandori"]) || 0;

    document.getElementById('valPanettoni').textContent = totPanettoni;
    document.getElementById('lblTotPanettoni').textContent = `prenotati su ${stockInizialePanettoni}`;
    document.getElementById('rimanenzePanettoni').textContent = `Rimanenza: ${stockInizialePanettoni - totPanettoni} pz`;
    const percPan = stockInizialePanettoni > 0 ? Math.min(100, Math.round((totPanettoni / stockInizialePanettoni) * 100)) : 0;
    document.getElementById('barPanettoni').style.width = percPan + '%';

    document.getElementById('valPandori').textContent = totPandori;
    document.getElementById('lblTotPandori').textContent = `prenotati su ${stockInizialePandori}`;
    document.getElementById('rimanenzePandori').textContent = `Rimanenza: ${stockInizialePandori - totPandori} pz`;
    const percPand = stockInizialePandori > 0 ? Math.min(100, Math.round((totPandori / stockInizialePandori) * 100)) : 0;
    document.getElementById('barPandori').style.width = percPand + '%';

    const alertContainer = document.getElementById('alertContainer');
    if(ordiniDaPagareNonConsegnati > 0) {
        alertContainer.innerHTML = `
            <div class="alert-box">
                <span>⚠️</span>
                <span>Attenzione: ci sono <strong>${ordiniDaPagareNonConsegnati} ordini</strong> con stato "Da Pagare" da saldare!</span>
            </div>
        `;
    } else {
        alertContainer.innerHTML = '';
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
                    <p style="font-size: 13px; color: #62756d; margin: 4px 0 0 0;">Report Generale e Statistiche - ${new Date().toLocaleDateString('it-IT')}</p>
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

            <h3 style="color: #5b8e72; font-family: Quicksand, sans-serif; margin-bottom: 10px; font-size: 16px;">Conteggio Ordini per Stato</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px;">
                <thead>
                    <tr style="background: #f0f4f1;">
                        <th style="padding: 8px; border: 1px solid #e1eae5; text-align: left;">Stato Ordine</th>
                        <th style="padding: 8px; border: 1px solid #e1eae5; text-align: center;">N° Ordini</th>
                        <th style="padding: 8px; border: 1px solid #e1eae5; text-align: center;">Dettaglio (Pan / Pand)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Prenotati Generici</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold;">${document.getElementById('countPrenotato').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subPrenotato').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Da Pagare</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #c53030;">${document.getElementById('countDaPagare').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subDaPagare').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Pagati</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #276749;">${document.getElementById('countPagati').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subPagati').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">In Preparazione</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #b7791f;">${document.getElementById('countInPreparazione').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subInPrep').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Da Consegnare</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #6b46c1;">${document.getElementById('countDaConsegnare').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subDaConseg').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Consegnati</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #2e7d32;">${document.getElementById('countConsegnati').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subConsegnati').textContent}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e1eae5;">Annullati</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center; font-weight: bold; color: #718096;">${document.getElementById('countAnnullati').textContent}</td>
                        <td style="padding: 6px; border: 1px solid #e1eae5; text-align: center;">${document.getElementById('subAnnullati').textContent}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;

    let rowsTableHTML = '';
    datiGlobali.forEach((o, i) => {
        if (!o.Nome && !o.Cognome) return;
        let dStr = o.Data || '-';
        if (dStr !== '-' && !isNaN(new Date(dStr))) {
            const d = new Date(dStr);
            dStr = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
        }
        rowsTableHTML += `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f6fff8'};">
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${dStr}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; font-weight: bold;">${o.Nome || ''} ${o.Cognome || ''}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${o.Telefono || '-'}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; text-align: center;">${o.Panettoni || 0}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 11px; text-align: center;">${o.Pandori || 0}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px; font-weight: bold;">${o.Status || 'Prenotato'}</td>
                <td style="padding: 6px; border: 1px solid #e1eae5; font-size: 10px;">${o["Metodo Pagamento"] || '-'}</td>
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
                        <th style="padding: 7px; border: 1px solid #3a6250; text-align: center;">Panettoni</th>
                        <th style="padding: 7px; border: 1px solid #3a6250; text-align: center;">Pandori</th>
                        <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Stato</th>
                        <th style="padding: 7px; border: 1px solid #3a6250; text-align: left;">Pagamento</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsTableHTML}
                </tbody>
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

function eseguiTestLettura() { caricaDati(); }
