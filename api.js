const API_URL = 'https://script.google.com/macros/s/AKfycbze7XWXu3OK3PF8TtDUftN-zBjKRuDz_FAcqXFNHtK2Ns6hNeUykEoi92tz0XHRbquEXA/exec';

function effettuaLoginAPI(user, pass) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login_check', user: user, pass: pass })
    }).then(res => res.json());
}

function recuperaDatiAPI() {
    return fetch(API_URL).then(res => res.json());
}

function inviaAggiornamentoOrdineAPI(payload) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    }).then(res => res.json());
}

function gestisciStockAPI(totPan, totPand, user) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update_stock', totPanettoni: totPan, totPandori: totPand, user: user })
    }).then(res => res.json());
}

function gestisciUtenteAPI(actionType, row, username, password, ruolo, user) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: actionType, rowNumber: row, newUsername: username, newPassword: password, newRole: ruolo, user: user })
    }).then(res => res.json());
}

function eliminaUtenteAPI(row, user) {
    return fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete_user', rowNumber: row, user: user })
    }).then(res => res.json());
}
