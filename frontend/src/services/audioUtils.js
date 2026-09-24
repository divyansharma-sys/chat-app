// Audio utility using Web Audio API
// Generates message chimes, incoming call ringtones, and outgoing ringback tones in memory without external audio files.

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Play a friendly incoming message chime
 */
export function playMessageChime() {
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gainNode = ctx.createGain()

    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12) // A5

    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(880, now + 0.08)
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.25) // D6

    gainNode.gain.setValueAtTime(0.001, now)
    gainNode.gain.linearRampToValueAtTime(0.18, now + 0.04)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)

    osc1.connect(gainNode)
    osc2.connect(gainNode)
    gainNode.connect(ctx.destination)

    osc1.start(now)
    osc2.start(now + 0.06)
    osc1.stop(now + 0.4)
    osc2.stop(now + 0.4)
  } catch (err) {
    console.warn('Audio chime error:', err)
  }
}

/**
 * Outgoing ringback tone ("duuu... duuu...")
 */
export function createOutgoingRingback() {
  let isRinging = true
  let timerId = null

  const ringPulse = () => {
    if (!isRinging) return
    const ctx = getAudioContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()

      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(440, now) // A4
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(480, now)

      gain.gain.setValueAtTime(0.001, now)
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05)
      gain.gain.setValueAtTime(0.12, now + 1.2)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)

      osc1.connect(gain)
      osc2.connect(gain)
      gain.connect(ctx.destination)

      osc1.start(now)
      osc2.start(now)
      osc1.stop(now + 1.35)
      osc2.stop(now + 1.35)
    } catch (e) {
      console.warn('Ringback audio error:', e)
    }

    timerId = setTimeout(ringPulse, 3500)
  }

  ringPulse()

  return {
    stop: () => {
      isRinging = false
      if (timerId) clearTimeout(timerId)
    }
  }
}

/**
 * Incoming call ringtone (cheerful rhythmic melody)
 */
export function createIncomingRingtone() {
  let isRinging = true
  let timerId = null

  const notes = [
    { freq: 523.25, time: 0, dur: 0.12 },    // C5
    { freq: 659.25, time: 0.14, dur: 0.12 }, // E5
    { freq: 783.99, time: 0.28, dur: 0.16 }, // G5
    { freq: 1046.50, time: 0.46, dur: 0.28 } // C6
  ]

  const ringCycle = () => {
    if (!isRinging) return
    const ctx = getAudioContext()
    if (!ctx) return

    try {
      const now = ctx.currentTime
      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + time)

        gain.gain.setValueAtTime(0.001, now + time)
        gain.gain.linearRampToValueAtTime(0.2, now + time + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(now + time)
        osc.stop(now + time + dur + 0.05)
      })
    } catch (e) {
      console.warn('Incoming ringtone error:', e)
    }

    timerId = setTimeout(ringCycle, 2200)
  }

  ringCycle()

  return {
    stop: () => {
      isRinging = false
      if (timerId) clearTimeout(timerId)
    }
  }
}
