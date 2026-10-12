// WonderLAD - export Excel completo (ExcelJS).
// Fogli: Riepilogo, Ordini, Righe prodotto, Andamento, Da incassare,
// Da consegnare, Ritiri e, solo per l'Administrator, Ricevute.
// I totali sono formule: in Excel si aggiornano se si filtra o si corregge un dato.

(function (radice) {
    'use strict';

    const M = (typeof Modello !== 'undefined') ? Modello : require('./modello.js');

    const COLORI = {
        scuro: 'FF3A6250', medio: 'FF5B8E72', chiaro: 'FFEAF4F0', banda: 'FFF6FBF8',
        bordo: 'FFDCE7E1', testoTenue: 'FF62756D', bianco: 'FFFFFFFF',
        verde: 'FF2E7D32', rosso: 'FFC53030', ambra: 'FFB7791F'
    };

    const COLORI_STATO = {
        'Prenotato - Da Pagare': ['FFFCE8E6', 'FFC53030'],
        'Prenotato - Pagato': ['FFE8F5E9', 'FF276749'],
        'In Preparazione': ['FFFFF8E1', 'FFB7791F'],
        'Da Consegnare': ['FFF3E5F5', 'FF6B46C1'],
        'Consegnato': ['FFEDF7ED', 'FF2E7D32'],
        'Annullato': ['FFF1F3F5', 'FF718096']
    };

    const FMT = {
        euro: '€ #,##0.00;[Red]-€ #,##0.00',
        euroTondo: '€ #,##0',
        intero: '#,##0',
        perc: '0%',
        data: 'dd/mm/yyyy',
        dataOra: 'dd/mm/yyyy hh:mm',
        ora: 'hh:mm'
    };

    const FONT = 'Arial';
    const PRIMA_RIGA_DATI = 5;      // 1 titolo, 2 sottotitolo, 3 totali filtrati, 4 intestazioni

    /* ======================================================
       UTILITA'
       ====================================================== */

    function lettera(n) {
        let s = '';
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
    }

    function siNo(v) { return v ? 'Sì' : 'No'; }

    function dataRitiroExcel(o) {
        const d = M.dataRitiro(o);
        return d ? dataLocale(d) : null;
    }

    // ExcelJS scrive le date in UTC: si sposta l'orario cosi' che in Excel
    // compaia l'ora locale italiana.
    function dataLocale(d) {
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    }

    function nomeFoglio(t) { return String(t).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31); }

    function stileIntestazione(cella) {
        cella.font = { name: FONT, bold: true, color: { argb: COLORI.bianco }, size: 10 };
        cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORI.scuro } };
        cella.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cella.border = { bottom: { style: 'thin', color: { argb: COLORI.scuro } } };
    }

    function stileTotale(cella) {
        cella.font = { name: FONT, bold: true, color: { argb: COLORI.scuro }, size: 10 };
        cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORI.chiaro } };
        cella.border = { top: { style: 'thin', color: { argb: COLORI.medio } }, bottom: { style: 'thin', color: { argb: COLORI.medio } } };
    }

    function titolo(ws, testo, sottotitolo, larghezza) {
        ws.mergeCells(1, 1, 1, Math.max(2, larghezza));
        const t = ws.getCell(1, 1);
        t.value = testo;
        t.font = { name: FONT, size: 15, bold: true, color: { argb: COLORI.scuro } };
        t.alignment = { vertical: 'middle' };
        ws.getRow(1).height = 26;

        ws.mergeCells(2, 1, 2, Math.max(2, larghezza));
        const s = ws.getCell(2, 1);
        s.value = sottotitolo;
        s.font = { name: FONT, size: 9, italic: true, color: { argb: COLORI.testoTenue } };
    }

    /* ======================================================
       FOGLIO ELENCO GENERICO
       colonne: [{ titolo, chiave, larghezza, fmt, totale: 'somma'|'conta'|null, allinea }]
       righe: array di oggetti con le chiavi delle colonne
       ====================================================== */

    function foglioElenco(wb, nome, intestazione, sottotitolo, colonne, righe, opzioni) {
        opzioni = opzioni || {};
        const ws = wb.addWorksheet(nomeFoglio(nome), {
            views: [{ state: 'frozen', ySplit: PRIMA_RIGA_DATI - 1, xSplit: opzioni.bloccaColonne || 0 }],
            properties: { defaultRowHeight: 16 },
            pageSetup: {
                orientation: opzioni.verticale ? 'portrait' : 'landscape',
                paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
                printTitlesRow: (PRIMA_RIGA_DATI - 1) + ':' + (PRIMA_RIGA_DATI - 1)
            },
            headerFooter: { oddFooter: '&L' + nome + '&RPagina &P di &N' }
        });

        titolo(ws, intestazione, sottotitolo, colonne.length);

        colonne.forEach((c, i) => {
            ws.getColumn(i + 1).width = c.larghezza || 14;
        });

        // Riga 4: intestazioni
        const rigaInt = ws.getRow(PRIMA_RIGA_DATI - 1);
        colonne.forEach((c, i) => {
            const cella = rigaInt.getCell(i + 1);
            cella.value = c.titolo;
            stileIntestazione(cella);
        });
        rigaInt.height = 30;

        // Dati
        righe.forEach((r, j) => {
            const riga = ws.getRow(PRIMA_RIGA_DATI + j);
            colonne.forEach((c, i) => {
                const cella = riga.getCell(i + 1);
                let v = r[c.chiave];
                if (typeof c.formula === 'function') {
                    v = { formula: c.formula(PRIMA_RIGA_DATI + j, colonne), result: v };
                }
                cella.value = (v === undefined || v === '') ? null : v;
                cella.font = { name: FONT, size: 10 };
                if (c.fmt) cella.numFmt = c.fmt;
                cella.alignment = { vertical: 'top', horizontal: c.allinea || (c.fmt ? 'right' : 'left'), wrapText: !!c.aCapo };
                cella.border = { bottom: { style: 'hair', color: { argb: COLORI.bordo } } };
                if (j % 2 === 1) cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORI.banda } };
                if (typeof c.stile === 'function') c.stile(cella, r);
            });
        });

        const ultima = PRIMA_RIGA_DATI + Math.max(righe.length, 1) - 1;

        // Riga 3: totali che seguono i filtri (SUBTOTAL ignora le righe nascoste dal filtro)
        const rigaTot = ws.getRow(PRIMA_RIGA_DATI - 2);
        colonne.forEach((c, i) => {
            const cella = rigaTot.getCell(i + 1);
            const col = lettera(i + 1);
            const rng = `${col}${PRIMA_RIGA_DATI}:${col}${ultima}`;
            if (i === 0) {
                cella.value = c.totale === 'conta'
                    ? { formula: `"Totali (righe visibili: "&SUBTOTAL(103,${rng})&")"`, result: `Totali (righe visibili: ${righe.length})` }
                    : 'Totali righe visibili';
            } else if (c.totale === 'somma') {
                const somma = righe.reduce((s, r) => s + (Number(r[c.chiave]) || 0), 0);
                cella.value = { formula: `SUBTOTAL(109,${rng})`, result: somma };
                if (c.fmt) cella.numFmt = c.fmt;
            } else if (c.totale === 'conta') {
                cella.value = { formula: `SUBTOTAL(103,${rng})`, result: righe.filter(r => r[c.chiave] !== '' && r[c.chiave] != null).length };
            }
            stileTotale(cella);
            cella.alignment = { horizontal: i === 0 ? 'left' : 'right' };
        });

        if (righe.length) {
            ws.autoFilter = { from: { row: PRIMA_RIGA_DATI - 1, column: 1 }, to: { row: ultima, column: colonne.length } };
        } else {
            const c = ws.getCell(PRIMA_RIGA_DATI, 1);
            c.value = 'Nessun dato.';
            c.font = { name: FONT, italic: true, color: { argb: COLORI.testoTenue } };
        }
        return { ws: ws, ultima: ultima };
    }

    function stileStato(cella, r) {
        const c = COLORI_STATO[r.stato];
        if (!c) return;
        cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c[0] } };
        cella.font = { name: FONT, size: 10, bold: true, color: { argb: c[1] } };
    }

    function stileSiNo(cella, r, chiave, coloreSi) {
        if (r[chiave] === 'Sì') cella.font = { name: FONT, size: 10, bold: true, color: { argb: coloreSi || COLORI.verde } };
    }

    /* ======================================================
       COSTRUZIONE DEL WORKBOOK
       ====================================================== */

    function costruisciWorkbook(ExcelJS, p) {
        const ordini = (p.ordini || []).slice().sort((a, b) => (M.dataDi(a) || 0) - (M.dataDi(b) || 0));
        const campagna = p.campagna || null;
        const prodotti = M.prodottiOrdinati(campagna);
        // Anche i prodotti presenti solo negli ordini (es. disattivati o storici).
        ordini.forEach(o => M.righeOrdine(o).forEach(r => {
            if (!prodotti.some(x => x.chiave === r.prodotto)) prodotti.push(M.prodotto(campagna, r.prodotto));
        }));
        const admin = !!p.admin;
        const ora = p.ora || new Date();
        const nomeCampagna = (campagna && campagna.nome) || 'Campagna';
        const sotto = `${nomeCampagna} · esportato il ${ora.toLocaleDateString('it-IT')} alle ${ora.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` +
                      (p.utente ? ` da ${p.utente}` : '') + ' · gli ordini annullati sono esclusi dai totali del riepilogo';

        const wb = new ExcelJS.Workbook();
        wb.creator = 'WonderLAD gestionale';
        wb.created = ora;
        wb.calcProperties = { fullCalcOnLoad: true };

        /* ---------- dati di base per ordine ---------- */
        const base = ordini.map(o => {
            const offerta = M.offertaOrdine(o, campagna);
            const minimo = M.minimoOrdine(o, campagna);
            const d = M.dataDi(o);
            const msg = Array.isArray(o.messaggi) ? o.messaggi : [];
            const ultimo = msg.length ? msg[msg.length - 1] : null;
            const r = {
                o: o,
                data: d ? dataLocale(d) : null,
                codice: o.codice || '',
                nome: o.nome || '', cognome: o.cognome || '',
                cliente: M.nomeCompleto(o),
                telefono: o.telefono || '', email: o.email || '',
                pezzi: M.pezziOrdine(o),
                minimo: minimo, offerta: offerta, extra: M.arrotonda(offerta - minimo),
                stato: o.status || '',
                pagato: siNo(M.pagato(o)),
                metodo: M.NOMI_METODI[o.metodoPagamento] || o.metodoPagamento || '',
                ritiro: dataRitiroExcel(o),
                luogo: (o.ritiro && o.ritiro.luogo) || '',
                referente: (o.ritiro && o.ritiro.referente) || '',
                ricevuta: siNo(o.ricevuta),
                cf: o.cf || '', indirizzo: o.indirizzo || '', cap: o.cap || '', comune: o.comune || '', provincia: o.provincia || '',
                marketing: siNo(o.consensoMarketing),
                privacy: o.consensoPrivacy ? ('v. ' + (o.privacyVersione || 1)) : 'non registrato',
                messaggi: msg.length,
                ultimoMsg: ultimo ? `${ultimo.canale} · ${ultimo.modello} · ${new Date(ultimo.quando).toLocaleDateString('it-IT')}` : '',
                note: o.note || '',
                origine: o.origine || '',
                dolci: M.riepilogoRighe(o, campagna)
            };
            prodotti.forEach(pr => {
                const riga = M.righeOrdine(o).find(x => x.prodotto === pr.chiave);
                r['q_' + pr.chiave] = riga ? riga.quantita : 0;
            });
            return r;
        });

        /* ---------- Ordini ---------- */
        const colOrdini = [
            { titolo: 'Data', chiave: 'data', larghezza: 16, fmt: FMT.dataOra, totale: 'conta' },
            { titolo: 'Codice', chiave: 'codice', larghezza: 10, allinea: 'center' },
            { titolo: 'Nome', chiave: 'nome', larghezza: 14 },
            { titolo: 'Cognome', chiave: 'cognome', larghezza: 16 },
            { titolo: 'Telefono', chiave: 'telefono', larghezza: 14 },
            { titolo: 'Email', chiave: 'email', larghezza: 26 }
        ];
        prodotti.forEach(pr => colOrdini.push({ titolo: pr.plurale || pr.nome, chiave: 'q_' + pr.chiave, larghezza: 11, fmt: FMT.intero, totale: 'somma' }));
        const iPrimoProdotto = 7;
        const iUltimoProdotto = 6 + prodotti.length;
        colOrdini.push(
            { titolo: 'Pezzi', chiave: 'pezzi', larghezza: 8, fmt: FMT.intero, totale: 'somma',
              formula: (r) => prodotti.length ? `SUM(${lettera(iPrimoProdotto)}${r}:${lettera(iUltimoProdotto)}${r})` : '0' },
            { titolo: 'Donazione minima', chiave: 'minimo', larghezza: 13, fmt: FMT.euro, totale: 'somma' },
            { titolo: 'Offerta', chiave: 'offerta', larghezza: 12, fmt: FMT.euro, totale: 'somma',
              stile: (c) => { c.font = { name: FONT, size: 10, bold: true }; } },
            { titolo: 'Oltre il minimo', chiave: 'extra', larghezza: 12, fmt: FMT.euro, totale: 'somma',
              formula: (r, cols) => `${lettera(indice(cols, 'offerta'))}${r}-${lettera(indice(cols, 'minimo'))}${r}`,
              stile: (c, r) => { if (r.extra > 0.009) c.font = { name: FONT, size: 10, bold: true, color: { argb: COLORI.verde } }; } },
            { titolo: 'Stato', chiave: 'stato', larghezza: 19, stile: stileStato },
            { titolo: 'Pagato', chiave: 'pagato', larghezza: 8, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'pagato') },
            { titolo: 'Metodo', chiave: 'metodo', larghezza: 12 },
            { titolo: 'Ritiro', chiave: 'ritiro', larghezza: 16, fmt: FMT.dataOra, totale: 'conta' },
            { titolo: 'Luogo ritiro', chiave: 'luogo', larghezza: 18 },
            { titolo: 'Referente', chiave: 'referente', larghezza: 13 },
            { titolo: 'Ricevuta', chiave: 'ricevuta', larghezza: 9, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'ricevuta', 'FF6B46C1') }
        );
        if (admin) {
            colOrdini.push(
                { titolo: 'Codice fiscale', chiave: 'cf', larghezza: 18 },
                { titolo: 'Indirizzo', chiave: 'indirizzo', larghezza: 24 },
                { titolo: 'CAP', chiave: 'cap', larghezza: 7, allinea: 'center' },
                { titolo: 'Comune', chiave: 'comune', larghezza: 14 },
                { titolo: 'Prov.', chiave: 'provincia', larghezza: 6, allinea: 'center' }
            );
        }
        colOrdini.push(
            { titolo: 'Consenso campagne future', chiave: 'marketing', larghezza: 11, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'marketing') },
            { titolo: 'Informativa', chiave: 'privacy', larghezza: 12 },
            { titolo: 'Messaggi inviati', chiave: 'messaggi', larghezza: 10, fmt: FMT.intero, totale: 'somma' },
            { titolo: 'Ultimo messaggio', chiave: 'ultimoMsg', larghezza: 26 },
            { titolo: 'Note', chiave: 'note', larghezza: 30, aCapo: true },
            { titolo: 'Origine', chiave: 'origine', larghezza: 9 }
        );

        function indice(cols, chiave) { return cols.findIndex(c => c.chiave === chiave) + 1; }

        // Il riepilogo e' il primo foglio, ma si scrive dopo: serve sapere dove stanno i dati.
        const wsRiep = wb.addWorksheet('Riepilogo', {
            views: [{ showGridLines: false }],
            pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
        });

        const fOrd = foglioElenco(wb, 'Ordini', `Ordini · ${nomeCampagna}`, sotto, colOrdini, base, { bloccaColonne: 4 });
        const ultOrd = fOrd.ultima;
        const R = (chiave) => {
            const c = lettera(indice(colOrdini, chiave));
            return `Ordini!$${c}$${PRIMA_RIGA_DATI}:$${c}$${ultOrd}`;
        };

        /* ---------- Righe prodotto (una riga per dolce ordinato) ---------- */
        const righeProd = [];
        base.forEach(b => {
            const tutte = M.righeOrdine(b.o);
            const minTot = tutte.reduce((s, r) => s + r.quantita * M.minimoRiga(r, campagna), 0);
            tutte.forEach(r => {
                const pr = M.prodotto(campagna, r.prodotto);
                const minCad = M.minimoRiga(r, campagna);
                righeProd.push({
                    data: b.data, codice: b.codice, cliente: b.cliente,
                    prodotto: pr.nome, quantita: r.quantita, minCad: minCad,
                    minRiga: M.arrotonda(r.quantita * minCad),
                    quota: minTot > 0 ? M.arrotonda(b.offerta * (r.quantita * minCad) / minTot) : 0,
                    stato: b.stato, pagato: b.pagato
                });
            });
        });
        const colRighe = [
            { titolo: 'Data', chiave: 'data', larghezza: 16, fmt: FMT.dataOra, totale: 'conta' },
            { titolo: 'Codice', chiave: 'codice', larghezza: 10, allinea: 'center' },
            { titolo: 'Cliente', chiave: 'cliente', larghezza: 24 },
            { titolo: 'Prodotto', chiave: 'prodotto', larghezza: 16 },
            { titolo: 'Quantità', chiave: 'quantita', larghezza: 10, fmt: FMT.intero, totale: 'somma' },
            { titolo: 'Minimo cad.', chiave: 'minCad', larghezza: 12, fmt: FMT.euro },
            { titolo: 'Minimo riga', chiave: 'minRiga', larghezza: 12, fmt: FMT.euro, totale: 'somma',
              formula: (r) => `E${r}*F${r}` },
            { titolo: 'Quota dell\'offerta', chiave: 'quota', larghezza: 13, fmt: FMT.euro, totale: 'somma' },
            { titolo: 'Stato', chiave: 'stato', larghezza: 19, stile: stileStato },
            { titolo: 'Pagato', chiave: 'pagato', larghezza: 8, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'pagato') }
        ];
        const fRighe = foglioElenco(wb, 'Righe prodotto', 'Dolci ordinati · una riga per prodotto', sotto + ' · utile per tabelle pivot', colRighe, righeProd, { verticale: true });
        const ultRighe = fRighe.ultima;
        const RR = (col) => `'Righe prodotto'!$${col}$${PRIMA_RIGA_DATI}:$${col}$${ultRighe}`;

        /* ---------- Andamento giornaliero ---------- */
        const giorni = {};
        base.forEach(b => {
            if (!b.data) return;
            const g = new Date(Date.UTC(b.data.getUTCFullYear(), b.data.getUTCMonth(), b.data.getUTCDate()));
            giorni[g.getTime()] = g;
        });
        const listaGiorni = Object.keys(giorni).sort((a, b) => a - b).map(k => giorni[k]);
        const righeGiorni = listaGiorni.map(g => {
            const fine = g.getTime() + 86400000;
            const delGiorno = base.filter(b => b.data && b.data.getTime() >= g.getTime() && b.data.getTime() < fine && b.stato !== 'Annullato');
            return {
                giorno: g,
                ordini: delGiorno.length,
                pezzi: delGiorno.reduce((s, b) => s + b.pezzi, 0),
                offerte: M.arrotonda(delGiorno.reduce((s, b) => s + b.offerta, 0))
            };
        });
        let cumul = 0;
        righeGiorni.forEach(r => { cumul += r.pezzi; r.cumulato = cumul; });
        const colGiorni = [
            { titolo: 'Giorno', chiave: 'giorno', larghezza: 14, fmt: FMT.data, totale: 'conta' },
            { titolo: 'Ordini', chiave: 'ordini', larghezza: 10, fmt: FMT.intero, totale: 'somma',
              formula: (r) => `COUNTIFS(${R('data')},">="&A${r},${R('data')},"<"&(A${r}+1),${R('stato')},"<>Annullato")` },
            { titolo: 'Pezzi', chiave: 'pezzi', larghezza: 10, fmt: FMT.intero, totale: 'somma',
              formula: (r) => `SUMIFS(${R('pezzi')},${R('data')},">="&A${r},${R('data')},"<"&(A${r}+1),${R('stato')},"<>Annullato")` },
            { titolo: 'Offerte', chiave: 'offerte', larghezza: 13, fmt: FMT.euro, totale: 'somma',
              formula: (r) => `SUMIFS(${R('offerta')},${R('data')},">="&A${r},${R('data')},"<"&(A${r}+1),${R('stato')},"<>Annullato")` },
            { titolo: 'Pezzi cumulati', chiave: 'cumulato', larghezza: 13, fmt: FMT.intero,
              formula: (r) => r === PRIMA_RIGA_DATI ? `C${r}` : `E${r - 1}+C${r}` }
        ];
        foglioElenco(wb, 'Andamento', 'Andamento giornaliero delle prenotazioni', sotto, colGiorni, righeGiorni, { verticale: true });

        /* ---------- Da incassare ---------- */
        const daIncassare = base.filter(b => b.stato !== 'Annullato' && b.pagato === 'No');
        foglioElenco(wb, 'Da incassare', 'Offerte ancora da incassare', sotto, [
            { titolo: 'Codice', chiave: 'codice', larghezza: 10, allinea: 'center', totale: 'conta' },
            { titolo: 'Cliente', chiave: 'cliente', larghezza: 24 },
            { titolo: 'Telefono', chiave: 'telefono', larghezza: 14 },
            { titolo: 'Email', chiave: 'email', larghezza: 26 },
            { titolo: 'Dolci', chiave: 'dolci', larghezza: 30, aCapo: true },
            { titolo: 'Offerta', chiave: 'offerta', larghezza: 12, fmt: FMT.euro, totale: 'somma' },
            { titolo: 'Stato', chiave: 'stato', larghezza: 19, stile: stileStato },
            { titolo: 'Ritiro', chiave: 'ritiro', larghezza: 16, fmt: FMT.dataOra },
            { titolo: 'Referente', chiave: 'referente', larghezza: 13 },
            { titolo: 'Messaggi inviati', chiave: 'messaggi', larghezza: 10, fmt: FMT.intero }
        ], daIncassare.slice().sort((a, b) => a.cognome.localeCompare(b.cognome)));

        /* ---------- Da consegnare (lista stampabile per il ritiro) ---------- */
        const daConsegnare = base
            .filter(b => b.stato !== 'Annullato' && M.bucketLogistico(b.stato) !== 'consegnato')
            .sort((a, b) => ((a.ritiro ? a.ritiro.getTime() : 9e15) - (b.ritiro ? b.ritiro.getTime() : 9e15)) || a.cognome.localeCompare(b.cognome));
        const colConsegna = [
            { titolo: 'Ritiro', chiave: 'ritiro', larghezza: 16, fmt: FMT.dataOra, totale: 'conta' },
            { titolo: 'Luogo', chiave: 'luogo', larghezza: 18 },
            { titolo: 'Referente', chiave: 'referente', larghezza: 13 },
            { titolo: 'Codice', chiave: 'codice', larghezza: 10, allinea: 'center' },
            { titolo: 'Cliente', chiave: 'cliente', larghezza: 24 },
            { titolo: 'Telefono', chiave: 'telefono', larghezza: 14 }
        ];
        prodotti.forEach(pr => colConsegna.push({ titolo: pr.plurale || pr.nome, chiave: 'q_' + pr.chiave, larghezza: 10, fmt: FMT.intero, totale: 'somma' }));
        colConsegna.push(
            { titolo: 'Offerta', chiave: 'offerta', larghezza: 12, fmt: FMT.euro, totale: 'somma' },
            { titolo: 'Pagato', chiave: 'pagato', larghezza: 8, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'pagato') },
            { titolo: 'Consegnato ✓', chiave: 'vuoto', larghezza: 12 },
            { titolo: 'Firma', chiave: 'vuoto', larghezza: 20 }
        );
        foglioElenco(wb, 'Da consegnare', 'Lista di consegna', sotto + ' · ordinata per data di ritiro', colConsegna, daConsegnare);

        /* ---------- Ritiri raggruppati ---------- */
        const gruppi = {};
        base.filter(b => b.ritiro && b.stato !== 'Annullato').forEach(b => {
            const k = b.ritiro.getTime() + '|' + b.luogo + '|' + b.referente;
            if (!gruppi[k]) gruppi[k] = { ritiro: b.ritiro, luogo: b.luogo, referente: b.referente, ordini: 0, pezzi: 0, daIncassare: 0, consegnati: 0 };
            const g = gruppi[k];
            g.ordini++;
            g.pezzi += b.pezzi;
            if (b.pagato === 'No') g.daIncassare += b.offerta;
            if (M.bucketLogistico(b.stato) === 'consegnato') g.consegnati++;
        });
        const righeRitiri = Object.values(gruppi).sort((a, b) => a.ritiro - b.ritiro);
        // IF(...="","",...): un criterio vuoto deve trovare le celle vuote, non lo zero.
        const crit = (r) => `${R('ritiro')},A${r},${R('luogo')},IF(B${r}="","",B${r}),${R('referente')},IF(C${r}="","",C${r}),${R('stato')},"<>Annullato"`;
        foglioElenco(wb, 'Ritiri', 'Appuntamenti di ritiro', sotto, [
            { titolo: 'Data e ora', chiave: 'ritiro', larghezza: 17, fmt: FMT.dataOra, totale: 'conta' },
            { titolo: 'Luogo', chiave: 'luogo', larghezza: 22 },
            { titolo: 'Referente', chiave: 'referente', larghezza: 14 },
            { titolo: 'Ordini', chiave: 'ordini', larghezza: 9, fmt: FMT.intero, totale: 'somma', formula: (r) => `COUNTIFS(${crit(r)})` },
            { titolo: 'Pezzi', chiave: 'pezzi', larghezza: 9, fmt: FMT.intero, totale: 'somma', formula: (r) => `SUMIFS(${R('pezzi')},${crit(r)})` },
            { titolo: 'Da incassare', chiave: 'daIncassare', larghezza: 13, fmt: FMT.euro, totale: 'somma',
              formula: (r) => `SUMIFS(${R('offerta')},${crit(r)},${R('pagato')},"No")` },
            { titolo: 'Già consegnati', chiave: 'consegnati', larghezza: 11, fmt: FMT.intero, totale: 'somma',
              formula: (r) => `COUNTIFS(${crit(r)},${R('stato')},"Consegnato")` }
        ], righeRitiri, { verticale: true });

        /* ---------- Ricevute (solo Administrator) ---------- */
        if (admin) {
            foglioElenco(wb, 'Ricevute', 'Ricevute richieste', sotto + ' · dati riservati', [
                { titolo: 'Data', chiave: 'data', larghezza: 16, fmt: FMT.dataOra, totale: 'conta' },
                { titolo: 'Codice', chiave: 'codice', larghezza: 10, allinea: 'center' },
                { titolo: 'Nome', chiave: 'nome', larghezza: 14 },
                { titolo: 'Cognome', chiave: 'cognome', larghezza: 16 },
                { titolo: 'Codice fiscale', chiave: 'cf', larghezza: 18 },
                { titolo: 'Indirizzo', chiave: 'indirizzo', larghezza: 26 },
                { titolo: 'CAP', chiave: 'cap', larghezza: 7, allinea: 'center' },
                { titolo: 'Comune', chiave: 'comune', larghezza: 16 },
                { titolo: 'Prov.', chiave: 'provincia', larghezza: 6, allinea: 'center' },
                { titolo: 'Email', chiave: 'email', larghezza: 26 },
                { titolo: 'Offerta', chiave: 'offerta', larghezza: 12, fmt: FMT.euro, totale: 'somma' },
                { titolo: 'Pagato', chiave: 'pagato', larghezza: 8, allinea: 'center', stile: (c, r) => stileSiNo(c, r, 'pagato') },
                { titolo: 'Metodo', chiave: 'metodo', larghezza: 12 },
                { titolo: 'Stato', chiave: 'stato', larghezza: 19, stile: stileStato }
            ], base.filter(b => b.ricevuta === 'Sì' && b.stato !== 'Annullato').sort((a, b) => a.cognome.localeCompare(b.cognome)));
        }

        /* ---------- Riepilogo (formule sui fogli precedenti) ---------- */
        scriviRiepilogo(wsRiep, {
            base, prodotti, campagna, nomeCampagna, sotto, R, RR, admin, generali: p.generali
        });

        return wb;
    }

    function scriviRiepilogo(ws, x) {
        const { base, prodotti, campagna, nomeCampagna, sotto, R, RR } = x;
        ws.getColumn(1).width = 30;
        for (let i = 2; i <= 8; i++) ws.getColumn(i).width = 15;

        titolo(ws, `WonderLAD · Riepilogo ${nomeCampagna}`, sotto, 8);

        const attivi = base.filter(b => b.stato !== 'Annullato');
        const somma = (arr, k) => M.arrotonda(arr.reduce((s, b) => s + (Number(b[k]) || 0), 0));
        let riga = 4;

        function sezione(testo) {
            ws.mergeCells(riga, 1, riga, 8);
            const c = ws.getCell(riga, 1);
            c.value = testo;
            c.font = { name: FONT, size: 11, bold: true, color: { argb: COLORI.bianco } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORI.medio } };
            c.alignment = { vertical: 'middle', indent: 1 };
            ws.getRow(riga).height = 20;
            riga++;
        }

        function intestazioni(titoli) {
            titoli.forEach((t, i) => {
                const c = ws.getCell(riga, i + 1);
                c.value = t;
                stileIntestazione(c);
                if (i === 0) c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            });
            riga++;
        }

        function cella(col, valore, fmt, opz) {
            const c = ws.getCell(riga, col);
            c.value = valore;
            c.font = Object.assign({ name: FONT, size: 10 }, (opz && opz.font) || {});
            if (fmt) c.numFmt = fmt;
            c.alignment = { horizontal: col === 1 ? 'left' : 'right', indent: col === 1 ? 1 : 0 };
            c.border = { bottom: { style: 'hair', color: { argb: COLORI.bordo } } };
            return c;
        }

        /* --- indicatori --- */
        sezione('Indicatori principali');
        const rif = {};
        const kpi = [
            ['ordiniTot', 'Ordini totali', { formula: `COUNTA(${R('codice')})`, result: base.length }, FMT.intero],
            ['attivi', 'Ordini attivi', { formula: `COUNTIF(${R('stato')},"<>Annullato")-COUNTBLANK(${R('stato')})`, result: attivi.length }, FMT.intero],
            ['annullati', 'Ordini annullati', { formula: `COUNTIF(${R('stato')},"Annullato")`, result: base.length - attivi.length }, FMT.intero],
            ['pezzi', 'Pezzi prenotati', { formula: `SUMIFS(${R('pezzi')},${R('stato')},"<>Annullato")`, result: somma(attivi, 'pezzi') }, FMT.intero],
            ['minimo', 'Donazioni minime', { formula: `SUMIFS(${R('minimo')},${R('stato')},"<>Annullato")`, result: somma(attivi, 'minimo') }, FMT.euro],
            ['offerte', 'Totale offerte', { formula: `SUMIFS(${R('offerta')},${R('stato')},"<>Annullato")`, result: somma(attivi, 'offerta') }, FMT.euro, { bold: true }],
            ['extra', 'Donato oltre il minimo', null, FMT.euro, { color: { argb: COLORI.verde } }],
            ['incassato', 'Già incassato', { formula: `SUMIFS(${R('offerta')},${R('stato')},"<>Annullato",${R('pagato')},"Sì")`, result: somma(attivi.filter(b => b.pagato === 'Sì'), 'offerta') }, FMT.euro, { color: { argb: COLORI.verde } }],
            ['daIncassare', 'Ancora da incassare', null, FMT.euro, { color: { argb: COLORI.rosso } }],
            ['percInc', 'Percentuale incassata', null, FMT.perc],
            ['ticket', 'Offerta media per ordine', null, FMT.euro],
            ['clienti', 'Sostenitori (email distinte)', new Set(attivi.map(b => (b.email || b.cliente).toLowerCase())).size, FMT.intero],
            ['ricevute', 'Ricevute richieste', { formula: `COUNTIFS(${R('ricevuta')},"Sì",${R('stato')},"<>Annullato")`, result: attivi.filter(b => b.ricevuta === 'Sì').length }, FMT.intero],
            ['ritiri', 'Ritiri assegnati', { formula: `COUNTIFS(${R('ritiro')},">0",${R('stato')},"<>Annullato")`, result: attivi.filter(b => b.ritiro).length }, FMT.intero],
            ['marketing', 'Consensi per campagne future', { formula: `COUNTIFS(${R('marketing')},"Sì",${R('stato')},"<>Annullato")`, result: attivi.filter(b => b.marketing === 'Sì').length }, FMT.intero]
        ];
        intestazioni(['Voce', 'Valore']);
        kpi.forEach(k => {
            rif[k[0]] = 'B' + riga;
            cella(1, k[1]);
            let v = k[2];
            const tot = somma(attivi, 'offerta'), min = somma(attivi, 'minimo');
            const inc = somma(attivi.filter(b => b.pagato === 'Sì'), 'offerta');
            if (k[0] === 'extra') v = { formula: `${rif.offerte}-${rif.minimo}`, result: M.arrotonda(tot - min) };
            if (k[0] === 'daIncassare') v = { formula: `${rif.offerte}-${rif.incassato}`, result: M.arrotonda(tot - inc) };
            if (k[0] === 'percInc') v = { formula: `IFERROR(${rif.incassato}/${rif.offerte},0)`, result: tot ? inc / tot : 0 };
            if (k[0] === 'ticket') v = { formula: `IFERROR(${rif.offerte}/${rif.attivi},0)`, result: attivi.length ? tot / attivi.length : 0 };
            cella(2, v, k[3], { font: Object.assign({ bold: true }, k[4] || {}) });
            riga++;
        });
        riga++;

        /* --- per prodotto --- */
        sezione('Prodotti');
        intestazioni(['Prodotto', 'Minimo cad.', 'Disponibili', 'Prenotati', 'Residui', '% impegnato', 'Donazioni minime', 'Offerte (quota)']);
        const primaProd = riga;
        prodotti.forEach(pr => {
            const nome = pr.nome;
            const prenotati = attivi.reduce((s, b) => s + (b['q_' + pr.chiave] || 0), 0);
            const stock = parseInt(pr.stock, 10) || 0;
            const filtro = `${RR('D')},"${String(nome).replace(/"/g, '""')}",${RR('I')},"<>Annullato"`;
            cella(1, ((pr.emoji ? pr.emoji + ' ' : '') + (pr.plurale || nome)), null, { font: { bold: true } });
            cella(2, Number(pr.donazioneMinima) || 0, FMT.euro);
            cella(3, stock, FMT.intero);
            cella(4, { formula: `SUMIFS(${RR('E')},${filtro})`, result: prenotati }, FMT.intero);
            const res = cella(5, { formula: `C${riga}-D${riga}`, result: stock - prenotati }, FMT.intero);
            if (stock - prenotati < 0) res.font = { name: FONT, size: 10, bold: true, color: { argb: COLORI.rosso } };
            cella(6, { formula: `IFERROR(D${riga}/C${riga},0)`, result: stock ? prenotati / stock : 0 }, FMT.perc);
            cella(7, { formula: `SUMIFS(${RR('G')},${filtro})`, result: 0 }, FMT.euro);
            cella(8, { formula: `SUMIFS(${RR('H')},${filtro})`, result: 0 }, FMT.euro);
            riga++;
        });
        if (prodotti.length) {
            const ultimaProd = riga - 1;
            cella(1, 'Totale');
            [3, 4, 5, 7, 8].forEach(col => {
                const L = lettera(col);
                cella(col, { formula: `SUM(${L}${primaProd}:${L}${ultimaProd})` }, col >= 7 ? FMT.euro : FMT.intero);
            });
            cella(6, { formula: `IFERROR(D${riga}/C${riga},0)` }, FMT.perc);
            for (let col = 1; col <= 8; col++) stileTotale(ws.getCell(riga, col));
            riga++;
        }
        riga++;

        /* --- per stato --- */
        sezione('Ordini per stato');
        intestazioni(['Stato', 'Ordini', 'Pezzi', 'Offerte']);
        M.STATI.forEach(st => {
            const c1 = cella(1, st);
            const col = COLORI_STATO[st];
            if (col) c1.font = { name: FONT, size: 10, bold: true, color: { argb: col[1] } };
            cella(2, { formula: `COUNTIF(${R('stato')},"${st}")` }, FMT.intero);
            cella(3, { formula: `SUMIFS(${R('pezzi')},${R('stato')},"${st}")` }, FMT.intero);
            cella(4, { formula: `SUMIFS(${R('offerta')},${R('stato')},"${st}")` }, FMT.euro);
            riga++;
        });
        riga++;

        /* --- per metodo --- */
        sezione('Incassi per metodo di pagamento');
        intestazioni(['Metodo', 'Ordini pagati', 'Importo', 'Quota']);
        const metodi = ['Contanti', 'Bonifico', 'POS / Carta', 'Non indicato'];
        const primaMet = riga;
        metodi.forEach(m => {
            cella(1, m);
            cella(2, { formula: `COUNTIFS(${R('metodo')},"${m}",${R('pagato')},"Sì",${R('stato')},"<>Annullato")` }, FMT.intero);
            cella(3, { formula: `SUMIFS(${R('offerta')},${R('metodo')},"${m}",${R('pagato')},"Sì",${R('stato')},"<>Annullato")` }, FMT.euro);
            cella(4, { formula: `IFERROR(C${riga}/${rif.incassato},0)` }, FMT.perc);
            riga++;
        });
        cella(1, 'Totale');
        cella(2, { formula: `SUM(B${primaMet}:B${riga - 1})` }, FMT.intero);
        cella(3, { formula: `SUM(C${primaMet}:C${riga - 1})` }, FMT.euro);
        cella(4, { formula: `IFERROR(C${riga}/${rif.incassato},0)` }, FMT.perc);
        for (let col = 1; col <= 4; col++) stileTotale(ws.getCell(riga, col));
        riga += 2;

        /* --- note --- */
        const note = [
            'Come leggere il file',
            '• Ogni foglio ha una riga «Totali righe visibili»: usa i filtri delle intestazioni e i totali si aggiornano da soli.',
            '• «Righe prodotto» ha una riga per ogni dolce ordinato: è il foglio da usare per le tabelle pivot.',
            '• «Da consegnare» è pronto da stampare per i giorni di ritiro, con le colonne per la spunta e la firma.',
            '• La «quota dell\'offerta» ripartisce ogni offerta fra i dolci in proporzione alla loro donazione minima.',
            x.admin ? '• Il foglio «Ricevute» contiene dati personali riservati: non inoltrarlo fuori dall\'associazione.'
                    : '• I dati fiscali (codice fiscale e residenza) sono esclusi: l\'export completo è riservato all\'Administrator.'
        ];
        note.forEach((t, i) => {
            ws.mergeCells(riga, 1, riga, 8);
            const c = ws.getCell(riga, 1);
            c.value = t;
            c.font = { name: FONT, size: i === 0 ? 10 : 9, bold: i === 0, color: { argb: i === 0 ? COLORI.scuro : COLORI.testoTenue } };
            riga++;
        });
    }

    /* ======================================================
       BROWSER
       ====================================================== */

    function esportaExcel() {
        if (typeof ExcelJS === 'undefined') return alert('Libreria Excel non caricata: controlla la connessione e ricarica la pagina.');
        const ordini = (typeof datiGlobali !== 'undefined') ? datiGlobali : [];
        if (!ordini.length) return alert('Nessun ordine da esportare per questa campagna.');

        const campagna = (typeof campagnaSel === 'function') ? campagnaSel() : null;
        const admin = (typeof isAdmin === 'function') && isAdmin();
        const utente = (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? utenteCorrente.email : '';

        let wb;
        try {
            wb = costruisciWorkbook(ExcelJS, {
                ordini: ordini, campagna: campagna, admin: admin, utente: utente,
                generali: (typeof generaliGlobali !== 'undefined') ? generaliGlobali : null
            });
        } catch (e) {
            console.error(e);
            return alert('Preparazione del file non riuscita: ' + e.message);
        }

        const nome = 'WonderLAD_' + M.slug((campagna && campagna.nome) || 'ordini') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        wb.xlsx.writeBuffer().then(buf => {
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nome;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            if (typeof scriviLog === 'function') scriviLog('EXPORT', `Excel ${admin ? 'completo' : 'senza dati fiscali'}: ${ordini.length} ordini (${(campagna && campagna.nome) || ''})`);
        }).catch(e => alert('Scrittura del file non riuscita: ' + e.message));
    }

    radice.esportaExcel = esportaExcel;
    radice.costruisciWorkbookOrdini = costruisciWorkbook;
    if (typeof module !== 'undefined' && module.exports) module.exports = { costruisciWorkbook };

})(typeof window !== 'undefined' ? window : globalThis);
