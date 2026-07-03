// ==UserScript==
// @name         Google Emoji Kitchen Same Randomizer
// @namespace    https://github.com/rohanod/useful-userscripts
// @version      1.0.0
// @description  Add a button to Google Emoji Kitchen that randomizes the first emoji, then selects the same emoji in the second slot.
// @match        https://www.google.com/search*
// @match        https://www.google.ch/search*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const query = new URLSearchParams(location.search).get("q") || "";

  if (!/\b(?:google\s+)?emoji\s+kitchen\b/i.test(query)) {
    return;
  }

  const LOG = "[Emoji Kitchen Same Randomizer]";
  const SCRIPT_ID = "gek-same-randomizer";

  console.log(LOG, "loaded", { query });

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findFirstRandomButton() {
    const button = document.querySelector('[data-slot="first"][jsaction="q2lsFf"]')
      || document.querySelector('[data-slot="first"][aria-label*="Random"]')
      || document.querySelector('[data-slot="first"][aria-label*="zufällig"]');
    console.log(LOG, "first random button", button);
    return button;
  }

  function findMainRandomButton() {
    const button = document.querySelector('[jsname="MqE0J"][role="button"]')
      || document.querySelector('[aria-label="Randomise"][role="button"]')
      || document.querySelector('[aria-label="Randomize"][role="button"]');
    console.log(LOG, "main randomise button", button);
    return button;
  }

  function findFirstSlot() {
    const slot = document.querySelector('[data-slot="first"][data-emoji][jsaction="sX2RNd"]')
      || document.querySelector('[data-slot="first"][data-emoji]:not([jsaction="q2lsFf"])');
    console.log(LOG, "first slot", slot, slot?.dataset?.emoji);
    return slot;
  }

  function findSecondSlotButton() {
    const slot = document.querySelector('[data-slot="second"][data-emoji][jsaction="sX2RNd"]')
      || document.querySelector('[data-slot="second"][data-emoji]:not([jsaction="q2lsFf"])');
    console.log(LOG, "second slot", slot, slot?.dataset?.emoji);
    return slot;
  }

  function getFirstEmoji() {
    return findFirstSlot()?.dataset?.emoji || null;
  }

  function findEmojiGridButton(emoji) {
    if (!emoji) return null;

    const button = Array.from(document.querySelectorAll('[data-emoji][jsaction="mCQBZc"], [data-emoji]:not([data-slot])'))
      .find((candidate) => candidate.dataset.emoji === emoji && !candidate.dataset.slot);
    console.log(LOG, "emoji grid button", { emoji, button });
    return button;
  }

  async function waitFor(getValue, timeoutMs = 2500) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const value = getValue();
      if (value) return value;
      await sleep(75);
    }

    return null;
  }

  async function waitForRandomizedFirstEmoji(previousEmoji) {
    const changedEmoji = await waitFor(() => {
      const emoji = getFirstEmoji();
      return emoji && emoji !== previousEmoji ? emoji : null;
    }, 1200);

    return changedEmoji || getFirstEmoji();
  }

  function setStatus(button, text, isError = false) {
    const label = button.querySelector(".t6NJlf");
    if (label) label.textContent = "Mirror first";
    button.style.color = isError ? "#b3261e" : "";
    console.log(LOG, "status", { text, isError });
  }

  async function makeSameRandom(button) {
    const firstRandom = findFirstRandomButton();

    if (!firstRandom) {
      console.log(LOG, "cannot run: first random button missing");
      setStatus(button, "No random button", true);
      return;
    }

    const previousEmoji = getFirstEmoji();
    console.log(LOG, "clicking first random", { previousEmoji });

    setStatus(button, "Randomizing...");
    firstRandom.click();

    const emoji = await waitForRandomizedFirstEmoji(previousEmoji);
    console.log(LOG, "randomized first emoji", { emoji });

    if (!emoji) {
      setStatus(button, "No emoji found", true);
      return;
    }

    const secondSlot = findSecondSlotButton();
    if (!secondSlot) {
      console.log(LOG, "cannot run: second slot missing");
      setStatus(button, "No second slot", true);
      return;
    }

    console.log(LOG, "clicking second slot", secondSlot);
    secondSlot.click();
    await sleep(100);

    const emojiButton = await waitFor(() => findEmojiGridButton(emoji));
    if (!emojiButton) {
      console.log(LOG, "cannot run: emoji grid button missing", { emoji });
      setStatus(button, `Can't find ${emoji}`, true);
      return;
    }

    console.log(LOG, "clicking same emoji", { emoji, emojiButton });
    emojiButton.click();
    setStatus(button, "done");
  }

  function createActionButton() {
    const source = findMainRandomButton();
    const button = source ? source.cloneNode(true) : document.createElement("div");
    button.id = SCRIPT_ID;
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("aria-label", "Mirror first");
    button.removeAttribute("jsaction");
    button.removeAttribute("data-ved");
    button.removeAttribute("jsname");
    button.title = "Randomize the first emoji, then use the same emoji in the second slot.";

    button.querySelectorAll("[jsaction], [jsname], [jscontroller], [data-ved]").forEach((element) => {
      element.removeAttribute("jsaction");
      element.removeAttribute("jsname");
      element.removeAttribute("jscontroller");
      element.removeAttribute("data-ved");
    });

    if (!source) {
      button.className = "imjQdf";
      button.style.cssText = "-webkit-tap-highlight-color:transparent;user-select:none;";
      button.innerHTML = '<div class="kKOyDb"></div><span class="t6NJlf">Mirror first</span>';
    }

    setStatus(button, "Mirror first");

    const run = () => {
      makeSameRandom(button).catch((error) => {
        console.error("[Google Emoji Kitchen Same Randomizer]", error);
        setStatus(button, "Error", true);
      });
    };

    button.addEventListener("click", run);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        run();
      }
    });

    return button;
  }

  function ensureActionButton() {
    const mainRandom = findMainRandomButton();
    const existing = document.getElementById(SCRIPT_ID);

    if (!mainRandom) {
      existing?.remove();
      return false;
    }

    if (!existing) {
      console.log(LOG, "adding Same random button");
      mainRandom.after(createActionButton());
    }

    return true;
  }

  const interval = setInterval(() => {
    if (ensureActionButton()) {
      clearInterval(interval);
    }
  }, 250);

  const observer = new MutationObserver(() => {
    ensureActionButton();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
