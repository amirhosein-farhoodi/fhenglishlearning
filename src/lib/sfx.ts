import { progressStore } from './storage'

/** Tiny WebAudio sound effects - no assets needed. Respects the sound setting. */
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!progressStore.get().settings.sound) return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const c = getCtx()
  if (!c) return
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.02)
}

export const sfx = {
  tap: () => tone(520, 0, 0.06, 'triangle', 0.04),
  correct: () => {
    tone(660, 0, 0.12, 'triangle')
    tone(880, 0.09, 0.18, 'triangle')
  },
  wrong: () => {
    tone(220, 0, 0.16, 'sawtooth', 0.05)
    tone(180, 0.1, 0.2, 'sawtooth', 0.05)
  },
  win: () => {
    ;[523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle'))
  },
  fail: () => {
    ;[392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.24, 'sine', 0.06))
  },
}
