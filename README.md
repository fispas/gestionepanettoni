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
| `firestore.rules` | autorizzazioni lato server (si pubblicano dalla console, non serve tenerle nel repo) |
| `functions/` | Cloud Functions per le email automatiche (`index.js`, `package.json`, copia di `modello.js`) |
| `firebase.json`, `.firebaserc` | configurazione della CLI Firebase per pubblicare le funzioni |

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

**Email automatiche** (Cloud Functions): conferma alla prenotazione, appuntamento quando si assegna o cambia il ritiro, «ordine pronto» quando passa a Da Consegnare senza ritiro, promemoria alle 17 del giorno prima. Ognuna si attiva o disattiva in Impostazioni → Email automatiche. Dal pannello il pulsante «Invia email» spedisce direttamente.

**WhatsApp e SMS manuali** dal dispositivo del volontario. Dopo l'apertura della chat il pannello chiede «Hai inviato il messaggio?»: solo la conferma registra l'invio. Selezionando più ordini, «WhatsApp in coda» li propone uno dopo l'altro.

**Controllo degli invii.** Colonna «Avvisi» con l'ultimo esito per ogni modello (📧 email, 💬 WhatsApp, 📱 SMS; ✓ riuscito, ✗ fallito, dettaglio al passaggio del mouse). Filtri «conferma non inviata», «ritiro assegnato ma non avvisati», «invii non riusciti». Le stesse informazioni sono nell'Excel.

**Excel.** Fogli Riepilogo, Ordini, Righe prodotto, Andamento, Da incassare, Da consegnare (stampabile, con colonne per spunta e firma), Ritiri e, solo per l'Administrator, Ricevute. Totali e riepiloghi sono formule; ogni foglio ha una riga di totali che segue i filtri.

**PDF.** Una pagina A4 fissa, con le voci dei prodotti della campagna, offerte e quote oltre il minimo.

## Email automatiche: messa in funzione

Si fa una volta sola, da un PC. Servono circa 30 minuti.

### 1. Programmi sul PC

1. Installa **Node.js LTS** da nodejs.org (versione 20 o successiva).
2. Apri il terminale (PowerShell su Windows) e installa la CLI Firebase:
   ```
   npm install -g firebase-tools
   ```
3. Accedi con l'account Google proprietario del progetto Firebase:
   ```
   firebase login
   ```
4. Scarica il repository e entra nella cartella:
   ```
   git clone https://github.com/fispas/gestionepanettoni.git
   cd gestionepanettoni
   ```

### 2. Piano Blaze

1. Console Firebase → ingranaggio accanto a «Panoramica del progetto» → **Utilizzo e fatturazione** → **Dettagli e impostazioni** → **Modifica piano** → **Blaze**, e collega un account di fatturazione.
2. Imposta subito un **avviso di budget** (es. 5 €) dalla stessa pagina o da Google Cloud → Fatturazione → Budget e avvisi.

Con questi volumi si resta nelle quote gratuite di Functions, Scheduler e Secret Manager; può comparire qualche centesimo al mese per l'archiviazione delle immagini delle funzioni.

### 3. Regione

Console Firebase → Impostazioni progetto → **Posizione predefinita delle risorse**.

- `eur3` o `europe-west…` → lascia `europe-west1` (già impostata).
- `nam5` o `us-…` → cambia `REGIONE` in `functions/index.js` e `REGIONE_FUNZIONI` in `firebase-init.js` con `us-central1`.

Le due costanti devono essere uguali, altrimenti il pannello non trova la funzione.

### 4. Account per spedire (SMTP)

**Brevo (consigliato)** — gratis fino a 300 email al giorno:

1. Crea l'account su brevo.com.
2. Verifica il mittente: menu **Mittenti, domini e IP** → aggiungi l'indirizzo che userai (es. `noreply@wonderlad.org` o la Gmail dell'associazione) e conferma dal link ricevuto. Per non finire in spam, autentica il dominio dalla stessa sezione aggiungendo i record DNS che Brevo indica.
3. Menu **SMTP e API** → scheda **SMTP** → **Genera una nuova chiave SMTP**. Annota: server `smtp-relay.brevo.com`, porta `587`, login (del tipo `…@smtp-brevo.com`) e la chiave.

**In alternativa, Gmail dell'associazione** — circa 500 email al giorno: attiva la verifica in due passaggi, crea una **password per le app**, poi usa server `smtp.gmail.com`, porta `465`, utente = indirizzo Gmail, password = password per le app. Il mittente deve essere lo stesso indirizzo Gmail.

### 5. Pubblicazione delle funzioni

```
cd functions
npm install
cd ..
firebase deploy --only functions
```

Al primo deploy la CLI chiede:

| Domanda | Cosa rispondere |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` (o `smtp.gmail.com`) |
| `SMTP_PORT` | `587` (Brevo) o `465` (Gmail) |
| `SMTP_USER` | login SMTP di Brevo, o indirizzo Gmail |
| `MITTENTE` | `WonderLAD <noreply@wonderlad.org>` (l'indirizzo verificato al punto 4) |
| `SITO` | invio per accettare `https://fispas.github.io/gestionepanettoni/` |
| attivare Secret Manager | sì |
| `SMTP_PASS` | la chiave SMTP di Brevo o la password per le app (non viene mostrata mentre la scrivi) |
| criterio di pulizia delle immagini | accetta il valore proposto |

I valori non segreti finiscono in `functions/.env.wonderlad-ordini`, che resta sul PC (è in `.gitignore`); la password sta in Secret Manager.

Se il primo deploy fallisce con un errore di permessi su **Eventarc**, è normale al primo utilizzo: aspetta 5 minuti e rilancia lo stesso comando.

### 6. Pubblicazione del pannello

Carica su GitHub i file aggiornati del sito (o, dalla cartella clonata: `git add .`, `git commit -m "Email automatiche"`, `git push`).

### 7. Prova

1. Pannello → **Impostazioni → Email automatiche** → **Invia un'email di prova a me**. Controlla anche lo spam.
2. Fai una prenotazione dal modulo con la tua email: entro un minuto arriva la conferma e nella colonna Avvisi compare «📧 Conferma ✓».
3. Assegna un ritiro all'ordine: arriva l'email con l'appuntamento.
4. Per provare il promemoria senza aspettare le 17: assegna un ritiro per domani, poi Google Cloud Console → **Cloud Scheduler** → job `firebase-schedule-promemoriaRitiro-…` → **Forza esecuzione**.

### Se qualcosa non va

- Console Firebase → **Functions → Log**, oppure `firebase functions:log`.
- Ogni invio fallito è anche sull'ordine: «✗» nella colonna Avvisi, il motivo al passaggio del mouse.
- Cambiare la password SMTP: `firebase functions:secrets:set SMTP_PASS`, poi di nuovo `firebase deploy --only functions`.
- Cambiare server, utente o mittente: modifica `functions/.env.wonderlad-ordini` e rilancia il deploy.
- Se modifichi `modello.js`, il deploy ne copia da solo la versione aggiornata dentro `functions/`.

## Limiti noti

- **Il modulo pubblico può far partire email verso indirizzi altrui**: chiunque può prenotare con l'email di un altro. Il tetto giornaliero di Brevo limita il danno; la protezione vera è attivare **App Check** (reCAPTCHA) sul progetto.

- **WhatsApp e SMS** restano manuali: l'invio registrato è quello confermato dall'operatore, non una ricevuta di consegna.
- **Disponibilità alla prenotazione**: le rules non possono sommare gli ordini esistenti, quindi non bloccano una prenotazione oltre lo stock. Il pannello segnala il sovrapprenotato; il rimedio è chiudere le prenotazioni dalla campagna.
- **Righe dell'ordine**: le rules verificano che il minimo dichiarato sia almeno pezzi × donazione minima più bassa della campagna, non riga per riga.
- **Revoca di un utente**: cancella la scheda in `utenti`, non l'account Auth.
- **Rate limiting** del modulo pubblico: affidato ad App Check, da attivare in console.
