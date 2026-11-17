const CONFIG_KEY = "myebook_dropbox_url";
const DB_NAME = "MYEbookLocal";
const DB_VERSION = 1;
const STORE = "index";

let books = [];
let filteredBooks = [];
let sortField = "author";
let ascending = true;
let selected = null;

const $ = id => document.getElementById(id);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalIndex(text, dateText) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ text, dateText }, "current");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadLocalIndex() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get("current");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function parseIndex(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!lines.length || !lines[0].startsWith("EBOOK_INDEX;"))
    throw new Error("File non valido: manca EBOOK_INDEX.");

  const dateText = lines[0].substring("EBOOK_INDEX;".length).trim();
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(";");
    if (parts.length < 2) continue;

    result.push({
      author: parts[0].trim(),
      title: parts[1].trim()
    });
  }

  return { books: result, dateText };
}

function setStatus(text) {
  $("status").textContent = text || "";
  $("setupMessage").textContent = text || "";
}

function showLibrary() {
  $("setup").classList.add("hidden");
  $("library").classList.remove("hidden");
}

function showSetup() {
  $("library").classList.add("hidden");
  $("setup").classList.remove("hidden");
}

function updateInfo(dateText) {
  $("indexInfo").textContent =
    books.length
      ? `${books.length.toLocaleString("it-IT")} ebook · aggiornato ${dateText}`
      : "Nessun indice locale disponibile";
}

function render() {
  const query = $("search").value.trim().toLocaleUpperCase("it-IT");

  filteredBooks = books.filter(book =>
    !query ||
    book.author.toLocaleUpperCase("it-IT").includes(query) ||
    book.title.toLocaleUpperCase("it-IT").includes(query)
  );

  const field = sortField;
  const direction = ascending ? 1 : -1;

  filteredBooks.sort((a, b) =>
    a[field].localeCompare(b[field], "it-IT", { sensitivity: "base" }) * direction
  );

  $("count").textContent =
    `${filteredBooks.length.toLocaleString("it-IT")} risultati su ${books.length.toLocaleString("it-IT")}`;

  const fragment = document.createDocumentFragment();

  // Per la prima versione visualizziamo al massimo 500 risultati.
  // La ricerca resta sull'intero indice.
  for (const book of filteredBooks.slice(0, 500)) {
    const div = document.createElement("div");
    div.className = "book";
    div.innerHTML =
      `<div class="author">${escapeHtml(book.author)}</div>` +
      `<div class="title">${escapeHtml(book.title)}</div>`;
    div.addEventListener("click", () => selectBook(book));
    fragment.appendChild(div);
  }

  $("results").replaceChildren(fragment);

  if (filteredBooks.length > 500) {
    const more = document.createElement("div");
    more.className = "message";
    more.textContent =
      "Primi 500 risultati visualizzati. Raffina la ricerca per restringere l'elenco.";
    $("results").appendChild(more);
  }
}

function selectBook(book) {
  selected = book;
  $("selectedBook").textContent = `${book.author} — ${book.title}`;
  $("selectedBar").classList.remove("hidden");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function toDropboxDirectUrl(url) {
  try {
    const u = new URL(url.trim());

    if (u.hostname === "www.dropbox.com" ||
        u.hostname === "dropbox.com") {
      u.hostname = "dl.dropboxusercontent.com";
    }

    u.searchParams.delete("st");
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");

    return u.toString();

  } catch {
    return url.trim();
  }
}

async function fetchRemoteIndex(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(toDropboxDirectUrl(url), {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadText(text, save) {
  const parsed = parseIndex(text);
  books = parsed.books;
  updateInfo(parsed.dateText);
  showLibrary();
  render();

  if (save)
    await saveLocalIndex(text, parsed.dateText);
}

async function initialLoad() {
  const local = await loadLocalIndex();

  if (local) {
    await loadText(local.text, false);
  } else {
    const savedUrl = localStorage.getItem(CONFIG_KEY);
    if (savedUrl) $("dropboxUrl").value = savedUrl;
    showSetup();
  }
}

async function saveUrlAndLoad() {
  const url = $("dropboxUrl").value.trim();

  if (!url) {
    setStatus("Inserisci il link Dropbox.");
    return;
  }

  localStorage.setItem(CONFIG_KEY, url);
  setStatus("Provo a scaricare l'indice...");

  try {
    const text = await fetchRemoteIndex(url);
    await loadText(text, true);
    setStatus("Indice caricato e salvato localmente.");
  } catch (error) {
    setStatus("Non riesco a leggere il file remoto. Controlla link e connessione.");
    console.error(error);
  }
}

async function checkRemote() {
  const url = localStorage.getItem(CONFIG_KEY);

  if (!url) {
    showSetup();
    return;
  }

  setStatus("Controllo il file remoto...");

  try {
    const text = await fetchRemoteIndex(url);
    const remote = parseIndex(text);
    const local = await loadLocalIndex();

    if (!local) {
      await loadText(text, true);
      setStatus("Indice locale creato.");
      return;
    }

    const localParsed = parseIndex(local.text);

    if (remote.dateText === localParsed.dateText) {
      setStatus(`Indice già aggiornato (${remote.dateText}).`);
      return;
    }

    const ok = confirm(
      `È disponibile un nuovo indice.\n\n` +
      `Locale: ${localParsed.dateText}\n` +
      `Rete:   ${remote.dateText}\n\n` +
      `Vuoi scaricarlo?`
    );

    if (ok) {
      await loadText(text, true);
      setStatus(`Indice aggiornato: ${remote.dateText}`);
    } else {
      setStatus("Continua a usare l'indice locale.");
    }
  } catch (error) {
    setStatus("Dropbox non raggiungibile. Continuo con l'indice locale.");
    console.error(error);
  }
}

function googleSearch(query) {
  window.open(
    "https://www.google.com/search?q=" + encodeURIComponent(query),
    "_blank"
  );
}

$("search").addEventListener("input", render);

$("sortAuthor").addEventListener("click", () => {
  sortField = "author";
  $("sortAuthor").classList.add("active");
  $("sortTitle").classList.remove("active");
  render();
});

$("sortTitle").addEventListener("click", () => {
  sortField = "title";
  $("sortTitle").classList.add("active");
  $("sortAuthor").classList.remove("active");
  render();
});

$("sortDirection").addEventListener("click", () => {
  ascending = !ascending;
  $("sortDirection").textContent = ascending ? "↑" : "↓";
  render();
});

$("saveUrl").addEventListener("click", saveUrlAndLoad);
$("check").addEventListener("click", checkRemote);

$("settings").addEventListener("click", () => {
  $("dropboxUrl").value = localStorage.getItem(CONFIG_KEY) || "";
  $("setupMessage").textContent = "";
  showSetup();
});

$("searchAuthor").addEventListener("click", () => {
  if (selected) googleSearch(selected.author);
});

$("searchBook").addEventListener("click", () => {
  if (selected)
    googleSearch(`"${selected.title}" "${selected.author}"`);
});

initialLoad().catch(error => {
  console.error(error);
  showSetup();
  setStatus("Errore nell'accesso all'indice locale.");
});
