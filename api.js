// api.js
const firebaseConfig = {
    apiKey: "AIzaSyAjwLhDJkxtriCjGygPMPgk4Fjc_d_rtDs",
    authDomain: "wonderlad-ordini.firebaseapp.com",
    projectId: "wonderlad-ordini",
    storageBucket: "wonderlad-ordini.firebasestorage.app",
    messagingSenderId: "1016384282148",
    appId: "1:1016384282148:web:8e8c16e889baed9d09c2b1",
    measurementId: "G-065ZY1K7JX"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

function effettuaLoginAPI(user, pass) {
    let emailFormat = user.includes('@') ? user : user + "@wonderlad.org";
    return auth.signInWithEmailAndPassword(emailFormat, pass);
}

function registraNuovoUtenteAPI(user, pass) {
    let emailFormat = user.includes('@') ? user : user + "@wonderlad.org";
    return auth.createUserWithEmailAndPassword(emailFormat, pass);
}

function inviaAggiornamentoOrdineAPI(docId, payload) {
    return db.collection("ordini").doc(docId).update(payload);
}

function gestisciStockAPI(totPan, totPand) {
    return db.collection("impostazioni").doc("stock").set({
        "Totale Panettoni": parseInt(totPan) || 0,
        "Totale Pandori": parseInt(totPand) || 0
    });
}

function aggiungiLogAPI(categoria, utente, dettaglio) {
    return db.collection("logs").add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        categoria: categoria,
        utente: utente,
        dettaglio: dettaglio
    });
}
