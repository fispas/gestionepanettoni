// Config Firebase condivisa. La apiKey web NON e' un segreto: la protezione
// sta nelle Security Rules (firestore.rules) + restrizioni per dominio
// (Google Cloud Console > Credenziali > HTTP referrer) + App Check.
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
const auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;

// Documento unico di configurazione: stock, prezzi, apertura prenotazioni.
const CONFIG_REF = db.collection("impostazioni").doc("stock");

const CONFIG_DEFAULT = {
    totalePanettoni: 500,
    totalePandori: 500,
    prezzoPanettone: 15,
    prezzoPandoro: 15,
    ordiniAperti: true
};

// Legge i nuovi campi con fallback sui vecchi ("Totale Panettoni", ecc.)
function normalizzaConfig(raw) {
    const d = raw || {};
    return {
        totalePanettoni: parseInt(d.totalePanettoni ?? d["Totale Panettoni"]) || CONFIG_DEFAULT.totalePanettoni,
        totalePandori: parseInt(d.totalePandori ?? d["Totale Pandori"]) || CONFIG_DEFAULT.totalePandori,
        prezzoPanettone: Number(d.prezzoPanettone ?? CONFIG_DEFAULT.prezzoPanettone),
        prezzoPandoro: Number(d.prezzoPandoro ?? CONFIG_DEFAULT.prezzoPandoro),
        ordiniAperti: d.ordiniAperti !== false
    };
}
