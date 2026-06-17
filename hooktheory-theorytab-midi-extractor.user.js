// ==UserScript==
// @name         Hooktheory TheoryTab MIDI Extractor
// @namespace    https://www.hooktheory.com/
// @version      1.2.1
// @description  Export the current Hooktheory TheoryTab public song payload as a multi-track MIDI file.
// @match        https://www.hooktheory.com/theorytab/view/*
// @grant        GM_xmlhttpRequest
// @connect      api.hooktheory.com
// @connect      www.hooktheory.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const API_ORIGIN = "https://api.hooktheory.com";
  const TPQ = 480;
  const DEFAULT_BPM = 120;
  const PLAYER_ASSET_BASE = "https://www.hooktheory.com/theorytab-player/3.0.17/";
  const CHANNELS = {
    lead1: 0,
    harmony: 1,
    bass: 2,
    drums: 9,
  };
  const PROGRAMS = {
    acousticGrandPiano: 0,
    acousticBass: 32,
  };

  const TONIC_TO_PC = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
    "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
  };
  const SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };

  function main() {
    const songContext = findSongContext();
    if (!songContext.sections.length) return;
    addButton(songContext);
  }

  function findSongContext() {
    const sections = findPageSections();
    if (sections.length > 1) return { sections };

    const fallbackId = findSongId();
    return fallbackId ? { sections: [{ id: fallbackId, name: "Full Song" }] } : { sections: [] };
  }

  function findPageSections() {
    const tabs = Array.from(document.querySelectorAll(".tb-section-tab[href^='#']"))
      .filter((a) => {
        const hash = a.getAttribute("href");
        return hash && hash !== "#";
      })
      .map((a) => (a.textContent || "").trim())
      .filter(Boolean);

    const ids = Array.from(document.querySelectorAll(".tb-section-block [id^='tab-']"))
      .map((el) => (el.id || "").replace(/^tab-/, ""))
      .filter(Boolean);

    if (ids.length < 2 || tabs.length !== ids.length) return [];
    return ids.map((id, index) => ({ id, name: tabs[index] || `Section ${index + 1}` }));
  }

  function findSongId() {
    const hookpad = Array.from(document.querySelectorAll("a[href*='hookpad.hooktheory.com']"))
      .map((a) => {
        try { return new URL(a.href).searchParams.get("idOfSong"); }
        catch (_) { return null; }
      })
      .find(Boolean);
    if (hookpad) return hookpad;

    const html = document.documentElement.innerHTML;
    const match = html.match(/pushToPendingTheoryTabs\("tab-([^"]+)"/g);
    if (!match) return null;
    const ids = match.map((s) => s.match(/tab-([^"]+)/)[1]).filter((x) => !x.startsWith("_"));
    return ids[0] || null;
  }

  function addButton(songContext) {
    const existing = document.getElementById("ht-midi-export-button");
    if (existing) return;

    const button = document.createElement("button");
    button.id = "ht-midi-export-button";
    button.type = "button";
    button.textContent = "Export MIDI";
    button.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483647",
      "border:0",
      "border-radius:8px",
      "padding:10px 14px",
      "background:#18a058",
      "color:#fff",
      "font:600 14px/1 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.28)",
      "cursor:pointer",
    ].join(";");

    button.addEventListener("click", async () => {
      const oldText = button.textContent;
      button.disabled = true;
      button.textContent = "Exporting...";
      try {
        const sectionPayloads = await getSectionPayloads(songContext.sections);
        const title = sectionPayloads[0]?.payload?.song || document.title || "hooktheory-theorytab";
        const data = stitchSections(sectionPayloads);
        const midiBytes = await buildMidi(data, title);
        downloadBytes(midiBytes, `${sanitizeFileName(title)}.mid`, "audio/midi");
        button.textContent = "Exported";
        setTimeout(() => { button.textContent = oldText; button.disabled = false; }, 1200);
      } catch (error) {
        console.error("[Hooktheory MIDI Exporter]", error);
        alert(`Could not export MIDI: ${error && error.message ? error.message : error}`);
        button.textContent = oldText;
        button.disabled = false;
      }
    });

    document.body.appendChild(button);
  }

  async function getSectionPayloads(sections) {
    const results = [];
    for (const section of sections) {
      const payload = await getSongPayload(section.id);
      results.push({ ...section, payload, data: parsePayload(payload) });
    }
    return results;
  }

  function getSongPayload(songId) {
    const url = `${API_ORIGIN}/v1/songs/public/${encodeURIComponent(songId)}?fields=ID,xmlData,song,jsonData,bpm`;
    return new Promise((resolve, reject) => {
      const handle = (status, text) => {
        if (status < 200 || status >= 300) {
          reject(new Error(`API returned HTTP ${status}`));
          return;
        }
        try { resolve(JSON.parse(text)); }
        catch (error) { reject(error); }
      };

      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { Accept: "application/json" },
          onload: (res) => handle(res.status, res.responseText),
          onerror: () => reject(new Error("Tampermonkey request failed")),
        });
      } else {
        fetch(url, { credentials: "omit" })
          .then((res) => res.text().then((text) => handle(res.status, text)))
          .catch(reject);
      }
    });
  }

  function parsePayload(payload) {
    if (payload.jsonData) return JSON.parse(payload.jsonData);
    if (payload.xmlData) throw new Error("This script currently exports Hookpad JSON payloads, not legacy XML payloads.");
    throw new Error("No jsonData found in Hooktheory payload.");
  }

  function stitchSections(sectionPayloads) {
    if (sectionPayloads.length === 1) {
      const data = sectionPayloads[0].data;
      data.exportSections = [{ name: sectionPayloads[0].name, beat: 1, id: sectionPayloads[0].id }];
      return data;
    }

    const merged = {
      ...sectionPayloads[0].data,
      chords: [],
      notes: [],
      inactiveNotes: [[], [], [], []],
      keys: [],
      tempos: [],
      meters: [],
      breaks: [],
      bands: [],
      keyFrames: [],
      sections: [],
      exportSections: [],
    };

    let beatOffset = 0;
    for (const section of sectionPayloads) {
      const data = section.data;
      const sectionStartBeat = beatOffset + 1;
      merged.exportSections.push({ name: section.name, beat: sectionStartBeat, id: section.id });
      appendShifted(merged.chords, data.chords || [], beatOffset);
      appendShifted(merged.notes, data.notes || [], beatOffset);
      appendShifted(merged.breaks, data.breaks || [], beatOffset);
      appendShifted(merged.keys, data.keys || [], beatOffset);
      appendShifted(merged.tempos, data.tempos || [], beatOffset);
      appendShifted(merged.meters, data.meters || [], beatOffset);
      appendShifted(merged.bands, data.bands || [], beatOffset);
      appendShifted(merged.keyFrames, data.keyFrames || [], beatOffset);
      for (let i = 0; i < Math.min(4, (data.inactiveNotes || []).length); i++) {
        appendShifted(merged.inactiveNotes[i], data.inactiveNotes[i] || [], beatOffset);
      }
      beatOffset += Math.max(0, inferEndBeat(data) - 1);
    }

    merged.endBeat = beatOffset + 1;
    merged.cursor = { ...(merged.cursor || {}), beat: merged.endBeat };
    dedupeBeatEvents(merged.keys);
    dedupeBeatEvents(merged.tempos);
    dedupeBeatEvents(merged.meters);
    dedupeBeatEvents(merged.bands);
    return merged;
  }

  function appendShifted(target, items, beatOffset) {
    for (const item of items) target.push(shiftBeatFields(item, beatOffset));
  }

  function shiftBeatFields(value, beatOffset) {
    if (!value || typeof value !== "object") return value;
    const copy = Array.isArray(value) ? [] : {};
    for (const [key, child] of Object.entries(value)) {
      if ((key === "beat" || key === "recordingEndBeat") && typeof child === "number") copy[key] = child + beatOffset;
      else copy[key] = shiftBeatFields(child, beatOffset);
    }
    return copy;
  }

  function dedupeBeatEvents(events) {
    const seen = new Set();
    for (let i = events.length - 1; i >= 0; i--) {
      const key = JSON.stringify([events[i].beat || 1, ...Object.keys(events[i]).filter((k) => k !== "beat").sort().map((k) => events[i][k])]);
      if (seen.has(key)) events.splice(i, 1);
      else seen.add(key);
    }
    events.sort((a, b) => Number(a.beat || 1) - Number(b.beat || 1));
  }

  async function buildMidi(data, title) {
    const bpm = Math.round((data.tempos && data.tempos[0] && data.tempos[0].bpm) || DEFAULT_BPM);
    const context = makeTimingContext(data);
    const tempoTrack = makeTempoTrack(bpm, title, data, context);
    const leadTrack = makeLeadTrack(data.notes || [], data, context, "lead1");
    const harmonyTrack = makeHarmonyTrack(data.chords || [], data, context);
    const bassTrack = makeBassTrack(data.chords || [], data, context);
    const drumPattern = await getDrumPattern(data);
    const drumsTrack = makeDrumsTrack(data, context, drumPattern);
    const tracks = [tempoTrack, leadTrack, harmonyTrack, bassTrack, drumsTrack];

    const bytes = [
      ...ascii("MThd"),
      ...u32(6),
      ...u16(1),
      ...u16(tracks.length),
      ...u16(TPQ),
      ...tracks.flat(),
    ];
    return new Uint8Array(bytes);
  }

  function makeTempoTrack(bpm, title, data, context) {
    const events = [];
    pushEvent(events, 0, [0xff, 0x03, ...varLen(title.length), ...ascii(title)]);
    for (const tempo of data.tempos && data.tempos.length ? data.tempos : [{ beat: 1, bpm }]) {
      const usPerQuarter = Math.round(60000000 / Math.round(tempo.bpm || bpm || DEFAULT_BPM));
      pushEvent(events, absoluteBeatToTick(tempo.beat || 1), [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255]);
    }
    for (const meter of data.meters && data.meters.length ? data.meters : [{ beat: 1, numBeats: 4, beatUnit: 1 }]) {
      const denominatorPower = Math.max(0, Math.round(Math.log2(4 / Number(meter.beatUnit || 1))));
      pushEvent(events, absoluteBeatToTick(meter.beat || 1), [0xff, 0x58, 0x04, Number(meter.numBeats || 4) & 255, denominatorPower & 255, 0x18, 0x08]);
    }
    for (const section of data.exportSections || []) {
      pushMarker(events, context.beatToTick(section.beat || 1), section.name || "Section");
    }
    const lastTick = events.reduce((max, event) => Math.max(max, event.tick), 0);
    pushEvent(events, lastTick + 1, [0xff, 0x2f, 0x00]);
    return wrapTrack(events);
  }

  function makeLeadTrack(notes, data, context, trackType) {
    const member = getBandMember(data, trackType);
    const events = [];
    const channel = CHANNELS[trackType];
    pushEvent(events, 0, [0xc0 | channel, PROGRAMS.acousticGrandPiano]);
    for (const note of notes) {
      if (note.isRest) continue;
      const startBeat = note.beat || 1;
      const endBeat = note.recordingEndBeat || (startBeat + (note.duration || 0.25));
      const start = context.beatToTick(startBeat);
      const end = Math.max(start + 1, context.beatToTick(endBeat));
      const key = keyAtBeat(data.keys, startBeat);
      const pitch = scaleDegreeToMidi(note.sd, Number(note.octave || 0) + Number(member.octaveOffset || 0), key, 60);
      if (!Number.isFinite(pitch)) continue;
      pushNote(events, channel, start, end, pitch, velocity(member, 92));
    }
    return eventTrack(events, "Lead 1");
  }

  function makeHarmonyTrack(chords, data, context) {
    const member = getBandMember(data, "harmony");
    const events = [];
    const channel = CHANNELS.harmony;
    pushEvent(events, 0, [0xc0 | channel, PROGRAMS.acousticGrandPiano]);
    for (const chord of chords) {
      if (chord.isRest) continue;
      const startBeat = chord.beat || 1;
      const endBeat = startBeat + (chord.duration || 1);
      const key = keyAtBeat(data.keys, startBeat);
      const pitches = chordToPitches(chord, key);
      for (let beat = startBeat; beat < endBeat - 0.0001; beat += 1) {
        const noteEndBeat = Math.min(beat + 0.92, endBeat);
        const start = context.beatToTick(beat);
        const end = Math.max(start + 1, context.beatToTick(noteEndBeat));
        for (const pitch of pitches) pushNote(events, channel, start, end, pitch, velocity(member, 66));
      }
    }
    return eventTrack(events, "Harmony");
  }

  function makeBassTrack(chords, data, context) {
    const member = getBandMember(data, "bass");
    const events = [];
    const channel = CHANNELS.bass;
    pushEvent(events, 0, [0xc0 | channel, PROGRAMS.acousticBass]);
    for (const chord of chords) {
      if (chord.isRest) continue;
      const startBeat = chord.beat || 1;
      const endBeat = startBeat + (chord.duration || 1);
      const key = keyAtBeat(data.keys, startBeat);
      const chordPitches = chordToPitches(chord, key);
      const root = chordPitches[0] - 12 + Math.round(Number(member.octaveOffset || 0) * 12);
      const fifth = (chordPitches[2] || chordPitches[0]) - 12 + Math.round(Number(member.octaveOffset || 0) * 12);
      for (let beat = startBeat; beat < endBeat - 0.0001; beat += 1) {
        addBeatNote(events, context, channel, beat, Math.min(beat + 0.72, endBeat), root, velocity(member, 76));
        if (beat + 0.75 < endBeat - 0.0001) {
          addBeatNote(events, context, channel, beat + 0.75, Math.min(beat + 1, endBeat), fifth, velocity(member, 66));
        }
      }
    }
    return eventTrack(events, "Bass");
  }

  function makeDrumsTrack(data, context, pattern) {
    const member = getBandMember(data, "drums");
    const events = [];
    const channel = CHANNELS.drums;
    const endBeat = data.endBeat || inferEndBeat(data);
    const beatsPerMeasure = Number((data.meters && data.meters[0] && data.meters[0].numBeats) || 4);
    const measureCount = Math.max(1, Math.ceil((endBeat - 1) / beatsPerMeasure));
    const source = pattern && pattern.length ? pattern : fallbackBasicPopPattern(beatsPerMeasure);
    for (let measure = 0; measure < measureCount; measure++) {
      const measureBeat = 1 + measure * beatsPerMeasure;
      for (const hit of source) {
        const beat = measureBeat + (hit.beat - 1);
        if (beat >= endBeat) continue;
        const start = context.beatToTick(beat);
        const end = Math.max(start + 1, context.beatToTick(Math.min(beat + Math.max(hit.duration || 0.125, 0.05), endBeat)));
        pushNote(events, channel, start, end, hit.midi, Math.round((hit.velocity || 0.7) * velocity(member, 100)));
      }
    }
    return eventTrack(events, "Drums");
  }

  function eventTrack(events, name) {
    pushEvent(events, 0, [0xff, 0x03, ...varLen(name.length), ...ascii(name)]);
    const lastTick = events.reduce((max, e) => Math.max(max, e.tick), 0);
    pushEvent(events, lastTick + 1, [0xff, 0x2f, 0x00]);
    return wrapTrack(events);
  }

  function chordToPitches(chord, key) {
    const rootPitch = scaleDegreeToMidi(String(chord.root || 1), 0, key, 48);
    const scale = getScale(key);
    const degree = Math.max(1, Math.min(7, Number(chord.root || 1))) - 1;
    const thirdDegreeOffset = chord.suspensions && chord.suspensions.includes(4) ? 3 : chord.suspensions && chord.suspensions.includes(2) ? 1 : 2;
    const thirdPc = scale[(degree + thirdDegreeOffset) % 7] + (degree + thirdDegreeOffset >= 7 ? 12 : 0);
    const fifthPc = scale[(degree + 4) % 7] + (degree + 4 >= 7 ? 12 : 0);
    const rootPc = scale[degree];
    const pitches = [rootPitch, rootPitch + (thirdPc - rootPc), rootPitch + (fifthPc - rootPc)];
    if (Number(chord.type) === 7) {
      const seventhPc = scale[(degree + 6) % 7] + (degree + 6 >= 7 ? 12 : 0);
      pitches.push(rootPitch + (seventhPc - rootPc));
    }
    for (const add of chord.adds || []) {
      const offset = Number(add) - 1;
      if (Number.isFinite(offset) && offset >= 0) {
        const pc = scale[(degree + offset) % 7] + (degree + offset >= 7 ? 12 : 0);
        pitches.push(rootPitch + (pc - rootPc));
      }
    }
    for (const omit of chord.omits || []) {
      const idx = Number(omit) === 3 ? 1 : Number(omit) === 5 ? 2 : -1;
      if (idx >= 0) pitches.splice(idx, 1);
    }
    const inversion = Math.max(0, Number(chord.inversion || 0));
    for (let i = 0; i < inversion && i < pitches.length; i++) pitches[i] += 12;
    return Array.from(new Set(pitches.map(clampMidi))).sort((a, b) => a - b);
  }

  function scaleDegreeToMidi(sd, octave, key, base) {
    const parsed = parseScaleDegree(sd);
    if (!parsed) return NaN;
    const tonic = TONIC_TO_PC[key.tonic] == null ? 0 : TONIC_TO_PC[key.tonic];
    const scale = getScale(key);
    const pc = tonic + scale[parsed.degree - 1] + parsed.accidental;
    return base + pc + 12 * Number(octave || 0);
  }

  function parseScaleDegree(value) {
    const text = String(value || "").trim();
    const match = text.match(/^([#bsf]*)([1-7])([#bsf]*)$/i);
    if (!match) return null;
    const marks = `${match[1]}${match[3]}`.toLowerCase();
    let accidental = 0;
    for (const ch of marks) accidental += ch === "#" || ch === "s" ? 1 : ch === "b" || ch === "f" ? -1 : 0;
    return { degree: Number(match[2]), accidental };
  }

  function getScale(key) {
    return SCALE_INTERVALS[String(key.scale || "major").toLowerCase()] || SCALE_INTERVALS.major;
  }

  function makeTimingContext(data) {
    return {
      beatToTick(beat) {
        const tempo = tempoAtBeat(data.tempos, beat);
        const zeroBased = Number(beat || 1) - 1;
        const adjusted = applySwing(zeroBased, tempo.swingFactor, tempo.swingBeat);
        return Math.round(adjusted * TPQ);
      },
    };
  }

  function absoluteBeatToTick(beat) {
    return Math.round((Number(beat || 1) - 1) * TPQ);
  }

  function applySwing(beatZeroBased, swingFactor, swingBeat) {
    const factor = Number(swingFactor || 0);
    const subBeat = Number(swingBeat || 0.5);
    if (!(factor > 0.5) || !(subBeat > 0)) return beatZeroBased;
    const pair = subBeat * 2;
    const pairStart = Math.floor(beatZeroBased / pair) * pair;
    const inside = beatZeroBased - pairStart;
    if (inside <= subBeat) return pairStart + inside * (factor / subBeat);
    return pairStart + factor + (inside - subBeat) * ((pair - factor) / (pair - subBeat));
  }

  function tempoAtBeat(tempos, beat) {
    if (!tempos || !tempos.length) return { beat: 1, bpm: DEFAULT_BPM, swingFactor: 0, swingBeat: 0.5 };
    let current = tempos[0];
    for (const tempo of tempos) {
      if (Number(tempo.beat || 1) <= beat) current = tempo;
      else break;
    }
    return current;
  }

  function keyAtBeat(keys, beat) {
    if (!keys || !keys.length) return { tonic: "C", scale: "major" };
    let current = keys[0];
    for (const key of keys) {
      if (Number(key.beat || 1) <= beat) current = key;
      else break;
    }
    return current;
  }

  function getBandMember(data, trackType) {
    const bands = data.bands || [];
    const band = bands[0] || {};
    const members = band[trackType] || [];
    return members[0] || { specification: "", velocity: 0.7, octaveOffset: 0, mute: false };
  }

  function velocity(member, fallback) {
    const value = Number(member.velocity);
    return clampMidi(Math.round((Number.isFinite(value) ? value : 0.7) * fallback * 1.6));
  }

  function addBeatNote(events, context, channel, startBeat, endBeat, pitch, vel) {
    const start = context.beatToTick(startBeat);
    const end = Math.max(start + 1, context.beatToTick(endBeat));
    pushNote(events, channel, start, end, pitch, vel);
  }

  function pushNote(events, channel, startTick, endTick, pitch, vel) {
    pushEvent(events, startTick, [0x90 | channel, clampMidi(pitch), clampMidi(vel)]);
    pushEvent(events, endTick, [0x80 | channel, clampMidi(pitch), 0]);
  }

  function pushMarker(events, tick, text) {
    pushEvent(events, tick, [0xff, 0x06, ...varLen(text.length), ...ascii(text)]);
  }

  async function getDrumPattern(data) {
    const member = getBandMember(data, "drums");
    const patternName = (member.specification || "Basic Pop 22").trim();
    const beatsPerMeasure = Number((data.meters && data.meters[0] && data.meters[0].numBeats) || 4);
    const url = `${PLAYER_ASSET_BASE}patternSpecs/midiPatternSpecs/drum-patterns/${encodeURIComponent(patternName)}/basic/${beatsPerMeasure}.mid`;
    try {
      const bytes = await getArrayBuffer(url);
      return parseMidiNotes(new Uint8Array(bytes)).map((note) => ({
        midi: note.pitch,
        beat: note.tick / note.ppqn + 1,
        duration: Math.max(note.duration / note.ppqn, 0.05),
        velocity: note.velocity / 127,
      }));
    } catch (error) {
      console.warn("[Hooktheory MIDI Exporter] Falling back to built-in drum pattern:", error);
      return null;
    }
  }

  function getArrayBuffer(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === "function") {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          responseType: "arraybuffer",
          onload: (res) => res.status >= 200 && res.status < 300 ? resolve(res.response) : reject(new Error(`HTTP ${res.status}`)),
          onerror: () => reject(new Error("Tampermonkey binary request failed")),
        });
      } else {
        fetch(url, { credentials: "omit" })
          .then((res) => res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`)))
          .then(resolve, reject);
      }
    });
  }

  function parseMidiNotes(bytes) {
    const reader = makeReader(bytes);
    if (reader.str(4) !== "MThd") throw new Error("Invalid MIDI header");
    const headerLen = reader.u32();
    reader.u16();
    const trackCount = reader.u16();
    const ppqn = reader.u16();
    if (headerLen > 6) reader.skip(headerLen - 6);
    const notes = [];
    for (let track = 0; track < trackCount && reader.left() >= 8; track++) {
      if (reader.str(4) !== "MTrk") break;
      const end = reader.pos + reader.u32();
      const active = new Map();
      let tick = 0;
      let running = 0;
      while (reader.pos < end) {
        tick += readVarLen(reader);
        let status = reader.u8();
        if (status < 0x80) {
          reader.pos--;
          status = running;
        } else if (status < 0xf0) {
          running = status;
        }
        if ((status & 0xf0) === 0x90) {
          const pitch = reader.u8();
          const vel = reader.u8();
          const key = `${status & 0x0f}:${pitch}`;
          if (vel > 0) active.set(key, { tick, pitch, velocity: vel });
          else closeMidiNote(active, key, tick, ppqn, notes);
        } else if ((status & 0xf0) === 0x80) {
          const pitch = reader.u8();
          reader.u8();
          closeMidiNote(active, `${status & 0x0f}:${pitch}`, tick, ppqn, notes);
        } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
          reader.u8();
        } else if (status === 0xff) {
          reader.u8();
          reader.skip(readVarLen(reader));
        } else if (status === 0xf0 || status === 0xf7) {
          reader.skip(readVarLen(reader));
        } else {
          reader.u8();
          reader.u8();
        }
      }
      reader.pos = end;
    }
    return notes.sort((a, b) => a.tick - b.tick);
  }

  function closeMidiNote(active, key, tick, ppqn, notes) {
    const note = active.get(key);
    if (!note) return;
    active.delete(key);
    notes.push({ ...note, duration: Math.max(1, tick - note.tick), ppqn });
  }

  function makeReader(bytes) {
    return {
      bytes,
      pos: 0,
      left() { return this.bytes.length - this.pos; },
      skip(n) { this.pos += n; },
      u8() { return this.bytes[this.pos++]; },
      u16() { return (this.u8() << 8) | this.u8(); },
      u32() { return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8(); },
      str(n) { let out = ""; for (let i = 0; i < n; i++) out += String.fromCharCode(this.u8()); return out; },
    };
  }

  function readVarLen(reader) {
    let value = 0;
    let byte;
    do {
      byte = reader.u8();
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  }

  function fallbackBasicPopPattern(beatsPerMeasure) {
    const hits = [];
    for (let beat = 1; beat <= beatsPerMeasure; beat += 0.5) hits.push({ midi: 42, beat, duration: 0.12, velocity: 0.58 });
    hits.push({ midi: 36, beat: 1, duration: 0.14, velocity: 0.9 });
    hits.push({ midi: 36, beat: 3, duration: 0.14, velocity: 0.82 });
    hits.push({ midi: 38, beat: 2, duration: 0.14, velocity: 0.88 });
    hits.push({ midi: 38, beat: 4, duration: 0.14, velocity: 0.92 });
    return hits;
  }

  function inferEndBeat(data) {
    const noteEnd = (data.notes || []).reduce((max, note) => Math.max(max, (note.beat || 1) + (note.duration || 0)), 1);
    const chordEnd = (data.chords || []).reduce((max, chord) => Math.max(max, (chord.beat || 1) + (chord.duration || 0)), 1);
    return Math.max(noteEnd, chordEnd);
  }

  function pushEvent(events, tick, data) {
    events.push({ tick, data });
  }

  function wrapTrack(events) {
    events.sort((a, b) => a.tick - b.tick);
    const body = [];
    let lastTick = 0;
    for (const event of events) {
      const delta = Math.max(0, event.tick - lastTick);
      body.push(...varLen(delta), ...event.data);
      lastTick = event.tick;
    }
    return [...ascii("MTrk"), ...u32(body.length), ...body];
  }

  function varLen(value) {
    let buffer = value & 0x7f;
    const bytes = [];
    while ((value >>= 7)) {
      buffer <<= 8;
      buffer |= ((value & 0x7f) | 0x80);
    }
    for (;;) {
      bytes.push(buffer & 0xff);
      if (buffer & 0x80) buffer >>= 8;
      else break;
    }
    return bytes;
  }

  function ascii(text) {
    return Array.from(String(text), (ch) => ch.charCodeAt(0) & 0x7f);
  }

  function u16(value) {
    return [(value >> 8) & 255, value & 255];
  }

  function u32(value) {
    return [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function clampMidi(value) {
    return Math.max(0, Math.min(127, Math.round(value)));
  }

  function sanitizeFileName(name) {
    return String(name || "hooktheory-theorytab").replace(/[\\/:*?"<>|]+/g, "-").trim() || "hooktheory-theorytab";
  }

  function downloadBytes(bytes, filename, mimeType) {
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  main();
})();
