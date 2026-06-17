# Useful Userscripts

A small collection of Tampermonkey userscripts for sites I use often.

## Scripts

| Script | Install | Site | What it does |
| --- | --- | --- | --- |
| [csTimer Auto Session Creator](cstimer-daily-session-creator.user.js) | [Install](https://raw.githubusercontent.com/rohanod/useful-userscripts/main/cstimer-daily-session-creator.user.js) | `cstimer.net` | Adds `Ctrl+Shift+N` to create a new csTimer session named `dd.mm.yyyy {cube type}`. |
| [Monkeytype Speed Range Indicator](monkeytype-speed-range-indicator.user.js) | [Install](https://raw.githubusercontent.com/rohanod/useful-userscripts/main/monkeytype-speed-range-indicator.user.js) | `monkeytype.com` | Adds a finished-test stat showing the lowest and highest recorded speed from the test history. |
| [Hooktheory TheoryTab MIDI Extractor](hooktheory-theorytab-midi-extractor.user.js) | [Install](https://raw.githubusercontent.com/rohanod/useful-userscripts/main/hooktheory-theorytab-midi-extractor.user.js) | `hooktheory.com/theorytab` | Adds an Export MIDI button that downloads the current public TheoryTab song as a multi-track `.mid` file. |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Open the raw `.user.js` file you want to install from this repository.
3. Confirm the install in Tampermonkey.

Tampermonkey can check these scripts for updates when they are installed from GitHub raw URLs.

## Notes

- `csTimer Auto Session Creator` prompts for the puzzle type before creating the session.
- `Monkeytype Speed Range Indicator` reads Monkeytype's in-page `stats()` data after a test completes.
- `Hooktheory TheoryTab MIDI Extractor` uses Hooktheory's public song payload and requires Tampermonkey network access to `api.hooktheory.com`.
