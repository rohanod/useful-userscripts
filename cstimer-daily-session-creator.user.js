// ==UserScript==
// @name         csTimer Auto Session Creator
// @match        https://cstimer.net/*
// @match        https://www.cstimer.net/*
// @grant        none
// @version      1.0
// @description  Ctrl+Shift+N to create a new session and rename it to dd.mm.yyyy {cubetype}
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Helper function to format today's date as dd.mm.yyyy
     * @returns {string} Formatted date string
     */
    function formatDate() {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        return `${day}.${month}.${year}`;
    }

    /**
     * Creates a new session by selecting "New.." from the dropdown
     */
    function createNewSession() {
        const sel = document.querySelector("#stats > div:nth-child(1) > select");
        if (!sel) throw new Error("Select not found");

        const opt = [...sel.options].find(o => o.text.trim() === "New..");
        if (!opt) throw new Error('Option "New.." not found');

        sel.value = opt.value;
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Opens the session manager by clicking the session button
     */
    function openSessionManager() {
        const btn = document.querySelector("#stats > div:nth-child(1) > span");
        if (!btn) throw new Error("Session button not found");
        btn.click();
    }

    /**
     * Normalizes session name by removing trailing asterisk and trimming
     */
    function normalizeSessionName(s) {
        return s.replace(/\*$/, "").trim();
    }

    /**
     * Finds the newest session by looking at session IDs
     * @returns {string|null} The normalized session name or null if not found
     */
    function findNewestSession() {
        const selectEl = document.querySelector("#stats > div:nth-child(1) > select");
        if (!selectEl) return null;

        const ignore = /^(new|del|delete)\.?$/i;

        // Find the highest numeric session ID
        const bestId = [...selectEl.options]
            .filter(o => !ignore.test(o.value.trim()))
            .map(o => parseInt(o.value, 10))
            .filter(Number.isFinite)
            .reduce((a, b) => (a == null || b > a ? b : a), null);

        if (bestId == null) return null;

        // Find the corresponding row in the session table
        const row = [...document.querySelectorAll("tr.mhide")]
            .find(tr => {
                const td = tr.querySelector('td[data="s"]');
                if (!td) return false;
                return normalizeSessionName(td.textContent).startsWith(bestId + "-");
            });

        if (!row) return null;

        const td = row.querySelector('td[data="s"]');
        return normalizeSessionName(td.textContent);
    }

    /**
     * Triggers the rename dialog for a specific session
     */
    function triggerRename(sessionName) {
        if (!sessionName) throw new Error("sessionName is not provided");

        const nameCell = [...document.querySelectorAll('tr.mhide td[data="s"]')]
            .find(td => normalizeSessionName(td.textContent) === sessionName);

        if (!nameCell) throw new Error(`Session "${sessionName}" not found`);

        const row = nameCell.parentElement;
        const sel = row.querySelector("select");

        if (!sel) throw new Error("Row select dropdown not found");

        const opt = [...sel.options].find(o => o.text.trim() === "Rename");
        if (!opt) throw new Error('Option "Rename" not found');

        sel.value = opt.value;
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * Clicks the OK button in the rename dialog
     */
    function clickRenameOkButton() {
        const okButton = document.querySelector('body > div.dialog.dialogssmgr > table > tbody > tr:nth-child(3) > td > div > input.buttonOK');
        if (okButton) {
            okButton.click();
            return true;
        }
        return false;
    }

    /**
     * Main function to orchestrate the session creation and renaming workflow
     * @param {string} cubeType - The cube type for the session name (e.g., "333", "222")
     */
    async function createAndRenameSession(cubeType) {
        const dateStr = formatDate();
        const newName = `${dateStr} ${cubeType}`;

        console.log(`[csTimer Hotkey] Creating session with name: ${newName}`);

        // Temporarily override window.prompt to inject our desired name
        const originalPrompt = window.prompt;
        let promptCallCount = 0;
        window.prompt = function(message, defaultValue) {
            promptCallCount++;
            window.prompt = originalPrompt; // Restore immediately after first call
            return newName;
        };

        try {
            // Step 1: Create new session
            createNewSession();

            // Wait for the session to be created
            await new Promise(r => setTimeout(r, 200));

            // Step 2: Open session manager
            openSessionManager();

            // Wait for the dialog to open
            await new Promise(r => setTimeout(r, 300));

            // Step 3: Find the newest session
            const newestSession = findNewestSession();
            if (!newestSession) {
                throw new Error("Could not find the newly created session");
            }

            console.log(`[csTimer Hotkey] Found newest session: ${newestSession}`);

            // Step 4: Trigger rename (this will call prompt() which we've overridden)
            triggerRename(newestSession);

            // Wait for the rename dialog to appear
            await new Promise(r => setTimeout(r, 100));

            // Step 5: Click the OK button to confirm the rename
            if (clickRenameOkButton()) {
                console.log("[csTimer Hotkey] OK button clicked");
            } else {
                console.log("[csTimer Hotkey] OK button not found, prompt() override may have handled it");
            }

            // Wait for the rename to complete
            await new Promise(r => setTimeout(r, 200));

            console.log("[csTimer Hotkey] Session renamed successfully");
        } catch (err) {
            console.error("[csTimer Hotkey] Error:", err);
            // Restore original prompt in case of error
            window.prompt = originalPrompt;
            throw err;
        }

        // Restore original prompt just in case
        window.prompt = originalPrompt;
    }

    // Keyboard event listener for Ctrl+Shift+N
    document.addEventListener('keydown', function(event) {
        const isCtrl = event.ctrlKey;
        const isShift = event.shiftKey;
        const isN = event.key === 'n' || event.key === 'N';

        if (isCtrl && isShift && isN) {
            event.preventDefault();
            event.stopPropagation();

            // Prompt user for cube type
            const cubeType = prompt("Enter cube type (e.g., 333, 222, 444, 555, 666, 777, minx, pyram, sq1, clock, skewb):", "333");

            if (!cubeType || cubeType.trim() === '') {
                console.log("[csTimer Hotkey] User cancelled or entered empty cube type");
                return;
            }

            // Execute the workflow
            createAndRenameSession(cubeType.trim())
                .then(() => {
                    console.log("[csTimer Hotkey] Session created and renamed successfully");
                })
                .catch(err => {
                    console.error("[csTimer Hotkey] Error:", err);
                    alert(`Error: ${err.message}`);
                });
        }
    }, true);

    console.log("[csTimer Hotkey] Loaded - Press Ctrl+Shift+N to create a new session");
})();
