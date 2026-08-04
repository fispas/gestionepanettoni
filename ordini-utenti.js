// ordini-utenti.js (Firebase Native Adaptation)
let datiGlobali = [];
let logsGlobali = [];
let impostazioniGlobali = { "Totale Panettoni": 500, "Totale Pandori": 500 };
let currentUserEmail = ""; 
let filtroStatoAttuale = "Tutti";
let filtroLogCatAttuale = "Tutti";
let esecuzioniTestLettura = 0;
let rowCounter = 0;

auth.onAuthStateChanged(user => {
    if (user) {
        currentUserEmail = user.email;
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        document.getElementById('user-badge').textContent = `(${currentUserEmail.split('@')[0]})`;

        const nav = document.getElementById('bottomNav');
        if(!document.getElementById('btn-nav-log')) {
            nav.innerHTML += `
                <button id="btn-nav-log" class="nav-item" onclick="switchView('log', this)">
                    <span class="nav-icon">📜</span>Log
                </button>
            `;
        }
        avviaAscoltoInTempoReale();
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-container').style.display = 'none';
    }
});

function effettuaLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('passcode').value;
    const btn = document.getElementById('btn-login');
    const errObj = document.getElementById('login-err');

    if(!user || !pass) {
        errObj.textContent = "Inserisci username e password!";
        errObj.style.display = 'block';
        return;
    }

    btn.textContent = "Verifica...";
    btn.disabled = true;
    errObj.style.display = 'none';

    effettuaLoginAPI(user, pass)
    .then(() => {
        aggiungiLogAPI("LOGIN", user, "Accesso effettuato al pannello di gestione");
    })
    .catch((error) => {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            registraNuovoUtenteAPI(user, pass).then(() => {
                aggiungiLogAPI("UTENTE", user, "Nuovo account creato ed effettuato il login");
            }).catch(() => {
                errObj.textContent = "Errore: la password deve avere almeno 6 caratteri!";
                errObj.style.display = 'block';
            });
        } else {
            errObj.textContent = "Errore: " + error.message;
            errObj.style.display = 'block';
        }
    })
    .finally(() => {
        btn.textContent = "Accedi / Registrati";
        btn.disabled = false;
    });
}

function effettuaLogout() {
    if (confirm("Vuoi davvero uscire dal sistema?")) {
        auth.signOut().then(() => location.reload());
    }
}

function avviaAscoltoInTempoReale() {
    document.getElementById('loadingMsg').style.display = 'block';

    db.collection("impostazioni").doc("stock").onSnapshot(doc => {
        if (doc.exists) impostazioniGlobali = doc.data();
        calcolaStatistiche(datiGlobali, impostazioniGlobali);
    });

    db.collection("ordini").orderBy("timestamp", "desc").onSnapshot(snapshot => {
        datiGlobali = [];
        rowCounter = 0;
        snapshot.forEach(doc => {
            rowCounter++;
            datiGlobali.push({ id: doc.id, ...doc.data() });
        });
        popolaTabellaOrdini(datiGlobali);
        calcolaStatistiche(datiGlobali, impostazioniGlobali);
        document.getElementById('loadingMsg').style.display = 'none';
        document.getElementById('contatoreOrdini').textContent = `Righe caricate e analizzate dal db: ${rowCounter}`;
    });

    db.collection("logs").orderBy("timestamp", "desc").limit(100).onSnapshot(snapshot => {
        logsGlobali = [];
        snapshot.forEach(doc => logsGlobali.push({ id: doc.id, ...doc.data() }));
        popolaTabellaLog(logsGlobali);
    });
}

function switchView(viewName, btnElement) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    btnElement.classList.add('active');
}

function getBadgeClass(status) {
    if(!status) return 'status-prenotato';
    const s = status.toLowerCase();
    if(s === 'prenotato') return 'status-prenotato';
    if(s.includes('da pagare')) return 'status-prenotato-da-pagare';
    if(s.includes('pagato')) return 'status-prenotato-pagare';
    if(s.includes('preparazione')) return 'status-in-preparazione';
    if(s.includes('da consegnare')) return 'status-da-consegnare';
    if(s.includes('consegnato')) return 'status-consegnato';
    if(s.includes('annullato')) return 'status-annullato';
    return 'status-prenotato';
}

function popolaTabellaOrdini(dati) {
    const tbody = document.getElementById('corpoTabella');
    tbody.innerHTML = ''; 
    if(dati.length === 0) return;

    dati.forEach(o => {
        let dStr = '-';
        if(o.timestamp && o.timestamp.toDate) {
            const d = o.timestamp.toDate();
            dStr = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
        }

        const cleanTel = String(o.telefono || '').replace(/\D/g, '');
        const msgWa = encodeURIComponent(`Ciao ${o.nome || ''}, ti contattiamo da WonderLAD in merito al tuo ordine per i dolci solidali.`);
        const telHtml = cleanTel ? `<a href="https://wa.me/39${cleanTel}?text=${msgWa}" target="_blank" class="wa-link">📱 ${o.telefono}</a>` : '-';

        const badgeClass = getBadgeClass(o.status);

        const tr = document.createElement('tr');
        tr.setAttribute('data-nome', (o.nome + " " + o.cognome + " " + o.telefono).toLowerCase());
        tr.setAttribute('data-stato', o.status || "");
        tr.setAttribute('data-panettoni', o.panettoni || 0);
        tr.setAttribute('data-pandori', o.pandori || 0);

        const currentStatus = o.status || 'Prenotato';
        let nextStatusBtn = '';
        if(currentStatus.includes('Da Pagare')) {
            nextStatusBtn = `<button class="btn-quick-status" onclick="apriModaleSaldoRapido('${o.id}')">✅ Pagato</button>`;
        } else if(currentStatus.includes('Da Consegnare') || currentStatus.includes('In Preparazione')) {
            nextStatusBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido('${o.id}', 'Consegnato', '${o.metodoPagamento || "-"}')">✅ Consegnato</button>`;
        }

        tr.innerHTML = `
            <td data-label="Data"><span>${dStr}</span></td>
            <td data-label="Nome"><span>${o.nome || '-'}</span></td>
            <td data-label="Cognome"><span>${o.cognome || '-'}</span></td>
            <td data-label="Telefono"><span>${telHtml}</span></td>
            <td data-label="Panettoni"><span>${o.panettoni || 0}</span></td>
            <td data-label="Pandori"><span>${o.pandori || 0}</span></td>
            <td data-label="Stato"><span class="badge-status ${badgeClass}">${o.status || 'Prenotato'}</span></td>
            <td data-label="Pagamento"><span>${o.metodoPagamento || '-'}</span></td>
            <td data-label="Azioni">${nextStatusBtn}<button class="btn-edit" onclick="apriModaleOrdine('${o.id}', ${o.panettoni || 0}, ${o.pandori || 0}, '${o.status || 'Prenotato'}', '${o.metodoPagamento || "-"}')">✏️ Modifica</button></td>
        `;
        tbody.appendChild(tr);
    });

    filtraOrdini();
}

function apriModaleSaldoRapido(docId) {
    document.getElementById('pay-doc-id').value = docId;
    document.getElementById('pay-modal').style.display = 'flex';
}

function confermaSaldoRapido() {
    const docId = document.getElementById('pay-doc-id').value;
    const metodo = document.getElementById('pay-method-select').value;
    cambiaStatoRapido(docId, 'Prenotato - Pagato', metodo);
    chiudiModale('pay-modal');
}

function cambiaStatoRapido(docId, nuovoStato, metodoPagamento = "-") {
    inviaAggiornamentoOrdineAPI(docId, {
        status: nuovoStato,
        metodoPagamento: metodoPagamento
    }).then(() => {
        aggiungiLogAPI("MODIFICA", currentUserEmail, `Aggiornato stato ordine rapido a ${nuovoStato} (${metodoPagamento})`);
    });
}

function filtraOrdini() {
    const query = document.getElementById('searchOrdini').value.toLowerCase();
    const rows = document.querySelectorAll('#corpoTabella tr');
    
    rows.forEach(tr => {
        const testo = tr.getAttribute('data-nome') || "";
        const stato = tr.getAttribute('data-stato') || "";
        const panettoni = parseInt(tr.getAttribute('data-panettoni')) || 0;
        const pandori = parseInt(tr.getAttribute('data-pandori')) || 0;
        
        const matchTesto = testo.includes(query);
        const matchFiltro = (filtroStatoAttuale === 'Tutti' || stato.toLowerCase() === filtroStatoAttuale.toLowerCase());
        
        let matchProdotto = true;
        if (filtroProdottoDashboard === 'PANETTONI') matchProdotto = panettoni > 0;
        if (filtroProdottoDashboard === 'PANDORI') matchProdotto = pandori > 0;

        tr.style.display = (matchTesto && matchFiltro && matchProdotto) ? '' : 'none';
    });
}

function setFiltroStato(stato, btnElement) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .filter-chips .chip').forEach(c => c.classList.remove('active'));
    btnElement.classList.add('active');
    filtraOrdini();
}

function popolaTabellaLog(logs) {
    const tbody = document.getElementById('corpoLog');
    tbody.innerHTML = '';
    if(!logs || logs.length === 0) return;

    logs.forEach(l => {
        let dStr = '-';
        if(l.timestamp && l.timestamp.toDate) {
            const d = l.timestamp.toDate();
            dStr = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
        }

        const catVal = l.categoria || 'INSERIMENTO';
        const badgeClass = catVal.toLowerCase().includes('login') ? 'log-login' : (catVal.toLowerCase().includes('modifica') ? 'log-modifica' : 'log-inserimento');

        const tr = document.createElement('tr');
        tr.setAttribute('data-cat', String(catVal).toUpperCase());
        tr.innerHTML = `
            <td data-label="Data/Ora"><span>${dStr}</span></td>
            <td data-label="Categoria"><span class="log-badge ${badgeClass}">${catVal}</span></td>
            <td data-label="Utente"><strong>${l.utente || '-'}</strong></td>
            <td data-label="Dettaglio"><span>${l.dettaglio || '-'}</span></td>
        `;
        tbody.appendChild(tr);
    });
    filtraLog();
}

function setFiltroLogCat(cat, btnElement) {
    filtroLogCatAttuale = cat;
    document.querySelectorAll('#logFilterChips .chip').forEach(c => c.classList.remove('active'));
    btnElement.classList.add('active');
    filtraLog();
}

function filtraLog() {
    const query = document.getElementById('searchLog').value.toLowerCase();
    const rows = document.querySelectorAll('#corpoLog tr');
    
    rows.forEach(tr => {
        const text = tr.textContent.toLowerCase();
        const cat = tr.getAttribute('data-cat') || "";
        
        const matchTesto = text.includes(query);
        const matchCat = (filtroLogCatAttuale === 'Tutti' || cat.includes(filtroLogCatAttuale.toUpperCase()));

        tr.style.display = (matchTesto && matchCat) ? '' : 'none';
    });
}

function apriModaleOrdine(docId, panettoni, pandori, status, metodo = "-") {
    document.getElementById('edit-doc-id').value = docId;
    document.getElementById('edit-pan').value = panettoni;
    document.getElementById('edit-pan-dori').value = pandori;
    
    const selStatus = document.getElementById('edit-status');
    for(let i=0; i<selStatus.options.length; i++) {
        if(selStatus.options[i].value.toLowerCase() === status.toLowerCase()) { selStatus.selectedIndex = i; break; }
    }

    const selMetodo = document.getElementById('edit-metodo-pagamento');
    for(let i=0; i<selMetodo.options.length; i++) {
        if(selMetodo.options[i].value.toLowerCase() === metodo.toLowerCase()) { selMetodo.selectedIndex = i; break; }
    }

    document.getElementById('edit-modal').style.display = 'flex';
}

function apriModaleStock(tipo) {
    document.getElementById('input-tot-pan').value = impostazioniGlobali["Totale Panettoni"] || 0;
    document.getElementById('input-tot-pand').value = impostazioniGlobali["Totale Pandori"] || 0;
    document.getElementById('stock-modal').style.display = 'flex';
}

function salvaStock() {
    const totPan = parseInt(document.getElementById('input-tot-pan').value) || 0;
    const totPand = parseInt(document.getElementById('input-tot-pand').value) || 0;

    gestisciStockAPI(totPan, totPand).then(() => {
        aggiungiLogAPI("STOCK", currentUserEmail, `Aggiornato stock iniziale: Panettoni=${totPan}, Pandori=${totPand}`);
        chiudiModale('stock-modal');
    });
}

function chiudiModale(modalId) { 
    document.getElementById(modalId).style.display = 'none'; 
}

function salvaModificaOrdine() {
    const docId = document.getElementById('edit-doc-id').value;
    const panettoni = parseInt(document.getElementById('edit-pan').value) || 0;
    const pandori = parseInt(document.getElementById('edit-pan-dori').value) || 0;
    const status = document.getElementById('edit-status').value;
    const metodo = document.getElementById('edit-metodo-pagamento').value;

    inviaAggiornamentoOrdineAPI(docId, {
        panettoni: panettoni,
        pandori: pandori,
        status: status,
        metodoPagamento: metodo
    }).then(() => {
        aggiungiLogAPI("MODIFICA", currentUserEmail, `Modificato ordine: Pan=${panettoni}, Pand=${pandori}, Status=${status}, Metodo=${metodo}`);
        chiudiModale('edit-modal');
    });
}

function esportaExcel() {
    if(datiGlobali.length === 0) return alert("Nessun dato!");
    const datiPuliti = datiGlobali.map(({id, timestamp, ...resto}) => {
        if (timestamp && timestamp.toDate) {
            resto.data = timestamp.toDate().toLocaleString('it-IT');
        }
        return resto;
    });
    const ws = XLSX.utils.json_to_sheet(datiPuliti);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ordini");
    XLSX.writeFile(wb, "Ordini_WonderLAD.xlsx");
}

let testCounter = 0;
function popolaDatiTest() {
    const ordiniTest = [
        { nome: "Mario", cognome: "Rossi", telefono: "3381234567", panettoni: 2, pandori: 1, status: "Prenotato - Da Pagare", metodoPagamento: "-" },
        { nome: "Giuseppe", cognome: "Verdi", telefono: "3409876543", panettoni: 1, pandori: 3, status: "Prenotato - Pagato", metodoPagamento: "Cash" },
        { nome: "Elena", cognome: "Bianchi", telefono: "3201122334", panettoni: 4, pandori: 2, status: "In Preparazione", metodoPagamento: "POS" },
        { nome: "Francesca", cognome: "Neri", telefono: "3334455667", panettoni: 0, pandori: 2, status: "Da Consegnare", metodoPagamento: "Bonifico" }
    ];

    ordiniTest.forEach(o => {
        db.collection("ordini").add({
            ...o,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        testCounter++;
    });

    aggiungiLogAPI("INSERIMENTO", currentUserEmail, "Inseriti ordini e dati di prova nel DB");
    document.getElementById('contatoreOrdiniTest').textContent = `Sessione caricata. Totale ordini simulati: ${testCounter}`;
    alert("Dati di prova inseriti con successo!");
}

function eseguiTestLettura() {
    esecuzioniTestLettura++;
    console.log(`Esecuzione Test Lettura #${esecuzioniTestLettura} avviata.`);
    document.getElementById('loadingMsg').style.display = 'block';
    setTimeout(() => {
        document.getElementById('loadingMsg').style.display = 'none';
        alert(`Test lettura eseguito correttamente. Progressivo esecuzioni: ${esecuzioniTestLettura}`);
    }, 500);
}
