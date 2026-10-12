// WonderLAD - pannello di gestione.
// Auth, ruoli, campagne, ordini, ritiri, messaggi, staff e log.
// Le impostazioni dell'Administrator sono in impostazioni.js,
// la dashboard in dashboard.js, il PDF in report.js, l'Excel in export.js.

const M = Modello;

let datiGlobali = [];
let utentiGlobali = [];
let campagneGlobali = {};
let generaliGlobali = normalizzaGenerali(null);
let generaliEsiste = false;
let modelliGlobali = normalizzaModelli(null);
let campagnaSelId = null;
let utenteCorrente = { uid: "", email: "", ruolo: "" };
let filtroStatoAttuale = "Tutti";
let filtroLogCatAttuale = "Tutti";
let unsubscribers = [];
let unsubOrdini = null;
let selezionati = new Set();
let idsRitiro = [];

const el = (id) => document.getElementById(id);
const isAdmin = () => utenteCorrente.ruolo === 'Administrator';
const esc = M.esc;

function campagnaSel() {
    return campagneGlobali[campagnaSelId] || null;
}

function campagnaDi(o) {
    return campagneGlobali[o && o.campagnaId] || campagnaSel();
}

function formattaData(ts) {
    if (!ts || typeof ts.toDate !== 'function') return '-';
    const d = ts.toDate();
    return d.toLocaleDateString('it-IT') + ' ' +
           d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function scriviLog(categoria, dettaglio) {
    return db.collection("logs").add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        categoria: categoria,
        utente: utenteCorrente.email,
        dettaglio: String(dettaglio).slice(0, 500)
    }).catch(() => { /* il log non deve mai bloccare l'operazione */ });
}

/* ==========================================================
   AUTENTICAZIONE E RUOLI
   ========================================================== */

auth.onAuthStateChanged(user => {
    fermaAscolti();

    if (!user) {
        el('login-overlay').style.display = 'flex';
        el('main-container').style.display = 'none';
        return;
    }

    // Il ruolo si legge da /utenti/{uid}. Nessuna auto-promozione:
    // un account senza scheda non entra.
    db.collection("utenti").doc(user.uid).get().then(doc => {
        if (!doc.exists) {
            mostraErroreLogin("Account non abilitato. Chiedi a un amministratore di abilitarti.");
            auth.signOut();
            return;
        }

        utenteCorrente = {
            uid: user.uid,
            email: user.email,
            ruolo: doc.data().ruolo === 'Administrator' ? 'Administrator' : 'Manager'
        };

        el('login-overlay').style.display = 'none';
        el('main-container').style.display = 'block';
        el('user-badge').textContent = `${utenteCorrente.email.split('@')[0]} · ${utenteCorrente.ruolo}`;

        applicaPermessi();
        avviaAscoltoInTempoReale();
        scriviLog("LOGIN", "Accesso al pannello di gestione");
    }).catch(() => {
        mostraErroreLogin("Impossibile verificare i permessi. Riprova.");
        auth.signOut();
    });
});

function applicaPermessi() {
    document.querySelectorAll('.admin-only').forEach(node => {
        node.style.display = isAdmin() ? '' : 'none';
    });
}

function mostraErroreLogin(testo) {
    const errObj = el('login-err');
    errObj.textContent = testo;
    errObj.style.display = 'block';
}

function effettuaLogin() {
    const user = el('username').value.trim();
    const pass = el('passcode').value;
    const btn = el('btn-login');

    if (!user || !pass) return mostraErroreLogin("Inserisci username e password.");

    const email = user.includes('@') ? user : user + "@wonderlad.org";

    btn.disabled = true;
    btn.textContent = "Verifica…";
    el('login-err').style.display = 'none';

    // Nessuna registrazione automatica: gli account li crea un Administrator.
    auth.signInWithEmailAndPassword(email, pass)
        .catch(() => mostraErroreLogin("Credenziali non valide."))
        .finally(() => {
            btn.disabled = false;
            btn.textContent = "Accedi";
            el('passcode').value = '';
        });
}

el('passcode').addEventListener('keydown', ev => { if (ev.key === 'Enter') effettuaLogin(); });

function effettuaLogout() {
    if (confirm("Vuoi uscire dal pannello?")) {
        auth.signOut().then(() => location.reload());
    }
}

/* ==========================================================
   ASCOLTO DATI
   ========================================================== */

function fermaAscolti() {
    unsubscribers.forEach(u => { try { u(); } catch (e) { /* niente */ } });
    unsubscribers = [];
    if (unsubOrdini) { try { unsubOrdini(); } catch (e) { /* niente */ } unsubOrdini = null; }
}

function avviaAscoltoInTempoReale() {
    el('loadingMsg').style.display = 'block';

    unsubscribers.push(GENERALI_REF.onSnapshot(doc => {
        generaliEsiste = doc.exists;
        generaliGlobali = normalizzaGenerali(doc.exists ? doc.data() : null);
        aggiornaStrisce();
        aggiornaDatalist();
        if (!campagnaSelId) selezionaCampagna(generaliGlobali.campagnaAttiva);
        else popolaSelettoreCampagne();
        notificaImpostazioni();
    }, () => { /* lettura pubblica: un errore qui e' di rete */ }));

    unsubscribers.push(MODELLI_REF.onSnapshot(doc => {
        modelliGlobali = normalizzaModelli(doc.exists ? doc.data() : null);
        notificaImpostazioni();
    }, () => { /* permessi o rete: restano i modelli predefiniti */ }));

    unsubscribers.push(db.collection("campagne").onSnapshot(snap => {
        campagneGlobali = {};
        snap.forEach(d => { campagneGlobali[d.id] = d.data(); });
        popolaSelettoreCampagne();
        aggiornaStrisce();
        ridisegnaTutto();
        notificaImpostazioni();
    }));

    if (!isAdmin()) return;

    unsubscribers.push(
        db.collection("logs").orderBy("timestamp", "desc").limit(150).onSnapshot(snapshot => {
            popolaTabellaLog(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        })
    );

    unsubscribers.push(
        db.collection("utenti").onSnapshot(snapshot => {
            utentiGlobali = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            popolaTabellaUtenti(utentiGlobali);
        })
    );
}

// Gli ordini si ascoltano per campagna. Niente orderBy: con un filtro di
// uguaglianza servirebbe un indice composto; si ordina in pagina.
function ascoltaOrdini(id) {
    if (unsubOrdini) { unsubOrdini(); unsubOrdini = null; }
    datiGlobali = [];
    el('loadingMsg').style.display = 'block';
    el('loadingMsg').textContent = 'Caricamento…';

    unsubOrdini = db.collection("ordini").where("campagnaId", "==", id).limit(3000)
        .onSnapshot(snapshot => {
            datiGlobali = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (M.dataDi(b) || 0) - (M.dataDi(a) || 0));
            // Gli id selezionati che non esistono piu' si scartano.
            const presenti = new Set(datiGlobali.map(o => o.id));
            selezionati.forEach(x => { if (!presenti.has(x)) selezionati.delete(x); });
            el('loadingMsg').style.display = 'none';
            ridisegnaTutto();
        }, () => {
            el('loadingMsg').textContent = "Errore di lettura: permessi insufficienti.";
        });
}

function selezionaCampagna(id) {
    if (!id) return;
    campagnaSelId = id;
    selezionati.clear();
    popolaSelettoreCampagne();
    ascoltaOrdini(id);
}

function ridisegnaTutto() {
    popolaTabellaOrdini(datiGlobali);
    if (typeof calcolaStatistiche === 'function') calcolaStatistiche(datiGlobali, campagnaSel());
    const c = campagnaSel();
    el('contatoreOrdini').textContent = `${datiGlobali.length} ordini · ${c ? c.nome : campagnaSelId || ''}`;
}

function notificaImpostazioni() {
    if (typeof window.aggiornaVistaImpostazioni === 'function') window.aggiornaVistaImpostazioni();
}

function popolaSelettoreCampagne() {
    const sel = el('selCampagna');
    const ids = Object.keys(campagneGlobali);
    if (campagnaSelId && !ids.includes(campagnaSelId)) ids.push(campagnaSelId);
    ids.sort((a, b) => {
        if (a === generaliGlobali.campagnaAttiva) return -1;
        if (b === generaliGlobali.campagnaAttiva) return 1;
        return String((campagneGlobali[a] || {}).nome || a).localeCompare(String((campagneGlobali[b] || {}).nome || b));
    });
    sel.innerHTML = '';
    ids.forEach(id => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = ((campagneGlobali[id] || {}).nome || id) + (id === generaliGlobali.campagnaAttiva ? ' · attiva' : '');
        sel.appendChild(o);
    });
    if (campagnaSelId) sel.value = campagnaSelId;
}

function aggiornaStrisce() {
    const t = String(generaliGlobali.contattiEmergenza || '').trim();
    el('stripEmergenza').style.display = t ? 'flex' : 'none';
    el('stripEmergenzaTesto').textContent = t;

    const avviso = el('stripAvviso');
    let testo = '';
    if (!generaliEsiste || !campagneGlobali[generaliGlobali.campagnaAttiva]) {
        testo = isAdmin()
            ? "Configurazione da completare: vai in Impostazioni → Manutenzione e premi «Inizializza configurazione», poi «Migra ordini storici»."
            : "Configurazione in corso da parte dell'amministratore: alcuni dati potrebbero non essere visibili.";
    } else {
        const att = campagneGlobali[generaliGlobali.campagnaAttiva];
        if (att && att.ordiniAperti === false) testo = `Le prenotazioni pubbliche per «${att.nome}» sono chiuse.`;
    }
    avviso.textContent = testo;
    avviso.style.display = testo ? 'block' : 'none';
}

function aggiornaDatalist() {
    const riempi = (id, valori) => {
        const dl = el(id);
        dl.innerHTML = '';
        (valori || []).forEach(v => {
            const o = document.createElement('option');
            o.value = v;
            dl.appendChild(o);
        });
    };
    riempi('listaLuoghi', generaliGlobali.luoghi);
    riempi('listaReferenti', generaliGlobali.referenti);
}

/* ==========================================================
   NAVIGAZIONE
   ========================================================== */

function switchView(nomeVista, btn) {
    if (['utenti', 'log', 'impostazioni'].includes(nomeVista) && !isAdmin()) return;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    el('view-' + nomeVista).classList.add('active');

    const target = btn || document.querySelector(`.nav-item[data-view="${nomeVista}"]`);
    if (target) target.classList.add('active');
    if (nomeVista === 'impostazioni') notificaImpostazioni();
}

function navigaVersoFiltro(stato) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.stato === stato);
    });
    switchView('ordini', null);
    filtraOrdini();
}

// Chiamata dal widget Stock della dashboard.
function apriModaleStock() {
    if (!isAdmin()) return;
    switchView('impostazioni', null);
    if (typeof window.apriEditorCampagna === 'function') window.apriEditorCampagna(campagnaSelId);
}

/* ==========================================================
   ORDINI: TABELLA
   ========================================================== */

function getBadgeClass(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('da pagare')) return 'status-prenotato-da-pagare';
    if (s.includes('pagato')) return 'status-prenotato-pagare';
    if (s.includes('preparazione')) return 'status-in-preparazione';
    if (s.includes('da consegnare')) return 'status-da-consegnare';
    if (s.includes('consegnato')) return 'status-consegnato';
    if (s.includes('annullato')) return 'status-annullato';
    return 'status-prenotato';
}

function dolciCompatti(o, campagna) {
    return M.righeOrdine(o).map(r => {
        const p = M.prodotto(campagna, r.prodotto);
        return `<span class="dolce" title="${esc(p.nome)}">${esc(p.emoji || p.nome.slice(0, 3))} ${r.quantita}</span>`;
    }).join(' ') || '-';
}

function ritiroCompatto(o) {
    const d = M.dataRitiro(o);
    if (!d) return '<span class="muto">da assegnare</span>';
    const r = o.ritiro || {};
    const giorno = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return `<strong>${esc(giorno)} ${esc(M.testoOra(d))}</strong>` +
           (r.referente ? `<span class="sotto">${esc(r.referente)}</span>` : '') +
           (r.luogo ? `<span class="sotto">${esc(r.luogo)}</span>` : '');
}

function popolaTabellaOrdini(dati) {
    const tbody = el('corpoTabella');
    tbody.innerHTML = '';

    if (dati.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted);">Nessun ordine per questa campagna.</td></tr>`;
        aggiornaBarraSelezione();
        return;
    }

    const frammento = document.createDocumentFragment();

    dati.forEach(o => {
        const campagna = campagnaDi(o);
        const stato = o.status || 'Prenotato - Da Pagare';
        const offerta = M.offertaOrdine(o, campagna);
        const minimo = M.minimoOrdine(o, campagna);
        const extra = M.arrotonda(offerta - minimo);
        const tel = String(o.telefono || '');

        let azioneRapida = '';
        if (M.bucketPagamento(stato, o.metodoPagamento) === 'da_pagare') {
            azioneRapida = `<button class="btn-quick-status" data-azione="saldo" data-id="${esc(o.id)}">💶 Pagato</button>`;
        } else if (stato === 'Da Consegnare' || stato === 'In Preparazione' || stato === 'Prenotato - Pagato') {
            azioneRapida = `<button class="btn-quick-status" data-azione="consegna" data-id="${esc(o.id)}">✅ Consegnato</button>`;
        }

        const tr = document.createElement('tr');
        tr.dataset.id = o.id;
        tr.dataset.ricerca = [o.nome, o.cognome, o.telefono, o.email, o.codice, o.cf].join(' ').toLowerCase();
        tr.dataset.stato = stato;
        tr.dataset.ritiro = M.dataRitiro(o) ? '1' : '0';
        tr.dataset.ricevuta = o.ricevuta ? '1' : '0';
        tr.dataset.extra = extra > 0.009 ? '1' : '0';
        tr.dataset.marketing = o.consensoMarketing ? '1' : '0';
        if (selezionati.has(o.id)) tr.classList.add('selezionata');

        tr.innerHTML = `
            <td class="col-sel" data-label="Seleziona"><input type="checkbox" data-sel="${esc(o.id)}" ${selezionati.has(o.id) ? 'checked' : ''} aria-label="Seleziona ordine"></td>
            <td data-label="Data"><span>${esc(formattaData(o.timestamp))}</span></td>
            <td data-label="Codice"><span><code>${esc(o.codice || '-')}</code></span></td>
            <td data-label="Cliente"><span class="cella-cliente">
                <strong>${esc(o.nome)} ${esc(o.cognome)}</strong>
                ${o.email ? `<span class="sotto">${esc(o.email)}</span>` : ''}
                ${o.ricevuta ? `<span class="tag-ricevuta" title="Ricevuta richiesta">🧾 ${esc(o.cf || 'ricevuta')}</span>` : ''}
            </span></td>
            <td data-label="Telefono"><span>${esc(tel || '-')}</span></td>
            <td data-label="Dolci"><span>${dolciCompatti(o, campagna)}</span></td>
            <td data-label="Offerta"><span class="cella-offerta"><strong>${esc(M.euro(offerta))}</strong>
                ${extra > 0.009 ? `<span class="tag-extra">+${esc(M.euro(extra))}</span>` : ''}
                ${extra < -0.009 ? `<span class="tag-sotto">sotto il minimo</span>` : ''}</span></td>
            <td data-label="Stato"><span class="badge-status ${getBadgeClass(stato)}">${esc(stato)}</span></td>
            <td data-label="Pagamento"><span>${o.metodoPagamento && o.metodoPagamento !== '-' ? esc(M.NOMI_METODI[o.metodoPagamento] || o.metodoPagamento) : '<span class="muto">—</span>'}</span></td>
            <td data-label="Ritiro"><span class="cella-ritiro">${ritiroCompatto(o)}</span></td>
            <td data-label="Azioni"><span class="cella-azioni">
                ${azioneRapida}
                <button class="btn-msg" data-azione="messaggio" data-id="${esc(o.id)}" title="Invia un messaggio">✉️</button>
                <button class="btn-edit" data-azione="modifica" data-id="${esc(o.id)}" title="Modifica l'ordine">✏️</button>
            </span></td>`;
        frammento.appendChild(tr);
    });

    tbody.appendChild(frammento);
    filtraOrdini();
}

// Delega eventi: niente onclick con stringhe interpolate.
el('corpoTabella').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-azione]');
    if (!btn) return;
    const id = btn.dataset.id;
    const o = datiGlobali.find(x => x.id === id);
    if (!o) return;

    if (btn.dataset.azione === 'saldo') {
        el('pay-doc-id').value = id;
        el('pay-importo').textContent = `${M.nomeCompleto(o)} · offerta ${M.euro(M.offertaOrdine(o, campagnaDi(o)))}`;
        el('pay-modal').style.display = 'flex';
    } else if (btn.dataset.azione === 'consegna') {
        aggiornaOrdine(id, { status: 'Consegnato' }, 'Consegnato');
    } else if (btn.dataset.azione === 'modifica') {
        apriModaleOrdine(id);
    } else if (btn.dataset.azione === 'messaggio') {
        apriModaleMessaggio(id);
    }
});

el('corpoTabella').addEventListener('change', (ev) => {
    const cb = ev.target.closest('input[data-sel]');
    if (!cb) return;
    const id = cb.dataset.sel;
    if (cb.checked) selezionati.add(id); else selezionati.delete(id);
    const tr = cb.closest('tr');
    if (tr) tr.classList.toggle('selezionata', cb.checked);
    aggiornaBarraSelezione();
});

function aggiornaBarraSelezione() {
    const n = selezionati.size;
    el('barraSelezione').style.display = n ? 'flex' : 'none';
    el('contaSelezionati').textContent = n === 1 ? '1 selezionato' : `${n} selezionati`;
    const visibili = righeVisibili();
    el('selTutti').checked = visibili.length > 0 && visibili.every(tr => selezionati.has(tr.dataset.id));
}

function righeVisibili() {
    return Array.from(document.querySelectorAll('#corpoTabella tr[data-id]')).filter(tr => tr.style.display !== 'none');
}

function selezionaVisibili(stato) {
    righeVisibili().forEach(tr => {
        const id = tr.dataset.id;
        if (stato) selezionati.add(id); else selezionati.delete(id);
        tr.classList.toggle('selezionata', stato);
        const cb = tr.querySelector('input[data-sel]');
        if (cb) cb.checked = stato;
    });
    aggiornaBarraSelezione();
}

function deselezionaTutti() {
    selezionati.clear();
    document.querySelectorAll('#corpoTabella input[data-sel]').forEach(cb => { cb.checked = false; });
    document.querySelectorAll('#corpoTabella tr.selezionata').forEach(tr => tr.classList.remove('selezionata'));
    aggiornaBarraSelezione();
}

function filtraOrdini() {
    const query = el('searchOrdini').value.toLowerCase().trim();
    const extra = el('filtroExtra').value;
    document.querySelectorAll('#corpoTabella tr').forEach(tr => {
        if (!tr.dataset.stato) return;
        const matchTesto = !query || (tr.dataset.ricerca || '').includes(query);
        const matchStato = filtroStatoAttuale === 'Tutti' || tr.dataset.stato === filtroStatoAttuale;
        const matchExtra = extra === 'tutti'
            || (extra === 'senzaRitiro' && tr.dataset.ritiro === '0')
            || (extra === 'conRitiro' && tr.dataset.ritiro === '1')
            || (extra === 'ricevuta' && tr.dataset.ricevuta === '1')
            || (extra === 'extra' && tr.dataset.extra === '1')
            || (extra === 'marketing' && tr.dataset.marketing === '1');
        tr.style.display = (matchTesto && matchStato && matchExtra) ? '' : 'none';
    });
    aggiornaBarraSelezione();
}

function setFiltroStato(stato, btn) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    filtraOrdini();
}

/* ==========================================================
   ORDINI: AGGIORNAMENTI
   ========================================================== */

function aggiornaOrdine(docId, payload, descrizione) {
    return db.collection("ordini").doc(docId).update(payload)
        .then(() => {
            const o = datiGlobali.find(x => x.id === docId);
            scriviLog("MODIFICA", `Ordine ${o && o.codice ? o.codice : docId}: ${descrizione || Object.keys(payload).join(', ')}`);
        })
        .catch(err => { alert("Modifica non riuscita: " + err.message); throw err; });
}

function confermaSaldoRapido() {
    const docId = el('pay-doc-id').value;
    const metodo = el('pay-method-select').value;
    const o = datiGlobali.find(x => x.id === docId);
    // Lo stato logistico non torna indietro: solo un ordine appena prenotato passa a "Pagato".
    const payload = { metodoPagamento: metodo };
    if (!o || ['Prenotato', 'Prenotato - Da Pagare'].includes(o.status)) payload.status = 'Prenotato - Pagato';
    aggiornaOrdine(docId, payload, `pagato (${metodo})`)
        .then(() => chiudiModale('pay-modal'))
        .catch(() => { /* gia' segnalato */ });
}

function riempiSelect(id, valori, etichette) {
    const s = el(id);
    s.innerHTML = '';
    valori.forEach(v => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = (etichette && etichette[v]) || v;
        s.appendChild(o);
    });
}

function apriModaleOrdine(docId) {
    const o = datiGlobali.find(x => x.id === docId);
    if (!o) return;
    const campagna = campagnaDi(o);

    el('edit-doc-id').value = docId;
    el('edit-cliente').textContent = `${M.nomeCompleto(o)} · ${o.codice || '—'} · ${formattaData(o.timestamp)}`;

    // Una riga per ogni prodotto della campagna, piu' quelli presenti solo nell'ordine.
    const righe = M.righeOrdine(o);
    const chiavi = M.prodottiOrdinati(campagna).map(p => p.chiave);
    righe.forEach(r => { if (!chiavi.includes(r.prodotto)) chiavi.push(r.prodotto); });

    const box = el('edit-righe');
    box.innerHTML = '';
    chiavi.forEach(k => {
        const p = M.prodotto(campagna, k);
        const r = righe.find(x => x.prodotto === k);
        const minimo = r && Number.isFinite(r.minimo) ? r.minimo : (Number(p.donazioneMinima) || 0);
        const div = document.createElement('div');
        div.className = 'edit-riga';
        div.innerHTML = `
            <label for="edit-q-${esc(k)}">${esc(p.emoji || '')} ${esc(p.nome)} <span class="muto">min. ${esc(M.euro(minimo))}</span></label>
            <input type="number" id="edit-q-${esc(k)}" min="0" max="200" value="${r ? r.quantita : 0}"
                   data-prodotto="${esc(k)}" data-minimo="${minimo}">`;
        box.appendChild(div);
    });
    box.querySelectorAll('input').forEach(i => i.addEventListener('input', aggiornaMinimoModale));

    el('edit-offerta').value = M.offertaOrdine(o, campagna).toFixed(2);

    const stati = M.STATI.slice();
    if (o.status && !stati.includes(o.status)) stati.unshift(o.status);
    riempiSelect('edit-status', stati);
    el('edit-status').value = o.status || 'Prenotato - Da Pagare';

    riempiSelect('edit-metodo', M.METODI, M.NOMI_METODI);
    el('edit-metodo').value = M.METODI.includes(o.metodoPagamento) ? o.metodoPagamento : '-';

    el('edit-telefono').value = o.telefono || '';
    el('edit-email').value = o.email || '';

    const rit = o.ritiro || {};
    el('edit-ritiro-data').value = rit.data || '';
    el('edit-ritiro-luogo').value = rit.luogo || '';
    el('edit-ritiro-referente').value = rit.referente || '';

    el('edit-ricevuta').checked = !!o.ricevuta;
    el('edit-box-ricevuta').style.display = o.ricevuta ? 'grid' : 'none';
    el('edit-cf').value = o.cf || '';
    el('edit-indirizzo').value = o.indirizzo || '';
    el('edit-comune').value = o.comune || '';
    el('edit-cap').value = o.cap || '';
    el('edit-provincia').value = o.provincia || '';
    el('edit-note').value = o.note || '';

    const consensi = [];
    if (o.consensoPrivacy) consensi.push(`informativa accettata (v. ${o.privacyVersione || 1})`);
    consensi.push(o.consensoMarketing ? 'consenso alle campagne future: sì' : 'consenso alle campagne future: no');
    if (o.origine) consensi.push('origine: ' + o.origine);
    el('edit-consensi').textContent = consensi.join(' · ');

    aggiornaMinimoModale();
    applicaPermessi();
    el('edit-modal').style.display = 'flex';
}

function righeDalModale() {
    return Array.from(el('edit-righe').querySelectorAll('input[data-prodotto]'))
        .map(i => ({
            prodotto: i.dataset.prodotto,
            quantita: Math.max(0, parseInt(i.value, 10) || 0),
            minimo: Number(i.dataset.minimo) || 0
        }))
        .filter(r => r.quantita > 0);
}

function aggiornaMinimoModale() {
    const righe = righeDalModale();
    const minimo = M.arrotonda(righe.reduce((s, r) => s + r.quantita * r.minimo, 0));
    el('edit-minimo').textContent = `Minimo per ${righe.reduce((s, r) => s + r.quantita, 0)} pezzi: ${M.euro(minimo)}`;
    return minimo;
}

function salvaModificaOrdine() {
    const docId = el('edit-doc-id').value;
    const righe = righeDalModale();
    const pezzi = righe.reduce((s, r) => s + r.quantita, 0);
    const minimo = aggiornaMinimoModale();
    const offerta = M.arrotonda(Number(el('edit-offerta').value) || 0);
    const status = el('edit-status').value;
    const telefono = el('edit-telefono').value.replace(/\D/g, '');
    const email = el('edit-email').value.trim().toLowerCase();
    const ricevuta = el('edit-ricevuta').checked;
    const cf = M.normalizzaCF(el('edit-cf').value);

    if (pezzi === 0 && status !== 'Annullato') return alert("Un ordine senza pezzi va impostato su Annullato.");
    if (telefono && !/^[0-9]{8,15}$/.test(telefono)) return alert("Numero di telefono non valido.");
    if (email && !M.validaEmail(email)) return alert("Email non valida.");
    if (ricevuta && !M.validaCodiceFiscale(cf)) return alert("Codice fiscale non valido.");
    if (offerta < minimo && status !== 'Annullato' &&
        !confirm(`L'offerta (${M.euro(offerta)}) è inferiore al minimo (${M.euro(minimo)}). Salvare comunque?`)) return;

    const payload = {
        righe: righe,
        pezzi: pezzi,
        minimoTotale: minimo,
        offerta: offerta,
        status: status,
        metodoPagamento: el('edit-metodo').value,
        telefono: telefono,
        email: email,
        note: el('edit-note').value.trim().slice(0, 300),
        ritiro: {
            data: el('edit-ritiro-data').value || '',
            luogo: el('edit-ritiro-luogo').value.trim(),
            referente: el('edit-ritiro-referente').value.trim()
        },
        ricevuta: ricevuta,
        cf: ricevuta ? cf : '',
        indirizzo: ricevuta ? el('edit-indirizzo').value.trim() : '',
        comune: ricevuta ? el('edit-comune').value.trim() : '',
        cap: ricevuta ? el('edit-cap').value.trim() : '',
        provincia: ricevuta ? el('edit-provincia').value.trim().toUpperCase() : ''
    };

    aggiornaOrdine(docId, payload, `modifica completa (stato ${status}, offerta ${M.euro(offerta)})`)
        .then(() => chiudiModale('edit-modal'))
        .catch(() => { /* gia' segnalato */ });
}

function eliminaOrdine() {
    if (!isAdmin()) return;
    const docId = el('edit-doc-id').value;
    const o = datiGlobali.find(x => x.id === docId);
    if (!o) return;
    if (!confirm(`Eliminare definitivamente l'ordine ${o.codice || ''} di ${M.nomeCompleto(o)}?\n\nPer un ordine non più valido di solito basta lo stato "Annullato".`)) return;
    db.collection("ordini").doc(docId).delete()
        .then(() => {
            scriviLog("MODIFICA", `Eliminato ordine ${o.codice || docId} di ${M.nomeCompleto(o)}`);
            chiudiModale('edit-modal');
        })
        .catch(err => alert("Eliminazione non riuscita: " + err.message));
}

/* ==========================================================
   RITIRO (singolo o massivo)
   ========================================================== */

function apriModaleRitiro(ids) {
    idsRitiro = ids && ids.length ? ids : Array.from(selezionati);
    if (!idsRitiro.length) return alert("Seleziona almeno un ordine.");
    el('ritiro-quanti').textContent = idsRitiro.length === 1 ? '1 ordine' : `${idsRitiro.length} ordini`;
    el('ritiro-data').value = '';
    el('ritiro-luogo').value = generaliGlobali.luoghi[0] || '';
    el('ritiro-referente').value = '';
    el('ritiro-stato').checked = false;
    el('ritiro-modal').style.display = 'flex';
}

function salvaRitiroMassivo() {
    const data = el('ritiro-data').value;
    if (!data) return alert("Indica data e ora del ritiro.");
    const ritiro = {
        data: data,
        luogo: el('ritiro-luogo').value.trim(),
        referente: el('ritiro-referente').value.trim()
    };
    const cambiaStato = el('ritiro-stato').checked;

    // Batch da 400 per stare sotto il limite di 500 scritture.
    const gruppi = [];
    for (let i = 0; i < idsRitiro.length; i += 400) gruppi.push(idsRitiro.slice(i, i + 400));

    Promise.all(gruppi.map(g => {
        const batch = db.batch();
        g.forEach(id => {
            const o = datiGlobali.find(x => x.id === id);
            const payload = { ritiro: ritiro };
            if (cambiaStato && o && M.bucketLogistico(o.status) !== 'consegnato' && o.status !== 'Annullato') {
                payload.status = 'Da Consegnare';
            }
            batch.update(db.collection("ordini").doc(id), payload);
        });
        return batch.commit();
    }))
        .then(() => {
            scriviLog("MODIFICA", `Ritiro assegnato a ${idsRitiro.length} ordini: ${ritiro.data} ${ritiro.luogo} ${ritiro.referente}`);
            chiudiModale('ritiro-modal');
            deselezionaTutti();
        })
        .catch(err => alert("Assegnazione non riuscita: " + err.message));
}

/* ==========================================================
   MESSAGGI (WhatsApp, SMS, email dal dispositivo)
   ========================================================== */

function modelloSuggerito(o) {
    const bl = M.bucketLogistico(o.status);
    if (bl === 'da_consegnare') return M.dataRitiro(o) ? 'ritiro' : 'pronto';
    if (M.dataRitiro(o) && bl !== 'consegnato') return 'ritiro';
    if (M.bucketPagamento(o.status, o.metodoPagamento) === 'da_pagare' && (o.messaggi || []).some(m => m.modello === 'conferma')) return 'sollecito';
    return 'conferma';
}

function apriModaleMessaggio(docId) {
    const o = datiGlobali.find(x => x.id === docId);
    if (!o) return;
    el('msg-doc-id').value = docId;

    const recapiti = [o.telefono, o.email].filter(Boolean).join(' · ') || 'nessun recapito';
    el('msg-destinatario').textContent = `${M.nomeCompleto(o)} · ${recapiti}`;

    const chiavi = Object.keys(modelliGlobali);
    const etichette = {};
    chiavi.forEach(k => { etichette[k] = modelliGlobali[k].titolo || k; });
    etichette.libero = 'Messaggio libero';
    riempiSelect('msg-modello', chiavi.concat(['libero']), etichette);
    el('msg-modello').value = modelloSuggerito(o);

    el('msg-wa').disabled = !o.telefono;
    el('msg-sms').disabled = !o.telefono;
    el('msg-mail').disabled = !o.email;

    disegnaStoricoMessaggi(o);
    compilaMessaggio();
    el('msg-modal').style.display = 'flex';
}

function compilaMessaggio() {
    const o = datiGlobali.find(x => x.id === el('msg-doc-id').value);
    if (!o) return;
    const chiave = el('msg-modello').value;
    const avviso = el('msg-avviso');
    avviso.textContent = '';

    if (chiave === 'libero') {
        el('msg-oggetto').value = 'WonderLAD';
        el('msg-testo').value = `Ciao ${o.nome || ''}, `;
        return;
    }
    const m = modelliGlobali[chiave];
    const campagna = campagnaDi(o);
    el('msg-oggetto').value = M.compilaModello(m.oggetto, o, campagna, generaliGlobali);
    el('msg-testo').value = M.compilaModello(m.testo, o, campagna, generaliGlobali);

    if (chiave === 'ritiro' && !M.dataRitiro(o)) {
        avviso.textContent = 'Il ritiro non è ancora assegnato: nel testo comparirà «da concordare». Assegnalo prima dal pulsante Modifica.';
    }
}

function disegnaStoricoMessaggi(o) {
    const box = el('msg-storico');
    const lista = (o.messaggi || []).slice(-6).reverse();
    if (!lista.length) { box.innerHTML = '<span class="muto">Nessun messaggio inviato finora.</span>'; return; }
    const nomi = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' };
    box.innerHTML = '<strong>Ultimi invii</strong>' + lista.map(m => {
        const d = new Date(m.quando);
        const quando = isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const titolo = (modelliGlobali[m.modello] && modelliGlobali[m.modello].titolo) || m.modello;
        return `<div>${esc(quando)} · ${esc(nomi[m.canale] || m.canale)} · ${esc(titolo)} · <span class="muto">${esc(m.utente || '')}</span></div>`;
    }).join('');
}

function inviaMessaggio(canale) {
    const o = datiGlobali.find(x => x.id === el('msg-doc-id').value);
    if (!o) return;
    const testo = el('msg-testo').value.trim();
    if (!testo) return alert("Il messaggio è vuoto.");
    const oggetto = el('msg-oggetto').value.trim() || 'WonderLAD';
    const tel = M.telefonoInternazionale(o.telefono);

    let url = '';
    if (canale === 'whatsapp') {
        if (!tel) return alert("Numero di telefono mancante.");
        url = `https://wa.me/${tel}?text=${encodeURIComponent(testo)}`;
        window.open(url, '_blank', 'noopener');
    } else if (canale === 'sms') {
        if (!tel) return alert("Numero di telefono mancante.");
        // "?&body=" e' la forma accettata sia da iOS sia da Android.
        url = `sms:+${tel}?&body=${encodeURIComponent(testo)}`;
        window.location.href = url;
    } else if (canale === 'email') {
        if (!o.email) return alert("Email mancante.");
        url = `mailto:${encodeURIComponent(o.email)}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}`;
        window.location.href = url;
    }

    const voce = {
        modello: el('msg-modello').value,
        canale: canale,
        utente: utenteCorrente.email,
        quando: new Date().toISOString()
    };
    db.collection("ordini").doc(o.id).update({
        messaggi: firebase.firestore.FieldValue.arrayUnion(voce)
    }).then(() => {
        scriviLog("MESSAGGIO", `${voce.canale} «${voce.modello}» a ${M.nomeCompleto(o)} (${o.codice || o.id})`);
        disegnaStoricoMessaggi(Object.assign({}, o, { messaggi: (o.messaggi || []).concat([voce]) }));
    }).catch(() => { /* l'invio e' comunque partito dal dispositivo */ });
}

/* ==========================================================
   UTENTI (solo Administrator)
   ========================================================== */

function popolaTabellaUtenti(utenti) {
    const tbody = el('corpoUtenti');
    tbody.innerHTML = '';

    if (utenti.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Nessun utente abilitato.</td></tr>`;
        return;
    }

    utenti.forEach(u => {
        const nuovoRuolo = u.ruolo === 'Administrator' ? 'Manager' : 'Administrator';
        const isSelf = u.id === utenteCorrente.uid;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Utente"><strong>${esc(u.email || u.id)}</strong></td>
            <td data-label="Ruolo"><span class="badge-status ${u.ruolo === 'Administrator' ? 'status-prenotato-da-pagare' : 'status-prenotato'}">${esc(u.ruolo || 'Manager')}</span></td>
            <td data-label="Azioni">
                ${isSelf ? '<span style="color:var(--text-muted); font-size:0.8rem;">sei tu</span>' : `
                    <button class="btn-edit" data-azione="ruolo" data-uid="${esc(u.id)}" data-ruolo="${esc(nuovoRuolo)}">Rendi ${esc(nuovoRuolo)}</button>
                    <button class="btn-delete" data-azione="revoca" data-uid="${esc(u.id)}">🗑️ Revoca</button>
                `}
            </td>`;
        tbody.appendChild(tr);
    });
}

el('corpoUtenti').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-azione]');
    if (!btn || !isAdmin()) return;

    const uid = btn.dataset.uid;
    const u = utentiGlobali.find(x => x.id === uid);
    if (!u) return;

    if (btn.dataset.azione === 'ruolo') {
        const nuovo = btn.dataset.ruolo;
        if (!confirm(`Impostare ${u.email} come ${nuovo}?`)) return;
        db.collection("utenti").doc(uid).set({ email: u.email, ruolo: nuovo, creato: u.creato || firebase.firestore.FieldValue.serverTimestamp() })
            .then(() => scriviLog("UTENTE", `Ruolo di ${u.email} impostato a ${nuovo}`))
            .catch(err => alert("Operazione non riuscita: " + err.message));
    }

    if (btn.dataset.azione === 'revoca') {
        if (!confirm(`Revocare l'accesso a ${u.email}?\n\nL'account resta in Firebase Auth ma non potrà più entrare nel pannello.`)) return;
        db.collection("utenti").doc(uid).delete()
            .then(() => scriviLog("UTENTE", `Revocato accesso a ${u.email}`))
            .catch(err => alert("Operazione non riuscita: " + err.message));
    }
});

function apriModaleNuovoUtente() {
    if (!isAdmin()) return;
    el('user-email-input').value = '';
    el('user-pass-input').value = '';
    el('user-role-input').value = 'Manager';
    el('user-modal').style.display = 'flex';
}

function salvaNuovoUtente() {
    if (!isAdmin()) return;

    const emailInput = el('user-email-input').value.trim();
    const pass = el('user-pass-input').value;
    const ruolo = el('user-role-input').value;

    if (!emailInput) return alert("Inserisci email o username.");
    if (pass.length < 8) return alert("La password deve avere almeno 8 caratteri.");

    const email = emailInput.includes('@') ? emailInput : emailInput + "@wonderlad.org";

    // App secondaria: crea l'account senza sloggare l'amministratore.
    const secondaryApp = firebase.initializeApp(firebaseConfig, "creazioneUtente-" + Date.now());

    secondaryApp.auth().createUserWithEmailAndPassword(email, pass)
        .then(cred => db.collection("utenti").doc(cred.user.uid).set({
            email: email,
            ruolo: ruolo,
            creato: firebase.firestore.FieldValue.serverTimestamp()
        }))
        .then(() => {
            scriviLog("UTENTE", `Creato utente ${email} con ruolo ${ruolo}`);
            chiudiModale('user-modal');
            alert(`Utente ${email} creato. Comunicagli la password provvisoria.`);
        })
        .catch(err => alert("Creazione non riuscita: " + err.message))
        .finally(() => secondaryApp.delete());
}

/* ==========================================================
   LOG (solo Administrator)
   ========================================================== */

function popolaTabellaLog(logs) {
    const tbody = el('corpoLog');
    tbody.innerHTML = '';

    if (!logs.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Nessuna attività registrata.</td></tr>`;
        return;
    }

    logs.forEach(l => {
        const cat = String(l.categoria || 'LOG');
        const c = cat.toLowerCase();
        let badge = 'log-inserimento';
        if (c.includes('login')) badge = 'log-login';
        else if (c.includes('modifica')) badge = 'log-modifica';
        else if (c.includes('utente')) badge = 'log-utente';
        else if (c.includes('stock') || c.includes('impostazioni')) badge = 'log-stock';
        else if (c.includes('messaggio')) badge = 'log-messaggio';
        else if (c.includes('export')) badge = 'log-export';

        const tr = document.createElement('tr');
        tr.dataset.cat = cat.toUpperCase();
        tr.dataset.ricerca = `${cat} ${l.utente || ''} ${l.dettaglio || ''}`.toLowerCase();
        tr.innerHTML = `
            <td data-label="Data"><span>${esc(formattaData(l.timestamp))}</span></td>
            <td data-label="Categoria"><span class="log-badge ${badge}">${esc(cat)}</span></td>
            <td data-label="Utente"><strong>${esc(l.utente || '-')}</strong></td>
            <td data-label="Dettaglio"><span>${esc(l.dettaglio || '-')}</span></td>`;
        tbody.appendChild(tr);
    });

    filtraLog();
}

function setFiltroLogCat(cat, btn) {
    filtroLogCatAttuale = cat;
    document.querySelectorAll('#logFilterChips .chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    filtraLog();
}

function filtraLog() {
    const query = el('searchLog').value.toLowerCase().trim();
    document.querySelectorAll('#corpoLog tr').forEach(tr => {
        if (!tr.dataset.cat) return;
        const matchTesto = !query || (tr.dataset.ricerca || '').includes(query);
        const matchCat = filtroLogCatAttuale === 'Tutti' || tr.dataset.cat.includes(filtroLogCatAttuale.toUpperCase());
        tr.style.display = (matchTesto && matchCat) ? '' : 'none';
    });
}

/* ==========================================================
   MODALI
   ========================================================== */

function chiudiModale(id) { el(id).style.display = 'none'; }

document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', ev => { if (ev.target === m) m.style.display = 'none'; });
});
document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; });
});
