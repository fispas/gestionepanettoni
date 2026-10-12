// WonderLAD - impostazioni dell'Administrator.
// Campagne e prodotti, campagna attiva, ritiro, contatti di emergenza,
// informativa privacy, modelli dei messaggi, inizializzazione e migrazione.
// Usa lo stato globale di app.js (generaliGlobali, campagneGlobali, ...).

(function () {
    'use strict';

    const sporche = new Set();      // sezioni con modifiche non salvate
    let editor = null;              // { id, nuova, dati, prodotti: [...] }

    const STAGIONI = { natale: 'Natale', pasqua: 'Pasqua', altro: 'Altro' };

    /* ======================================================
       AGGIORNAMENTO DELLA VISTA
       ====================================================== */

    // Chiamata da app.js quando cambiano generali, modelli o campagne.
    window.aggiornaVistaImpostazioni = function () {
        if (!isAdmin()) return;
        disegnaElencoCampagne();
        riempiCampagnaAttiva();
        if (!sporche.has('ritiro')) {
            el('impReferenti').value = generaliGlobali.referenti.join('\n');
            el('impLuoghi').value = generaliGlobali.luoghi.join('\n');
        }
        if (!sporche.has('emergenza')) el('impEmergenza').value = generaliGlobali.contattiEmergenza;
        if (!sporche.has('privacy')) riempiPrivacy();
        if (!sporche.has('modelli')) disegnaModelli();
        if (el('view-impostazioni').classList.contains('active') && !window.__manutenzioneVerificata) {
            window.__manutenzioneVerificata = true;
            verificaManutenzione();
        }
    };

    function segnaSporca(sezione, ids) {
        ids.forEach(id => {
            const n = el(id);
            if (n) n.addEventListener('input', () => sporche.add(sezione));
        });
    }
    segnaSporca('ritiro', ['impReferenti', 'impLuoghi']);
    segnaSporca('emergenza', ['impEmergenza']);
    segnaSporca('privacy', ['impTitolare', 'impCfEnte', 'impSede', 'impEmailPrivacy', 'impConservazione', 'impPrivacyExtra']);

    el('elencoSegnaposto').innerHTML = Modello.SEGNAPOSTO.map(s => `<code>{${s}}</code>`).join(' ');

    function righe(testo) {
        return String(testo || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
    }

    function salvaGenerali(parziale, descrizione, sezione) {
        if (!isAdmin()) return Promise.resolve();
        return GENERALI_REF.set(parziale, { merge: true })
            .then(() => {
                if (sezione) sporche.delete(sezione);
                scriviLog("IMPOSTAZIONI", descrizione);
                avvisa('Salvato.');
            })
            .catch(err => alert("Salvataggio non riuscito: " + err.message));
    }

    function avvisa(testo) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = testo;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    /* ======================================================
       CAMPAGNA ATTIVA
       ====================================================== */

    function riempiCampagnaAttiva() {
        const sel = el('impCampagnaAttiva');
        const corrente = sel.value;
        sel.innerHTML = '';
        Object.keys(campagneGlobali).sort().forEach(id => {
            const c = campagneGlobali[id];
            const o = document.createElement('option');
            o.value = id;
            o.textContent = (c.nome || id) + (id === generaliGlobali.campagnaAttiva ? ' (attiva)' : '');
            sel.appendChild(o);
        });
        sel.value = corrente && campagneGlobali[corrente] ? corrente : generaliGlobali.campagnaAttiva;
    }

    window.impostaCampagnaAttiva = function () {
        const id = el('impCampagnaAttiva').value;
        const c = campagneGlobali[id];
        if (!c) return;
        if (id === generaliGlobali.campagnaAttiva) return avvisa('È già la campagna attiva.');
        if (!confirm(`Rendere attiva «${c.nome}»?\n\nIl modulo pubblico mostrerà da subito i suoi prodotti` +
                     (c.ordiniAperti === false ? ', ma le prenotazioni risultano chiuse: aprile dall\'editor della campagna.' : '.'))) return;
        salvaGenerali({ campagnaAttiva: id }, `Campagna attiva: ${c.nome} (${id})`)
            .then(() => selezionaCampagna(id));
    };

    /* ======================================================
       ELENCO CAMPAGNE
       ====================================================== */

    function disegnaElencoCampagne() {
        const box = el('elencoCampagne');
        const ids = Object.keys(campagneGlobali).sort();
        if (!ids.length) {
            box.innerHTML = '<p class="imp-aiuto">Nessuna campagna. Usa «Inizializza configurazione» in Manutenzione.</p>';
            return;
        }
        box.innerHTML = '';
        ids.forEach(id => {
            const c = campagneGlobali[id];
            const prodotti = Modello.prodottiOrdinati(c);
            const card = document.createElement('div');
            card.className = 'campagna-voce' + (id === generaliGlobali.campagnaAttiva ? ' attiva' : '');
            card.innerHTML = `
                <div>
                    <strong>${esc(c.nome || id)}</strong>
                    ${id === generaliGlobali.campagnaAttiva ? '<span class="pill pill-ok">attiva</span>' : ''}
                    <span class="pill ${c.ordiniAperti === false ? 'pill-ko' : 'pill-ok'}">${c.ordiniAperti === false ? 'prenotazioni chiuse' : 'prenotazioni aperte'}</span>
                    <div class="sotto">${esc(STAGIONI[c.stagione] || c.stagione || '')} · ${prodotti.map(p => esc((p.emoji || '') + ' ' + p.nome)).join(', ') || 'nessun prodotto'}</div>
                </div>
                <button class="btn-edit" type="button">Modifica</button>`;
            card.querySelector('button').addEventListener('click', () => window.apriEditorCampagna(id));
            box.appendChild(card);
        });
    }

    /* ======================================================
       EDITOR CAMPAGNA E PRODOTTI
       ====================================================== */

    window.apriEditorCampagna = function (id) {
        const c = campagneGlobali[id];
        if (!c) return;
        editor = {
            id: id,
            nuova: false,
            dati: Object.assign({}, c),
            prodotti: Modello.prodottiOrdinati(c).map(p => Object.assign({ esistente: true }, p))
        };
        disegnaEditor();
    };

    window.nuovaCampagna = function () {
        const nome = (prompt("Nome della nuova campagna (es. Pasqua 2027):") || '').trim();
        if (!nome) return;
        let id = Modello.slug(nome) || 'campagna';
        while (campagneGlobali[id]) id += '-2';
        const stagione = /pasqua|colomb/i.test(nome) ? 'pasqua' : (/natal/i.test(nome) ? 'natale' : 'altro');
        const modello = Object.values(Modello.CAMPAGNE_DEFAULT).find(x => x.stagione === stagione);
        editor = {
            id: id,
            nuova: true,
            dati: {
                nome: nome,
                stagione: stagione,
                ordiniAperti: false,
                titoloForm: modello ? modello.titoloForm : 'Prenota i tuoi dolci',
                sottotitoloForm: 'Sostieni i nostri progetti con dolcezza'
            },
            prodotti: modello ? Modello.prodottiOrdinati(modello).map(p => Object.assign({ esistente: false }, p)) : []
        };
        disegnaEditor();
    };

    function campoTesto(label, nome, valore, attr) {
        return `<div><label>${esc(label)}</label><input type="text" data-c="${nome}" value="${esc(valore || '')}" ${attr || ''}></div>`;
    }

    function disegnaEditor() {
        const box = el('editorCampagna');
        if (!editor) { box.style.display = 'none'; box.innerHTML = ''; return; }
        const d = editor.dati;

        box.innerHTML = `
            <div class="editor-testa">
                <h4>${editor.nuova ? 'Nuova campagna' : 'Modifica campagna'} <code>${esc(editor.id)}</code></h4>
            </div>
            <div class="imp-due">
                ${campoTesto('Nome', 'nome', d.nome, 'maxlength="60"')}
                <div><label>Stagione</label>
                    <select data-c="stagione">${Object.keys(STAGIONI).map(k =>
                        `<option value="${k}" ${d.stagione === k ? 'selected' : ''}>${STAGIONI[k]}</option>`).join('')}</select>
                </div>
                ${campoTesto('Titolo del modulo', 'titoloForm', d.titoloForm, 'maxlength="80"')}
                ${campoTesto('Sottotitolo del modulo', 'sottotitoloForm', d.sottotitoloForm, 'maxlength="120"')}
            </div>
            <label class="imp-check">
                <input type="checkbox" data-c="ordiniAperti" ${d.ordiniAperti === false ? '' : 'checked'}>
                <span>Prenotazioni aperte al pubblico (vale solo quando la campagna è attiva)</span>
            </label>

            <div class="editor-sez">Prodotti</div>
            <div id="editorProdotti"></div>
            <button class="btn-edit" type="button" id="btnAggiungiProdotto">➕ Aggiungi prodotto</button>

            <div class="imp-azioni">
                <button class="btn-action" type="button" id="btnSalvaCampagna">${editor.nuova ? 'Crea campagna' : 'Salva campagna'}</button>
                <button class="btn-edit" type="button" id="btnChiudiEditor">Chiudi senza salvare</button>
            </div>`;

        disegnaProdotti();
        box.querySelector('#btnAggiungiProdotto').addEventListener('click', () => {
            leggiEditor();
            editor.prodotti.push({
                esistente: false, chiave: '', nome: '', plurale: '', emoji: '',
                descrizione: '', peso: '', ingredienti: '', allergeni: '',
                donazioneMinima: Modello.DONAZIONE_MINIMA_DEFAULT, stock: 0, attivo: true
            });
            disegnaProdotti();
        });
        box.querySelector('#btnSalvaCampagna').addEventListener('click', salvaCampagna);
        box.querySelector('#btnChiudiEditor').addEventListener('click', () => { editor = null; disegnaEditor(); });

        box.style.display = 'block';
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function disegnaProdotti() {
        const box = el('editorProdotti');
        box.innerHTML = '';
        if (!editor.prodotti.length) {
            box.innerHTML = '<p class="imp-aiuto">Nessun prodotto: aggiungine almeno uno.</p>';
            return;
        }
        editor.prodotti.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'prodotto-ed' + (p.attivo === false ? ' spento' : '');
            div.dataset.i = i;
            div.innerHTML = `
                <div class="prodotto-ed-testa">
                    <strong>${esc((p.emoji || '') + ' ' + (p.nome || 'Nuovo prodotto'))}</strong>
                    ${p.esistente ? `<code>${esc(p.chiave)}</code>` : '<span class="pill">nuovo</span>'}
                    <span class="prodotto-ed-btn">
                        <button type="button" class="btn-mini" data-op="su" ${i === 0 ? 'disabled' : ''} title="Sposta su">▲</button>
                        <button type="button" class="btn-mini" data-op="giu" ${i === editor.prodotti.length - 1 ? 'disabled' : ''} title="Sposta giù">▼</button>
                        ${p.esistente ? '' : '<button type="button" class="btn-mini rosso" data-op="via" title="Rimuovi">✕</button>'}
                    </span>
                </div>
                <div class="prodotto-ed-griglia">
                    <div><label>Nome</label><input type="text" data-p="nome" value="${esc(p.nome)}" maxlength="40"></div>
                    <div><label>Plurale</label><input type="text" data-p="plurale" value="${esc(p.plurale)}" maxlength="40"></div>
                    <div><label>Emoji</label><input type="text" data-p="emoji" value="${esc(p.emoji)}" maxlength="4"></div>
                    <div><label>Donazione minima (€)</label><input type="number" data-p="donazioneMinima" value="${Number(p.donazioneMinima) || 0}" min="0" step="0.5"></div>
                    <div><label>Disponibili</label><input type="number" data-p="stock" value="${parseInt(p.stock, 10) || 0}" min="0"></div>
                    <div><label>Peso / formato</label><input type="text" data-p="peso" value="${esc(p.peso)}" maxlength="40"></div>
                </div>
                <label>Descrizione</label><textarea data-p="descrizione" rows="2" maxlength="400">${esc(p.descrizione)}</textarea>
                <div class="imp-due">
                    <div><label>Ingredienti</label><textarea data-p="ingredienti" rows="3" maxlength="800">${esc(p.ingredienti)}</textarea></div>
                    <div><label>Allergeni</label><textarea data-p="allergeni" rows="3" maxlength="400">${esc(p.allergeni)}</textarea></div>
                </div>
                <label class="imp-check"><input type="checkbox" data-p="attivo" ${p.attivo === false ? '' : 'checked'}>
                    <span>Prenotabile ${p.esistente ? '(i prodotti già usati negli ordini non si cancellano: si disattivano)' : ''}</span></label>`;
            div.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
                leggiEditor();
                const op = b.dataset.op;
                const arr = editor.prodotti;
                if (op === 'su' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                if (op === 'giu' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                if (op === 'via') arr.splice(i, 1);
                disegnaProdotti();
            }));
            box.appendChild(div);
        });
    }

    // Copia i valori dei campi nello stato dell'editor.
    function leggiEditor() {
        const box = el('editorCampagna');
        box.querySelectorAll('[data-c]').forEach(n => {
            editor.dati[n.dataset.c] = n.type === 'checkbox' ? n.checked : n.value.trim();
        });
        box.querySelectorAll('.prodotto-ed').forEach(div => {
            const p = editor.prodotti[parseInt(div.dataset.i, 10)];
            if (!p) return;
            div.querySelectorAll('[data-p]').forEach(n => {
                const k = n.dataset.p;
                if (n.type === 'checkbox') p[k] = n.checked;
                else if (k === 'donazioneMinima') p[k] = Modello.arrotonda(Number(n.value) || 0);
                else if (k === 'stock') p[k] = Math.max(0, parseInt(n.value, 10) || 0);
                else p[k] = n.value.trim();
            });
        });
    }

    function salvaCampagna() {
        leggiEditor();
        const d = editor.dati;
        if (!d.nome) return alert("Il nome della campagna è obbligatorio.");
        if (!editor.prodotti.length) return alert("Aggiungi almeno un prodotto.");

        const prodotti = {};
        const usate = new Set();
        for (let i = 0; i < editor.prodotti.length; i++) {
            const p = editor.prodotti[i];
            if (!p.nome) return alert(`Il prodotto n. ${i + 1} non ha un nome.`);
            let chiave = p.esistente ? p.chiave : (Modello.slug(p.nome) || 'prodotto');
            if (!p.esistente) { while (usate.has(chiave)) chiave += '-2'; }
            usate.add(chiave);
            prodotti[chiave] = {
                ordine: i + 1,
                nome: p.nome,
                plurale: p.plurale || p.nome,
                emoji: p.emoji || '',
                descrizione: p.descrizione || '',
                peso: p.peso || '',
                ingredienti: p.ingredienti || '',
                allergeni: p.allergeni || '',
                donazioneMinima: Modello.arrotonda(p.donazioneMinima),
                stock: parseInt(p.stock, 10) || 0,
                attivo: p.attivo !== false
            };
        }

        const doc = {
            nome: d.nome,
            stagione: d.stagione || 'altro',
            ordiniAperti: d.ordiniAperti !== false,
            titoloForm: d.titoloForm || '',
            sottotitoloForm: d.sottotitoloForm || '',
            prodotti: prodotti,
            minimoPezzo: Modello.minimoPerPezzo({ prodotti: prodotti }),
            aggiornato: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (!Object.values(prodotti).some(p => p.attivo)) {
            if (!confirm("Nessun prodotto è prenotabile: il modulo pubblico non mostrerà nulla. Salvare comunque?")) return;
        }

        campagnaRef(editor.id).set(doc)
            .then(() => {
                scriviLog("IMPOSTAZIONI", `${editor.nuova ? 'Creata' : 'Aggiornata'} campagna ${d.nome} (${editor.id}): ` +
                    Object.keys(prodotti).map(k => `${prodotti[k].nome} min ${prodotti[k].donazioneMinima}€ stock ${prodotti[k].stock}`).join('; '));
                avvisa(editor.nuova ? 'Campagna creata.' : 'Campagna salvata.');
                editor = null;
                disegnaEditor();
            })
            .catch(err => alert("Salvataggio non riuscito: " + err.message));
    }

    /* ======================================================
       RITIRO, EMERGENZA, PRIVACY
       ====================================================== */

    window.salvaRitiro = function () {
        const referenti = righe(el('impReferenti').value);
        const luoghi = righe(el('impLuoghi').value);
        salvaGenerali({ referenti: referenti, luoghi: luoghi },
            `Ritiro: referenti ${referenti.join(', ') || '—'}; luoghi ${luoghi.join(', ') || '—'}`, 'ritiro');
    };

    window.salvaEmergenza = function () {
        const t = el('impEmergenza').value.trim().slice(0, 500);
        salvaGenerali({ contattiEmergenza: t }, 'Contatti di emergenza aggiornati', 'emergenza');
    };

    function riempiPrivacy() {
        const p = generaliGlobali.privacy;
        el('impTitolare').value = p.titolare || '';
        el('impCfEnte').value = p.cfEnte || '';
        el('impSede').value = p.sede || '';
        el('impEmailPrivacy').value = p.emailPrivacy || '';
        el('impConservazione').value = p.conservazione || '';
        el('impPrivacyExtra').value = p.testoAggiuntivo || '';
        el('impPrivacyVersione').textContent = p.versione || 1;
        el('impPrivacyNuovaVersione').checked = false;
    }

    window.salvaPrivacy = function () {
        const attuale = parseInt(generaliGlobali.privacy.versione, 10) || 1;
        const nuova = el('impPrivacyNuovaVersione').checked ? attuale + 1 : attuale;
        const privacy = {
            titolare: el('impTitolare').value.trim(),
            cfEnte: el('impCfEnte').value.trim(),
            sede: el('impSede').value.trim(),
            emailPrivacy: el('impEmailPrivacy').value.trim(),
            conservazione: el('impConservazione').value.trim(),
            testoAggiuntivo: el('impPrivacyExtra').value.trim(),
            versione: nuova
        };
        salvaGenerali({ privacy: privacy }, `Informativa privacy aggiornata (versione ${nuova})`, 'privacy');
    };

    /* ======================================================
       MODELLI DEI MESSAGGI
       ====================================================== */

    function disegnaModelli() {
        const box = el('editorModelli');
        box.innerHTML = '';
        Object.keys(modelliGlobali).forEach(k => {
            const m = modelliGlobali[k];
            const div = document.createElement('div');
            div.className = 'modello-ed';
            div.innerHTML = `
                <div class="editor-sez">${esc(m.titolo || k)}</div>
                <label>Oggetto email</label>
                <input type="text" data-m="${esc(k)}" data-f="oggetto" value="${esc(m.oggetto || '')}" maxlength="150">
                <label>Testo</label>
                <textarea data-m="${esc(k)}" data-f="testo" rows="5" maxlength="1500">${esc(m.testo || '')}</textarea>`;
            div.querySelectorAll('input, textarea').forEach(n => n.addEventListener('input', () => sporche.add('modelli')));
            box.appendChild(div);
        });
    }

    window.salvaModelli = function () {
        const out = {};
        Object.keys(modelliGlobali).forEach(k => {
            out[k] = { titolo: modelliGlobali[k].titolo || k, oggetto: '', testo: '' };
        });
        el('editorModelli').querySelectorAll('[data-m]').forEach(n => {
            if (out[n.dataset.m]) out[n.dataset.m][n.dataset.f] = n.value;
        });
        MODELLI_REF.set(out)
            .then(() => {
                sporche.delete('modelli');
                scriviLog("IMPOSTAZIONI", 'Modelli dei messaggi aggiornati');
                avvisa('Modelli salvati.');
            })
            .catch(err => alert("Salvataggio non riuscito: " + err.message));
    };

    window.ripristinaModelli = function () {
        if (!confirm("Ripristinare i testi predefiniti di tutti i modelli?")) return;
        MODELLI_REF.set(JSON.parse(JSON.stringify(Modello.MODELLI_DEFAULT)))
            .then(() => {
                sporche.delete('modelli');
                scriviLog("IMPOSTAZIONI", 'Modelli dei messaggi ripristinati');
                avvisa('Modelli ripristinati.');
            })
            .catch(err => alert("Operazione non riuscita: " + err.message));
    };

    /* ======================================================
       MANUTENZIONE: INIZIALIZZAZIONE E MIGRAZIONE
       ====================================================== */

    window.verificaManutenzione = function () {
        if (!isAdmin()) return;
        const stato = el('statoManutenzione');
        stato.textContent = 'Verifica in corso…';

        Promise.all([
            GENERALI_REF.get(),
            MODELLI_REF.get(),
            db.collection("campagne").get(),
            db.collection("ordini").get()
        ]).then(([gen, mod, camp, ord]) => {
            const daMigrare = ord.docs.filter(d => !d.data().campagnaId).length;
            const parti = [];
            parti.push(gen.exists ? 'impostazioni generali presenti' : 'impostazioni generali da creare');
            parti.push(mod.exists ? 'modelli messaggi presenti' : 'modelli messaggi da creare');
            parti.push(camp.size ? `${camp.size} campagne` : 'nessuna campagna');
            parti.push(daMigrare ? `${daMigrare} ordini storici da migrare` : 'nessun ordine da migrare');
            parti.push(`${ord.size} ordini in totale`);
            stato.textContent = parti.join(' · ') + '.';

            const tuttoPresente = gen.exists && mod.exists && camp.size > 0;
            el('btnInizializza').disabled = tuttoPresente;
            el('btnMigra').disabled = !daMigrare || !camp.size;
        }).catch(err => { stato.textContent = 'Verifica non riuscita: ' + err.message; });
    };

    window.inizializzaConfigurazione = function () {
        if (!isAdmin()) return;
        if (!confirm("Creare la configurazione mancante?\n\nNon viene sovrascritto nulla di già esistente.")) return;

        STOCK_LEGACY_REF.get().then(legacyDoc => {
            const legacy = legacyDoc.exists ? legacyDoc.data() : {};
            const totPan = parseInt(legacy.totalePanettoni ?? legacy["Totale Panettoni"], 10);
            const totPand = parseInt(legacy.totalePandori ?? legacy["Totale Pandori"], 10);

            const lavori = Object.keys(Modello.CAMPAGNE_DEFAULT).map(id => campagnaRef(id).get().then(doc => {
                if (doc.exists) return null;
                const c = JSON.parse(JSON.stringify(Modello.CAMPAGNE_DEFAULT[id]));
                // La campagna di Natale eredita stock e apertura della versione precedente.
                if (id === 'natale-2026') {
                    if (Number.isFinite(totPan)) c.prodotti.panettone.stock = totPan;
                    if (Number.isFinite(totPand)) c.prodotti.pandoro.stock = totPand;
                    if (legacy.ordiniAperti === false) c.ordiniAperti = false;
                }
                c.minimoPezzo = Modello.minimoPerPezzo(c);
                c.aggiornato = firebase.firestore.FieldValue.serverTimestamp();
                return campagnaRef(id).set(c).then(() => id);
            }));

            lavori.push(GENERALI_REF.get().then(doc => doc.exists ? null
                : GENERALI_REF.set(JSON.parse(JSON.stringify(Modello.GENERALI_DEFAULT))).then(() => 'generali')));
            lavori.push(MODELLI_REF.get().then(doc => doc.exists ? null
                : MODELLI_REF.set(JSON.parse(JSON.stringify(Modello.MODELLI_DEFAULT))).then(() => 'modelli')));

            return Promise.all(lavori);
        }).then(creati => {
            const fatti = creati.filter(Boolean);
            scriviLog("IMPOSTAZIONI", 'Inizializzazione: ' + (fatti.join(', ') || 'nulla da creare'));
            avvisa(fatti.length ? 'Configurazione creata.' : 'Era già tutto presente.');
            window.verificaManutenzione();
        }).catch(err => alert("Inizializzazione non riuscita: " + err.message));
    };

    window.migraOrdiniStorici = function () {
        if (!isAdmin()) return;
        const destinazione = campagneGlobali['natale-2026'] ? 'natale-2026' : generaliGlobali.campagnaAttiva;
        if (!campagneGlobali[destinazione]) return alert("Prima inizializza la configurazione.");

        Promise.all([db.collection("ordini").get(), STOCK_LEGACY_REF.get()]).then(([snap, legacyDoc]) => {
            const legacy = legacyDoc.exists ? legacyDoc.data() : {};
            // Gli ordini storici mantengono il prezzo con cui erano stati presi.
            const prezzoPan = Number(legacy.prezzoPanettone) || 15;
            const prezzoPand = Number(legacy.prezzoPandoro) || 15;
            const daMigrare = snap.docs.filter(d => !d.data().campagnaId);

            if (!daMigrare.length) { avvisa('Nessun ordine da migrare.'); return null; }
            if (!confirm(`Migrare ${daMigrare.length} ordini nella campagna «${campagneGlobali[destinazione].nome}»?\n\n` +
                         `Prezzi storici applicati: panettone ${Modello.euro(prezzoPan)}, pandoro ${Modello.euro(prezzoPand)}.`)) return null;

            const gruppi = [];
            for (let i = 0; i < daMigrare.length; i += 400) gruppi.push(daMigrare.slice(i, i + 400));

            return Promise.all(gruppi.map(g => {
                const batch = db.batch();
                g.forEach(doc => {
                    const o = doc.data();
                    const righe = [];
                    const pan = parseInt(o.panettoni, 10) || 0;
                    const pand = parseInt(o.pandori, 10) || 0;
                    if (pan > 0) righe.push({ prodotto: 'panettone', quantita: pan, minimo: prezzoPan });
                    if (pand > 0) righe.push({ prodotto: 'pandoro', quantita: pand, minimo: prezzoPand });
                    const minimo = Modello.arrotonda(pan * prezzoPan + pand * prezzoPand);
                    batch.update(doc.ref, {
                        campagnaId: destinazione,
                        righe: righe,
                        pezzi: pan + pand,
                        minimoTotale: minimo,
                        offerta: Number.isFinite(Number(o.offerta)) && o.offerta !== '' && o.offerta != null ? Number(o.offerta) : minimo,
                        email: o.email || '',
                        note: o.note || '',
                        ricevuta: !!o.ricevuta,
                        cf: o.cf || '', indirizzo: o.indirizzo || '', cap: o.cap || '', comune: o.comune || '', provincia: o.provincia || '',
                        consensoPrivacy: !!o.consensoPrivacy,
                        privacyVersione: parseInt(o.privacyVersione, 10) || 0,
                        consensoMarketing: !!o.consensoMarketing,
                        ritiro: o.ritiro || { data: '', luogo: '', referente: '' },
                        status: o.status === 'Prenotato' ? 'Prenotato - Da Pagare' : (o.status || 'Prenotato - Da Pagare'),
                        metodoPagamento: o.metodoPagamento || '-',
                        migrato: true
                    });
                });
                return batch.commit();
            })).then(() => daMigrare.length);
        }).then(n => {
            if (!n) return;
            scriviLog("IMPOSTAZIONI", `Migrati ${n} ordini storici nella campagna ${destinazione}`);
            avvisa(`${n} ordini migrati.`);
            if (campagnaSelId !== destinazione) selezionaCampagna(destinazione);
            window.verificaManutenzione();
        }).catch(err => alert("Migrazione non riuscita: " + err.message));
    };

})();
