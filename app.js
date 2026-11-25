const photoInput = document.querySelector("#photo");
const preview = document.querySelector("#preview");
const materialSelect = document.querySelector("#material");
const instructions = document.querySelector("#instructions");
const instructionText = document.querySelector("#instruction-text");

const tips = {
  pet: "Знайдіть маркування 1 PET. Спорожніть паковання та перевірте правила обраного пункту приймання.",
  hdpe: "Знайдіть маркування 2 HDPE. Перевірте, чи приймає пункт саме цей вид паковання.",
  aluminum: "Спорожніть паковання та перевірте умови приймання алюмінію.",
  cardboard: "Перевірте вимоги пункту до чистоти й стану картону.",
  unknown: "Знайдіть маркування на дні, етикетці або біля шва паковання."
};

let previewUrl;

photoInput.addEventListener("change", () => {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = undefined;
  }

  const file = photoInput.files[0];

  if (!file) {
    preview.removeAttribute("src");
    preview.hidden = true;
    return;
  }

  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
});

materialSelect.addEventListener("change", () => {
  const text = tips[materialSelect.value];

  instructionText.textContent = text || "";
  instructions.hidden = !text;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.error("Помилка реєстрації service worker:", error);
  });
}

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

  try {
    // Читаємо актуальні записи перед кожним збереженням.
    const records = readHistory();

    records.unshift({
      material,
      createdAt: new Date().toISOString()
    });

    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
    renderHistory(records);

    // Наступний запис починається з нового вибору матеріалу.
    materialSelect.value = "";
    materialSelect.dispatchEvent(new Event("change"));

    saveStatus.textContent = "Сортування збережено.";
  } catch (error) {
    saveStatus.textContent =
      "Не вдалося зберегти запис. Перевірте доступ браузера до сховища.";
    console.error("Помилка збереження історії:", error);
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