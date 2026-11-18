(function () {
  "use strict";

  const content = document.querySelector("#donation-content");
  if (!content) return;

  function createCopyAction(panel) {
    const status = panel.querySelector(".copy-status");
    const manual = panel.querySelector(".copy-manual");
    const copyText = manual.querySelector("textarea");
    let latestCopy = 0;

    return async (value, description) => {
      const request = ++latestCopy;
      status.textContent = "";
      manual.hidden = true;
      copyText.value = "";
      try {
        await navigator.clipboard.writeText(value);
        if (request !== latestCopy) return;
        status.textContent = description + " скопировано.";
      } catch {
        if (request !== latestCopy) return;
        copyText.value = value;
        manual.hidden = false;
        status.textContent = "Автоматическое копирование недоступно.";
        copyText.focus();
        copyText.select();
      }
    };
  }

  const bank = content.querySelector("#bank-details");
  const copyBank = createCopyAction(bank);
  const entries = Array.from(bank.querySelectorAll(".bank-details > div"));
  const copyAll = bank.querySelector("#copy-bank-details");

  entries.forEach((entry) => {
    const label = entry.querySelector("dt").textContent;
    const value = entry.querySelector("[data-bank-value]").textContent;
    const button = entry.querySelector("button");
    button.addEventListener("click", () => copyBank(value, "Поле «" + label + "»"));
    button.hidden = false;
  });

  copyAll.addEventListener("click", () => {
    const values = entries.map((entry) =>
      entry.querySelector("dt").textContent + ": " + entry.querySelector("[data-bank-value]").textContent
    );
    copyBank(values.join("\n"), "Содержимое списка");
  });
  copyAll.hidden = false;

  const purpose = content.querySelector("#payment-purpose-value").textContent;
  const copyPurpose = createCopyAction(content.querySelector("#payment-purpose-copy"));
  const purposeButton = content.querySelector("#copy-payment-purpose");
  purposeButton.addEventListener("click", () => copyPurpose(purpose, "Назначение платежа"));
  purposeButton.hidden = false;
}());
