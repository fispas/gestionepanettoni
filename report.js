// WonderLAD - riepilogo PDF.
// Impagina un documento A4 verticale in forma di prospetto: intestazione,
// dettaglio voci, totali, ripartizioni. Sempre una pagina sola.
//
// Nota tecnica: html2pdf clona l'elemento in un suo contenitore e disegna
// quella copia. Per questo la pagina non va nascosta con regole sul suo id
// (la copia le erediterebbe e il PDF verrebbe bianco): la si nasconde
// mettendola dentro un contenitore a dimensione zero, che non viene clonato.

(function () {
    'use strict';

    const A4 = { larghezza: 793, altezza: 1122 };   // pixel a 96 dpi, appena sotto 210x297 mm

    const euro = (n) => '€ ' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const euroTondo = (n) => '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT');
    const num = (n) => Number(n || 0).toLocaleString('it-IT');

    function h(t) {
        return String(t == null ? '' : t)
            .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ======================================================
       DATI
       ====================================================== */

    function raccogliDati() {
        if (typeof window.aggregatoDashboard === 'function') {
            try {
                const p = window.aggregatoDashboard();
                if (p && p.dati) return p;
            } catch (e) { /* si ricalcola sotto */ }
        }
        const ordini = (typeof datiGlobali !== 'undefined' && Array.isArray(datiGlobali)) ? datiGlobali : [];
        const campagna = (typeof campagnaSel === 'function') ? campagnaSel() : null;
        const filtri = { prodotto: 'TUTTI', periodo: 'tutto' };
        return { dati: Modello.aggrega(ordini, campagna, filtri), filtri: filtri };
    }

    /* ======================================================
       BLOCCHI DEL DOCUMENTO
       ====================================================== */

    function vociProdotto(a) {
        return Object.keys(a.perProdotto)
            .filter(k => a.filtri.prodotto === 'TUTTI' || k === a.filtri.prodotto)
            .map(k => a.perProdotto[k])
            .filter(pp => pp.pezzi > 0 || pp.stock > 0);
    }

    function tabellaVoci(a) {
        const nomeCampagna = (a.campagna && a.campagna.nome) || '';
        const righe = vociProdotto(a).map((pp, i) => {
            const p = Modello.prodotto(a.campagna, pp.chiave);
            const desc = [p.peso, 'dolce solidale' + (nomeCampagna ? ' · ' + nomeCampagna : '')].filter(Boolean).join(' · ');
            return `
            <tr>
                <td class="rp-c">${i + 1}</td>
                <td><b>${h(pp.nome)}</b><div class="rp-desc">${h(desc)}</div></td>
                <td class="rp-n">${num(pp.pezzi)}</td>
                <td class="rp-n">${h(euro(pp.donazioneMinima))}</td>
                <td class="rp-n">${h(euro(pp.minimo))}</td>
                <td class="rp-n"><b>${h(euro(pp.offerta))}</b></td>
            </tr>`;
        }).join('');

        return `<table class="rp-voci">
            <thead><tr>
                <th class="rp-c" style="width:24px">#</th>
                <th>Descrizione</th>
                <th class="rp-n" style="width:56px">Q.tà</th>
                <th class="rp-n" style="width:84px">Min. cad.</th>
                <th class="rp-n" style="width:92px">Minimo</th>
                <th class="rp-n" style="width:96px">Offerte</th>
            </tr></thead>
            <tbody>${righe || '<tr><td></td><td colspan="5">Nessun prodotto.</td></tr>'}
                <tr class="rp-riga-tot">
                    <td></td><td>Totale prenotato</td>
                    <td class="rp-n">${num(a.pezziTotali)}</td>
                    <td></td>
                    <td class="rp-n">${h(euro(a.minimoTotale))}</td>
                    <td class="rp-n">${h(euro(a.valoreTotale))}</td>
                </tr>
            </tbody></table>`;
    }

    function blocchoTotali(a) {
        return `<table class="rp-totali">
            <tr><td>Donazioni minime</td><td class="rp-n">${h(euro(a.minimoTotale))}</td></tr>
            <tr class="rp-ok"><td>Donato oltre il minimo</td><td class="rp-n">${h(euro(a.extra))}</td></tr>
            <tr class="rp-ok"><td>Già incassato</td><td class="rp-n">${h(euro(a.incassato))}</td></tr>
            <tr class="rp-ko"><td>Ancora da incassare</td><td class="rp-n">${h(euro(a.daIncassare))}</td></tr>
            <tr class="rp-grande"><td>Totale offerte</td><td class="rp-n">${h(euro(a.valoreTotale))}</td></tr>
        </table>
        <div class="rp-nota">Documento non fiscale. Gli ordini annullati sono esclusi da importi, quantità e disponibilità.</div>`;
    }

    function barraStock(nome, impegnati, totale) {
        const perc = totale > 0 ? Math.min(100, Math.round(impegnati / totale * 100)) : 0;
        const rim = totale - impegnati;
        return `<div class="rp-stock">
            <div class="rp-stock-top"><span>${h(nome)}</span><span><b>${num(impegnati)}</b> / ${num(totale)}</span></div>
            <div class="rp-barra"><div class="rp-barra-int" style="width:${perc}%"></div></div>
            <div class="rp-stock-sub">${rim >= 0 ? 'restano ' + num(rim) + ' pz' : 'sovrapprenotati ' + num(Math.abs(rim)) + ' pz'} · ${perc}% impegnato</div>
        </div>`;
    }

    function tabellaStati(a) {
        const voci = [
            ['Prenotati', 'prenotato'], ['In preparazione', 'preparazione'],
            ['Da consegnare', 'da_consegnare'], ['Consegnati', 'consegnato'],
            ['Annullati', 'annullato']
        ];
        return `<table class="rp-tab">
            <thead><tr><th>Stato</th><th class="rp-n">Ordini</th><th class="rp-n">Pezzi</th><th class="rp-n">Valore</th></tr></thead>
            <tbody>${voci.map(v => `
                <tr class="${v[1] === 'annullato' ? 'rp-spento' : ''}">
                    <td>${h(v[0])}</td>
                    <td class="rp-n">${num(a.stati[v[1]])}</td>
                    <td class="rp-n">${num(a.statiPezzi[v[1]])}</td>
                    <td class="rp-n">${h(euroTondo(a.statiImporto[v[1]]))}</td>
                </tr>`).join('')}
                <tr class="rp-riga-tot">
                    <td>Totale attivi</td>
                    <td class="rp-n">${num(a.ordiniAttivi)}</td>
                    <td class="rp-n">${num(a.pezziTotali)}</td>
                    <td class="rp-n">${h(euroTondo(a.valoreTotale))}</td>
                </tr>
            </tbody></table>`;
    }

    function tabellaMetodi(a) {
        const chiavi = Object.keys(a.metodi).sort((x, y) => a.metodi[y] - a.metodi[x]);
        if (!chiavi.length) return '<p class="rp-vuoto">Nessun incasso registrato.</p>';
        return `<table class="rp-tab">
            <thead><tr><th>Metodo</th><th class="rp-n">Quota</th><th class="rp-n">Importo</th></tr></thead>
            <tbody>${chiavi.map(k => `
                <tr><td>${h(k)}</td>
                    <td class="rp-n">${a.incassato ? Math.round(a.metodi[k] / a.incassato * 100) : 0}%</td>
                    <td class="rp-n">${h(euroTondo(a.metodi[k]))}</td></tr>`).join('')}
                <tr class="rp-riga-tot"><td>Totale incassato</td><td class="rp-n">100%</td>
                    <td class="rp-n">${h(euroTondo(a.incassato))}</td></tr>
            </tbody></table>`;
    }

    function tabellaSostenitori(a) {
        const top = Object.keys(a.classifica).map(k => [k, a.classifica[k]])
            .sort((x, y) => y[1].importo - x[1].importo).slice(0, 5);
        if (!top.length) return '<p class="rp-vuoto">Nessun ordine.</p>';
        return `<table class="rp-tab">
            <thead><tr><th>Sostenitore</th><th class="rp-n">Pezzi</th><th class="rp-n">Importo</th></tr></thead>
            <tbody>${top.map((t, i) => `
                <tr><td>${i + 1}. ${h(t[0])}</td>
                    <td class="rp-n">${num(t[1].pezzi)}</td>
                    <td class="rp-n">${h(euroTondo(t[1].importo))}</td></tr>`).join('')}
            </tbody></table>`;
    }

    // Istogramma in puro CSS: html2canvas rende i canvas in modo inaffidabile.
    function andamento(a) {
        const giorni = Object.keys(a.perGiorno).sort().slice(-14);
        if (!giorni.length) return '<p class="rp-vuoto">Nessun ordine nel periodo selezionato.</p>';
        const max = Math.max.apply(null, giorni.map(g => a.perGiorno[g].pezzi)) || 1;
        return `<div class="rp-istogramma">${giorni.map(g => {
            const v = a.perGiorno[g].pezzi;
            return `<div class="rp-col">
                        <div class="rp-col-val">${num(v)}</div>
                        <div class="rp-col-barra" style="height:${Math.max(3, Math.round(v / max * 44))}px"></div>
                        <div class="rp-col-lbl">${g.slice(8, 10)}/${g.slice(5, 7)}</div>
                    </div>`;
        }).join('')}</div>`;
    }

    /* ======================================================
       PAGINA
       ====================================================== */

    function costruisciPagina(a, filtri) {
        const ora = new Date();
        const p2 = (x) => String(x).padStart(2, '0');
        const protocollo = 'RIEP-' + ora.getFullYear() + p2(ora.getMonth() + 1) + p2(ora.getDate())
                         + '-' + p2(ora.getHours()) + p2(ora.getMinutes());

        const periodo = { tutto: 'Tutto lo storico', '7': 'Ultimi 7 giorni', '30': 'Ultimi 30 giorni', mese: 'Mese corrente' }[filtri.periodo] || 'Tutto lo storico';
        const prodotto = filtri.prodotto === 'TUTTI'
            ? (a.prodotti.map(p => p.plurale || p.nome).join(', ') || '—')
            : 'Solo ' + String(Modello.prodotto(a.campagna, filtri.prodotto).plurale || filtri.prodotto).toLowerCase();
        const nomeCampagna = (a.campagna && a.campagna.nome) || '—';
        const chi = (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.email) ? utenteCorrente.email : '—';
        const prenotazioni = a.campagna && a.campagna.ordiniAperti === false ? 'chiuse' : 'aperte';

        const daIncassareOrd = a.daFare.filter(v => v.motivo === 'da incassare').length;
        const daConsegnareOrd = a.stati.prenotato + a.stati.preparazione + a.stati.da_consegnare;
        const daConsegnarePz = a.statiPezzi.prenotato + a.statiPezzi.preparazione + a.statiPezzi.da_consegnare;

        const pagina = document.createElement('div');
        pagina.id = 'rp-pagina';
        pagina.innerHTML = `
            <div class="rp-head">
                <div>
                    <div class="rp-marchio">WonderLAD</div>
                    <div class="rp-ente">Dolci Solidali · prospetto di riepilogo</div>
                </div>
                <div class="rp-head-dx">
                    <div class="rp-prot">${h(protocollo)}</div>
                    <div>${h(ora.toLocaleDateString('it-IT'))} · ${h(ora.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))}</div>
                </div>
            </div>

            <div class="rp-info">
                <div class="rp-info-col">
                    <div class="rp-info-tit">Campagna</div>
                    <div><span>Nome</span><b>${h(nomeCampagna)}</b></div>
                    <div><span>Periodo</span><b>${h(periodo)}</b></div>
                    <div><span>Prodotti</span><b>${h(prodotto)}</b></div>
                    <div><span>Prenotazioni</span><b>${h(prenotazioni)}</b></div>
                </div>
                <div class="rp-info-col">
                    <div class="rp-info-tit">Volumi</div>
                    <div><span>Ordini attivi</span><b>${num(a.ordiniAttivi)}</b></div>
                    <div><span>Sostenitori</span><b>${num(a.clientiUnici)}</b></div>
                    <div><span>Media per ordine</span><b>${h(euro(a.ticketMedio))}</b></div>
                    <div><span>Ricevute richieste</span><b>${num(a.ricevute)}</b></div>
                </div>
                <div class="rp-info-col">
                    <div class="rp-info-tit">Emissione</div>
                    <div><span>Operatore</span><b>${h(chi)}</b></div>
                    <div><span>Ordini esaminati</span><b>${num(a.ordiniTotali)}</b></div>
                    <div><span>Di cui annullati</span><b>${num(a.stati.annullato)}</b></div>
                    <div><span>Ritiri assegnati</span><b>${num(a.ritiriProgrammati)}</b></div>
                </div>
            </div>

            <div class="rp-sez-tit">Dettaglio voci</div>
            ${tabellaVoci(a)}

            <div class="rp-due">
                <div class="rp-col-sx">
                    <div class="rp-sez-tit">Disponibilità a magazzino</div>
                    ${vociProdotto(a).map(pp => barraStock(pp.plurale, pp.pezzi, pp.stock)).join('')}
                </div>
                <div class="rp-col-dx">
                    ${blocchoTotali(a)}
                </div>
            </div>

            <div class="rp-due">
                <div class="rp-col-meta">
                    <div class="rp-sez-tit">Ripartizione per stato</div>
                    ${tabellaStati(a)}
                </div>
                <div class="rp-col-meta">
                    <div class="rp-sez-tit">Incassi per metodo</div>
                    ${tabellaMetodi(a)}
                </div>
            </div>

            ${vociProdotto(a).length >= 5 ? '' : `<div class="rp-sez-tit">Pezzi prenotati per giorno <span class="rp-mini">— ultimi 14 giorni con ordini</span></div>
            ${andamento(a)}`}

            <div class="rp-due">
                <div class="rp-col-meta">
                    <div class="rp-sez-tit">Migliori sostenitori <span class="rp-mini">— per importo</span></div>
                    ${tabellaSostenitori(a)}
                </div>
                <div class="rp-col-meta">
                    <div class="rp-sez-tit">Cosa resta da fare</div>
            <div class="rp-azioni">
                <div class="rp-azione">
                    <div class="rp-azione-num">${num(daIncassareOrd)}</div>
                    <div><b>ordini da incassare</b><br>${h(euroTondo(a.daIncassare))} ancora da riscuotere</div>
                </div>
                <div class="rp-azione">
                    <div class="rp-azione-num">${num(daConsegnareOrd)}</div>
                    <div><b>ordini da consegnare</b><br>${num(daConsegnarePz)} pezzi da preparare</div>
                </div>
                <div class="rp-azione">
                    <div class="rp-azione-num">${a.percConsegnato}%</div>
                    <div><b>campagna conclusa</b><br>${num(a.stati.consegnato)} ordini già consegnati</div>
                </div>
            </div>
                </div>
            </div>

            <div class="rp-piede">
                Prospetto generato automaticamente dal gestionale WonderLAD · ${h(protocollo)} · pagina 1 di 1
            </div>`;
        return pagina;
    }

    const CSS = `
#rp-contenitore { position:fixed; left:0; top:0; width:0; height:0; overflow:hidden; pointer-events:none; }
#rp-pagina { position:relative; width:${A4.larghezza}px; height:${A4.altezza}px;
    box-sizing:border-box; padding:26px 34px 40px; background:#fff; color:#2c3e35;
    font-family:'Nunito',Arial,Helvetica,sans-serif; font-size:10.5px; overflow:hidden; }
#rp-pagina * { box-sizing:border-box; }
/* Neutralizza gli stili delle tabelle del pannello (anche quelli per smartphone):
   :where() ha specificita' zero, cosi' le regole .rp-* sotto restano valide. */
:where(#rp-pagina) table { display:table; width:100%; border-collapse:collapse; background:transparent;
    border:none; border-radius:0; box-shadow:none; overflow:visible; font-size:inherit; }
:where(#rp-pagina) thead { display:table-header-group; }
:where(#rp-pagina) tbody { display:table-row-group; }
:where(#rp-pagina) tr { display:table-row; background:none; margin:0; padding:0; border:none; border-radius:0; box-shadow:none; }
:where(#rp-pagina) th, :where(#rp-pagina) td { display:table-cell; font-size:inherit; padding:0; border:none;
    background:transparent; text-align:left; position:static; }
:where(#rp-pagina) td::before { content:none; }
#rp-pagina table { border-collapse:collapse; width:100%; }

.rp-head { display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #6b9080; padding-bottom:8px; }
.rp-marchio { font-family:'Quicksand',Arial,sans-serif; font-size:24px; font-weight:800;
    color:#4d6a5b; letter-spacing:-.4px; }
.rp-ente { font-size:11px; color:#6b7c73; font-weight:700; }
.rp-head-dx { text-align:right; font-size:10px; color:#6b7c73; font-weight:700; }
.rp-prot { font-family:'Quicksand',Arial,sans-serif; font-size:13px; font-weight:800; color:#2c3e35; }

.rp-info { display:flex; gap:10px; margin-top:12px; }
.rp-info-col { flex:1; border:1.5px solid #e2ece9; border-radius:8px; padding:8px 10px; background:#fbfdfc; }
.rp-info-tit { font-family:'Quicksand',Arial,sans-serif; font-size:9px; font-weight:800;
    text-transform:uppercase; letter-spacing:.5px; color:#8a9a92; margin-bottom:5px; }
.rp-info-col > div:not(.rp-info-tit) { display:flex; justify-content:space-between; gap:8px; padding:1.5px 0; }
.rp-info-col span { color:#6b7c73; }
.rp-info-col b { color:#2c3e35; text-align:right; }

.rp-sez-tit { font-family:'Quicksand',Arial,sans-serif; font-size:11.5px; font-weight:800;
    color:#4d6a5b; margin:11px 0 4px; }
.rp-mini { font-weight:600; font-size:9.5px; color:#8a9a92; }

.rp-voci th { background:#eaf4f0; color:#4d6a5b; font-size:9px; text-transform:uppercase;
    letter-spacing:.4px; text-align:left; padding:5px 7px; border-bottom:1.5px solid #cddfd7; }
.rp-voci td { padding:4px 7px; border-bottom:1px solid #eef3f1; vertical-align:top; line-height:1.3; }
.rp-desc { font-size:9px; color:#8a9a92; font-weight:600; margin-top:1px; }
.rp-voci .rp-riga-tot td { background:#f6fbf8; font-weight:800; color:#4d6a5b;
    border-top:1.5px solid #cddfd7; border-bottom:none; }
.rp-c { text-align:center; color:#8a9a92; }
.rp-n { text-align:right; white-space:nowrap; }

.rp-due { display:flex; gap:14px; align-items:flex-start; }
.rp-col-sx { width:52%; }
.rp-col-dx { width:48%; padding-top:14px; }
.rp-col-meta { width:50%; }

.rp-totali td { padding:4px 8px; border-bottom:1px solid #eef3f1; }
.rp-totali .rp-ok td { color:#2e7d32; }
.rp-totali .rp-ko td { color:#c53030; }
.rp-totali .rp-grande td { font-family:'Quicksand',Arial,sans-serif; font-size:14px; font-weight:800;
    color:#2c3e35; background:#eaf4f0; border-top:2px solid #6b9080; border-bottom:none; }
.rp-nota { font-size:8.5px; color:#8a9a92; font-weight:600; margin-top:6px; line-height:1.35; }

.rp-stock { margin-bottom:7px; }
.rp-stock-top { display:flex; justify-content:space-between; font-size:10.5px; font-weight:700; margin-bottom:3px; }
.rp-barra { height:9px; background:#eaf4f0; border-radius:5px; overflow:hidden; }
.rp-barra-int { height:100%; background:#6b9080; }
.rp-stock-sub { font-size:9px; color:#6b7c73; font-weight:700; margin-top:2px; }

.rp-tab th { text-align:left; font-size:8.5px; text-transform:uppercase; color:#8a9a92;
    border-bottom:1.5px solid #e2ece9; padding:3px 4px; letter-spacing:.3px; }
.rp-tab td { padding:3.5px 4px; border-bottom:1px solid #f2f6f4; }
.rp-tab .rp-spento td { color:#a8b5ae; }
.rp-tab .rp-riga-tot td { font-weight:800; color:#4d6a5b; border-top:1.5px solid #e2ece9; border-bottom:none; }
.rp-vuoto { color:#8a9a92; font-size:10px; margin:6px 0; }

.rp-istogramma { display:flex; align-items:flex-end; gap:5px; height:72px;
    border:1.5px solid #e2ece9; border-radius:8px; padding:6px 8px; }
.rp-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.rp-col-val { font-size:8px; color:#6b7c73; font-weight:800; margin-bottom:2px; }
.rp-col-barra { width:100%; background:#94bdad; border-radius:3px 3px 0 0; }
.rp-col-lbl { font-size:7.5px; color:#8a9a92; font-weight:700; margin-top:3px; }

.rp-azioni { display:flex; flex-direction:column; gap:7px; }
.rp-azione { flex:1; display:flex; align-items:center; gap:9px; border:1.5px solid #e2ece9;
    background:#f6fbf8; border-radius:8px; padding:6px 10px; font-size:9.5px;
    color:#4d6a5b; font-weight:600; line-height:1.4; }
.rp-azione-num { font-family:'Quicksand',Arial,sans-serif; font-size:19px; font-weight:800; min-width:44px;
    color:#6b9080; line-height:1; white-space:nowrap; }

.rp-piede { position:absolute; left:34px; right:34px; bottom:16px;
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
        if (typeof html2pdf === 'undefined') return alert('Libreria PDF non caricata.');

        const pacco = raccogliDati();
        if (!pacco || !pacco.dati) return alert('Dati non ancora disponibili.');
        if (!pacco.dati.ordiniTotali) return alert('Nessun ordine da riepilogare con i filtri attivi.');

        iniettaCSS();
        const vecchio = document.getElementById('rp-contenitore');
        if (vecchio) vecchio.remove();

        const contenitore = document.createElement('div');
        contenitore.id = 'rp-contenitore';
        const pagina = costruisciPagina(pacco.dati, pacco.filtri || { prodotto: 'TUTTI', periodo: 'tutto' });
        contenitore.appendChild(pagina);
        document.body.appendChild(contenitore);

        const ripulisci = () => { try { contenitore.remove(); } catch (e) { /* niente */ } };

        return html2pdf().set({
            margin: 0,
            filename: 'Riepilogo_WonderLAD_' + new Date().toISOString().slice(0, 10) + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                // Larghezza da desktop: su smartphone le regole mobili non entrano nel PDF.
                windowWidth: 1280
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            // Nessuna gestione delle interruzioni: la pagina misura gia' un A4.
            // Con 'avoid-all' html2pdf spingeva tutto su una seconda pagina.
            pagebreak: { mode: [] }
        }).from(pagina).save()
          .then(() => {
              ripulisci();
              if (typeof scriviLog === 'function') scriviLog('EXPORT', 'Riepilogo PDF generato');
          })
          .catch(() => {
              ripulisci();
              alert('Generazione del PDF non riuscita.');
          });
    }

    window.esportaPDF = generaReport;
    window.generaReportPDF = generaReport;

})();
