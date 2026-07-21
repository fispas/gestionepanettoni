let datiGlobali = [];
let utentiGlobali = [];
let logsGlobali = [];
let impostazioniGlobali = {};
let rowCounter = 0;
let currentUser = ""; 
let currentRole = "";
let filtroStatoAttuale = "Tutti";
let filtroLogCatAttuale = "Tutti";

window.addEventListener('DOMContentLoaded', () => {
    const sessionUser = sessionStorage.getItem('wonderlad_active_user') || localStorage.getItem('wonderlad_user');
    const sessionRole = sessionStorage.getItem('wonderlad_active_role');

    if (sessionUser && sessionRole) {
        currentUser = sessionUser;
        currentRole = sessionRole;
        avviaInterfaccia();
    }
});

function effettuaLogin() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('passcode').value;
    const btn = document.getElementById('btn-login');

    if(!user || !pass) return;

    btn.textContent = "Verifica...";
    btn.disabled = true;

    effettuaLoginAPI(user, pass)
        .then(result => {
            if(result.status === "success") {
                currentUser = user;
                currentRole = result.role;

                sessionStorage.setItem('wonderlad_active_user', currentUser);
                sessionStorage.setItem('wonderlad_active_role', currentRole);

                avviaInterfaccia();
            } else {
                document.getElementById('login-err').style.display = 'block';
                btn.textContent = "Accedi";
                btn.disabled = false;
            }
        })
        .catch(() => {
            document.getElementById('login-err').style.display = 'block';
            btn.textContent = "Accedi";
            btn.disabled = false;
        });
}

function avviaInterfaccia() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('user-badge').textContent = `(${currentUser} - ${currentRole})`;

    const isAdmin = currentRole.toLowerCase() === 'administrator';
    
    const nav = document.getElementById('bottomNav');
    const existingUtentiBtn = document.getElementById('btn-nav-utenti');
    const existingLogBtn = document.getElementById('btn-nav-log');

    if (isAdmin) {
        if (!existingUtentiBtn) {
            nav.innerHTML += `
                <button id="btn-nav-utenti" class="nav-item" onclick="switchView('utenti', this)">
                    <span class="nav-icon">⚙️</span>Utenti
                </button>
            `;
        }
        if (!existingLogBtn) {
            nav.innerHTML += `
                <button id="btn-nav-log" class="nav-item" onclick="switchView('log', this)">
                    <span class="nav-icon">📜</span>Log
                </button>
            `;
        }
    } else {
        if (existingUtentiBtn) existingUtentiBtn.remove();
        if (existingLogBtn) existingLogBtn.remove();
    }

    caricaDati();
}

function effettuaLogout() {
    if (confirm("Vuoi davvero uscire dal sistema?")) {
        sessionStorage.removeItem('wonderlad_active_user');
        sessionStorage.removeItem('wonderlad_active_role');
        location.reload();
    }
}

function switchView(viewName, btnElement) {
    if ((viewName === 'utenti' || viewName === 'log') && currentRole.toLowerCase() !== 'administrator') {
        alert("Accesso non autorizzato. Questa sezione è riservata agli Administrator.");
        return;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    btnElement.classList.add('active');
}

function caricaDati() {
    document.getElementById('loadingMsg').style.display = 'block';
    document.getElementById('tabellaOrdini').style.display = 'none';

    recuperaDatiAPI().then(result => {
        if(result.status === "success") {
            datiGlobali = result.data;
            utentiGlobali = result.utenti || [];
            logsGlobali = result.logs || [];
            impostazioniGlobali = result.impostazioni || {};

            popolaTabellaOrdini(datiGlobali);
            
            if (currentRole.toLowerCase() === 'administrator') {
                popolaTabellaUtenti(utentiGlobali);
                popolaTabellaLog(logsGlobali);
            }

            calcolaStatistiche(datiGlobali, impostazioniGlobali);
            document.getElementById('loadingMsg').style.display = 'none';
        }
    });
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
    const thead = document.getElementById('testaTabella');
    const tbody = document.getElementById('corpoTabella');
    thead.innerHTML = ''; tbody.innerHTML = ''; rowCounter = 0;
    if(dati.length === 0) return;

    const colonneOriginali = Object.keys(dati[0]);
    const trHead = document.createElement('tr');
    
    colonneOriginali.forEach(col => {
        if(col !== "rowNumber" && col.trim() !== "") {
            const th = document.createElement('th');
            th.textContent = col;
            trHead.appendChild(th);
        }
    });
    const thAzioni = document.createElement('th');
    thAzioni.textContent = "Azioni";
    trHead.appendChild(thAzioni);
    thead.appendChild(trHead);

    dati.forEach(ordine => {
        if(!ordine.Nome && !ordine.Cognome) return; 
        rowCounter++;
        const tr = document.createElement('tr');
        tr.setAttribute('data-nome', (ordine.Nome + " " + ordine.Cognome + " " + ordine.Telefono).toLowerCase());
        tr.setAttribute('data-stato', ordine.Status || "");
        tr.setAttribute('data-panettoni', ordine.Panettoni || 0);
        tr.setAttribute('data-pandori', ordine.Pandori || 0);
        
        colonneOriginali.forEach(col => {
            if(col !== "rowNumber" && col.trim() !== "") {
                const td = document.createElement('td');
                td.setAttribute('data-label', col);
                let valore = ordine[col];
                
                if(col.toLowerCase().includes('data') && valore) {
                    const d = new Date(valore);
                    if(!isNaN(d)) valore = d.toLocaleDateString('it-IT') + " " + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
                }

                if(col.toLowerCase() === 'telefono' && valore) {
                    const cleanTel = String(valore).replace(/\D/g, '');
                    const msgWa = encodeURIComponent(`Ciao ${ordine.Nome || ''}, ti contattiamo da WonderLAD in merito al tuo ordine per i dolci solidali.`);
                    valore = `<a href="https://wa.me/39${cleanTel}?text=${msgWa}" target="_blank" class="wa-link">📱 ${valore}</a>`;
                }
                
                if(col.toLowerCase() === 'status' || col.toLowerCase() === 'stato') {
                    const badgeClass = getBadgeClass(valore);
                    td.innerHTML = `<span class="badge-status ${badgeClass}">${valore || 'Prenotato'}</span>`;
                } else {
                    td.innerHTML = `<span>${valore || '-'}</span>`;
                }
                tr.appendChild(td);
            }
        });
        
        const currentStatus = ordine.Status || 'Prenotato';
        let nextStatusBtn = '';
        if(currentStatus.includes('Da Pagare')) {
            nextStatusBtn = `<button class="btn-quick-status" onclick="apriModaleSaldoRapido(${ordine.rowNumber}, ${ordine.Panettoni || 0}, ${ordine.Pandori || 0})">✅ Pagato</button>`;
        } else if(currentStatus.includes('Da Consegnare') || currentStatus.includes('In Preparazione')) {
            nextStatusBtn = `<button class="btn-quick-status" onclick="cambiaStatoRapido(${ordine.rowNumber}, ${ordine.Panettoni || 0}, ${ordine.Pandori || 0}, 'Consegnato', '${ordine["Metodo Pagamento"] || "-"}')">✅ Consegnato</button>`;
        }

        const tdAzioni = document.createElement('td');
        tdAzioni.setAttribute('data-label', 'Azioni');
        tdAzioni.innerHTML = `${nextStatusBtn}<button class="btn-edit" onclick="apriModaleOrdine(${ordine.rowNumber}, ${ordine.Panettoni || 0}, ${ordine.Pandori || 0}, '${ordine.Status || 'Prenotato'}', '${ordine["Metodo Pagamento"] || "-"}')">✏️ Modifica</button>`;
        tr.appendChild(tdAzioni);
        tbody.appendChild(tr);
    });
    document.getElementById('tabellaOrdini').style.display = 'table';
    document.getElementById('contatoreOrdini').textContent = `Sessione caricata. Totale righe analizzate: ${rowCounter}`;
    filtraOrdini();
}

function apriModaleSaldoRapido(rowNumber, panettoni, pandori) {
    document.getElementById('pay-row').value = rowNumber;
    document.getElementById('pay-pan').value = panettoni;
    document.getElementById('pay-pand').value = pandori;
    document.getElementById('pay-modal').style.display = 'flex';
}

function confermaSaldoRapido() {
    const rowNumber = document.getElementById('pay-row').value;
    const panettoni = document.getElementById('pay-pan').value;
    const pandori = document.getElementById('pay-pand').value;
    const metodo = document.getElementById('pay-method-select').value;

    cambiaStatoRapido(rowNumber, panettoni, pandori, 'Prenotato - Pagato', metodo);
    chiudiModale('pay-modal');
}

function cambiaStatoRapido(rowNumber, panettoni, pandori, nuovoStato, metodoPagamento = "-") {
    inviaAggiornamentoOrdineAPI({
        action: 'update',
        rowNumber: rowNumber,
        panettoni: panettoni,
        pandori: pandori,
        status: nuovoStato,
        metodoPagamento: metodoPagamento,
        user: currentUser
    }).then(() => caricaDati());
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

        if(matchTesto && matchFiltro && matchProdotto) {
            tr.style.display = '';
        } else {
            tr.style.display = 'none';
        }
    });
}

function setFiltroStato(stato, btnElement) {
    filtroStatoAttuale = stato;
    document.querySelectorAll('#view-ordini .filter-chips .chip').forEach(c => c.classList.remove('active'));
    btnElement.classList.add('active');
    filtraOrdini();
}

function filtraUtenti() {
    const query = document.getElementById('searchUtenti').value.toLowerCase();
    const rows = document.querySelectorAll('#corpoUtenti tr');
    rows.forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(query) ? '' : 'none';
    });
}

function popolaTabellaUtenti(utenti) {
    const tbody = document.getElementById('corpoUtenti');
    tbody.innerHTML = '';
    
    utenti.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Username"><span>${u.Username}</span></td>
            <td data-label="Password"><span>••••••</span></td>
            <td data-label="Ruolo"><span>${u.Ruolo}</span></td>
            <td data-label="Azioni">
                <button class="btn-edit" onclick="apriModaleUtente('edit', ${u.rowNumber}, '${u.Username}', '${u.Password}', '${u.Ruolo}')">✏️ Modifica</button>
                <button class="btn-delete" onclick="eliminaUtente(${u.rowNumber}, '${u.Username}')">🗑️ Elimina</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getLogBadgeClass(cat) {
    if(!cat) return 'log-inserimento';
    const c = cat.toUpperCase();
    if(c.includes('INSERIMENTO')) return 'log-inserimento';
    if(c.includes('MODIFICA')) return 'log-modifica';
    if(c.includes('LOGIN')) return 'log-login';
    if(c.includes('STOCK')) return 'log-stock';
    if(c.includes('UTENTE')) return 'log-utente';
    if(c.includes('BACKUP')) return 'log-backup';
    return 'log-inserimento';
}

function popolaTabellaLog(logs) {
    const tbody = document.getElementById('corpoLog');
    tbody.innerHTML = '';
    if(!logs || logs.length === 0) return;

    const logReversi = [...logs].reverse();

    logReversi.forEach(l => {
        const keys = Object.keys(l);
        let dataVal = l[keys[0]] || l.Data || l.Timestamp || '-';
        let catVal = l[keys[1]] || l.Azione || l.Categoria || '-';
        let userVal = l[keys[2]] || l.Utente || '-';
        let detVal = l[keys[3]] || l.Dettaglio || l.Descrizione || '-';

        if(dataVal !== '-' && !isNaN(new Date(dataVal))) {
            const d = new Date(dataVal);
            dataVal = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', {hour: '2-digit', minute:'2-digit'});
        }

        const badgeClass = getLogBadgeClass(catVal);

        const tr = document.createElement('tr');
        tr.setAttribute('data-cat', String(catVal).toUpperCase());
        tr.innerHTML = `
            <td data-label="Data/Ora"><span>${dataVal}</span></td>
            <td data-label="Categoria"><span class="log-badge ${badgeClass}">${catVal}</span></td>
            <td data-label="Utente"><strong>${userVal}</strong></td>
            <td data-label="Dettaglio"><span>${detVal}</span></td>
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

        if(matchTesto && matchCat) {
            tr.style.display = '';
        } else {
            tr.style.display = 'none';
        }
    });
}

function apriModaleOrdine(row, panettoni, pandori, status, metodo = "-") {
    document.getElementById('edit-row').value = row;
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
    if (currentRole.toLowerCase() !== 'administrator') {
        alert("Operazione non consentita per il ruolo Manager.");
        return;
    }
    document.getElementById('input-tot-pan').value = impostazioniGlobali["Totale Panettoni"] || 0;
    document.getElementById('input-tot-pand').value = impostazioniGlobali["Totale Pandori"] || 0;
    document.getElementById('stock-modal').style.display = 'flex';
}

function salvaStock() {
    if (currentRole.toLowerCase() !== 'administrator') return;

    const totPan = document.getElementById('input-tot-pan').value;
    const totPand = document.getElementById('input-tot-pand').value;

    gestisciStockAPI(totPan, totPand, currentUser).then(() => {
        chiudiModale('stock-modal');
        caricaDati();
    });
}

function apriModaleUtente(mode, row = '', username = '', password = '', ruolo = 'Manager') {
    if (currentRole.toLowerCase() !== 'administrator') return;

    document.getElementById('modal-mode').value = mode;
    document.getElementById('modal-user-row').value = row;
    document.getElementById('modal-username').value = username;
    document.getElementById('modal-password').value = password;
    
    const sel = document.getElementById('modal-role');
    for(let i=0; i<sel.options.length; i++) {
        if(sel.options[i].value === ruolo) { sel.selectedIndex = i; break; }
    }

    document.getElementById('user-modal-title').textContent = mode === 'add' ? 'Nuovo Utente' : 'Modifica Utente / Resetta Password';
    document.getElementById('user-modal').style.display = 'flex';
}

function chiudiModale(modalId) { 
    document.getElementById(modalId).style.display = 'none'; 
    
    if (modalId === 'user-modal') {
        document.getElementById('modal-username').value = '';
        document.getElementById('modal-password').value = '';
    } else if (modalId === 'edit-modal') {
        document.getElementById('edit-pan').value = '';
        document.getElementById('edit-pan-dori').value = '';
    }
}

function salvaModificaOrdine() {
    const row = document.getElementById('edit-row').value;
    const panettoni = document.getElementById('edit-pan').value;
    const pandori = document.getElementById('edit-pan-dori').value;
    const status = document.getElementById('edit-status').value;
    const metodo = document.getElementById('edit-metodo-pagamento').value;

    inviaAggiornamentoOrdineAPI({
        action: 'update',
        rowNumber: row,
        panettoni: panettoni,
        pandori: pandori,
        status: status,
        metodoPagamento: metodo,
        user: currentUser
    }).then(() => {
        chiudiModale('edit-modal');
        caricaDati(); 
    });
}

function salvaUtente() {
    if (currentRole.toLowerCase() !== 'administrator') return;

    const mode = document.getElementById('modal-mode').value;
    const row = document.getElementById('modal-user-row').value;
    const username = document.getElementById('modal-username').value.trim();
    const password = document.getElementById('modal-password').value.trim();
    const ruolo = document.getElementById('modal-role').value;

    if(!username || !password) return alert("Inserisci username e password!");

    const action = mode === 'add' ? 'add_user' : 'update_user';

    gestisciUtenteAPI(action, row, username, password, ruolo, currentUser).then(() => {
        chiudiModale('user-modal');
        caricaDati();
    });
}

function eliminaUtente(row, username) {
    if (currentRole.toLowerCase() !== 'administrator') return;

    if(confirm(`Sei sicuro di voler eliminare l'utente "${username}"?`)) {
        eliminaUtenteAPI(row, currentUser).then(() => caricaDati());
    }
}

function esportaExcel() {
    if(datiGlobali.length === 0) return alert("Nessun dato!");
    const datiPuliti = datiGlobali.map(({rowNumber, ...resto}) => resto);
    const ws = XLSX.utils.json_to_sheet(datiPuliti);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ordini");
    XLSX.writeFile(wb, "Ordini_WonderLAD.xlsx");
}

function eseguiTestLettura() { caricaDati(); }
