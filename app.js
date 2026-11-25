const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#preview");
const materialSelect = document.querySelector("#material");
const instructions = document.querySelector("#instructions");
const instructionText = document.querySelector("#instruction-text");

const cameraInput = document.querySelector("#camera");
const takePhotoButton = document.querySelector("#take-photo");
const choosePhotoButton = document.querySelector("#choose-photo");
const photoStatus = document.querySelector("#photo-status");

const tips = {
  pet: "Знайдіть маркування 1 PET. Спорожніть паковання та перевірте правила обраного пункту приймання.",
  hdpe: "Знайдіть маркування 2 HDPE. Перевірте, чи приймає пункт саме цей вид паковання.",
  aluminum: "Спорожніть паковання та перевірте умови приймання алюмінію.",
  cardboard: "Перевірте вимоги пункту до чистоти й стану картону.",
  unknown: "Знайдіть маркування на дні, етикетці або біля шва паковання."
};

let previewUrl;

takePhotoButton.addEventListener("click", () => {
  cameraInput.click();
});

choosePhotoButton.addEventListener("click", () => {
  photoInput.click();
});

function showPhoto(file) {
  // При скасуванні вибору залишаємо попереднє фото.
  if (!file) {
    return;
  }

  if (file.type && !file.type.startsWith("image/")) {
    photoStatus.textContent = "Оберіть файл із зображенням.";
    return;
  }

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);

  preview.onload = () => {
    photoStatus.textContent =
      "Фото додано. Оберіть матеріал паковання.";
  };

  preview.onerror = () => {
    preview.hidden = true;
    photoStatus.textContent =
      "Не вдалося відкрити фото. Спробуйте зображення JPG або PNG.";
  };

  preview.src = previewUrl;
  preview.hidden = false;
  photoStatus.textContent = "Відкриваємо фото…";

  // Для нового предмета користувач обирає матеріал заново.
  materialSelect.value = "";
  materialSelect.dispatchEvent(new Event("change"));
}

photoInput.addEventListener("change", () => {
  showPhoto(photoInput.files[0]);
  photoInput.value = "";
});

cameraInput.addEventListener("change", () => {
  showPhoto(cameraInput.files[0]);
  cameraInput.value = "";
});

const saveButton = document.querySelector("#save-sorting");
const saveStatus = document.querySelector("#save-status");
const historyList = document.querySelector("#sorting-history");
const emptyHistory = document.querySelector("#empty-history");

const HISTORY_KEY = "ecoloop-sorting-history-v1";

const materialNames = {
  pet: "PET",
  hdpe: "HDPE",
  aluminum: "Алюміній",
  cardboard: "Картон"
};

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

function readHistory() {
  const storedValue = localStorage.getItem(HISTORY_KEY);

  if (!storedValue) {
    return [];
  }

  const records = JSON.parse(storedValue);

  if (!Array.isArray(records)) {
    throw new Error("Некоректний формат історії");
  }

  return records.filter((record) => {
    return record &&
      Object.hasOwn(materialNames, record.material) &&
      typeof record.createdAt === "string" &&
      Number.isFinite(Date.parse(record.createdAt));
  });
}

function renderHistory(records) {
  historyList.replaceChildren();
  emptyHistory.hidden = records.length > 0;

  for (const record of records) {
    const item = document.createElement("li");
    item.className = "history-item";

    const name = document.createElement("strong");
    name.textContent = materialNames[record.material];

    const date = document.createElement("time");
    date.dateTime = record.createdAt;
    date.textContent = dateFormatter.format(
      new Date(record.createdAt)
    );

    item.append(name, date);
    historyList.append(item);
  }
}

function updateSaveButton() {
  saveButton.disabled = !Object.hasOwn(
    materialNames,
    materialSelect.value
  );
}

materialSelect.addEventListener("change", () => {
  updateSaveButton();
  saveStatus.textContent = "";
});

saveButton.addEventListener("click", () => {
  const material = materialSelect.value;

  if (!Object.hasOwn(materialNames, material)) {
    return;
  }

  let records;

  // Спочатку перевіряємо саме збереження.
  try {
    records = readHistory();

    records.unshift({
      material,
      createdAt: new Date().toISOString()
    });

    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch (error) {
    saveStatus.textContent =
      "Не вдалося зберегти запис у браузері.";
    console.error("Помилка збереження:", error);
    return;
  }

  // Запис уже збережено. Готуємо форму до наступної дії.
  materialSelect.value = "";
  updateSaveButton();
  saveStatus.textContent = "Сортування збережено.";

  // Окремо оновлюємо відображення історії.
  try {
    instructions.hidden = true;
    instructionText.textContent = "";

    const missingElements = [
      "#sorting-history",
      "#empty-history"
    ].filter((selector) => !document.querySelector(selector));

    if (missingElements.length > 0) {
      throw new Error(
        `У HTML відсутні елементи: ${missingElements.join(", ")}`
      );
    }

    renderHistory(records);
  } catch (error) {
    saveStatus.textContent =
      `Запис збережено, але історію не вдалося показати. ${error.message}`;
    console.error("Помилка відображення історії:", error);
  }
});

try {
  renderHistory(readHistory());
} catch (error) {
  saveStatus.textContent =
    "Не вдалося прочитати історію на цьому пристрої.";
  console.error("Помилка читання історії:", error);
}

updateSaveButton();

const exportButton = document.querySelector("#export-history");
const exportStatus = document.querySelector("#export-status");

exportButton.addEventListener("click", () => {
  try {
    const records = readHistory();

    if (records.length === 0) {
      exportStatus.textContent =
        "Спочатку збережіть хоча б одне сортування.";
      return;
    }

    const rows = [
      ["Матеріал", "Дата і час (UTC)"]
    ];

    for (const record of records) {
      rows.push([
        materialNames[record.material],
        new Date(record.createdAt).toISOString()
      ]);
    }

    const csv = rows
      .map((row) => row.join(";"))
      .join("\r\n");

    // BOM допомагає Excel правильно відобразити українські літери.
    const file = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8"
    });

    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");

    const today = new Date();
    const dateLabel = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");

    link.href = downloadUrl;
    link.download = `ecoloop-history-${dateLabel}.csv`;

    document.body.append(link);
    link.click();
    link.remove();

    // Даємо браузеру час розпочати завантаження.
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
    }, 10000);

    exportStatus.textContent =
      "Файл підготовлено. Перевірте завантаження браузера.";
  } catch (error) {
    exportStatus.textContent =
      "Не вдалося підготувати файл з історією.";
    console.error("Помилка експорту історії:", error);
  }
});