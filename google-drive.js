
"use strict";

// Google Drive - MYEbook
// Test di collegamento, scrittura e lettura JSON

const GOOGLE_CLIENT_ID =
    "492254401531-qbrem8uqlfq5sue5gdhv8dkdt4bplf3c.apps.googleusercontent.com";

const GOOGLE_SCOPE =
    "https://www.googleapis.com/auth/drive.appdata";

const GOOGLE_TEST_FILE = "MYEbook_test.json";

let googleTokenClient = null;
let googleAccessToken = null;

const googleConnect = document.getElementById("googleConnect");
const googleWrite = document.getElementById("googleWrite");
const googleRead = document.getElementById("googleRead");
const googleStatus = document.getElementById("googleStatus");

function googleMessage(message) {
    googleStatus.textContent = message;
}

function googleSetConnected(connected) {
    googleWrite.disabled = !connected;
    googleRead.disabled = !connected;
}

function googleInitialize() {
    if (!window.google?.accounts?.oauth2) {
        googleMessage("Libreria Google non ancora disponibile.");
        return false;
    }

    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPE,
        callback: (response) => {
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

async function googleApi(url, options = {}) {
    if (!googleAccessToken) {
        throw new Error("Google Drive non collegato.");
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", "Bearer " + googleAccessToken);

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (!response.ok) {
        if (response.status === 401) {
            googleAccessToken = null;
            googleSetConnected(false);
        }

        const details = await response.text();
        throw new Error("HTTP " + response.status + ": " + details);
    }

    return response;
}

async function googleFindTestFile() {
    const query = new URLSearchParams({
        spaces: "appDataFolder",
        q: "name = '" + GOOGLE_TEST_FILE + "' and trashed = false",
        fields: "files(id,name),nextPageToken",
        page_size: "100"
    });

    const response = await googleApi(
        "https://www.googleapis.com/drive/v3/files?" + query
    );

    const result = await response.json();

    return result.files?.[0] || null;
}

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

        const boundary = "myebook_boundary_" + Date.now();

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
              encodeURIComponent(existingFile.id) + "?uploadType=multipart"
            : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

        const response = await googleApi(url, {
            method: existingFile ? "PATCH" : "POST",
            headers: {
                "Content-Type": "multipart/related; boundary=" + boundary
            },
            body
        });

        const result = await response.json();

        googleMessage(
            "File scritto correttamente. ID: " + result.id
        );

    } catch (error) {
        googleMessage("Errore scrittura: " + error.message);
    }
}

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
            encodeURIComponent(file.id) + "?alt=media"
        );

        const data = await response.json();

        googleMessage(
            "File letto correttamente: " +
            JSON.stringify(data)
        );

    } catch (error) {
        googleMessage("Errore lettura: " + error.message);
    }
}

googleConnect.addEventListener("click", () => {
    try {
        if (!googleTokenClient && !googleInitialize()) {
            return;
        }

        googleTokenClient.requestAccessToken({
            prompt: googleAccessToken ? "" : "consent"
        });

    } catch (error) {
        googleMessage("Errore collegamento: " + error.message);
    }
});

googleWrite.addEventListener("click", googleWriteTest);
googleRead.addEventListener("click", googleReadTest);

googleSetConnected(false);
