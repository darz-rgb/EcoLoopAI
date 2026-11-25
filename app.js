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