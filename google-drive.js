
"use strict";

// =========================================
// MYEbook - Google Drive
// Collegamento, prove e lettura Note personali
// =========================================

const GOOGLE_CLIENT_ID =
    "492254401531-qbrem8uqlfq5sue5gdhv8dkdt4bplf3c.apps.googleusercontent.com";

const GOOGLE_SCOPE =
    "https://www.googleapis.com/auth/drive.appdata";

const GOOGLE_TEST_FILE = "MYEbook_test.json";
const GOOGLE_NOTES_FILE = "MYEbook_notes.json";

let googleTokenClient = null;
let googleAccessToken = null;

let personalArchive = null;
let personalArchiveFileId = null;

const googleConnect = document.getElementById("googleConnect");
const googleWrite = document.getElementById("googleWrite");
const googleRead = document.getElementById("googleRead");
const googleStatus = document.getElementById("googleStatus");


// =========================================
// Messaggi e stato collegamento
// =========================================

function googleMessage(message) {
    googleStatus.textContent = message;
}

function googleSetConnected(connected) {
    googleWrite.disabled = !connected;
    googleRead.disabled = !connected;
}


// =========================================
// Inizializzazione Google
// =========================================

function googleInitialize() {
    if (!window.google?.accounts?.oauth2) {
        googleMessage("Libreria Google non ancora disponibile.");
        return false;
    }

    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,

        callback: response => {
            if (response.error || !response.access_token) {
                googleMessage(
                    "Autorizzazione non riuscita: " +
                    (response.error || "Token mancante")
                );
                return;
            }

            googleAccessToken = response.access_token;
            googleSetConnected(true);
            googleMessage("Google Drive collegato correttamente.");
        }
    });

    return true;
}


// =========================================
// Richieste API Google Drive
// =========================================

async function googleApi(url, options = {}) {
    if (!googleAccessToken) {
        throw new Error("Google Drive non collegato.");
    }

    const headers = new Headers(options.headers || {});

    headers.set(
        "Authorization",
        "Bearer " + googleAccessToken
    );

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        if (response.status === 401) {
            googleAccessToken = null;
            googleSetConnected(false);
            personalArchive = null;
            personalArchiveFileId = null;
        }

        const details = await response.text();

        throw new Error(
            "HTTP " + response.status + ": " + details
        );
    }

    return response;
}


// =========================================
// Ricerca file di prova
// =========================================

async function googleFindTestFile() {
    const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: "name = '" + GOOGLE_TEST_FILE +
           "' and trashed = false",
        fields: "files(id,name),nextPageToken",
        pageSize: "100"
    });

    const response = await googleApi(
        "https://www.googleapis.com/drive/v3/files?" + query
    );

    const result = await response.json();

    return result.files?.[0] || null;
}


// =========================================
// Scrittura file di prova
// =========================================

async function googleWriteTest() {
    try {
        googleMessage("Scrittura del file di prova...");

        const existingFile = await googleFindTestFile();

        const data = {
            application: "MYEbook",
            test: true,
            message: "Prova Google Drive riuscita",
            date: new Date().toISOString()
        };

        const boundary =
            "myebook_boundary_" + Date.now();

        const metadata = {
            name: GOOGLE_TEST_FILE,
            mimeType: "application/json"
        };

        if (!existingFile) {
            metadata.parents = ["appDataFolder"];
        }

        const body =
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) + "\r\n" +
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(data) + "\r\n" +
            "--" + boundary + "--";

        const url = existingFile
            ? "https://www.googleapis.com/upload/drive/v3/files/" +
              encodeURIComponent(existingFile.id) +
              "?uploadType=multipart"
            : "https://www.googleapis.com/upload/drive/v3/files" +
              "?uploadType=multipart";

        const response = await googleApi(url, {
            method: existingFile ? "PATCH" : "POST",

            headers: {
                "Content-Type":
                    "multipart/related; boundary=" + boundary
            },

            body
        });

        const result = await response.json();

        googleMessage(
            "File scritto correttamente. ID: " + result.id
        );

    } catch (error) {
        googleMessage(
            "Errore scrittura: " + error.message
        );
    }
}


// =========================================
// Lettura file di prova
// =========================================

async function googleReadTest() {
    try {
        googleMessage("Lettura del file di prova...");

        const file = await googleFindTestFile();

        if (!file) {
            googleMessage("File di prova non trovato.");
            return;
        }

        const response = await googleApi(
            "https://www.googleapis.com/drive/v3/files/" +
            encodeURIComponent(file.id) +
            "?alt=media"
        );

        const data = await response.json();

        googleMessage(
            "File letto correttamente: " +
            JSON.stringify(data)
        );

    } catch (error) {
        googleMessage(
            "Errore lettura: " + error.message
        );
    }
}


// =========================================
// Autorizzazione per Note personali
// =========================================

function googleAuthorizeForNotes() {
    return new Promise((resolve, reject) => {
        if (googleAccessToken) {
            resolve();
            return;
        }

        if (!googleTokenClient && !googleInitialize()) {
            reject(new Error(
                "Google non ancora disponibile."
            ));
            return;
        }

        googleTokenClient.callback = response => {
            if (response.error || !response.access_token) {
                reject(new Error(
                    response.error ||
                    "Autorizzazione non riuscita."
                ));
                return;
            }

            googleAccessToken = response.access_token;

            googleSetConnected(true);
            googleMessage("Google Drive collegato.");

            resolve();
        };

        try {
            googleTokenClient.requestAccessToken({
                prompt: ""
            });
        } catch (error) {
            reject(error);
        }
    });
}


// =========================================
// Lettura archivio personale
// =========================================

async function googleLoadPersonalArchive() {
    if (personalArchive !== null) {
        return personalArchive;
    }

    const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: "name = '" + GOOGLE_NOTES_FILE +
           "' and trashed = false",
        fields: "nextPageToken,files(id,name)",
        pageSize: "100"
    });

    const response = await googleApi(
        "https://www.googleapis.com/drive/v3/files?" + query
    );

    const result = await response.json();
    const file = result.files?.[0];

    if (!file) {
        personalArchiveFileId = null;

        personalArchive = {
            version: 1,
            notes: {}
        };

        return personalArchive;
    }

    const contentResponse = await googleApi(
        "https://www.googleapis.com/drive/v3/files/" +
        encodeURIComponent(file.id) +
        "?alt=media"
    );

    const data = await contentResponse.json();

    if (!data ||
        typeof data.notes !== "object" ||
        data.notes === null ||
        Array.isArray(data.notes)) {

        throw new Error(
            "Archivio Note non valido."
        );
    }

    personalArchiveFileId = file.id;
    personalArchive = data;

    return personalArchive;
}


// =========================================
// Lettura Note di un singolo libro
// =========================================

async function googleReadBookNotes(book) {
    const archive = await googleLoadPersonalArchive();

    const key = book.author + "|" + book.title;

    return archive.notes[key] || null;
}


// =========================================
// Pulsante collegamento manuale
// =========================================

googleConnect.addEventListener("click", () => {
    try {
        if (!googleTokenClient && !googleInitialize()) {
            return;
        }

        googleTokenClient.requestAccessToken({
            prompt: googleAccessToken ? "" : "consent"
        });

    } catch (error) {
        googleMessage(
            "Errore collegamento: " + error.message
        );
    }
});


// =========================================
// Pulsanti di prova
// =========================================

googleWrite.addEventListener(
    "click",
    googleWriteTest
);

googleRead.addEventListener(
    "click",
    googleReadTest
);


// =========================================
// Stato iniziale
// =========================================

googleSetConnected(false);

/* =========================================
   MYEbook - Salvataggio archivio personale
   ========================================= */

async function googleSaveBookNotes(book, changes) {
    if (!googleAccessToken) {
        throw new Error("Google Drive non collegato.");
    }

    // Recupera l'archivio personale.
    const archive = await googleLoadPersonalArchive();

    const key = book.author + "|" + book.title;

    // Prepara una copia senza alterare l'archivio
    // originale prima che Drive confermi il salvataggio.
    const updatedArchive = {
        ...archive,
        date: new Date().toISOString(),
        notes: {
            ...archive.notes,
            [key]: {
                ...(archive.notes[key] || {}),
                status: changes.status,
                rating: changes.rating,
                note: changes.note,
                updatedAt: new Date().toISOString()
            }
        }
    };

    const json = JSON.stringify(updatedArchive);

    let response;

    if (personalArchiveFileId) {

        // Aggiorna il file già esistente.
        response = await googleApi(
            "https://www.googleapis.com/upload/drive/v3/files/" +
            encodeURIComponent(personalArchiveFileId) +
            "?uploadType=media",
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json; charset=UTF-8"
                },
                body: json
            }
        );

    } else {

        // Crea il file nella cartella privata dell'app.
        const boundary = "myebook_" + Date.now();

        const metadata = {
            name: GOOGLE_NOTES_FILE,
            mimeType: "application/json",
            parents: ["appDataFolder"]
        };

        const body =
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) + "\r\n" +
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            json + "\r\n" +
            "--" + boundary + "--";

        response = await googleApi(
            "https://www.googleapis.com/upload/drive/v3/files" +
            "?uploadType=multipart",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "multipart/related; boundary=" + boundary
                },
                body
            }
        );
    }

    // Aggiorna la memoria soltanto dopo
    // la conferma di Google Drive.
    const result = await response.json();

    if (!result.id) {
        throw new Error(
            "Google Drive non ha confermato il file."
        );
    }

    personalArchiveFileId = result.id;
    personalArchive = updatedArchive;

    return true;
}


/* =========================================
   Importazione completa backup Android
   ========================================= */

async function googleImportAndroidBackup(backup) {

    if (!backup ||
        backup.version !== 1 ||
        !backup.notes ||
        typeof backup.notes !== "object" ||
        Array.isArray(backup.notes)) {
        throw new Error("Backup Android non valido.");
    }

    if (!googleAccessToken) {
        throw new Error("Google Drive non collegato.");
    }

    // Carica l'archivio esistente per individuare
    // il file Google Drive da sostituire.
    await googleLoadPersonalArchive();

    // Normalizza le chiavi come nell'app Android.
    const notes = {};

    for (const [key, value] of Object.entries(backup.notes)) {
        const separator = key.indexOf("|");

        if (separator < 0) {
            throw new Error("Chiave libro non valida: " + key);
        }

        const author = key.slice(0, separator).trim().toUpperCase();
        const title = key.slice(separator + 1).trim().toUpperCase();

        notes[author + "|" + title] = value;
    }

    // Sostituzione completa, senza fusione.
    const archive = {
        version: 1,
        date: new Date().toISOString(),
        notes: notes
    };

    const json = JSON.stringify(archive);
    let response;

    if (personalArchiveFileId) {

        response = await googleApi(
            "https://www.googleapis.com/upload/drive/v3/files/" +
            encodeURIComponent(personalArchiveFileId) +
            "?uploadType=media",
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json; charset=UTF-8"
                },
                body: json
            }
        );

    } else {

        const boundary = "myebook_import_" + Date.now();

        const metadata = {
            name: GOOGLE_NOTES_FILE,
            mimeType: "application/json",
            parents: ["appDataFolder"]
        };

        const body =
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) + "\r\n" +
            "--" + boundary + "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            json + "\r\n" +
            "--" + boundary + "--";

        response = await googleApi(
            "https://www.googleapis.com/upload/drive/v3/files" +
            "?uploadType=multipart",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "multipart/related; boundary=" + boundary
                },
                body
            }
        );
    }

    // Aggiorna i dati in memoria soltanto
    // dopo la conferma di Google Drive.
    const result = await response.json();

    if (!result.id) {
        throw new Error(
            "Google Drive non ha confermato il salvataggio."
        );
    }

    personalArchiveFileId = result.id;
    personalArchive = archive;

    return Object.keys(notes).length;
}

