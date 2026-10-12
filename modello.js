// WonderLAD - modello dati condiviso.
// Campagne, prodotti, ordini, modelli di messaggio e aggregazione.
// Usato da index.html, gestione.html, dashboard.js, report.js ed export.js.
// Non dipende da Firebase: si puo' caricare e testare anche in Node.

(function (radice) {
    'use strict';

    /* ======================================================
       VALORI PREDEFINITI
       ====================================================== */

    const DONAZIONE_MINIMA_DEFAULT = 19.5;

    const CAMPAGNE_DEFAULT = {
        'natale-2026': {
            nome: 'Natale 2026',
            stagione: 'natale',
            ordiniAperti: true,
            titoloForm: 'Prenota i tuoi dolci di Natale',
            sottotitoloForm: 'Sostieni i nostri progetti con dolcezza',
            prodotti: {
                panettone: {
                    ordine: 1, nome: 'Panettone', plurale: 'Panettoni', emoji: '🥮',
                    descrizione: 'Panettone artigianale classico.',
                    peso: '1 kg', ingredienti: '', allergeni: 'Glutine, uova, latte. Può contenere frutta a guscio.',
                    donazioneMinima: DONAZIONE_MINIMA_DEFAULT, stock: 500, attivo: true
                },
                pandoro: {
                    ordine: 2, nome: 'Pandoro', plurale: 'Pandori', emoji: '🍞',
                    descrizione: 'Pandoro artigianale.',
                    peso: '1 kg', ingredienti: '', allergeni: 'Glutine, uova, latte.',
                    donazioneMinima: DONAZIONE_MINIMA_DEFAULT, stock: 500, attivo: true
                }
            }
        },
        'pasqua-2027': {
            nome: 'Pasqua 2027',
            stagione: 'pasqua',
            ordiniAperti: false,
            titoloForm: 'Prenota la tua colomba di Pasqua',
            sottotitoloForm: 'Sostieni i nostri progetti con dolcezza',
            prodotti: {
                colomba: {
                    ordine: 1, nome: 'Colomba', plurale: 'Colombe', emoji: '🕊️',
                    descrizione: 'Colomba artigianale classica.',
                    peso: '1 kg', ingredienti: '', allergeni: 'Glutine, uova, latte, frutta a guscio.',
                    donazioneMinima: DONAZIONE_MINIMA_DEFAULT, stock: 300, attivo: true
                }
            }
        }
    };

    const GENERALI_DEFAULT = {
        campagnaAttiva: 'natale-2026',
        contattiEmergenza: '',
        referenti: ['Federica', 'Monica'],
        luoghi: [],
        privacy: {
            titolare: 'WonderLAD',
            cfEnte: '',
            sede: '',
            emailPrivacy: '',
            conservazione: 'I dati dell’ordine sono conservati per il tempo necessario a gestire la campagna e comunque non oltre 12 mesi dalla sua chiusura. I dati necessari al rilascio della ricevuta sono conservati per 10 anni, come previsto dagli obblighi di legge.',
            testoAggiuntivo: '',
            versione: 1
        }
    };

    const MODELLI_DEFAULT = {
        conferma: {
            titolo: 'Conferma prenotazione',
            oggetto: 'La tua prenotazione WonderLAD',
            testo: 'Ciao {nome}, grazie di cuore! Hai prenotato {riepilogo} per la campagna {campagna}.\n' +
                   'Codice prenotazione: {codice}\nOfferta: {offerta}\n' +
                   'Ti avviseremo quando potrai ritirarli.\n\nPer urgenze: {contattiEmergenza}'
        },
        ritiro: {
            titolo: 'Appuntamento per il ritiro',
            oggetto: 'Ritiro dei tuoi dolci WonderLAD',
            testo: 'Ciao {nome}, puoi venire a prendere {riepilogo} {dataRitiro} alle {oraRitiro} presso {luogo}. ' +
                   'Chiedi di {referente}.\nCodice prenotazione: {codice}\n\nPer urgenze: {contattiEmergenza}'
        },
        pronto: {
            titolo: 'Ordine pronto',
            oggetto: 'Il tuo ordine WonderLAD è pronto',
            testo: 'Ciao {nome}, il tuo ordine è pronto! Ti ricordiamo di venire a recuperare {riepilogo} ' +
                   '{quandoRitiro}.\nCodice prenotazione: {codice}\n\nPer urgenze: {contattiEmergenza}'
        },
        sollecito: {
            titolo: 'Promemoria offerta',
            oggetto: 'Promemoria per la tua prenotazione WonderLAD',
            testo: 'Ciao {nome}, ti ricordiamo che per la prenotazione {codice} ({riepilogo}) risulta ancora da saldare ' +
                   'l’offerta di {offerta}. Puoi farlo al momento del ritiro.\n\nPer informazioni: {contattiEmergenza}'
        }
    };

    const SEGNAPOSTO = ['nome', 'cognome', 'codice', 'riepilogo', 'offerta', 'campagna',
                        'dataRitiro', 'oraRitiro', 'luogo', 'referente', 'quandoRitiro', 'contattiEmergenza'];

    const STATI = ['Prenotato - Da Pagare', 'Prenotato - Pagato', 'In Preparazione',
                   'Da Consegnare', 'Consegnato', 'Annullato'];

    const METODI = ['-', 'Cash', 'Bonifico', 'POS'];
    const NOMI_METODI = { '-': 'Non indicato', Cash: 'Contanti', Bonifico: 'Bonifico', POS: 'POS / Carta' };

    /* ======================================================
       UTILITA'
       ====================================================== */

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function arrotonda(n) {
        return Math.round((Number(n) || 0) * 100) / 100;
    }

    function euro(n) {
        return '€ ' + arrotonda(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function euroTondo(n) {
        return '€ ' + Math.round(Number(n) || 0).toLocaleString('it-IT');
    }

    function slug(testo) {
        return String(testo || '').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    }

    function dataDi(o) {
        if (!o || !o.timestamp) return null;
        if (typeof o.timestamp.toDate === 'function') return o.timestamp.toDate();
        if (o.timestamp instanceof Date) return o.timestamp;
        return null;
    }

    /* ======================================================
       CAMPAGNE E PRODOTTI
       ====================================================== */

    function prodottiOrdinati(campagna, soloAttivi) {
        const mappa = (campagna && campagna.prodotti) || {};
        return Object.keys(mappa)
            .map(k => Object.assign({ chiave: k }, mappa[k]))
            .filter(p => !soloAttivi || p.attivo !== false)
            .sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
    }

    function prodotto(campagna, chiave) {
        const p = campagna && campagna.prodotti && campagna.prodotti[chiave];
        if (p) return Object.assign({ chiave: chiave }, p);
        // Prodotti dei vecchi ordini, prima delle campagne.
        const legacy = { panettone: ['Panettone', 'Panettoni', '🥮'], pandoro: ['Pandoro', 'Pandori', '🍞'], colomba: ['Colomba', 'Colombe', '🕊️'] }[chiave];
        return {
            chiave: chiave,
            nome: legacy ? legacy[0] : chiave,
            plurale: legacy ? legacy[1] : chiave,
            emoji: legacy ? legacy[2] : '',
            donazioneMinima: DONAZIONE_MINIMA_DEFAULT,
            stock: 0
        };
    }

    // Il minimo piu' basso fra i prodotti attivi: le rules lo usano come soglia.
    function minimoPerPezzo(campagna) {
        const valori = prodottiOrdinati(campagna, true).map(p => Number(p.donazioneMinima) || 0);
        return valori.length ? Math.min.apply(null, valori) : 0;
    }

    /* ======================================================
       ORDINI
       ====================================================== */

    // Righe dell'ordine. I vecchi ordini (panettoni/pandori come campi fissi)
    // vengono letti come righe al volo.
    function righeOrdine(o) {
        if (o && Array.isArray(o.righe)) {
            return o.righe
                .map(r => ({
                    prodotto: String(r.prodotto || ''),
                    quantita: parseInt(r.quantita, 10) || 0,
                    minimo: Number(r.minimo)
                }))
                .filter(r => r.prodotto && r.quantita > 0);
        }
        const righe = [];
        const pan = parseInt(o && o.panettoni, 10) || 0;
        const pand = parseInt(o && o.pandori, 10) || 0;
        if (pan > 0) righe.push({ prodotto: 'panettone', quantita: pan, minimo: NaN });
        if (pand > 0) righe.push({ prodotto: 'pandoro', quantita: pand, minimo: NaN });
        return righe;
    }

    function pezziOrdine(o) {
        return righeOrdine(o).reduce((s, r) => s + r.quantita, 0);
    }

    function minimoRiga(r, campagna) {
        if (Number.isFinite(r.minimo)) return r.minimo;
        return Number(prodotto(campagna, r.prodotto).donazioneMinima) || 0;
    }

    function minimoOrdine(o, campagna) {
        if (o && Number.isFinite(Number(o.minimoTotale)) && o.minimoTotale !== '' && o.minimoTotale != null) {
            return Number(o.minimoTotale);
        }
        return arrotonda(righeOrdine(o).reduce((s, r) => s + r.quantita * minimoRiga(r, campagna), 0));
    }

    function offertaOrdine(o, campagna) {
        const v = Number(o && o.offerta);
        if (o && o.offerta !== '' && o.offerta != null && Number.isFinite(v)) return v;
        return minimoOrdine(o, campagna);
    }

    function riepilogoRighe(o, campagna) {
        const parti = righeOrdine(o).map(r => {
            const p = prodotto(campagna, r.prodotto);
            const nome = r.quantita === 1 ? p.nome : (p.plurale || p.nome);
            return r.quantita + ' ' + String(nome).toLowerCase();
        });
        if (parti.length <= 1) return parti.join('');
        return parti.slice(0, -1).join(', ') + ' e ' + parti[parti.length - 1];
    }

    function bucketLogistico(status) {
        const s = String(status || '').toLowerCase();
        if (s.includes('annullato')) return 'annullato';
        if (s.includes('consegnato') && !s.includes('da consegnare')) return 'consegnato';
        if (s.includes('da consegnare')) return 'da_consegnare';
        if (s.includes('preparazione')) return 'preparazione';
        return 'prenotato';
    }

    // Pagato se lo stato lo dice, se l'ordine e' consegnato, oppure se e'
    // registrato un metodo di pagamento (un ordine "Da Consegnare" puo' essere gia' saldato).
    function bucketPagamento(status, metodo) {
        const s = String(status || '').toLowerCase();
        if (s.includes('annullato')) return null;
        if (metodo && metodo !== '-') return 'pagato';
        if (s.includes('da pagare')) return 'da_pagare';
        if (s.includes('pagato') || bucketLogistico(status) === 'consegnato') return 'pagato';
        return 'da_pagare';
    }

    function pagato(o) {
        return bucketPagamento(o && o.status, o && o.metodoPagamento) === 'pagato';
    }

    function nomeCompleto(o) {
        return ((o && o.nome || '') + ' ' + (o && o.cognome || '')).trim() || '—';
    }

    /* ======================================================
       RITIRO
       ====================================================== */

    // ritiro.data e' una stringa "AAAA-MM-GGTHH:MM" (input datetime-local).
    function dataRitiro(o) {
        const v = o && o.ritiro && o.ritiro.data;
        if (!v) return null;
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }

    function testoGiorno(d) {
        return d ? d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    }

    function testoOra(d) {
        return d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
    }

    /* ======================================================
       TELEFONO E CODICE FISCALE
       ====================================================== */

    function telefonoInternazionale(tel) {
        let t = String(tel || '').replace(/\D/g, '');
        if (t.startsWith('00')) return t.slice(2);
        if (t.length >= 11 && t.startsWith('39')) return t;
        return t ? '39' + t : '';
    }

    const CF_DISPARI = {
        '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
        A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
        N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23
    };

    function normalizzaCF(cf) {
        return String(cf || '').toUpperCase().replace(/\s/g, '');
    }

    // Controllo formale con carattere di controllo; accetta l'omocodia.
    function validaCodiceFiscale(cf) {
        const c = normalizzaCF(cf);
        if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(c)) return false;
        let somma = 0;
        for (let i = 0; i < 15; i++) {
            const ch = c[i];
            if (i % 2 === 0) {
                somma += CF_DISPARI[ch];
            } else {
                somma += /[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
            }
        }
        return String.fromCharCode(65 + (somma % 26)) === c[15];
    }

    function validaEmail(e) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
    }

    /* ======================================================
       MODELLI DI MESSAGGIO
       ====================================================== */

    function valoriSegnaposto(o, campagna, generali) {
        const d = dataRitiro(o);
        const r = (o && o.ritiro) || {};
        const quando = d
            ? testoGiorno(d) + ' alle ' + testoOra(d) + (r.luogo ? ' presso ' + r.luogo : '') + (r.referente ? ' (chiedi di ' + r.referente + ')' : '')
            : 'appena possibile';
        return {
            nome: (o && o.nome) || '',
            cognome: (o && o.cognome) || '',
            codice: (o && o.codice) || '',
            riepilogo: riepilogoRighe(o, campagna),
            offerta: euro(offertaOrdine(o, campagna)),
            campagna: (campagna && campagna.nome) || '',
            dataRitiro: d ? testoGiorno(d) : 'in data da concordare',
            oraRitiro: d ? testoOra(d) : 'orario da concordare',
            luogo: r.luogo || 'la nostra sede',
            referente: r.referente || 'un volontario',
            quandoRitiro: quando,
            contattiEmergenza: ((generali && generali.contattiEmergenza) || '').trim() || 'rispondi a questo messaggio'
        };
    }

    function compilaModello(testo, o, campagna, generali) {
        const v = valoriSegnaposto(o, campagna, generali);
        return String(testo || '').replace(/\{(\w+)\}/g, (tutto, k) => (k in v ? v[k] : tutto));
    }

    /* ======================================================
       AGGREGAZIONE (dashboard, PDF, Excel)
       ====================================================== */

    function nelPeriodo(o, periodo, ora) {
        if (!periodo || periodo === 'tutto') return true;
        const d = dataDi(o);
        if (!d) return false;
        ora = ora || new Date();
        if (periodo === 'mese') return d.getFullYear() === ora.getFullYear() && d.getMonth() === ora.getMonth();
        return (ora - d) <= parseInt(periodo, 10) * 86400000;
    }

    // filtri.prodotto: 'TUTTI' oppure la chiave di un prodotto. Con un prodotto
    // selezionato l'offerta viene ripartita in proporzione ai minimi delle righe.
    function aggrega(ordini, campagna, filtri) {
        filtri = filtri || {};
        const filtroProdotto = filtri.prodotto && filtri.prodotto !== 'TUTTI' ? filtri.prodotto : null;
        const vuotoStati = () => ({ prenotato: 0, preparazione: 0, da_consegnare: 0, consegnato: 0, annullato: 0 });

        const a = {
            campagna: campagna || null,
            prodotti: prodottiOrdinati(campagna),
            filtri: { prodotto: filtroProdotto || 'TUTTI', periodo: filtri.periodo || 'tutto' },
            perProdotto: {},
            stati: vuotoStati(), statiPezzi: vuotoStati(), statiImporto: vuotoStati(),
            metodi: {}, perGiorno: {}, classifica: {},
            incassato: 0, daIncassare: 0, valoreTotale: 0, minimoTotale: 0, extra: 0,
            pezziTotali: 0, ordiniTotali: 0, ordiniAttivi: 0, pagati: 0, ordiniDaIncassare: 0,
            ricevute: 0, ritiriProgrammati: 0, consensiMarketing: 0,
            clienti: new Set(), ultimi: [], daFare: []
        };

        // Anche i prodotti che compaiono solo negli ordini hanno la loro voce.
        a.prodotti.forEach(p => { a.perProdotto[p.chiave] = { pezzi: 0, minimo: 0, offerta: 0, ordini: 0 }; });

        (ordini || []).filter(o => nelPeriodo(o, filtri.periodo)).forEach(o => {
            const righeTutte = righeOrdine(o);
            const righe = filtroProdotto ? righeTutte.filter(r => r.prodotto === filtroProdotto) : righeTutte;
            const pezzi = righe.reduce((s, r) => s + r.quantita, 0);
            if (pezzi <= 0) return;

            const minimoTutto = righeTutte.reduce((s, r) => s + r.quantita * minimoRiga(r, campagna), 0);
            const minimoQui = righe.reduce((s, r) => s + r.quantita * minimoRiga(r, campagna), 0);
            const offertaTutta = offertaOrdine(o, campagna);
            const quota = minimoTutto > 0 ? minimoQui / minimoTutto : (righeTutte.length ? pezzi / pezziOrdine(o) : 1);
            const importo = arrotonda(offertaTutta * quota);

            const bl = bucketLogistico(o.status);
            const bp = bucketPagamento(o.status, o.metodoPagamento);

            a.ordiniTotali++;
            a.stati[bl]++;
            a.statiPezzi[bl] += pezzi;
            a.statiImporto[bl] += importo;
            a.ultimi.push(o);

            if (bl === 'annullato') return;

            a.ordiniAttivi++;
            a.pezziTotali += pezzi;
            a.valoreTotale += importo;
            a.minimoTotale += minimoQui;
            a.clienti.add((String(o.email || '') || (String(o.nome || '') + '|' + String(o.telefono || ''))).toLowerCase());
            if (o.ricevuta) a.ricevute++;
            if (o.consensoMarketing) a.consensiMarketing++;
            if (dataRitiro(o)) a.ritiriProgrammati++;

            righe.forEach(r => {
                if (!a.perProdotto[r.prodotto]) a.perProdotto[r.prodotto] = { pezzi: 0, minimo: 0, offerta: 0, ordini: 0 };
                const pp = a.perProdotto[r.prodotto];
                const minR = r.quantita * minimoRiga(r, campagna);
                pp.pezzi += r.quantita;
                pp.minimo += minR;
                pp.offerta += minimoTutto > 0 ? offertaTutta * (minR / minimoTutto) : 0;
                pp.ordini++;
            });

            if (bp === 'pagato') {
                a.pagati++;
                a.incassato += importo;
                const m = NOMI_METODI[o.metodoPagamento] || o.metodoPagamento || 'Non indicato';
                a.metodi[m] = (a.metodi[m] || 0) + importo;
            } else {
                a.ordiniDaIncassare++;
                a.daIncassare += importo;
                a.daFare.push({ ordine: o, motivo: 'da incassare' });
            }
            if (bl === 'da_consegnare') a.daFare.push({ ordine: o, motivo: 'da consegnare' });

            const d = dataDi(o);
            if (d) {
                const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                if (!a.perGiorno[k]) a.perGiorno[k] = { ordini: 0, pezzi: 0, incasso: 0 };
                a.perGiorno[k].ordini++;
                a.perGiorno[k].pezzi += pezzi;
                a.perGiorno[k].incasso += importo;
            }

            const nome = nomeCompleto(o);
            if (!a.classifica[nome]) a.classifica[nome] = { pezzi: 0, importo: 0 };
            a.classifica[nome].pezzi += pezzi;
            a.classifica[nome].importo += importo;
        });

        Object.keys(a.perProdotto).forEach(k => {
            const pp = a.perProdotto[k];
            pp.chiave = k;
            pp.offerta = arrotonda(pp.offerta);
            pp.minimo = arrotonda(pp.minimo);
            const p = prodotto(campagna, k);
            pp.stock = parseInt(p.stock, 10) || 0;
            pp.nome = p.nome;
            pp.plurale = p.plurale || p.nome;
            pp.emoji = p.emoji || '';
            pp.donazioneMinima = Number(p.donazioneMinima) || 0;
        });

        const stockTot = Object.keys(a.perProdotto)
            .filter(k => !filtroProdotto || k === filtroProdotto)
            .reduce((s, k) => s + a.perProdotto[k].stock, 0);

        a.valoreTotale = arrotonda(a.valoreTotale);
        a.incassato = arrotonda(a.incassato);
        a.daIncassare = arrotonda(a.daIncassare);
        a.minimoTotale = arrotonda(a.minimoTotale);
        a.extra = arrotonda(a.valoreTotale - a.minimoTotale);
        a.stockTotale = stockTot;
        a.ticketMedio = a.ordiniAttivi ? arrotonda(a.valoreTotale / a.ordiniAttivi) : 0;
        a.pezziMedi = a.ordiniAttivi ? Math.round(a.pezziTotali / a.ordiniAttivi * 10) / 10 : 0;
        a.clientiUnici = a.clienti.size;
        a.daConsegnare = a.statiPezzi.prenotato + a.statiPezzi.preparazione + a.statiPezzi.da_consegnare;
        a.percConsegnato = a.ordiniAttivi ? Math.round(a.stati.consegnato / a.ordiniAttivi * 100) : 0;
        a.percPagato = a.ordiniAttivi ? Math.round(a.pagati / a.ordiniAttivi * 100) : 0;
        a.percStock = stockTot ? Math.round(a.pezziTotali / stockTot * 100) : 0;
        a.ultimi.sort((x, y) => (dataDi(y) || 0) - (dataDi(x) || 0));
        return a;
    }

    /* ======================================================
       ESPORTAZIONE DEL MODULO
       ====================================================== */

    const Modello = {
        DONAZIONE_MINIMA_DEFAULT, CAMPAGNE_DEFAULT, GENERALI_DEFAULT, MODELLI_DEFAULT,
        SEGNAPOSTO, STATI, METODI, NOMI_METODI,
        esc, arrotonda, euro, euroTondo, slug, dataDi,
        prodottiOrdinati, prodotto, minimoPerPezzo,
        righeOrdine, pezziOrdine, minimoRiga, minimoOrdine, offertaOrdine, riepilogoRighe,
        bucketLogistico, bucketPagamento, pagato, nomeCompleto,
        dataRitiro, testoGiorno, testoOra,
        telefonoInternazionale, normalizzaCF, validaCodiceFiscale, validaEmail,
        valoriSegnaposto, compilaModello,
        nelPeriodo, aggrega
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = Modello;
    radice.Modello = Modello;

})(typeof window !== 'undefined' ? window : globalThis);
