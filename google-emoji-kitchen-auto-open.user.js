// ==UserScript==
// @name         Auto-open Google Emoji Kitchen
// @namespace    https://github.com/rohanod/useful-userscripts
// @version      1.0.0
// @description  Auto-open the Google Emoji Kitchen popup from matching Google searches.
// @match        https://www.google.com/search*
// @match        https://www.google.ch/search*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const LOG = "[Emoji Kitchen Auto-open]";
  const query = new URLSearchParams(location.search).get("q") || "";

  console.log(LOG, "loaded", { query });

  if (!/\b(?:google\s+)?emoji\s+kitchen\b/i.test(query)) {
    console.log(LOG, "skipping non Emoji Kitchen query");
    return;
  }

  const clicked = new WeakSet();

  function getClickableElement(element) {
    return element.closest("button, a, div[role='button']") || element;
  }

  function findGetCookingButton() {
    const elements = Array.from(document.querySelectorAll("button, a, div[role='button'], span"));

    for (const element of elements) {
      const text = (element.innerText || element.textContent || "").trim().toLowerCase();

      if (text === "get cooking" || text === "cooking" || text === "cook" || text === "kochen") {
        console.log(LOG, "found open button", { text });
        return getClickableElement(element);
      }
    }

    return null;
  }

  function tryOpenEmojiKitchen() {
    const button = findGetCookingButton();

    if (!button) {
      return false;
    }

    if (clicked.has(button)) {
      console.log(LOG, "open button already clicked");
      return false;
    }

    clicked.add(button);
    console.log(LOG, "clicking open button", button);
    button.click();
    return true;
  }

  let attempts = 0;

  const interval = setInterval(() => {
    attempts += 1;

    if (tryOpenEmojiKitchen() || attempts >= 60) {
      console.log(LOG, "stopping interval", { attempts });
      clearInterval(interval);
    }
  }, 250);

  const observer = new MutationObserver(() => {
    if (tryOpenEmojiKitchen()) {
      console.log(LOG, "opened from mutation observer");
      clearInterval(interval);
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
