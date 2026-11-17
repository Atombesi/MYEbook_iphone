
const CONFIG_KEY = "myebook_dropbox_url";
const DB_NAME = "MYEbookLocal";
const DB_VERSION = 1;
const STORE = "index";

let books = [];
let filteredBooks = [];
let sortField = "author";
let ascending = true;
let selected = null;
let expandedAuthor = null;

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


function createBookElement(book, showAuthor = true) {
  const div = document.createElement("div");
  div.className = "book";

  if (showAuthor) {
    const author = document.createElement("div");
    author.className = "author";
    author.textContent = book.author;
    div.appendChild(author);
  }

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = book.title;

  // Icona se il libro contiene informazioni personali
  if (bookHasNotes(book)) {
    const icon = document.createElement("span");
    icon.textContent = " 📝";
    icon.title = "Informazioni personali presenti";
    title.appendChild(icon);
  }

  div.appendChild(title);

  div.addEventListener("click", () => selectBook(book));

  return div;
}

// Verifica se un libro contiene informazioni personali
function bookHasNotes(book) {
  if (typeof personalArchive === "undefined" ||
      !personalArchive?.notes) {
    return false;
  }

  const key = book.author + "|" + book.title;
  const data = personalArchive.notes[key];

  if (!data) return false;

  return (
    data.status === "READ" ||
    data.status === "TO_READ" ||
    Number(data.rating) > 0 ||
    (typeof data.note === "string" &&
     data.note.trim() !== "")
  );
}


function renderByTitle(fragment) {
  for (const book of filteredBooks.slice(0, 500)) {
    fragment.appendChild(createBookElement(book));
  }

  if (filteredBooks.length > 500) {
    const more = document.createElement("div");
    more.className = "message";
    more.textContent =
      "Primi 500 risultati visualizzati. Raffina la ricerca per restringere l'elenco.";
    fragment.appendChild(more);
  }
}

function renderByAuthor(fragment) {
  const groups = new Map();

  for (const book of filteredBooks) {
    const key = book.author.toLocaleUpperCase("it-IT");

    if (!groups.has(key)) {
      groups.set(key, {
        author: book.author,
        books: []
      });
    }

    groups.get(key).books.push(book);
  }

  const orderedGroups = Array.from(groups.entries());

  orderedGroups.sort((a, b) =>
    a[1].author.localeCompare(
      b[1].author,
      "it-IT",
      { sensitivity: "base" }
    ) * (ascending ? 1 : -1)
  );

  for (const [key, group] of orderedGroups) {
    group.books.sort((a, b) =>
      a.title.localeCompare(
        b.title,
        "it-IT",
        { sensitivity: "base" }
      )
    );

    const container = document.createElement("div");
    container.className = "author-group";

    const header = document.createElement("div");
    header.className = "book author-header";
    header.style.cursor = "pointer";

    const isOpen = expandedAuthor === key;

  
    header.style.fontWeight = "bold";
    header.textContent =
      `${isOpen ? "▼" : "▶"} ${group.author} (${group.books.length})`;

    // Mostra l'icona se almeno un libro
    // dell'autore contiene informazioni personali.
    if (group.books.some(book => bookHasNotes(book))) {
      const icon = document.createElement("span");
      icon.textContent = " 📝";
      icon.title = "Questo autore ha libri con informazioni personali";
      header.appendChild(icon);
    }

    const content = document.createElement("div");
    content.className = "author-books";
    content.style.paddingLeft = "18px";

    if (isOpen) {
      for (const book of group.books) {
        content.appendChild(createBookElement(book, false));
      }
    }

    header.addEventListener("click", () => {
      expandedAuthor = isOpen ? null : key;
      render();
    });

    container.appendChild(header);
    container.appendChild(content);
    fragment.appendChild(container);
  }
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
    a[field].localeCompare(
      b[field],
      "it-IT",
      { sensitivity: "base" }
    ) * direction
  );

  $("count").textContent =
    `${filteredBooks.length.toLocaleString("it-IT")} risultati su ${books.length.toLocaleString("it-IT")}`;

  const fragment = document.createDocumentFragment();

  if (sortField === "author") {
    renderByAuthor(fragment);
  } else {
    renderByTitle(fragment);
  }

  $("results").replaceChildren(fragment);
}


function selectBook(book) {
  selected = book;

  $("selectedBook").textContent =
    `${book.author} — ${book.title}`;

  $("selectedBar").classList.remove("hidden");

  // Chiude le note del libro precedente
  closeBookNotes();

  // Azzera i campi in attesa del caricamento da Drive
  currentRating = 0;
  $("statusNone").checked = true;
  $("bookNote").value = "";
  $("notesMessage").textContent = "";
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
  expandedAuthor = null;

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

$("search").addEventListener("input", () => {
  expandedAuthor = null;
  render();
});

$("sortAuthor").addEventListener("click", () => {
  sortField = "author";
  expandedAuthor = null;

  $("sortAuthor").classList.add("active");
  $("sortTitle").classList.remove("active");

  render();
});

$("sortTitle").addEventListener("click", () => {
  sortField = "title";
  expandedAuthor = null;

  $("sortTitle").classList.add("active");
  $("sortAuthor").classList.remove("active");

  render();
});

$("sortDirection").addEventListener("click", () => {
  ascending = !ascending;
  expandedAuthor = null;

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

/* =========================================
   MYEbook - Gestione interfaccia Note
   ========================================= */

let currentRating = 0;

// Scala di valutazione Android: 3 stelle
const MAX_RATING = 3;

function renderRatingStars() {
  const container = $("ratingStars");
  container.replaceChildren();

  for (let i = 1; i <= MAX_RATING; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "★";
    button.classList.toggle("active", i <= currentRating);

    button.addEventListener("click", () => {
      currentRating = currentRating === i ? 0 : i;
      renderRatingStars();
    });

    container.appendChild(button);
  }
}

function closeBookNotes() {
  $("notesPanel").classList.add("hidden");
  $("openNotes").textContent = "📝 Note ▾";
}


async function openBookNotes() {
  if (!selected) return;

  const book = selected;

  $("notesPanel").classList.remove("hidden");
  $("openNotes").textContent = "📝 Note ▴";
  $("notesMessage").textContent = "Caricamento Note...";

  $("saveBookNotes").disabled = true;

  currentRating = 0;
  $("statusNone").checked = true;
  $("bookNote").value = "";
  renderRatingStars();

  try {
    await googleAuthorizeForNotes();

    const data = await googleReadBookNotes(book);

    // Evita di mostrare le note di un libro
    // se nel frattempo ne è stato selezionato un altro.
    if (selected !== book) return;

    if (data) {
      if (data.status === "READ") {
        $("statusRead").checked = true;
      } else if (data.status === "TO_READ") {
        $("statusToRead").checked = true;
      }

      currentRating = Number(data.rating) || 0;
      $("bookNote").value = data.note || "";
      renderRatingStars();
    }

  $("notesMessage").textContent = data
      ? "Note caricate da Google Drive."
      : "Nessuna nota personale per questo libro.";

    render();

    $("saveBookNotes").disabled = false;

  } catch (error) {
    if (selected !== book) return;

    $("notesMessage").textContent =
      "Impossibile caricare le Note: " + error.message;

    console.error(error);
  }
}


$("openNotes").addEventListener("click", () => {
  if ($("notesPanel").classList.contains("hidden")) {
    openBookNotes();
  } else {
    closeBookNotes();
  }
});

$("closeNotes").addEventListener("click", closeBookNotes);


$("saveBookNotes").addEventListener("click", async () => {
  if (!selected) return;

  const book = selected;
  const button = $("saveBookNotes");

  const status = document.querySelector(
    'input[name="bookStatus"]:checked'
  )?.value || "";

  const changes = {
    status: status,
    rating: currentRating,
    note: $("bookNote").value
  };

  button.disabled = true;
  $("notesMessage").textContent =
    "Salvataggio su Google Drive...";

  try {
    await googleSaveBookNotes(book, changes);

    if (selected === book) {
      $("notesMessage").textContent =
        "Note salvate correttamente su Google Drive.";
    }

  } catch (error) {
    if (selected === book) {
      $("notesMessage").textContent =
        "Errore nel salvataggio: " + error.message;
    }

    console.error(error);

  } finally {
    if (selected === book) {
      button.disabled = false;
    }
  }
});


initialLoad().catch(error => {
  console.error(error);
  showSetup();
  setStatus("Errore nell'accesso all'indice locale.");
});
