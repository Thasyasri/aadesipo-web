let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.08) {
  const audioCtx = getContext();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

/**
 * Placeholder SFX — real designed sound (and music) is an asset-
 * authoring task, not a code task. These give genuine audio feedback
 * with zero asset files; every call site here is exactly where a
 * Howler-based real sample plugs in later without changing callers.
 */
export const sfx = {
  diceRoll: () => {
    tone(220, 90, "triangle", 0.05);
    setTimeout(() => tone(260, 90, "triangle", 0.05), 90);
  },
  purchase: () => {
    tone(440, 100, "sine", 0.06);
    setTimeout(() => tone(660, 140, "sine", 0.06), 100);
  },
  cashGain: () => tone(880, 120, "sine", 0.05),
  cashLoss: () => tone(180, 160, "sawtooth", 0.05),
  error: () => tone(120, 180, "square", 0.04),
  victory: () => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 220, "sine", 0.06), i * 140));
  },
};
