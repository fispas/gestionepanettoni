// WonderLAD - pannello di gestione
// Unico punto di verita' per auth, ruoli, ordini, utenti e log.
// Sostituisce api.js + ordini-utenti.js + lo script inline di gestione.html.

let datiGlobali = [];
let utentiGlobali = [];
let configGlobale = { ...CONFIG_DEFAULT };
let utenteCorrente = { uid: "", email: "", ruolo: "" };
let filtroStatoAttuale = "Tutti";
let filtroLogCatAttuale = "Tutti";
let unsubscribers = [];

const STATI = ['Prenotato', 'Prenotato - Da Pagare', 'Prenotato - Pagato',
               'In Preparazione', 'Da Consegnare', 'Consegnato', 'Annullato'];

const el = (id) => document.getElementById(id);
const isAdmin = () => utenteCorrente.ruolo === 'Administrator';

// --- anti-XSS: qualunque dato che arriva dal form pubblico passa da qui ---
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
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
    unsubscribers.forEach(u => u());
    unsubscribers = [];

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

function effettuaLogout() {
    if (confirm("Vuoi uscire dal pannello?")) {
        auth.signOut().then(() => location.reload());
    }
}

/* ==========================================================
   ASCOLTO DATI
   ========================================================== */

function avviaAscoltoInTempoReale() {
    el('loadingMsg').style.display = 'block';

    unsubscribers.push(CONFIG_REF.onSnapshot(doc => {
        configGlobale = normalizzaConfig(doc.exists ? doc.data() : null);
        calcolaStatistiche(datiGlobali, configGlobale);
    }));

    // limit(500): evita di riscaricare l'intera collezione a ogni modifica.
    unsubscribers.push(
        db.collection("ordini").orderBy("timestamp", "desc").limit(500).onSnapshot(snapshot => {
            datiGlobali = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            popolaTabellaOrdini(datiGlobali);
            calcolaStatistiche(datiGlobali, configGlobale);
            el('loadingMsg').style.display = 'none';
            el('contatoreOrdini').textContent = `${datiGlobali.length} ordini caricati`;
        }, () => {
            el('loadingMsg').textContent = "Errore di lettura: permessi insufficienti.";
        })
    );

    if (!isAdmin()) return;

    unsubscribers.push(
        db.collection("logs").orderBy("timestamp", "desc").limit(100).onSnapshot(snapshot => {
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

/* ==========================================================
   NAVIGAZIONE
   ========================================================== */

function switchView(nomeVista, btn) {
    if ((nomeVista === 'utenti' || nomeVista === 'log') && !isAdmin()) return;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    el('view-' + nomeVista).classList.add('active');

    if (btn) {
        btn.classList.add('active');
    } else {
        const target = document.querySelector(`.nav-item[data-view="${nomeVista}"]`);
        if (target) target.classList.add('active');
    }
}

function navigaVersoFiltro(stato) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.stato === stato);
    });
    switchView('ordini', null);
    filtraOrdini();
}

/* ==========================================================
   ORDINI
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

function popolaTabellaOrdini(dati) {
    const tbody = el('corpoTabella');
    tbody.innerHTML = '';

    if (dati.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted);">Nessun ordine registrato.</td></tr>`;
        return;
    }

    dati.forEach(o => {
        const tel = String(o.telefono || '').replace(/\D/g, '');
        const msgWa = encodeURIComponent(`Ciao ${o.nome || ''}, ti scriviamo da WonderLAD per il tuo ordine di dolci solidali.`);
        const telHtml = tel
            ? `<a href="https://wa.me/39${tel}?text=${msgWa}" target="_blank" rel="noopener" class="wa-link">📱 ${esc(o.telefono)}</a>`
            : '-';

        const stato = o.status || 'Prenotato';
        let azioneRapida = '';
        if (stato.includes('Da Pagare')) {
            azioneRapida = `<button class="btn-quick-status" data-azione="saldo" data-id="${esc(o.id)}">💶 Segna pagato</button>`;
        } else if (stato.includes('Da Consegnare') || stato.includes('In Preparazione')) {
            azioneRapida = `<button class="btn-quick-status" data-azione="consegna" data-id="${esc(o.id)}">✅ Segna consegnato</button>`;
        }

        const tr = document.createElement('tr');
        tr.dataset.ricerca = `${o.nome || ''} ${o.cognome || ''} ${o.telefono || ''} ${o.codice || ''}`.toLowerCase();
        tr.dataset.stato = stato;
        tr.innerHTML = `
            <td data-label="Data"><span>${esc(formattaData(o.timestamp))}</span></td>
            <td data-label="Codice"><span><code>${esc(o.codice || '-')}</code></span></td>
            <td data-label="Cliente"><strong>${esc(o.nome)} ${esc(o.cognome)}</strong></td>
            <td data-label="Telefono"><span>${telHtml}</span></td>
            <td data-label="Panettoni"><span>${parseInt(o.panettoni) || 0}</span></td>
            <td data-label="Pandori"><span>${parseInt(o.pandori) || 0}</span></td>
            <td data-label="Stato"><span class="badge-status ${getBadgeClass(stato)}">${esc(stato)}</span></td>
            <td data-label="Pagamento"><span>${esc(o.metodoPagamento || '-')}</span></td>
            <td data-label="Azioni">
                ${azioneRapida}
                <button class="btn-edit" data-azione="modifica" data-id="${esc(o.id)}">✏️ Modifica</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    filtraOrdini();
}

// Delega eventi: niente onclick con stringhe interpolate, niente injection.
el('corpoTabella').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-azione]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.azione === 'saldo') {
        el('pay-doc-id').value = id;
        el('pay-modal').style.display = 'flex';
    } else if (btn.dataset.azione === 'consegna') {
        const o = datiGlobali.find(x => x.id === id);
        aggiornaOrdine(id, { status: 'Consegnato', metodoPagamento: (o && o.metodoPagamento) || '-' });
    } else if (btn.dataset.azione === 'modifica') {
        apriModaleOrdine(id);
    }
});

function aggiornaOrdine(docId, payload) {
    return db.collection("ordini").doc(docId).update(payload)
        .then(() => scriviLog("MODIFICA", `Ordine ${docId}: ${JSON.stringify(payload)}`))
        .catch(err => alert("Modifica non riuscita: " + err.message));
}

function confermaSaldoRapido() {
    const docId = el('pay-doc-id').value;
    aggiornaOrdine(docId, {
        status: 'Prenotato - Pagato',
        metodoPagamento: el('pay-method-select').value
    });
    chiudiModale('pay-modal');
}

function apriModaleOrdine(docId) {
    const o = datiGlobali.find(x => x.id === docId);
    if (!o) return;

    el('edit-doc-id').value = docId;
    el('edit-cliente').textContent = `${o.nome || ''} ${o.cognome || ''} · ${o.codice || '—'}`;
    el('edit-pan').value = parseInt(o.panettoni) || 0;
    el('edit-pand').value = parseInt(o.pandori) || 0;
    el('edit-note').value = o.note || '';
    el('edit-status').value = STATI.includes(o.status) ? o.status : 'Prenotato';
    el('edit-metodo').value = ['-', 'Cash', 'Bonifico', 'POS'].includes(o.metodoPagamento) ? o.metodoPagamento : '-';
    el('edit-modal').style.display = 'flex';
}

function salvaModificaOrdine() {
    const docId = el('edit-doc-id').value;
    const pan = parseInt(el('edit-pan').value) || 0;
    const pand = parseInt(el('edit-pand').value) || 0;

    if (pan < 0 || pand < 0) return alert("Le quantità non possono essere negative.");
    if (pan + pand === 0 && el('edit-status').value !== 'Annullato') {
        return alert("Un ordine senza pezzi va impostato su Annullato.");
    }

    aggiornaOrdine(docId, {
        panettoni: pan,
        pandori: pand,
        note: el('edit-note').value.trim().slice(0, 300),
        status: el('edit-status').value,
        metodoPagamento: el('edit-metodo').value
    }).then(() => chiudiModale('edit-modal'));
}

function filtraOrdini() {
    const query = el('searchOrdini').value.toLowerCase().trim();
    document.querySelectorAll('#corpoTabella tr').forEach(tr => {
        if (!tr.dataset.stato) return;
        const matchTesto = !query || (tr.dataset.ricerca || '').includes(query);
        const matchStato = filtroStatoAttuale === 'Tutti' ||
                           tr.dataset.stato.toLowerCase() === filtroStatoAttuale.toLowerCase();
        tr.style.display = (matchTesto && matchStato) ? '' : 'none';
    });
}

function setFiltroStato(stato, btn) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    filtraOrdini();
}

/* ==========================================================
   IMPOSTAZIONI: STOCK E PREZZI (solo Administrator)
   ========================================================== */

function apriModaleStock() {
    if (!isAdmin()) return;
    el('input-tot-pan').value = configGlobale.totalePanettoni;
    el('input-tot-pand').value = configGlobale.totalePandori;
    el('input-prezzo-pan').value = configGlobale.prezzoPanettone;
    el('input-prezzo-pand').value = configGlobale.prezzoPandoro;
    el('input-ordini-aperti').checked = configGlobale.ordiniAperti;
    el('stock-modal').style.display = 'flex';
}

function salvaStock() {
    if (!isAdmin()) return;

    const payload = {
        totalePanettoni: parseInt(el('input-tot-pan').value) || 0,
        totalePandori: parseInt(el('input-tot-pand').value) || 0,
        prezzoPanettone: Number(el('input-prezzo-pan').value) || 0,
        prezzoPandoro: Number(el('input-prezzo-pand').value) || 0,
        ordiniAperti: el('input-ordini-aperti').checked
    };

    CONFIG_REF.set(payload)
        .then(() => {
            scriviLog("STOCK", `Stock ${payload.totalePanettoni}/${payload.totalePandori}, prezzi ${payload.prezzoPanettone}€/${payload.prezzoPandoro}€, prenotazioni ${payload.ordiniAperti ? 'aperte' : 'chiuse'}`);
            chiudiModale('stock-modal');
        })
        .catch(err => alert("Salvataggio non riuscito: " + err.message));
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
            </td>
        `;
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
        .then(cred => {
            const uid = cred.user.uid;
            return db.collection("utenti").doc(uid).set({
                email: email,
                ruolo: ruolo,
                creato: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            scriviLog("UTENTE", `Creato utente ${email} con ruolo ${ruolo}`);
            chiudiModale('user-modal');
            alert(`Utente ${email} creato. Comunicagli la password: dovrà cambiarla al primo accesso.`);
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
        else if (c.includes('stock')) badge = 'log-stock';

        const tr = document.createElement('tr');
        tr.dataset.cat = cat.toUpperCase();
        tr.dataset.ricerca = `${cat} ${l.utente || ''} ${l.dettaglio || ''}`.toLowerCase();
        tr.innerHTML = `
            <td data-label="Data"><span>${esc(formattaData(l.timestamp))}</span></td>
            <td data-label="Categoria"><span class="log-badge ${badge}">${esc(cat)}</span></td>
            <td data-label="Utente"><strong>${esc(l.utente || '-')}</strong></td>
            <td data-label="Dettaglio"><span>${esc(l.dettaglio || '-')}</span></td>
        `;
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
   MODALI ED EXPORT
   ========================================================== */

function chiudiModale(id) { el(id).style.display = 'none'; }

document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', ev => { if (ev.target === m) m.style.display = 'none'; });
});
document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
});

function esportaExcel() {
    if (!datiGlobali.length) return alert("Nessun ordine da esportare.");

    const righe = datiGlobali.map(o => ({
        Data: formattaData(o.timestamp),
        Codice: o.codice || '',
        Nome: o.nome || '',
        Cognome: o.cognome || '',
        Telefono: o.telefono || '',
        Panettoni: parseInt(o.panettoni) || 0,
        Pandori: parseInt(o.pandori) || 0,
        Importo: (parseInt(o.panettoni) || 0) * configGlobale.prezzoPanettone +
                 (parseInt(o.pandori) || 0) * configGlobale.prezzoPandoro,
        Stato: o.status || '',
        Pagamento: o.metodoPagamento || '',
        Note: o.note || ''
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(righe), "Ordini");
    XLSX.writeFile(wb, `Ordini_WonderLAD_${new Date().toISOString().slice(0, 10)}.xlsx`);
    scriviLog("EXPORT", `Esportati ${righe.length} ordini in Excel`);
}
