"use strict";

const VERSION = document.querySelector('meta[name="app-version"]').content;
const materials = {
  pet: { name: "PET", tip: "Знайдіть маркування 1 PET. Спорожніть паковання. Уточніть, які форми PET приймає обраний пункт і що робити з кришкою та етикеткою." },
  hdpe: { name: "HDPE", tip: "Знайдіть маркування 2 HDPE. Спорожніть паковання та перевірте вимоги пункту до залишків вмісту й підготовки тари." },
  aluminum: { name: "Алюміній", tip: "Спорожніть паковання. Уточніть, чи приймає пункт цей алюмінієвий виріб. Для фольги та комбінованих матеріалів умови можуть відрізнятися." },
  cardboard: { name: "Картон", tip: "Тримайте картон сухим. Перевірте вимоги пункту до забрудненого, ламінованого та комбінованого паковання." },
  unknown: { name: "Не знаю", tip: "Пошукайте маркування на дні, етикетці або біля шва. Якщо визначити матеріал не вдалося, уточніть його у пункті приймання." }
};
const statusNames = { sorted: "Відсортовано", handed: "Передано" };
const $ = (id) => document.getElementById(id);
const form = $("sorting-form");
const numberFormat = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" });
let records = [];
let editing = null;
let removedRecord = null;
let photoUrl = null;
let photoSequence = 0;
let busy = false;
let ready = false;
let registration = null;
let remoteVersion = VERSION;
let checking = false;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("ecoloop-journal-changes") : null;

function showStatus(id, message = "", error = false) {
  $(id).textContent = message;
  $(id).classList.toggle("error", error);
}

function formatMass(grams) {
  return grams === null ? "Без зважування" : `${numberFormat.format(grams / 1000)} кг`;
}

function updateForm() {
  const material = $("material").value;
  $("instructions").hidden = !material;
  $("instruction-text").textContent = materials[material]?.tip || "";
  $("save-sorting").disabled = !ready || busy || !material || material === "unknown";
}

function clearPhoto() {
  photoSequence += 1;
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  $("preview").removeAttribute("src");
  $("preview").hidden = true;
  $("photo-placeholder").hidden = false;
  $("remove-photo").hidden = true;
  $("photo").value = "";
  $("camera").value = "";
  showStatus("photo-status");
}

async function loadPhoto(file) {
  if (!file) return;
  if (file.type && !file.type.startsWith("image/")) {
    showStatus("photo-status", "Оберіть зображення JPG, PNG або інший підтримуваний формат.", true);
    return;
  }
  const sequence = ++photoSequence;
  const url = URL.createObjectURL(file);
  showStatus("photo-status", "Відкриваємо фото…");
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (sequence !== photoSequence) {
      URL.revokeObjectURL(url);
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = url;
    $("preview").src = url;
    $("preview").hidden = false;
    $("photo-placeholder").hidden = true;
    $("remove-photo").hidden = false;
    if (!editing) $("material").value = "";
    updateForm();
    showStatus("photo-status", "Фото додано. Матеріал оберіть за маркуванням.");
  } catch (error) {
    URL.revokeObjectURL(url);
    if (sequence === photoSequence) showStatus("photo-status", "Не вдалося відкрити фото. Спробуйте JPG або PNG.", true);
  }
}

function resetForm() {
  form.reset();
  editing = null;
  clearPhoto();
  $("form-heading").textContent = "Додати сортування";
  $("save-sorting").textContent = "Зберегти запис";
  $("cancel-edit").hidden = true;
  updateForm();
}

function readGrams() {
  const raw = $("weight").value.trim();
  if (!raw) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) throw new Error("Введіть масу числом, наприклад 0,25.");
  const amount = Number(raw.replace(",", "."));
  const grams = amount * ($("weight-unit").value === "kg" ? 1000 : 1);
  const rounded = Math.round(grams);
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(grams - rounded) > 0.000001) {
    throw new Error("Маса має бути більшою за нуль і вказаною з точністю до цілого грама.");
  }
  return rounded;
}

function renderStats() {
  const total = records.reduce((sum, record) => sum + (record.grams || 0), 0);
  const handed = records.reduce((sum, record) => sum + (record.status === "handed" ? record.grams || 0 : 0), 0);
  $("total-weight").textContent = formatMass(total);
  $("handed-weight").textContent = formatMass(handed);
  $("record-count").textContent = records.length;
  $("material-totals").replaceChildren();
  for (const [key, material] of Object.entries(materials)) {
    if (key === "unknown") continue;
    const grams = records.reduce((sum, record) => sum + (record.material === key ? record.grams || 0 : 0), 0);
    const row = document.createElement("div");
    const label = document.createElement("div");
    label.className = "material-label";
    const name = document.createElement("span");
    name.textContent = material.name;
    const weight = document.createElement("strong");
    weight.textContent = formatMass(grams);
    label.append(name, weight);
    const progress = document.createElement("progress");
    progress.max = total || 1;
    progress.value = grams;
    progress.setAttribute("aria-label", `${material.name}: ${formatMass(grams)}`);
    row.append(label, progress);
    $("material-totals").append(row);
  }
  const unweighed = records.filter(record => record.grams === null).length;
  $("unweighed-note").textContent = unweighed ? `Записів без зважування: ${unweighed}. У суму маси вони не входять.` : "";
}

function renderHistory() {
  const visible = records.filter(record => {
    return ($("filter-material").value === "all" || record.material === $("filter-material").value) &&
      ($("filter-status").value === "all" || record.status === $("filter-status").value);
  });
  $("history-count").textContent = `${visible.length} / ${records.length}`;
  $("sorting-history").replaceChildren();
  $("empty-history").hidden = visible.length > 0;
  $("empty-history").textContent = records.length ? "За цими фільтрами записів немає." : "Тут з’являться ваші записи. Почніть з першого сортування.";
  for (const record of visible) {
    const item = document.createElement("li");
    item.className = "history-item";
    const top = document.createElement("div");
    top.className = "record-top";
    const name = document.createElement("span");
    name.className = "record-material";
    name.textContent = materials[record.material].name;
    const mass = document.createElement("span");
    mass.className = "record-mass";
    mass.textContent = formatMass(record.grams);
    top.append(name, mass);
    const meta = document.createElement("div");
    meta.className = "record-meta";
    const time = document.createElement("time");
    time.dateTime = record.createdAt;
    time.textContent = dateFormat.format(new Date(record.createdAt));
    const badge = document.createElement("span");
    badge.className = "record-badge";
    badge.textContent = statusNames[record.status];
    meta.append(time, badge);
    item.append(top, meta);
    if (record.note) {
      const note = document.createElement("p");
      note.className = "record-note";
      note.textContent = record.note;
      item.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "record-actions";
    for (const action of ["edit", "delete"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `text-button ${action}`;
      button.dataset.action = action;
      button.dataset.id = record.id;
      button.textContent = action === "edit" ? "Редагувати" : "Видалити";
      button.setAttribute("aria-label", `${button.textContent}: ${materials[record.material].name}, ${time.textContent}`);
      actions.append(button);
    }
    item.append(actions);
    $("sorting-history").append(item);
  }
}

async function refreshRecords() {
  records = await EcoStore.all();
  renderStats();
  renderHistory();
}

async function notifyChanges() {
  channel?.postMessage("changed");
  await refreshRecords();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || $("save-sorting").disabled) return;
  let record;
  try {
    record = {
      id: editing?.id || crypto.randomUUID(),
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date(Math.max(Date.now(), editing ? Date.parse(editing.updatedAt) + 1 : 0)).toISOString(),
      material: $("material").value,
      grams: readGrams(),
      status: $("record-status").value,
      note: $("note").value.trim()
    };
  } catch (error) {
    showStatus("save-status", error.message, true);
    $("weight").focus();
    return;
  }
  busy = true;
  updateForm();
  try {
    await EcoStore.save(record, editing?.updatedAt || null);
  } catch (error) {
    busy = false;
    updateForm();
    showStatus("save-status", `Не вдалося зберегти. ${error.message}`, true);
    return;
  }
  busy = false;
  resetForm();
  showStatus("save-status", "Запис збережено.");
  try {
    await notifyChanges();
  } catch (error) {
    showStatus("global-status", `Запис збережено. Перезавантажте сторінку, щоб оновити історію. ${error.message}`, true);
  }
});

$("material").addEventListener("change", () => { updateForm(); showStatus("save-status"); });
$("take-photo").addEventListener("click", () => $("camera").click());
$("choose-photo").addEventListener("click", () => $("photo").click());
for (const id of ["camera", "photo"]) {
  $(id).addEventListener("change", () => { loadPhoto($(id).files[0]); $(id).value = ""; });
}
$("remove-photo").addEventListener("click", clearPhoto);
$("cancel-edit").addEventListener("click", () => { resetForm(); showStatus("save-status"); });
$("filter-material").addEventListener("change", renderHistory);
$("filter-status").addEventListener("change", renderHistory);

$("sorting-history").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || busy) return;
  const record = records.find(item => item.id === button.dataset.id);
  if (!record) return;
  if (button.dataset.action === "edit") {
    resetForm();
    editing = record;
    $("material").value = record.material;
    $("weight").value = record.grams === null ? "" : String(record.grams / 1000);
    $("record-status").value = record.status;
    $("note").value = record.note;
    $("form-heading").textContent = "Редагувати запис";
    $("save-sorting").textContent = "Зберегти зміни";
    $("cancel-edit").hidden = false;
    updateForm();
    form.scrollIntoView({ behavior: "auto", block: "start" });
    $("material").focus({ preventScroll: true });
    return;
  }
  if (!confirm("Видалити цей запис із журналу?")) return;
  busy = true;
  updateForm();
  try {
    await EcoStore.remove(record);
    removedRecord = record;
    $("undo-panel").hidden = false;
    if (editing?.id === record.id) resetForm();
    await notifyChanges();
  } catch (error) { showStatus("global-status", error.message, true); }
  finally { busy = false; updateForm(); }
});

$("undo-delete").addEventListener("click", async () => {
  if (!removedRecord || busy) return;
  busy = true;
  updateForm();
  try {
    await EcoStore.save(removedRecord);
    removedRecord = null;
    $("undo-panel").hidden = true;
    await notifyChanges();
  } catch (error) { showStatus("global-status", error.message, true); }
  finally { busy = false; updateForm(); }
});

function downloadFile(contents, type, filename) {
  const url = URL.createObjectURL(new Blob(contents, { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

$("export-history").addEventListener("click", async () => {
  try {
    const data = await EcoStore.all();
    if (!data.length) { showStatus("export-status", "Спочатку додайте запис."); return; }
    const rows = [["Матеріал", "Маса (кг)", "Стан", "Дата і час (UTC)", "Примітка"]];
    for (const record of data) rows.push([materials[record.material].name,
      record.grams === null ? "" : String(record.grams / 1000).replace(".", ","),
      statusNames[record.status], record.createdAt, record.note]);
    const csv = rows.map(row => row.map(csvCell).join(";")).join("\r\n");
    downloadFile(["\uFEFF", csv], "text/csv;charset=utf-8", "ecoloop-history.csv");
    showStatus("export-status", "CSV підготовлено. Перевірте завантаження браузера.");
  } catch (error) { showStatus("export-status", error.message, true); }
});

$("backup-history").addEventListener("click", async () => {
  try {
    const backup = { app: "EcoLoopAI", formatVersion: 2, exportedAt: new Date().toISOString(), records: await EcoStore.all() };
    downloadFile([JSON.stringify(backup, null, 2)], "application/json", "ecoloop-backup.json");
    showStatus("export-status", "Резервну копію підготовлено.");
  } catch (error) { showStatus("export-status", error.message, true); }
});
$("restore-history").addEventListener("click", () => $("backup-file").click());
$("backup-file").addEventListener("change", async () => {
  const file = $("backup-file").files[0];
  $("backup-file").value = "";
  if (!file || busy) return;
  busy = true;
  updateForm();
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== "EcoLoopAI" || backup.formatVersion !== 2 || !Array.isArray(backup.records)) {
      throw new Error("Оберіть резервну копію EcoLoop формату 2.");
    }
    const count = await EcoStore.importRecords(backup.records);
    await notifyChanges();
    showStatus("export-status", `Додано записів: ${count}. Наявні записи з тими самими ID пропущено.`);
  } catch (error) { showStatus("export-status", `Імпорт не виконано. ${error.message}`, true); }
  finally { busy = false; updateForm(); }
});

function updateConnection() {
  $("connection").textContent = navigator.onLine ? "Онлайн" : "Офлайн";
  $("connection").classList.toggle("offline", !navigator.onLine);
}
window.addEventListener("online", () => { updateConnection(); checkForUpdates(false); });
window.addEventListener("offline", updateConnection);
channel?.addEventListener("message", () => refreshRecords().catch(error => showStatus("global-status", error.message, true)));
window.addEventListener("focus", () => {
  if (ready) refreshRecords().catch(error => showStatus("global-status", error.message, true));
});

// Оновлення активується за явною дією, щоб зберегти незавершену форму.
function showUpdate() {
  $("update-banner").hidden = false;
}

function watchRegistration(reg) {
  if (reg.waiting) showUpdate();
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && reg.waiting) showUpdate();
    });
  });
}

async function checkForUpdates(manual = true) {
  if (checking) return;
  if (!navigator.onLine) {
    if (manual) showStatus("global-status", "Для перевірки оновлень під’єднайтеся до інтернету.");
    return;
  }
  checking = true;
  $("check-update").disabled = true;
  try {
    const url = new URL("./version.json", location.href);
    url.searchParams.set("check", Date.now());
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Сервер ще не опублікував файл версії. Повторіть пізніше.");
    const latest = await response.json();
    if (typeof latest.version !== "string" || !/^[a-f0-9]{12}$/.test(latest.version)) throw new Error("Некоректний файл версії на сервері.");
    remoteVersion = latest.version;
    if (registration) await registration.update();
    if (remoteVersion !== VERSION || registration?.waiting) {
      showUpdate();
      if (manual) showStatus("global-status", "Нова версія доступна. Натисніть «Оновити».");
    } else if (manual) {
      showStatus("global-status", "Відкрита актуальна версія EcoLoop.");
    }
  } catch (error) {
    if (manual) showStatus("global-status", `Перевірка не завершена. ${error.message}`, true);
  } finally {
    checking = false;
    $("check-update").disabled = false;
  }
}

function waitForInstalled(reg) {
  const worker = reg.installing;
  if (!worker || reg.waiting) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Завантаження триває. Спробуйте оновити ще раз.")), 30000);
    function finish(error) {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      error ? reject(error) : resolve();
    }
    function changed() {
      if (["installed", "activated"].includes(worker.state)) finish();
      if (worker.state === "redundant") finish(new Error("Не вдалося встановити версію. Перевірте публікацію всіх файлів."));
    }
    worker.addEventListener("statechange", changed);
    changed();
  });
}

$("check-update").addEventListener("click", () => checkForUpdates(true));
$("apply-update").addEventListener("click", async () => {
  if (busy) { showStatus("global-status", "Дочекайтеся збереження запису."); return; }
  const dirty = editing || photoUrl || $("material").value || $("weight").value || $("note").value;
  if (dirty && !confirm("Є незбережена форма. Перезавантажити й очистити її для оновлення?")) return;
  $("apply-update").disabled = true;
  try {
    if (!navigator.onLine) throw new Error("Під’єднайтеся до інтернету.");
    if (registration) {
      await registration.update();
      await waitForInstalled(registration);
      if (registration.waiting) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener("controllerchange", changed); reject(new Error("Оновлення ще активується. Спробуйте повторно.")); }, 15000);
          function changed() { clearTimeout(timer); navigator.serviceWorker.removeEventListener("controllerchange", changed); resolve(); }
          navigator.serviceWorker.addEventListener("controllerchange", changed);
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        });
      }
    }
    const url = new URL("./", location.href);
    url.searchParams.set("updated", Date.now());
    location.replace(url);
  } catch (error) {
    showStatus("global-status", error.message, true);
    $("apply-update").disabled = false;
  }
});

async function start() {
  $("app-version").textContent = `Версія 2.0 · ${VERSION.slice(0, 6)}`;
  updateConnection();
  try {
    await EcoStore.open();
    await refreshRecords();
    ready = true;
    updateForm();
  } catch (error) {
    showStatus("global-status", `Журнал недоступний. ${error.message}`, true);
    $("export-history").disabled = true;
    $("backup-history").disabled = true;
    $("restore-history").disabled = true;
  }
  if ("serviceWorker" in navigator) {
    try {
      registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      watchRegistration(registration);
    } catch (error) {
      showStatus("global-status", "Офлайн-режим не підключився. Перевірте HTTPS та повторно відкрийте сайт з інтернетом.", true);
    }
  }
  await checkForUpdates(false);
}
start();
