# Gestione Dolci Solidali — WonderLAD

PWA statica su GitHub Pages + Firestore. Due pagine:

- `index.html` — form pubblico di prenotazione
- `gestione.html` — pannello staff (login richiesto)

## File

| File | Ruolo |
|---|---|
| `firebase-init.js` | config Firebase, `db`, `auth`, documento `impostazioni/stock` |
| `index.html` | form pubblico, autonomo |
| `gestione.html` | solo markup del pannello |
| `gestionestyle.css` | stile del pannello |
| `dashboard.js` | KPI, flussi, stock, grafico, export PDF |
| `app.js` | auth, ruoli, ordini, staff, log, export Excel |
| `firestore.rules` | autorizzazioni lato server |

**Da eliminare dal repo:** `api.js` e `ordini-utenti.js`. Erano una seconda versione dell'app mai caricata da nessuna pagina; la loro logica è confluita in `app.js`.

## Ruoli

| | Manager | Administrator |
|---|---|---|
| Vedere gli ordini | ✅ | ✅ |
| Modificare gli ordini | ✅ | ✅ |
| Cancellare un ordine | ❌ (usa "Annullato") | ✅ |
| Prezzi, stock, apertura prenotazioni | ❌ | ✅ |
| Gestione staff | ❌ | ✅ |
| Log | ❌ | ✅ |

Il ruolo sta in `utenti/{uid}.ruolo`. Non è scrivibile dall'utente stesso: le rules richiedono `isAdmin()`. Un account Firebase Auth **senza** scheda in `utenti` non entra nel pannello: è la revoca più rapida.

## Migrazione (una tantum, in quest'ordine)

### 1. Crea le schede utente sugli UID reali

Il vecchio codice indicizzava `utenti` per email (`utenti/{email}`) o per campo `username`. Ora la chiave è l'**UID**, perché è l'unica cosa che le rules possono verificare.

In Firebase Console → Authentication → Utenti, copia l'UID completo dei tre account e crea a mano in Firestore, collezione `utenti`, un documento per ciascuno con **ID = UID**:

```
utenti/{uid}
  email: "filispada@gmail.com"
  ruolo: "Administrator"
```

```
utenti/{uid}
  email: "manager@manager.it"
  ruolo: "Manager"
```

Fallo **prima** di pubblicare le rules: la console non passa dalle rules, ma dopo il deploy nessuno potrà creare la prima scheda dall'app.

Poi cancella i vecchi documenti `utenti` indicizzati per email.

### 2. Aggiorna `impostazioni/stock`

Aggiungi i campi nuovi (i vecchi `Totale Panettoni` / `Totale Pandori` restano letti come fallback):

```
totalePanettoni: 500
totalePandori: 500
prezzoPanettone: 15
prezzoPandoro: 15
ordiniAperti: true
```

### 3. Pubblica le rules

Console → Firestore → Regole, incolla `firestore.rules`, pubblica. Poi verifica in Rules Playground:

- create su `ordini` non autenticato con payload valido → **consentito**
- create su `ordini` con `status: "Prenotato - Pagato"` → **negato**
- read su `ordini` non autenticato → **negato**
- write su `utenti/{proprio uid}` da un Manager → **negato**
- write su `impostazioni/stock` da un Manager → **negato**
- read su `logs` da un Manager → **negato**

### 4. Chiudi la registrazione pubblica

Authentication → Impostazioni → Azioni utente → disattiva la creazione di account. Gli account li crea l'Administrator dal pannello.

### 5. Restringi la API key

Google Cloud Console → Credenziali → la chiave del browser → limita per referrer HTTP a `fispas.github.io/gestionepanettoni/*`. Poi attiva App Check con reCAPTCHA v3 su Firestore: è l'unica difesa vera contro lo spam sul form pubblico, che resta scrivibile senza autenticazione per necessità.

### 6. Deploy

Sostituisci i file nel repo, elimina `api.js` e `ordini-utenti.js`, commit su `main`. GitHub Pages pubblica in un paio di minuti.

## Cosa è cambiato nel codice

**Sicurezza**
- Rimossa l'auto-promozione ad Administrator (login sconosciuto → accesso negato, non admin).
- Rimossa l'auto-registrazione dal form di login.
- Ruoli su UID, verificati anche lato server dalle rules.
- Tutti i dati che arrivano dal form pubblico passano da `esc()` prima di finire in `innerHTML`.
- Gli `onclick="funzione('${dato}')"` sono spariti: le azioni delle tabelle usano delega di eventi con `data-*`. Non c'è più modo di iniettare codice tramite nome o stato.
- `index.html` non scrive più nella collezione `logs` (era scrivibile da chiunque).
- Schema degli ordini chiuso e validato nelle rules: campi fissi, telefono `^[0-9]{8,15}$`, massimo 50 pezzi per prodotto, stato iniziale imposto, timestamp = ora server.

**Correzioni**
- `esportaPDF()` esiste (prima il bottone chiamava una funzione inesistente).
- Gli ordini annullati non consumano più stock e non entrano negli incassi.
- Ogni ordine cade in un solo stato logistico e in un solo stato di pagamento: niente doppi conteggi.
- Prezzi separati per panettone e pandoro, letti da `impostazioni/stock`. Prima erano `const PREZZO_UNITA = 15` nel codice.
- `onSnapshot` sugli ordini limitato a 500 documenti.
- Il campo `Importo` è calcolato nell'export Excel, con date leggibili.

**Funzionalità**
- Codice prenotazione a 6 caratteri mostrato al cliente e ricercabile nel pannello.
- Campo note sull'ordine.
- Interruttore "prenotazioni aperte": chiude il form pubblico senza toccare il codice.
- Avviso in dashboard quando le scorte sono esaurite.
- Card "Annullati" in dashboard.
- Label su tutti i campi, focus da tastiera visibile, `prefers-reduced-motion` rispettato.

## Limiti noti

- **La disponibilità non è verificata alla prenotazione.** Il cliente può prenotare anche a scorte finite: le rules non possono contare gli ordini esistenti. Serve una Cloud Function (`onCreate` su `ordini` che aggiorna un contatore in transazione), oppure si chiudono le prenotazioni a mano con l'interruttore. Il pannello segnala il sovrapprenotato.
- **Revocare un utente cancella la scheda in `utenti`, non l'account Auth.** L'accesso al pannello viene bloccato subito; per rimuovere davvero l'account serve la console o l'Admin SDK.
- **Nessuna conferma automatica al cliente** (email o WhatsApp): richiede un backend. Per ora il codice prenotazione è a schermo.
- **Rate limiting**: affidato ad App Check. Senza, il form pubblico resta spammabile.
