// CSLT-1 synthesis: no dependencies, samples, worklets, or runtime downloads.
const TOKEN = /^([A-Z])([1-9]\d*)([A-Z])(1[0-2]|[1-9])(?:@(-1|[0-9]))?([whqes])$/;
const LENGTH = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25 };
const TAU = 2 * Math.PI;
// Attack/release seconds, then [frequency ratio, amplitude, decay per second].
const VOICES = {
  piano: [0.004, 0.18, [[1, 1, 1.8], [2, 0.4, 3], [3, 0.17, 4], [4, 0.08, 5]]],
  bell: [0.002, 0.4, [[1, 1, 1.5], [2.76, 0.35, 3], [5.4, 0.12, 5]]],
  guitar: [0.003, 0.12, [[1, 1, 2.8], [2, 0.45, 4], [3, 0.22, 6], [4, 0.1, 8]]],
  cello: [0.07, 0.18, [[1, 1, 0], [2, 0.5, 0], [3, 0.25, 0], [4, 0.12, 0]]],
  pad: [0.25, 0.65, [[1, 1, 0], [1.003, 0.3, 0], [2, 0.15, 0]]],
  electric_piano: [0.003, 0.3, [[1, 1, 1.1], [2, 0.18, 2], [3, 0.3, 4], [7, 0.07, 8]]],
  organ: [0.012, 0.06, [[1, 0.8, 0], [2, 0.65, 0], [3, 0.35, 0], [4, 0.25, 0], [6, 0.15, 0]]],
  harpsichord: [0.001, 0.06, [[1, 0.7, 2], [2, 0.6, 2.8], [3, 0.4, 3.5], [4, 0.3, 4.5], [6, 0.18, 6]]],
  marimba: [0.003, 0.16, [[1, 1, 3], [4, 0.3, 9], [10, 0.08, 16]]],
  vibraphone: [0.006, 0.5, [[1, 1, 0.7], [1.006, 0.25, 0.9], [4, 0.2, 2.8], [10, 0.05, 6]]],
  glockenspiel: [0.001, 0.6, [[1, 0.8, 1], [2.8, 0.55, 1.8], [5.6, 0.25, 3], [8.9, 0.1, 5]]],
  steel_guitar: [0.002, 0.2, [[1, 1, 1.8], [2, 0.55, 2.5], [3, 0.35, 3.5], [4, 0.22, 4.5], [6, 0.12, 7]]],
  bass: [0.006, 0.1, [[1, 1.2, 1.6], [2, 0.3, 3], [3, 0.1, 5]]],
  harp: [0.005, 0.4, [[1, 1, 1.3], [2, 0.25, 2.4], [3, 0.12, 3.5], [5, 0.06, 6]]],
  violin: [0.055, 0.2, [[1, 0.8, 0], [2, 0.6, 0], [3, 0.4, 0], [4, 0.3, 0], [5, 0.2, 0], [6, 0.12, 0]]],
  flute: [0.045, 0.12, [[1, 1, 0], [2, 0.12, 0], [3, 0.025, 0]]],
  clarinet: [0.03, 0.1, [[1, 1, 0], [3, 0.55, 0], [5, 0.28, 0], [7, 0.12, 0]]],
  oboe: [0.025, 0.09, [[1, 0.55, 0], [2, 0.7, 0], [3, 0.5, 0], [4, 0.3, 0], [5, 0.15, 0]]],
  trumpet: [0.035, 0.09, [[1, 0.7, 0], [2, 0.75, 0], [3, 0.6, 0], [4, 0.4, 0], [5, 0.2, 0], [6, 0.1, 0]]],
  lead: [0.008, 0.14, [[1, 0.8, 0], [1.007, 0.3, 0], [2, 0.4, 0], [3, 0.27, 0], [4, 0.2, 0], [5, 0.16, 0]]],
  sine: [0.008, 0.08, [[1, 1, 0]]]
};

/** Built-in preset IDs and display names; use either in metadata.instruments. */
export const instruments = Object.freeze({
  piano: 'Acoustic Piano', electric_piano: 'Electric Piano', organ: 'Tonewheel Organ',
  harpsichord: 'Harpsichord', bell: 'Music Box', marimba: 'Marimba',
  vibraphone: 'Vibraphone', glockenspiel: 'Glockenspiel', guitar: 'Nylon-String Guitar',
  steel_guitar: 'Steel-String Guitar', bass: 'Electric Bass', harp: 'Harp',
  cello: 'Solo Cello', violin: 'Solo Violin', flute: 'Flute', clarinet: 'Clarinet',
  oboe: 'Oboe', trumpet: 'Trumpet', pad: 'Ambient Synth Pad', lead: 'Synth Lead'
});

// Specific names precede broad legacy aliases (piano, string, synth, etc.).
const ALIASES = [
  ['electric_piano', /electric\s*piano|e\s*piano|rhodes|wurli/i],
  ['harpsichord', /harpsichord/i], ['glockenspiel', /glockenspiel|glock/i],
  ['vibraphone', /vibraphone|vibes/i], ['marimba', /marimba/i],
  ['steel_guitar', /steel.*guitar|acoustic\s*guitar/i],
  ['violin', /violin|fiddle/i], ['clarinet', /clarinet/i],
  ['bass', /\bbass\b/i], ['harp', /\bharp\b/i], ['organ', /organ/i],
  ['flute', /flute/i], ['oboe', /oboe/i], ['trumpet', /trumpet|brass/i],
  ['lead', /lead|sawtooth/i], ['bell', /music\s*box|bell|celesta/i],
  ['piano', /piano|keys/i], ['guitar', /guitar|pluck/i],
  ['cello', /cello|string|bowed/i], ['pad', /synth|pad|ambient/i]
];

function fail(message) {
  throw new TypeError(`CSLT-1: ${message}`);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function integerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function voiceFor(name) {
  const normalized = name.trim().toLowerCase().replace(/[_-]+/g, ' ');
  const id = normalized.replace(/\s+/g, '_');
  if (Object.hasOwn(VOICES, id)) return id;
  return ALIASES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? 'sine';
}

/** Validate an object or JSON string and compile tokens into timed note events. */
export function compile(input, { rootMidi = 60 } = {}) {
  let song = input;
  if (typeof song === 'string') {
    try { song = JSON.parse(song); }
    catch { fail('input must be valid JSON'); }
  }
  if (!object(song) || song.format !== 'CSLT-1') fail('format must be "CSLT-1"');
  if (!['1.0', '1.1'].includes(song.version)) fail('version must be "1.0" or "1.1"');
  const meta = song.metadata;
  if (!object(meta)) fail('metadata must be an object');
  if (meta.title !== undefined && typeof meta.title !== 'string') fail('title must be a string');
  if (!integerInRange(meta.tempo_bpm, 20, 300)) {
    fail('tempo_bpm must be an integer from 20 to 300');
  }
  const meter = typeof meta.time_signature === 'string' && /^(\d+)\/(\d+)$/.exec(meta.time_signature);
  if (!meter) fail('time_signature must look like "4/4"');
  const numerator = Number(meter[1]);
  const denominator = Number(meter[2]);
  if (![numerator, denominator].every(n => integerInRange(n, 1, Number.MAX_SAFE_INTEGER))) {
    fail('time_signature values must be positive safe integers');
  }
  if (!object(meta.instruments)) fail('instruments must be an object');
  const voices = {};
  for (const [code, name] of Object.entries(meta.instruments)) {
    if (!/^[A-Z]$/.test(code) || typeof name !== 'string') {
      fail('instruments must map single uppercase letters to string names');
    }
    voices[code] = voiceFor(name);
  }
  if (!integerInRange(rootMidi, 0, 116)) {
    fail('rootMidi must be an integer from 0 to 116');
  }
  if (typeof song.sequence !== 'string') fail('sequence must be a string');
  const tokens = song.sequence.match(/\S+/g) ?? [];
  if (tokens.length > 10000) fail('sequence exceeds 10,000 notes');
  const quarter = 60 / meta.tempo_bpm;
  const beatSeconds = quarter * 4 / denominator;
  const barSeconds = numerator * beatSeconds;
  let bars = 0;
  let end = 0;
  const events = tokens.map((token, index) => {
    const match = TOKEN.exec(token);
    if (!match) fail(`invalid token #${index + 1}: "${token}"`);
    const label = `token #${index + 1} (${token})`;
    const [, measure, beatText, instrument, pitchText, octaveText, length] = match;
    if (octaveText !== undefined && song.version === '1.0') {
      fail(`${label}: explicit octaves require version "1.1"`);
    }
    const bar = measure.charCodeAt(0) - 65;
    const beat = Number(beatText);
    if (!integerInRange(beat, 1, numerator)) {
      fail(`${label}: beat exceeds ${meta.time_signature}`);
    }
    if (!Object.hasOwn(voices, instrument)) {
      fail(`${label}: unmapped instrument ${instrument}`);
    }
    // Explicit octaves are absolute scientific pitch; rootMidi affects legacy notes only.
    const midi = (octaveText === undefined ? rootMidi : 12 * (Number(octaveText) + 1)) + Number(pitchText) - 1;
    if (midi > 127) fail(`${label}: pitch exceeds MIDI 127 (G9)`);
    const start = bar * barSeconds + (beat - 1) * beatSeconds;
    const duration = LENGTH[length] * quarter;
    bars = Math.max(bars, bar + 1);
    end = Math.max(end, start + duration);
    return {
      token, instrument, voice: voices[instrument],
      midi, frequency: 440 * 2 ** ((midi - 69) / 12), start, duration
    };
  });
  events.sort((a, b) => a.start - b.start);
  return {
    title: meta.title ?? '', tempo: meta.tempo_bpm, timeSignature: meta.time_signature,
    bars, beatSeconds, duration: Math.max(bars * barSeconds, end), events
  };
}

/** Render mono floating-point PCM. The same DSP runs in Node and the browser. */
export function render(input, { sampleRate = 22050, rootMidi = 60, volume = 0.7 } = {}) {
  if (!integerInRange(sampleRate, 8000, 96000)) {
    fail('sampleRate must be an integer from 8000 to 96000');
  }
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) fail('volume must be from 0 to 1');
  const score = compile(input, { rootMidi });
  let end = score.duration;
  for (const event of score.events) {
    end = Math.max(end, event.start + event.duration + VOICES[event.voice][1]);
  }
  const count = Math.ceil(end * sampleRate);
  if (end > 600 || count > 30000000) fail('render exceeds 600 seconds or 30 million samples');
  const samples = new Float32Array(count);
  for (const event of score.events) {
    const [attack, release, harmonics] = VOICES[event.voice];
    const offset = Math.round(event.start * sampleRate);
    const gate = event.duration * sampleRate;
    const tail = release * sampleRate;
    const attackSamples = Math.max(1, Math.min(attack * sampleRate, gate / 4));
    const length = Math.min(samples.length - offset, Math.ceil(gate + tail));
    // Recurrence oscillators need sin/cos only at initialization, not per sample.
    const partials = harmonics.filter(([ratio]) => event.frequency * ratio < sampleRate / 2)
      .map(([ratio, amplitude, decay]) => {
        const phase = TAU * event.frequency * ratio / sampleRate;
        return { previous: -Math.sin(phase), current: 0, step: 2 * Math.cos(phase),
          amplitude, decay: Math.exp(-decay / sampleRate) };
      });
    for (let i = 0; i < length; i++) {
      let value = 0;
      for (const partial of partials) {
        value += partial.current * partial.amplitude;
        const next = partial.step * partial.current - partial.previous;
        partial.previous = partial.current;
        partial.current = next;
        partial.amplitude *= partial.decay;
      }
      const envelope = Math.min(1, i / attackSamples) * (i < gate ? 1 : Math.max(0, 1 - (i - gate) / tail) ** 2);
      samples[offset + i] += value * envelope * 0.25;
    }
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = volume * (peak > 0.95 ? 0.95 / peak : 1);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return { samples, sampleRate, duration: samples.length / sampleRate };
}

/** Encode rendered PCM as a standard mono, 16-bit little-endian WAV. */
export function encodeWav({ samples, sampleRate }) {
  if (!(samples instanceof Float32Array) || !integerInRange(sampleRate, 8000, 96000)) {
    fail('encodeWav expects { samples: Float32Array, sampleRate: 8000..96000 }');
  }
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buffer);
}

/** Call from a browser click/tap. Returns { stop(), ended, duration }. */
export async function play(input, options = {}) {
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!options.context && !AudioContext) throw new Error('Browser Web Audio is unavailable; use render() in Node.');
  const context = options.context ?? new AudioContext();
  const ownsContext = !options.context;
  let source;
  let stopped = false;
  let resolveEnded;
  const ended = new Promise(resolve => { resolveEnded = resolve; });
  // One cleanup path for completion, stop, empty scores, and errors.
  const finish = () => {
    if (stopped) return;
    stopped = true;
    source?.disconnect();
    resolveEnded();
    if (ownsContext) return context.close().catch(() => {});
  };
  try {
    await context.resume();
    const audio = render(input, options);
    if (audio.samples.length) {
      const buffer = context.createBuffer(1, audio.samples.length, audio.sampleRate);
      buffer.copyToChannel(audio.samples, 0);
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = finish;
      source.start();
    } else finish();
    return {
      duration: audio.duration, ended,
      stop() { if (!stopped) { source?.stop(); finish(); } }
    };
  } catch (error) {
    await finish();
    throw error;
  }
}

// Open Waters: a module, so its names stay private; this hands the API to the game's plain scripts.
// Songs are inlined from src/music/*.urchin as <script type="application/json" data-song="name">. Call from a click/key handler.
globalThis.Urchin = {
  compile, render, encodeWav, play, instruments,
  song(name) {
    const el = document.querySelector(`script[data-song="${name}"]`);
    if (!el) throw new Error(`No song "${name}" (add src/music/${name}.urchin and list it in src/index.html)`);
    return el.textContent;
  },
  playSong(name, options) { return play(this.song(name), options); }
};
