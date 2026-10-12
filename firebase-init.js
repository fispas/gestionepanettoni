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

// impostazioni/generali: campagna attiva, contatti di emergenza, referenti,
// luoghi di ritiro, dati dell'informativa. Leggibile da tutti.
const GENERALI_REF = db.collection("impostazioni").doc("generali");

// impostazioni/messaggi: modelli dei messaggi. Solo staff.
const MODELLI_REF = db.collection("impostazioni").doc("messaggi");

// impostazioni/stock: documento della versione precedente, letto solo
// dalla migrazione per recuperare stock e prezzi storici.
const STOCK_LEGACY_REF = db.collection("impostazioni").doc("stock");

function campagnaRef(id) {
    return db.collection("campagne").doc(id);
}

// Unisce i dati salvati ai predefiniti, cosi' un campo mancante non rompe le pagine.
function normalizzaGenerali(raw) {
    const d = raw || {};
    const def = Modello.GENERALI_DEFAULT;
    return {
        campagnaAttiva: d.campagnaAttiva || def.campagnaAttiva,
        contattiEmergenza: typeof d.contattiEmergenza === 'string' ? d.contattiEmergenza : def.contattiEmergenza,
        referenti: Array.isArray(d.referenti) ? d.referenti : def.referenti.slice(),
        luoghi: Array.isArray(d.luoghi) ? d.luoghi : def.luoghi.slice(),
        privacy: Object.assign({}, def.privacy, d.privacy || {})
    };
}

function normalizzaModelli(raw) {
    const d = raw || {};
    const out = {};
    Object.keys(Modello.MODELLI_DEFAULT).forEach(k => {
        out[k] = Object.assign({}, Modello.MODELLI_DEFAULT[k], d[k] || {});
    });
    return out;
}

// Carica impostazioni generali e campagna attiva in un colpo solo.
// Restituisce { generali, campagna, id, inizializzato }.
function caricaCampagnaAttiva() {
    return GENERALI_REF.get().then(doc => {
        const generali = normalizzaGenerali(doc.exists ? doc.data() : null);
        return campagnaRef(generali.campagnaAttiva).get().then(c => ({
            generali: generali,
            id: generali.campagnaAttiva,
            campagna: c.exists ? c.data() : null,
            inizializzato: doc.exists && c.exists
        }));
    });
}
