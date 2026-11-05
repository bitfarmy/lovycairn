# LovyCairn Suite — app desktop

Stato: anteprima e specifica approvate dall’utente il 5 novembre 2026;
implementazione nativa verificata prima dell’installazione.

## Obiettivo e risultato

Un’app nativa LovyCairn permette di trovare, organizzare e riprendere i progetti
senza passare esclusivamente dai menu sul desktop. La finestra riunisce progetti,
prossimo passo, Git, note e impostazioni. Desktop e suite usano gli stessi dati.

L’utente ha scelto un’app LovyCairn dedicata e approvato l’anteprima navigabile
con elenco progetti, gruppi, preferiti, scheda progetto e impostazioni.
LovyCairn Note rimane l’editor separato delle note.

## Approcci considerati

1. **App dedicata — scelta.** Python, GTK 4, libadwaita, come l’app Note già
   presente. Interfaccia e processo separati da GNOME Shell; dati condivisi con
   l’estensione. Consente gestione e ricerca anche quando l’estensione è spenta.
2. Trasformare LovyCairn Note nella suite. Meno punti d’ingresso, ma mescola la
   scrittura delle note alla gestione dei progetti e modifica l’app esistente.
3. Estendere soltanto il menu sul desktop. Poco codice aggiuntivo, ma non offre
   la finestra centrale richiesta dall’utente.

L’anteprima HTML è un riferimento di progettazione. Il prodotto finale non
dipende da un browser, da un server locale o da un servizio remoto.

## Esperienza della prima versione

### Progetti

- Finestra LovyCairn accessibile dal menu delle applicazioni e dal clic destro
  sullo sfondo del desktop.
- Navigazione: tutti i progetti, preferiti, note, gruppi esistenti e impostazioni.
- Ricerca per nome, cartella e gruppo; ordinamento per recenti, nome e modifiche.
- Elenco con nome, percorso, gruppo, ramo Git, modifiche, numero di note,
  preferito e apertura del terminale.
- Riprendi da qui: ultimo progetto effettivamente aperto da suite o desktop e
  prossimo passo salvato. Alla prima apertura, senza cronologia, nessun ultimo
  progetto inventato.
- Aggiunta di una cartella tramite selettore nativo, nome e gruppo; controllo
  duplicati e conflitti senza sovrascrivere lanciatori esistenti.
- Modifica di nome, cartella, gruppo, colore, forma e collegamenti di un progetto.
  La cartella può essere ricollegata se non esiste più.
- Creazione di un gruppo e spostamento dei lanciatori tra gruppi e scrivania.
  I gruppi annidati esistenti sono leggibili e selezionabili.
- Rimozione del solo lanciatore mediante cestino, con conferma che chiarisce
  l’effetto. Le cartelle di codice e le note non vengono eliminate.

### Scheda progetto

- Nome, percorso, gruppo, preferito e apertura con il terminale configurato.
- Prossimo passo modificabile con salvataggio esplicito e messaggio d’errore
  se il salvataggio non riesce.
- Stato Git reale: ramo, file modificati, repository pulito o condizione di
  assenza/errore. Nessuna operazione di scrittura sul repository.
- Note associate dal tag del lanciatore; anteprima di titolo e testo, apertura
  e creazione nell’app LovyCairn Note con cartella e comando configurati.
- Collegamenti di documentazione, apertura della cartella e dell’editor scelto.
- Quando si cambia progetto, i risultati Git della selezione precedente non
  devono comparire nella scheda nuova.

### Note

- Raccolta delle note Markdown nella cartella configurata, con ricerca e nome
  del progetto associato quando disponibile. Comprende anche note senza progetto.
- Apertura delle note e dell’archivio tramite LovyCairn Note.
- Nessuna riscrittura dello stato finestre, del cestino o del contenuto delle
  note da parte della suite. La scheda del prossimo passo è metadato separato.

### Impostazioni

- Leggere e scrivere le vere impostazioni GSettings condivise: terminale,
  browser, comando/cartella note, note sulla scrivania e tre scorciatoie.
- Riconoscere LovyTerm, i terminali già supportati e i comandi personalizzati;
  preservare il comando attuale se l’utente non lo cambia.
- Aggiungere comando editor, preferenza globale dello spazio di lavoro e tema
  della suite. Tema iniziale: sistema; alternative chiaro e scuro.
- La scelta dello spazio per un singolo progetto continua a prevalere sulla
  preferenza globale; globale iniziale “Chiedi ogni volta”, come oggi.
- I comandi personalizzati mantengono i segnaposto esistenti; il comando editor
  ammette `{dir}` e richiede una configurazione esplicita: un comando vuoto non
  viene interpretato come editor predefinito della cartella (che potrebbe essere
  il gestore file). Nessuna interpretazione implicita tramite una shell.
- Le scorciatoie sono validate prima del salvataggio. Le scelte personalizzate
  rimangono visibili e modificabili, senza sostituzioni automatiche.

## Condivisione dei dati

- Progetti: file `.desktop` nella Scrivania XDG e nei gruppi con `.group`.
  Usare `GLib.KeyFile` e conservare campi, traduzioni e chiavi non conosciute.
- Gruppi: directory con `.group`; conservare colori e forme esistenti.
- Note: directory da GSettings, oppure `~/Notes`, con gli stessi tag Markdown
  riconosciuti dalle app esistenti. Un tag può associare più note.
- Preferenze: schema `org.gnome.shell.extensions.lovycairn` già installato.
  In sviluppo caricarlo anche dalla cartella sorgente; mostrare un errore utile
  se manca, senza far terminare il processo GLib.
- Nuove chiavi: `editor-command` (stringa, vuota), `default-workspace`
  (`ask`, `new`, `here`; default `ask`), `suite-theme` (`system`, `light`, `dark`;
  default `system`). Aggiornare anche le preferenze dell’estensione.
- Preferiti e prossimo passo: `~/.config/lovycairn/suite.json`, per percorso
  assoluto normalizzato del progetto. Lo spostamento del lanciatore fra gruppi
  non cambia l’identità. Ricollegare una cartella trasferisce i suoi metadati.
- Cronologia: `~/.config/lovycairn/activity.json`, separata dai metadati della
  suite. L’estensione registra gli avvii riusciti; la suite la legge. Quando
  l’estensione non è attiva, l’apertura diretta dalla suite aggiorna la cronologia.
- Scritture atomiche, rilettura prima delle modifiche, conservazione degli altri
  progetti. Errori o JSON non validi non autorizzano sovrascritture silenziose.
- File monitor con debounce per aggiornare suite e conteggio note alle modifiche
  esterne. Conservare selezione e ricerca e non scartare un modulo aperto.

## Apertura dei progetti e integrazione GNOME

L’estensione conserva la responsabilità di finestre e spazi di lavoro.
Espone sul bus di sessione `org.gnome.Shell`, percorso
`/io/github/bitfarmy/LovyCairn`, interfaccia `io.github.bitfarmy.LovyCairn`:

`OpenProject(launcher: s, mode: s) -> accepted: b`

`launcher` è il percorso relativo del lanciatore nella Scrivania XDG;
`mode` è `auto`, `new` o `here`. Il metodo trova il lanciatore tra quelli
effettivamente gestiti dall’estensione, valida il modo, poi usa l’apertura
esistente. Non accetta comandi o percorsi arbitrari. `accepted` indica che la
richiesta è valida e gestibile; il dialogo GNOME può ancora essere annullato.
Il servizio viene rimosso quando l’estensione si disattiva.

La suite usa questa interfaccia quando disponibile. In assenza dell’estensione,
può aprire terminale e documentazione nello spazio attuale, segnalando la
limitazione nell’interfaccia. Non dichiara di aver creato uno spazio o riconosciuto
finestre esistenti se non può farlo.

Il menu sullo sfondo aggiunge “Apri LovyCairn”. L’app accetta anche un argomento
per mostrare la scheda di un progetto; il menu del progetto può usarlo.

## Struttura tecnica

- Pacchetto Python `suite/lovycairn_suite/`: modello/storage, servizi di Git e
  avvio, applicazione e viste GTK. Separare il modello dalle finestre.
- Lanciatore `suite/lovycairn`, comando installato `~/.local/bin/lovycairn`.
- File desktop `io.github.bitfarmy.LovyCairn.desktop` e logo esistente.
- Installazione del pacchetto sotto la directory dati XDG di LovyCairn;
  installazione/disinstallazione aggiornate senza eliminare progetti e note.
- Nessuna nuova dipendenza Python di terze parti: libreria standard e PyGObject
  già richiesto dalle note. Git eseguito in processi con timeout fuori dal thread
  dell’interfaccia; errori distinti da uno stato pulito.
- L’app resta utilizzabile se una cartella manca, una nota è illeggibile o Git
  non è installato. Gli errori riguardano il blocco interessato.
- Interfaccia traducibile, inglese come lingua sorgente e traduzione italiana.
  Testi e stili seguono l’anteprima approvata e i controlli nativi GNOME.

## Conservazione e limiti

- Conservare progetti, gruppi, colori, forme, posizioni, note e impostazioni
  migrati; mantenere LovyTerm configurato sul computer dell’utente.
- La suite aggiunge capacità senza una seconda migrazione dei dati.
- Nessuna suite web, account, cloud o telemetria.
- Azioni personalizzate “Avvia sviluppo” / “Esegui test”, backup con ripristino
  dall’interfaccia, cancellazione di gruppi e riorganizzazione dei gruppi annidati
  rimangono sviluppi successivi. L’installazione reale viene comunque preceduta
  da backup dei file installati e delle impostazioni.

## Verifica prima di installare

1. Test del modello su directory temporanee: gruppi, chiavi preservate, nomi
   duplicati, percorsi con spazi/caratteri speciali, movimenti, ricollegamento,
   note e metadati corrotti, senza toccare i dati reali.
2. Test su repository Git temporanei: pulito, modificato, non tracciato,
   rinominato, ramo senza commit, detached HEAD, cartella non repository.
3. Test dei comandi: segnaposto, quote, comando mancante, fallback e preferenze.
4. Prova GTK isolata di ricerca, scheda, preferiti, prossimo passo, impostazioni,
   creazione/spostamento/rimozione di lanciatori e collegamento note.
5. Prova GNOME isolata dell’API D-Bus: avvio valido, richiesta non valida,
   disattivazione, cronologia e nessuna regressione dei menu esistenti.
6. Controlli del repository, schemi, traduzioni e schermate dell’app nativa a
   finestra larga e stretta, chiaro e scuro.
7. Installare soltanto la versione verificata, conservare un backup e controllare
   l’app sul computer dell’utente. Non forzare logout della sessione.

## Decisioni affidate all’implementazione

Suddivisione esatta delle classi GTK, scelta dei widget libadwaita equivalenti
all’anteprima, debounce e limiti dei processi Git, dettaglio dei messaggi di errore
e disposizione dei controlli nelle finestre strette. Devono rispettare i flussi e
la conservazione dei dati descritti sopra.
