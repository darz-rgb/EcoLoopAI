/* IndexedDB дає атомарні записи, зокрема коли відкрито кілька вкладок. */
(() => {
  "use strict";
  const MATERIALS = ["pet", "hdpe", "aluminum", "cardboard"];
  const LEGACY_KEY = "ecoloop-sorting-history-v1";
  const databaseName = `ecoloop-journal-${new URL("./", location.href).pathname}`;
  let database;

  function normalizeRecord(record, index = 0) {
    if (!record || !MATERIALS.includes(record.material) ||
        typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
      throw new Error("У файлі є некоректний запис або дата.");
    }
    const grams = record.grams ?? null;
    const status = record.status ?? "sorted";
    const note = record.note ?? "";
    const id = record.id ?? `legacy-${record.createdAt}-${record.material}-${index}`;
    const updatedAt = record.updatedAt ?? record.createdAt;
    if ((grams !== null && (!Number.isSafeInteger(grams) || grams <= 0)) ||
        !["sorted", "handed"].includes(status) || typeof note !== "string" ||
        note.length > 200 || typeof id !== "string" || !id || id.length > 200 ||
        typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) {
      throw new Error("Перевірте масу, стан і формат записів у резервній копії.");
    }
    return { id, material: record.material, createdAt: record.createdAt, updatedAt,
      grams, status, note };
  }

  function transactionError(transaction) {
    return transaction.error || new Error("Браузер не зміг завершити запис. Спробуйте ще раз.");
  }

  async function open() {
    database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records", { keyPath: "id" });
        request.result.createObjectStore("meta");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Закрийте інші вкладки EcoLoop і спробуйте знову."));
    });
    database.onversionchange = () => database.close();

    // Позначка міграції та записи зберігаються в одній транзакції.
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(["records", "meta"], "readwrite");
      let migrationError;
      transaction.objectStore("meta").get("legacy-imported").onsuccess = (event) => {
        if (event.target.result) return;
        try {
          const raw = localStorage.getItem(LEGACY_KEY);
          const legacy = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(legacy)) throw new Error("Стара історія має некоректний формат.");
          const records = legacy.map(normalizeRecord);
          for (const record of records) transaction.objectStore("records").add(record);
          transaction.objectStore("meta").put(true, "legacy-imported");
        } catch (error) {
          // Недоступний localStorage не блокує нову порожню базу.
          if (error.name === "SecurityError") {
            // Спробуємо перенесення ще раз під час наступного відкриття.
          } else {
            migrationError = error;
            transaction.abort();
          }
        }
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(migrationError || transactionError(transaction));
    });
  }

  function all() {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("records", "readonly");
      const request = transaction.objectStore("records").getAll();
      transaction.oncomplete = () => resolve(request.result.sort((a, b) => {
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }));
      transaction.onabort = () => reject(transactionError(transaction));
    });
  }

  function save(record, expectedUpdatedAt = null) {
    const valid = normalizeRecord(record);
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite");
      const records = transaction.objectStore("records");
      let conflict;
      records.get(valid.id).onsuccess = (event) => {
        const current = event.target.result;
        const isNew = expectedUpdatedAt === null;
        if ((isNew && current) || (!isNew && (!current || current.updatedAt !== expectedUpdatedAt))) {
          conflict = new Error("Цей запис уже змінено в іншій вкладці. Відкрийте його з історії ще раз.");
          transaction.abort();
          return;
        }
        records.put(valid);
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(conflict || transactionError(transaction));
    });
  }

  function remove(record) {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      let conflict;
      store.get(record.id).onsuccess = (event) => {
        if (!event.target.result || event.target.result.updatedAt !== record.updatedAt) {
          conflict = new Error("Запис змінено в іншій вкладці. Оновіть історію та повторіть дію.");
          transaction.abort();
          return;
        }
        store.delete(record.id);
      };
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(conflict || transactionError(transaction));
    });
  }

  function importRecords(records) {
    if (!Array.isArray(records)) throw new Error("Очікується список записів.");
    const validated = records.map(normalizeRecord);
    if (new Set(validated.map(record => record.id)).size !== validated.length) {
      throw new Error("У резервній копії повторюються ідентифікатори записів.");
    }
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      let added = 0;
      for (const record of validated) {
        store.get(record.id).onsuccess = (event) => {
          if (!event.target.result) {
            store.add(record);
            added += 1;
          }
        };
      }
      transaction.oncomplete = () => resolve(added);
      transaction.onabort = () => reject(transactionError(transaction));
    });
  }

  window.EcoStore = { open, all, save, remove, importRecords };
})();
