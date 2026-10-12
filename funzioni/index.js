// WonderLAD - Cloud Functions per le email automatiche.
//
//  confermaPrenotazione  alla creazione di un ordine: email di conferma
//  avvisoOrdine          all'aggiornamento: ritiro assegnato/cambiato, oppure ordine pronto
//  promemoriaRitiro      ogni giorno alle 17: promemoria per i ritiri del giorno dopo
//  inviaEmail            chiamata dal pannello: invio manuale di un modello o email di prova
//
// Ogni invio (riuscito o fallito) viene registrato in ordini/{id}.messaggi,
// cosi' il pannello mostra chi e' stato avvisato e chi no.
// I testi sono i modelli modificabili dall'Administrator (impostazioni/messaggi).

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { defineSecret, defineString, defineInt } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const M = require('./modello.js');

// Deve coincidere con REGIONE_FUNZIONI in firebase-init.js e con la
// posizione del database Firestore (vedi README).
const REGIONE = 'europe-west1';
const FUSO = 'Europe/Rome';

setGlobalOptions({ region: REGIONE, maxInstances: 5 });
admin.initializeApp();
const db = admin.firestore();

/* ==========================================================
   PARAMETRI (chiesti dalla CLI al primo deploy)
   ========================================================== */

const SMTP_HOST = defineString('SMTP_HOST', { description: 'Server SMTP, es. smtp-relay.brevo.com oppure smtp.gmail.com' });
const SMTP_PORT = defineInt('SMTP_PORT', { default: 587, description: 'Porta SMTP: 587 (STARTTLS) o 465 (SSL)' });
const SMTP_USER = defineString('SMTP_USER', { description: 'Utente SMTP (login fornito dal servizio)' });
const MITTENTE = defineString('MITTENTE', { description: 'Mittente visibile, es. WonderLAD <noreply@wonderlad.org>' });
const SITO = defineString('SITO', { default: 'https://gestionepanettoni.pages.dev/', description: 'Indirizzo del sito, per il link all\'informativa' });
const SMTP_PASS = defineSecret('SMTP_PASS');

let trasporto = null;
function postino() {
    if (trasporto) return trasporto;
    const porta = SMTP_PORT.value();
    trasporto = nodemailer.createTransport({
        host: SMTP_HOST.value(),
        port: porta,
        secure: porta === 465,
        auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
    });
    return trasporto;
}

/* ==========================================================
   CONTESTO: impostazioni, modelli, campagna
   ========================================================== */

function normalizzaGenerali(d) {
    d = d || {};
    const def = M.GENERALI_DEFAULT;
    return {
        campagnaAttiva: d.campagnaAttiva || def.campagnaAttiva,
        contattiEmergenza: typeof d.contattiEmergenza === 'string' ? d.contattiEmergenza : '',
        automazioni: Object.assign({}, def.automazioni, d.automazioni || {}),
        emailRisposta: typeof d.emailRisposta === 'string' ? d.emailRisposta : '',
        privacy: Object.assign({}, def.privacy, d.privacy || {})
    };
}

function normalizzaModelli(d) {
    d = d || {};
    const out = {};
    Object.keys(M.MODELLI_DEFAULT).forEach(k => { out[k] = Object.assign({}, M.MODELLI_DEFAULT[k], d[k] || {}); });
    return out;
}

async function contesto(campagnaId) {
    const [gen, mod, camp] = await Promise.all([
        db.doc('impostazioni/generali').get(),
        db.doc('impostazioni/messaggi').get(),
        campagnaId ? db.doc('campagne/' + campagnaId).get() : Promise.resolve(null)
    ]);
    return {
        generali: normalizzaGenerali(gen.exists ? gen.data() : null),
        modelli: normalizzaModelli(mod.exists ? mod.data() : null),
        campagna: camp && camp.exists ? camp.data() : null
    };
}

/* ==========================================================
   COMPOSIZIONE DELL'EMAIL
   ========================================================== */

function paragrafiHtml(testo) {
    return String(testo || '').split(/\n{2,}/).map(p =>
        `<p style="margin:0 0 14px;line-height:1.55">${M.esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

function componiEmail(oggetto, testo, generali, sito) {
    const titolare = (generali.privacy && generali.privacy.titolare) || 'WonderLAD';
    const linkPrivacy = String(sito || '').replace(/\/?$/, '/') + 'privacy.html';
    const piedeTesto = `\n\n--\n${titolare}\nInformativa privacy: ${linkPrivacy}\n` +
        'Ricevi questa email perché hai effettuato una prenotazione solidale.';

    const html = `<!doctype html><html lang="it"><body style="margin:0;background:#f6fff8;font-family:Arial,Helvetica,sans-serif;color:#2c3e35">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6fff8;padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #e2ece9;border-radius:18px">
    <tr><td style="padding:22px 26px 6px;border-bottom:3px solid #6b9080">
      <div style="font-size:22px;font-weight:bold;color:#4d6a5b">WonderLAD</div>
      <div style="font-size:13px;color:#6b7c73;margin:2px 0 12px">Dolci solidali</div>
    </td></tr>
    <tr><td style="padding:22px 26px 8px;font-size:15px">${paragrafiHtml(testo)}</td></tr>
    <tr><td style="padding:12px 26px 22px;font-size:11px;color:#8a9a92;border-top:1px solid #e2ece9">
      ${M.esc(titolare)} · <a href="${M.esc(linkPrivacy)}" style="color:#4d6a5b">Informativa privacy</a><br>
      Ricevi questa email perché hai effettuato una prenotazione solidale.
    </td></tr>
  </table>
</td></tr></table></body></html>`;

    return { subject: String(oggetto || 'WonderLAD').slice(0, 150), text: String(testo || '') + piedeTesto, html };
}

async function spedisci(destinatario, email, generali) {
    const rispondiA = (generali.emailRisposta || generali.privacy.emailPrivacy || '').trim();
    return postino().sendMail({
        from: MITTENTE.value(),
        to: destinatario,
        replyTo: rispondiA || undefined,
        subject: email.subject,
        text: email.text,
        html: email.html
    });
}

/* ==========================================================
   INVIO E REGISTRAZIONE SULL'ORDINE
   ========================================================== */

async function registra(ref, voce) {
    await ref.update({ messaggi: admin.firestore.FieldValue.arrayUnion(voce) });
}

// Invia un modello a un ordine e registra l'esito. Restituisce la voce registrata.
async function inviaModello(ref, ordine, chiave, opz) {
    opz = opz || {};
    const ctx = opz.ctx || await contesto(ordine.campagnaId);
    const modello = ctx.modelli[chiave];
    const oggetto = opz.oggetto != null ? opz.oggetto : M.compilaModello(modello.oggetto, ordine, ctx.campagna, ctx.generali);
    const testo = opz.testo != null ? opz.testo : M.compilaModello(modello.testo, ordine, ctx.campagna, ctx.generali);

    const voce = {
        modello: chiave,
        canale: 'email',
        automatico: !!opz.automatico,
        utente: opz.utente || 'sistema',
        quando: new Date().toISOString(),
        destinatario: ordine.email || ''
    };
    if (opz.rif) voce.rif = opz.rif;

    if (!M.validaEmail(ordine.email)) {
        voce.esito = 'errore';
        voce.dettaglio = 'indirizzo email mancante o non valido';
    } else {
        try {
            await spedisci(ordine.email, componiEmail(oggetto, testo, ctx.generali, SITO.value()), ctx.generali);
            voce.esito = 'inviato';
        } catch (e) {
            voce.esito = 'errore';
            voce.dettaglio = String(e && e.message || e).slice(0, 200);
            logger.error('Invio fallito', { ordine: ref.id, modello: chiave, errore: voce.dettaglio });
        }
    }
    await registra(ref, voce);
    return voce;
}

function giaInviato(ordine, chiave, rif) {
    return (ordine.messaggi || []).some(m =>
        m.modello === chiave && m.canale === 'email' && m.esito === 'inviato' && (rif == null || m.rif === rif));
}

/* ==========================================================
   QUALE AVVISO SPEDIRE DOPO UNA MODIFICA (logica pura, testata)
   ========================================================== */

function chiaveRitiro(o) {
    const r = (o && o.ritiro) || {};
    return r.data ? [r.data, r.luogo || '', r.referente || ''].join('|') : '';
}

function avvisoDopoModifica(prima, dopo) {
    if (!dopo || dopo.status === 'Annullato') return null;
    if (M.bucketLogistico(dopo.status) === 'consegnato') return null;
    // La migrazione degli ordini storici non deve far partire email.
    if (!prima.campagnaId && dopo.campagnaId) return null;

    const kPrima = chiaveRitiro(prima);
    const kDopo = chiaveRitiro(dopo);
    if (kDopo && kDopo !== kPrima) return { modello: 'ritiro', rif: kDopo };

    if (dopo.status === 'Da Consegnare' && prima.status !== 'Da Consegnare' && !kDopo) {
        return { modello: 'pronto', rif: null };
    }
    return null;
}

/* ==========================================================
   TRIGGER
   ========================================================== */

const conSegreti = { secrets: [SMTP_PASS] };

exports.confermaPrenotazione = onDocumentCreated(Object.assign({ document: 'ordini/{id}' }, conSegreti), async (event) => {
    const snap = event.data;
    if (!snap) return;
    const ordine = snap.data();
    if (!ordine.email || ordine.status === 'Annullato') return;

    const ctx = await contesto(ordine.campagnaId);
    if (!ctx.generali.automazioni.conferma) return;
    if (giaInviato(ordine, 'conferma')) return;   // evento ricevuto due volte

    await inviaModello(snap.ref, ordine, 'conferma', { automatico: true, ctx });
});

exports.avvisoOrdine = onDocumentUpdated(Object.assign({ document: 'ordini/{id}' }, conSegreti), async (event) => {
    const prima = event.data.before.data();
    const dopo = event.data.after.data();
    const avviso = avvisoDopoModifica(prima, dopo);
    if (!avviso || !dopo.email) return;

    const ctx = await contesto(dopo.campagnaId);
    if (!ctx.generali.automazioni[avviso.modello]) return;
    if (giaInviato(dopo, avviso.modello, avviso.rif)) return;

    await inviaModello(event.data.after.ref, dopo, avviso.modello, { automatico: true, rif: avviso.rif, ctx });
});

// Data di domani nel fuso italiano, in formato AAAA-MM-GG.
function domani(ora) {
    const d = new Date((ora || new Date()).getTime() + 24 * 3600 * 1000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

exports.promemoriaRitiro = onSchedule(Object.assign({ schedule: 'every day 17:00', timeZone: FUSO }, conSegreti), async () => {
    const giorno = domani();
    const snap = await db.collection('ordini')
        .where('ritiro.data', '>=', giorno)
        .where('ritiro.data', '<', giorno + '')
        .get();
    if (snap.empty) return;

    const contesti = {};
    let inviati = 0;
    for (const doc of snap.docs) {
        const o = doc.data();
        if (o.status === 'Annullato' || M.bucketLogistico(o.status) === 'consegnato' || !o.email) continue;
        const ctx = contesti[o.campagnaId] || (contesti[o.campagnaId] = await contesto(o.campagnaId));
        if (!ctx.generali.automazioni.promemoria) return;
        if (giaInviato(o, 'promemoria', o.ritiro.data)) continue;
        const voce = await inviaModello(doc.ref, o, 'promemoria', { automatico: true, rif: o.ritiro.data, ctx });
        if (voce.esito === 'inviato') inviati++;
    }
    logger.info(`Promemoria per il ${giorno}: ${inviati} inviati su ${snap.size}`);
});

// Invio manuale dal pannello (testo eventualmente modificato dall'operatore)
// oppure email di prova all'operatore stesso.
exports.inviaEmail = onCall(conSegreti, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Accesso richiesto.');
    const profilo = await db.doc('utenti/' + request.auth.uid).get();
    if (!profilo.exists) throw new HttpsError('permission-denied', 'Utente non abilitato.');
    const operatore = request.auth.token.email || request.auth.uid;
    const dati = request.data || {};

    if (dati.prova) {
        const gen = await db.doc('impostazioni/generali').get();
        const generali = normalizzaGenerali(gen.exists ? gen.data() : null);
        try {
            await spedisci(operatore, componiEmail('Prova invio WonderLAD',
                'Ciao, questa è un\'email di prova del gestionale WonderLAD.\n\nSe la leggi, l\'invio automatico funziona.', generali, SITO.value()), generali);
        } catch (e) {
            throw new HttpsError('internal', 'Invio non riuscito: ' + String(e && e.message || e).slice(0, 200));
        }
        return { ok: true, destinatario: operatore };
    }

    const id = String(dati.ordineId || '');
    const chiave = String(dati.modello || 'libero');
    if (!id) throw new HttpsError('invalid-argument', 'Ordine mancante.');
    const oggetto = String(dati.oggetto || '').slice(0, 150);
    const testo = String(dati.testo || '').slice(0, 3000);
    if (!testo.trim()) throw new HttpsError('invalid-argument', 'Testo vuoto.');

    const ref = db.doc('ordini/' + id);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Ordine inesistente.');

    const voce = await inviaModello(ref, snap.data(), chiave in M.MODELLI_DEFAULT ? chiave : 'libero', {
        automatico: false, utente: operatore, oggetto: oggetto || 'WonderLAD', testo,
        ctx: await contesto(snap.data().campagnaId)
    });
    if (voce.esito !== 'inviato') throw new HttpsError('internal', 'Invio non riuscito: ' + (voce.dettaglio || 'errore sconosciuto'));
    return { ok: true, destinatario: voce.destinatario };
});

// Esposte solo nei test locali: in produzione la CLI non deve vederle.
if (process.env.WL_TEST) {
    exports._test = { avvisoDopoModifica, componiEmail, domani, chiaveRitiro, giaInviato };
}
