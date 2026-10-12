# Gestione Dolci Solidali — WonderLAD

Web app statica su GitHub Pages + Firestore, organizzata a **campagne** (Natale, Pasqua, …).

- `index.html` — modulo pubblico di prenotazione della campagna attiva
- `privacy.html` — informativa privacy (dati del titolare modificabili dall'Administrator)
- `gestione.html` — pannello staff (login richiesto)

## File

| File | Ruolo |
|---|---|
| `modello.js` | modello dati condiviso: campagne, prodotti, offerte, codice fiscale, modelli di messaggio, aggregazione |
| `firebase-init.js` | config Firebase, riferimenti a `impostazioni/generali`, `impostazioni/messaggi`, `campagne` |
| `index.html` | modulo pubblico costruito dai prodotti della campagna attiva |
| `privacy.html` | informativa |
| `gestione.html` | markup del pannello |
| `gestionestyle.css` | stile del pannello |
| `app.js` | auth, ruoli, ordini, ritiri, messaggi, staff, log |
| `impostazioni.js` | campagne e prodotti, campagna attiva, ritiro, contatti, privacy, modelli, inizializzazione e migrazione |
| `dashboard.js` | dashboard a widget, generica sui prodotti della campagna |
| `report.js` | riepilogo PDF su una pagina A4 |
| `export.js` | export Excel completo (ExcelJS) |
| `firestore.rules` | autorizzazioni lato server |

Ordine di caricamento in `gestione.html`, da non cambiare: `modello.js`, `firebase-init.js`, `dashboard.js`, `app.js`, `impostazioni.js`, `report.js`, `export.js`.

`anteprima-report.png` non serve all'app: si può cancellare.

## Modello dati

```
impostazioni/generali   campagnaAttiva, contattiEmergenza, referenti[], luoghi[], privacy{…}   lettura pubblica
impostazioni/messaggi   modelli: conferma, ritiro, pronto, sollecito                          solo staff
campagne/{id}           nome, stagione, ordiniAperti, titoloForm, sottotitoloForm,
                        prodotti{chiave: {nome, plurale, emoji, descrizione, peso, ingredienti,
                        allergeni, donazioneMinima, stock, attivo, ordine}}, minimoPezzo        lettura pubblica
ordini/{id}             campagnaId, righe[{prodotto, quantita, minimo}], pezzi, minimoTotale, offerta,
                        nome, cognome, telefono, email, note, codice, status, metodoPagamento,
                        ricevuta, cf, indirizzo, cap, comune, provincia,
                        consensoPrivacy, privacyVersione, consensoMarketing,
                        ritiro{data, luogo, referente}, messaggi[], timestamp
```

## Ruoli

| | Manager | Administrator |
|---|---|---|
| Vedere e modificare gli ordini (CF compreso) | ✅ | ✅ |
| Assegnare i ritiri, inviare messaggi | ✅ | ✅ |
| Export Excel | senza dati fiscali | completo, con foglio Ricevute |
| Cancellare un ordine | ❌ (usa "Annullato") | ✅ |
| Campagne, prodotti, donazioni minime, campagna attiva | ❌ | ✅ |
| Contatti di emergenza, informativa, modelli dei messaggi | ❌ | ✅ |
| Staff e log | ❌ | ✅ |

## Aggiornamento dalla versione precedente (una tantum, in quest'ordine)

1. **Carica i file** nel repo: tutti quelli della tabella sopra.
2. **Pubblica `firestore.rules`** dalla console Firebase. Va fatto prima del passo 3: le regole vecchie non permettono di scrivere nella collezione `campagne`.
   Da qui al passo 3 il modulo pubblico mostra "prenotazioni non ancora disponibili": sono pochi minuti.
3. **Accedi come Administrator → Impostazioni → Manutenzione**:
   - **Inizializza configurazione**: crea le campagne *Natale 2026* (attiva, con lo stock della versione precedente) e *Pasqua 2027* (con la colomba, prenotazioni chiuse), le impostazioni generali e i modelli dei messaggi. Non sovrascrive nulla di esistente.
   - **Migra ordini storici**: assegna gli ordini esistenti a *Natale 2026*, converte panettoni/pandori in righe e mantiene i prezzi storici (letti da `impostazioni/stock`) come donazione minima e offerta.
4. **Completa le impostazioni**: dati del titolare per l'informativa, contatti di emergenza, referenti e luoghi di ritiro, descrizioni e allergeni dei prodotti.

### Verifica delle rules (Rules Playground)

L'emulatore Firestore non era raggiungibile dall'ambiente di sviluppo: le regole sono state riviste ma vanno provate nel Playground della console.

- create `ordini` non autenticato, payload completo e valido → **consentito**
- stesso payload con `offerta` minore di `minimoTotale` → **negato**
- stesso payload con `campagnaId` diverso dalla campagna attiva → **negato**
- stesso payload con la campagna attiva in `ordiniAperti: false` → **negato**
- `ricevuta: true` con `cf: ""` → **negato**
- update `ordini` da Manager su `ritiro` e `messaggi` → **consentito**; su `campagnaId` → **negato**
- write `campagne/*` o `impostazioni/generali` da Manager → **negato**
- read `impostazioni/messaggi` non autenticato → **negato**; read `impostazioni/generali` → **consentito**

## Funzionalità

**Campagne.** Lo switch della campagna attiva è solo dell'Administrator e cambia subito il modulo pubblico (prodotti, testi, donazioni minime). Dal selettore in alto il pannello mostra gli ordini di qualunque campagna.

**Modulo pubblico.** Email obbligatoria; scheda di ogni dolce con descrizione, peso, ingredienti e allergeni; donazione minima per prodotto (predefinita € 19,50) con offerta libera non inferiore al minimo; ricevuta facoltativa con codice fiscale (verificato col carattere di controllo) e residenza; informativa obbligatoria e consenso facoltativo per le campagne future, con versione dell'informativa registrata sull'ordine; contatti di emergenza in fondo.

**Ordini.** Colonne offerta (con evidenza di quanto donato oltre il minimo), ritiro, ricevuta. Filtri per ritiro assegnato, ricevuta, offerta sopra il minimo, consenso. Selezione multipla e assegnazione del ritiro in blocco. Registrare un pagamento non riporta più indietro lo stato logistico.

**Messaggi.** Pulsante ✉️ su ogni ordine: modello (conferma, appuntamento per il ritiro, ordine pronto, promemoria offerta, libero) compilato con i dati dell'ordine, invio via WhatsApp, SMS o email dal dispositivo del volontario. Ogni invio resta registrato sull'ordine e nei log.

**Excel.** Fogli Riepilogo, Ordini, Righe prodotto, Andamento, Da incassare, Da consegnare (stampabile, con colonne per spunta e firma), Ritiri e, solo per l'Administrator, Ricevute. Totali e riepiloghi sono formule; ogni foglio ha una riga di totali che segue i filtri.

**PDF.** Una pagina A4 fissa, con le voci dei prodotti della campagna, offerte e quote oltre il minimo.

## Limiti noti

- **Messaggi automatici** (conferma all'invio, promemoria il giorno prima): richiedono Cloud Functions e piano Blaze. Oggi l'invio è manuale dal pannello.
- **Disponibilità alla prenotazione**: le rules non possono sommare gli ordini esistenti, quindi non bloccano una prenotazione oltre lo stock. Il pannello segnala il sovrapprenotato; il rimedio è chiudere le prenotazioni dalla campagna.
- **Righe dell'ordine**: le rules verificano che il minimo dichiarato sia almeno pezzi × donazione minima più bassa della campagna, non riga per riga.
- **Revoca di un utente**: cancella la scheda in `utenti`, non l'account Auth.
- **Rate limiting** del modulo pubblico: affidato ad App Check, da attivare in console.
