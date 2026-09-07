// WonderLAD - report PDF di riepilogo.
// Impagina un A4 verticale costruito apposta, indipendente dal layout della
// dashboard: il contenuto e' sempre lo stesso e sta sempre in una pagina sola.

(function () {
    'use strict';

    const A4 = { larghezza: 794, altezza: 1123 };   // pixel a 96 dpi

    const euro = (n) => '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT');
    const num = (n) => Number(n || 0).toLocaleString('it-IT');

    function h(t) {
        return String(t == null ? '' : t)
            .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ======================================================
       DATI
       ====================================================== */

    // Si preferisce l'aggregato della dashboard, cosi' il report rispetta i
    // filtri attivi. Se non c'e', si ricalcola dai dati grezzi senza filtri.
    function raccogliDati() {
        if (typeof window.aggregatoDashboard === 'function') {
            try { return window.aggregatoDashboard(); } catch (e) { /* si ricalcola */ }
        }

        const dati = (typeof datiGlobali !== 'undefined' && Array.isArray(datiGlobali)) ? datiGlobali : [];
        const cfg = (typeof configGlobale !== 'undefined' && configGlobale) ? configGlobale : {
            totalePanettoni: 0, totalePandori: 0, prezzoPanettone: 15, prezzoPandoro: 15
        };
        return { dati: aggregaMinimo(dati, cfg), filtri: { prodotto: 'TUTTI', periodo: 'tutto' } };
    }

    function aggregaMinimo(ordini, cfg) {
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

        ordini.forEach(o => {
            const pan = parseInt(o.panettoni) || 0;
            const pand = parseInt(o.pandori) || 0;
            if (pan + pand <= 0) return;

            const s = String(o.status || '').toLowerCase();
            const bl = s.includes('annullato') ? 'annullato'
                     : s.includes('consegnato') ? 'consegnato'
                     : s.includes('da consegnare') ? 'da_consegnare'
                     : s.includes('preparazione') ? 'preparazione' : 'prenotato';
            const pagato = !s.includes('annullato') && (s.includes('pagato') || s.includes('consegnato'));
            const importo = pan * pPan + pand * pPand;

            a.ordiniTotali++;
            a.stati[bl]++;
            a.statiPezzi[bl] += pan + pand;
            a.statiImporto[bl] += importo;
            if (bl === 'annullato') return;

            a.ordiniAttivi++;
            a.panettoni += pan;
            a.pandori += pand;
            a.pezziTotali += pan + pand;
            a.valoreTotale += importo;
            a.clienti.add(((o.nome || '') + '|' + (o.telefono || '')).toLowerCase());

            if (pagato) {
                a.pagati++;
                a.incassato += importo;
                const m = (o.metodoPagamento && o.metodoPagamento !== '-') ? o.metodoPagamento : 'Non indicato';
                a.metodi[m] = (a.metodi[m] || 0) + importo;
            } else {
                a.daIncassare += importo;
                a.daFare.push({ ordine: o, motivo: 'da incassare' });
            }
            if (bl === 'da_consegnare') a.daFare.push({ ordine: o, motivo: 'da consegnare' });

            const d = (o.timestamp && typeof o.timestamp.toDate === 'function') ? o.timestamp.toDate() : null;
            if (d) {
                const k = d.toISOString().slice(0, 10);
                if (!a.perGiorno[k]) a.perGiorno[k] = { ordini: 0, pezzi: 0, incasso: 0 };
                a.perGiorno[k].ordini++;
                a.perGiorno[k].pezzi += pan + pand;
                a.perGiorno[k].incasso += importo;
            }

            const nome = ((o.nome || '') + ' ' + (o.cognome || '')).trim() || '—';
            if (!a.classifica[nome]) a.classifica[nome] = { pezzi: 0, importo: 0 };
            a.classifica[nome].pezzi += pan + pand;
            a.classifica[nome].importo += importo;
        });

        a.clientiUnici = a.clienti.size;
        a.ticketMedio = a.ordiniAttivi ? Math.round(a.valoreTotale / a.ordiniAttivi) : 0;
        a.percPagato = a.ordiniAttivi ? Math.round(a.pagati / a.ordiniAttivi * 100) : 0;
        a.percConsegnato = a.ordiniAttivi ? Math.round(a.stati.consegnato / a.ordiniAttivi * 100) : 0;
        return a;
    }

    /* ======================================================
       PEZZI DI IMPAGINAZIONE
       ====================================================== */

    function riquadro(etichetta, valore, colore) {
        return `<div class="rp-kpi">
                    <div class="rp-kpi-lbl">${h(etichetta)}</div>
                    <div class="rp-kpi-val" style="color:${colore}">${h(valore)}</div>
                </div>`;
    }

    function barraStock(nome, impegnati, totale) {
        const perc = totale > 0 ? Math.min(100, Math.round(impegnati / totale * 100)) : 0;
        const rim = totale - impegnati;
        return `<div class="rp-stock">
                    <div class="rp-stock-top">
                        <span>${h(nome)}</span>
                        <span><b>${num(impegnati)}</b> / ${num(totale)}</span>
                    </div>
                    <div class="rp-barra"><div class="rp-barra-int" style="width:${perc}%"></div></div>
                    <div class="rp-stock-sub">${rim >= 0 ? 'restano ' + num(rim) + ' pz' : 'sovrapprenotati ' + num(Math.abs(rim)) + ' pz'} · ${perc}%</div>
                </div>`;
    }

    function tabellaStati(a) {
        const nomi = [
            ['Prenotati', 'prenotato'], ['In preparazione', 'preparazione'],
            ['Da consegnare', 'da_consegnare'], ['Consegnati', 'consegnato'],
            ['Annullati', 'annullato']
        ];
        const righe = nomi.map(n => `
            <tr>
                <td>${h(n[0])}</td>
                <td class="rp-num">${num(a.stati[n[1]])}</td>
                <td class="rp-num">${num(a.statiPezzi[n[1]])}</td>
                <td class="rp-num">${h(euro(a.statiImporto[n[1]]))}</td>
            </tr>`).join('');

        return `<table class="rp-tab">
                    <thead><tr><th>Stato</th><th class="rp-num">Ordini</th><th class="rp-num">Pezzi</th><th class="rp-num">Valore</th></tr></thead>
                    <tbody>${righe}
                        <tr class="rp-tot">
                            <td>Totale attivi</td>
                            <td class="rp-num">${num(a.ordiniAttivi)}</td>
                            <td class="rp-num">${num(a.pezziTotali)}</td>
                            <td class="rp-num">${h(euro(a.valoreTotale))}</td>
                        </tr>
                    </tbody>
                </table>`;
    }

    function tabellaMetodi(a) {
        const chiavi = Object.keys(a.metodi);
        if (!chiavi.length) return '<p class="rp-vuoto">Nessun incasso registrato.</p>';
        const righe = chiavi.sort((x, y) => a.metodi[y] - a.metodi[x]).map(k => `
            <tr><td>${h(k)}</td><td class="rp-num">${h(euro(a.metodi[k]))}</td></tr>`).join('');
        return `<table class="rp-tab"><tbody>${righe}
                    <tr class="rp-tot"><td>Totale incassato</td><td class="rp-num">${h(euro(a.incassato))}</td></tr>
                </tbody></table>`;
    }

    function classifica(a) {
        const top = Object.keys(a.classifica).map(n => [n, a.classifica[n]])
            .sort((x, y) => y[1].pezzi - x[1].pezzi).slice(0, 6);
        if (!top.length) return '<p class="rp-vuoto">Nessun ordine.</p>';
        return `<table class="rp-tab"><tbody>${top.map((t, i) => `
                    <tr><td>${i + 1}. ${h(t[0])}</td>
                        <td class="rp-num">${num(t[1].pezzi)} pz</td>
                        <td class="rp-num">${h(euro(t[1].importo))}</td></tr>`).join('')}
                </tbody></table>`;
    }

    // Istogramma in puro CSS: niente canvas, cosi' la resa in PDF e' sempre pulita.
    function andamento(a) {
        const giorni = Object.keys(a.perGiorno).sort().slice(-14);
        if (!giorni.length) return '<p class="rp-vuoto">Nessun ordine nel periodo.</p>';

        const max = Math.max.apply(null, giorni.map(g => a.perGiorno[g].pezzi)) || 1;
        const barre = giorni.map(g => {
            const v = a.perGiorno[g].pezzi;
            const alt = Math.max(3, Math.round(v / max * 78));
            return `<div class="rp-col">
                        <div class="rp-col-val">${num(v)}</div>
                        <div class="rp-col-barra" style="height:${alt}px"></div>
                        <div class="rp-col-lbl">${g.slice(8, 10)}/${g.slice(5, 7)}</div>
                    </div>`;
        }).join('');
        return `<div class="rp-istogramma">${barre}</div>`;
    }

    /* ======================================================
       COSTRUZIONE DELLA PAGINA
       ====================================================== */

    function costruisciPagina(a, filtri) {
        const ora = new Date();
        const periodo = { tutto: 'Tutto lo storico', '7': 'Ultimi 7 giorni', '30': 'Ultimi 30 giorni', mese: 'Mese corrente' }[filtri.periodo] || 'Tutto lo storico';
        const prodotto = { TUTTI: 'Panettoni e pandori', PANETTONI: 'Solo panettoni', PANDORI: 'Solo pandori' }[filtri.prodotto] || 'Panettoni e pandori';
        const chi = (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.email) ? utenteCorrente.email : '';

        const daIncassareOrd = a.daFare.filter(v => v.motivo === 'da incassare').length;
        const daConsegnareOrd = a.stati.da_consegnare + a.stati.preparazione + a.stati.prenotato;

        const pagina = document.createElement('div');
        pagina.id = 'rp-pagina';
        pagina.innerHTML = `
            <div class="rp-head">
                <div>
                    <div class="rp-titolo">Dolci Solidali WonderLAD</div>
                    <div class="rp-sottotitolo">Riepilogo prenotazioni · ${h(periodo)} · ${h(prodotto)}</div>
                </div>
                <div class="rp-head-dx">
                    <div>${h(ora.toLocaleDateString('it-IT'))} · ${h(ora.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))}</div>
                    ${chi ? `<div class="rp-mini">${h(chi)}</div>` : ''}
                </div>
            </div>

            <div class="rp-kpi-riga">
                ${riquadro('Incassato', euro(a.incassato), '#2e7d32')}
                ${riquadro('Da incassare', euro(a.daIncassare), '#c53030')}
                ${riquadro('Valore prenotato', euro(a.valoreTotale), '#3a6250')}
                ${riquadro('Ticket medio', euro(a.ticketMedio), '#6b46c1')}
            </div>
            <div class="rp-kpi-riga">
                ${riquadro('Ordini attivi', num(a.ordiniAttivi), '#2b6cb0')}
                ${riquadro('Pezzi prenotati', num(a.pezziTotali), '#3a6250')}
                ${riquadro('Clienti', num(a.clientiUnici), '#2b6cb0')}
                ${riquadro('Pagato', a.percPagato + '%', '#276749')}
            </div>

            <div class="rp-due">
                <div class="rp-box">
                    <div class="rp-box-tit">Disponibilità</div>
                    ${barraStock('🥮 Panettoni', a.panettoni, parseInt(a.cfg.totalePanettoni) || 0)}
                    ${barraStock('🍞 Pandori', a.pandori, parseInt(a.cfg.totalePandori) || 0)}
                    <div class="rp-nota">Prezzi applicati: panettone ${h(euro(a.cfg.prezzoPanettone))} · pandoro ${h(euro(a.cfg.prezzoPandoro))}</div>
                </div>
                <div class="rp-box">
                    <div class="rp-box-tit">Ordini per stato</div>
                    ${tabellaStati(a)}
                </div>
            </div>

            <div class="rp-box">
                <div class="rp-box-tit">Pezzi prenotati per giorno <span class="rp-mini">(ultimi 14 giorni con ordini)</span></div>
                ${andamento(a)}
            </div>

            <div class="rp-due">
                <div class="rp-box">
                    <div class="rp-box-tit">Incassi per metodo</div>
                    ${tabellaMetodi(a)}
                </div>
                <div class="rp-box">
                    <div class="rp-box-tit">Migliori sostenitori</div>
                    ${classifica(a)}
                </div>
            </div>

            <div class="rp-azioni">
                <div class="rp-azione">
                    <div class="rp-azione-num">${num(daIncassareOrd)}</div>
                    <div>ordini da incassare<br><b>${h(euro(a.daIncassare))}</b></div>
                </div>
                <div class="rp-azione">
                    <div class="rp-azione-num">${num(daConsegnareOrd)}</div>
                    <div>ordini da consegnare<br><b>${num(a.statiPezzi.prenotato + a.statiPezzi.preparazione + a.statiPezzi.da_consegnare)} pz</b></div>
                </div>
                <div class="rp-azione">
                    <div class="rp-azione-num">${num(a.stati.consegnato)}</div>
                    <div>ordini conclusi<br><b>${a.percConsegnato}% del totale</b></div>
                </div>
            </div>

            <div class="rp-piede">
                Documento generato automaticamente dal gestionale WonderLAD. Gli ordini annullati sono esclusi da importi e disponibilità.
            </div>`;
        return pagina;
    }

    const CSS = `
#rp-pagina { position:fixed; left:-20000px; top:0; width:${A4.larghezza}px; height:${A4.altezza}px;
    box-sizing:border-box; padding:30px 34px; background:#fff; color:#2c3e35;
    font-family:'Nunito',Arial,sans-serif; font-size:11px; overflow:hidden; }
#rp-pagina * { box-sizing:border-box; }
.rp-head { display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #6b9080; padding-bottom:9px; margin-bottom:14px; }
.rp-titolo { font-family:'Quicksand',Arial,sans-serif; font-size:21px; font-weight:800; color:#4d6a5b; }
.rp-sottotitolo { font-size:11px; color:#6b7c73; font-weight:700; margin-top:2px; }
.rp-head-dx { text-align:right; font-size:10px; color:#6b7c73; font-weight:700; }
.rp-mini { font-size:9px; color:#8a9a92; font-weight:600; }

.rp-kpi-riga { display:flex; gap:9px; margin-bottom:9px; }
.rp-kpi { flex:1; border:1.5px solid #e2ece9; border-radius:10px; padding:8px 9px; background:#fbfdfc; }
.rp-kpi-lbl { font-size:9px; font-weight:800; color:#6b7c73; text-transform:uppercase; letter-spacing:.3px; }
.rp-kpi-val { font-family:'Quicksand',Arial,sans-serif; font-size:19px; font-weight:800; line-height:1.25; }

.rp-due { display:flex; gap:11px; margin-top:5px; }
.rp-due > .rp-box { flex:1; }
.rp-box { border:1.5px solid #e2ece9; border-radius:10px; padding:10px 11px; margin-top:11px; }
.rp-box-tit { font-family:'Quicksand',Arial,sans-serif; font-size:12px; font-weight:800;
    color:#4d6a5b; margin-bottom:8px; }
.rp-vuoto { color:#8a9a92; font-size:10px; margin:6px 0; }
.rp-nota { font-size:9px; color:#8a9a92; font-weight:600; margin-top:7px; }

.rp-stock { margin-bottom:9px; }
.rp-stock-top { display:flex; justify-content:space-between; font-size:11px; font-weight:700; margin-bottom:3px; }
.rp-barra { height:9px; background:#eaf4f0; border-radius:5px; overflow:hidden; }
.rp-barra-int { height:100%; background:#6b9080; }
.rp-stock-sub { font-size:9px; color:#6b7c73; font-weight:700; margin-top:2px; }

.rp-tab { width:100%; border-collapse:collapse; font-size:10.5px; }
.rp-tab th { text-align:left; font-size:9px; text-transform:uppercase; color:#8a9a92;
    border-bottom:1.5px solid #e2ece9; padding:3px 2px; letter-spacing:.3px; }
.rp-tab td { padding:3.5px 2px; border-bottom:1px solid #f0f4f2; }
.rp-tab .rp-num { text-align:right; white-space:nowrap; }
.rp-tab .rp-tot td { font-weight:800; color:#4d6a5b; border-top:1.5px solid #e2ece9; border-bottom:none; }

.rp-istogramma { display:flex; align-items:flex-end; gap:5px; height:108px; padding-top:4px; }
.rp-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.rp-col-val { font-size:8px; color:#6b7c73; font-weight:800; margin-bottom:2px; }
.rp-col-barra { width:100%; background:#94bdad; border-radius:3px 3px 0 0; }
.rp-col-lbl { font-size:7.5px; color:#8a9a92; font-weight:700; margin-top:3px; }

.rp-azioni { display:flex; gap:11px; margin-top:11px; }
.rp-azione { flex:1; display:flex; align-items:center; gap:9px; border:1.5px solid #e2ece9;
    background:#f6fbf8; border-radius:10px; padding:9px 11px; font-size:10px; color:#4d6a5b; font-weight:700; }
.rp-azione-num { font-family:'Quicksand',Arial,sans-serif; font-size:23px; font-weight:800; color:#6b9080; line-height:1; }

.rp-piede { position:absolute; left:34px; right:34px; bottom:18px;
    border-top:1px solid #e2ece9; padding-top:6px; font-size:8.5px; color:#8a9a92; font-weight:600; }`;

    function iniettaCSS() {
        if (document.getElementById('rp-stile')) return;
        const s = document.createElement('style');
        s.id = 'rp-stile';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* ======================================================
       GENERAZIONE
       ====================================================== */

    function generaReport() {
        if (typeof html2pdf === 'undefined') {
            alert('Libreria PDF non caricata.');
            return;
        }

        const pacco = raccogliDati();
        if (!pacco || !pacco.dati) return alert('Dati non ancora disponibili.');

        iniettaCSS();
        const vecchia = document.getElementById('rp-pagina');
        if (vecchia) vecchia.remove();

        const pagina = costruisciPagina(pacco.dati, pacco.filtri || { prodotto: 'TUTTI', periodo: 'tutto' });
        document.body.appendChild(pagina);

        const nome = 'Riepilogo_WonderLAD_' + new Date().toISOString().slice(0, 10) + '.pdf';

        return html2pdf().set({
            margin: 0,
            filename: nome,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff',
                           windowWidth: A4.larghezza, width: A4.larghezza, height: A4.altezza },
            jsPDF: { unit: 'px', format: [A4.larghezza, A4.altezza], orientation: 'portrait', hotfixes: ['px_scaling'] },
            pagebreak: { mode: 'avoid-all' }
        }).from(pagina).save()
          .then(() => {
              pagina.remove();
              if (typeof scriviLog === 'function') scriviLog('EXPORT', 'Riepilogo PDF generato');
          })
          .catch(() => {
              pagina.remove();
              alert('Generazione del PDF non riuscita.');
          });
    }

    // Sostituisce l'export della dashboard (questo file si carica dopo).
    window.esportaPDF = generaReport;
    window.generaReportPDF = generaReport;

})();
