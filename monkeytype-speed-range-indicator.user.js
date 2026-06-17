// ==UserScript==
// @name         Monkeytype Speed Range Indicator
// @namespace    https://monkeytype.com/
// @version      1.1.0
// @description  Add lowest/highest speed to Monkeytype's finished test page.
// @match        https://monkeytype.com/*
// @match        https://www.monkeytype.com/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const MonkeytypeLowestSpeedIndicator = (() => {
    const GROUP_ID = "mt-speed-range-indicator";
    const LEGACY_GROUP_ID = "mt-lowest-speed-indicator";
    const pageWindow = typeof unsafeWindow === "undefined" ? window : unsafeWindow;

    function numericValue(point) {
      if (typeof point === "number") return point;
      if (point && typeof point === "object") {
        if (typeof point.y === "number") return point.y;
        if (typeof point.value === "number") return point.value;
      }
      return Number.NaN;
    }

    function getSpeeds(points) {
      return (points || [])
        .map(numericValue)
        .filter((value) => Number.isFinite(value) && value > 0);
    }

    function getLowestSpeed(points) {
      const speeds = getSpeeds(points);
      return speeds.length ? Math.min(...speeds) : null;
    }

    function getSpeedRange(points) {
      const speeds = getSpeeds(points);
      if (!speeds.length) return null;
      return {
        lowest: Math.min(...speeds),
        highest: Math.max(...speeds),
      };
    }

    function formatSpeed(value) {
      return `${Math.floor(value)}`;
    }

    function formatSpeedRange(range) {
      return `${formatSpeed(range.lowest)}/${formatSpeed(range.highest)}`;
    }

    function formatSpeedRangeLabel(range, unit) {
      return `lowest ${range.lowest.toFixed(2)} ${unit}\nhighest ${range.highest.toFixed(2)} ${unit}`;
    }

    function getSpeedUnit() {
      const wpmBottom = document.querySelector("#result .group.wpm .bottom");
      const label = wpmBottom?.getAttribute("aria-label") || "";
      const match = label.match(/\b([a-z]+pm)\b/i);
      return match ? match[1].toLowerCase() : "wpm";
    }

    function getStatsData() {
      try {
        const stats = pageWindow.stats;
        if (typeof stats !== "function") return [];
        const data = stats();
        return Array.isArray(data?.wpmHistory) ? data.wpmHistory : [];
      } catch (_) {
        return [];
      }
    }

    function createGroup() {
      const group = document.createElement("div");
      group.id = GROUP_ID;
      group.className = "group speedRange";
      group.innerHTML = '<div class="top">speed range</div><div class="bottom" data-balloon-pos="up" data-balloon-break="">-</div>';
      return group;
    }

    function getOrCreateGroup(stats) {
      const existing = document.getElementById(GROUP_ID);
      if (existing) return existing;

      document.getElementById(LEGACY_GROUP_ID)?.remove();
      const group = createGroup();
      const raw = stats.querySelector(".group.raw");
      if (raw?.nextSibling) stats.insertBefore(group, raw.nextSibling);
      else stats.appendChild(group);
      return group;
    }

    function renderSpeedRange() {
      const result = document.querySelector("#result");
      const stats = result?.querySelector(".stats.morestats");
      if (!stats || result.classList.contains("hidden")) return false;

      const range = getSpeedRange(getStatsData());
      if (range === null) return false;

      const unit = getSpeedUnit();
      const group = getOrCreateGroup(stats);
      const bottom = group.querySelector(".bottom");
      const text = formatSpeedRange(range);
      const label = formatSpeedRangeLabel(range, unit);

      if (bottom.textContent !== text) bottom.textContent = text;
      if (bottom.getAttribute("aria-label") !== label) bottom.setAttribute("aria-label", label);
      return true;
    }

    function start() {
      const observer = new MutationObserver(() => {
        window.requestAnimationFrame(renderSpeedRange);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const interval = window.setInterval(() => {
        if (renderSpeedRange()) window.clearInterval(interval);
      }, 250);
      renderSpeedRange();
    }

    return {
      formatSpeed,
      formatSpeedRange,
      getLowestSpeed,
      getSpeedRange,
      renderSpeedRange,
      start,
    };
  })();

  window.MonkeytypeLowestSpeedIndicator = MonkeytypeLowestSpeedIndicator;

  function main() {
    if (document.body) {
      MonkeytypeLowestSpeedIndicator.start();
    } else {
      window.addEventListener("DOMContentLoaded", MonkeytypeLowestSpeedIndicator.start, { once: true });
    }
  }

  main();
})();
