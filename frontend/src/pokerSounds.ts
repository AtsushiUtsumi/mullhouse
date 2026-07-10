import type { PokerActionType, PokerGameState, PokerPlayerState } from './pokerTypes'

function findPlayer(state: PokerGameState, playerId: string): PokerPlayerState | undefined {
  return state.players.find((p) => p.player_id === playerId)
}

/**
 * Infers which action the previously-to-act player just took by diffing two
 * consecutive state snapshots. The server doesn't label WebSocket pushes with
 * an action type, so this reconstructs it from the observable state change.
 */
export function detectLastAction(prev: PokerGameState, next: PokerGameState): PokerActionType | null {
  const actorId = prev.current_player_id
  if (!actorId) return null
  const prevPlayer = findPlayer(prev, actorId)
  const nextPlayer = findPlayer(next, actorId)
  if (!prevPlayer || !nextPlayer) return null

  if (!prevPlayer.folded && nextPlayer.folded) return 'fold'

  if (prev.phase !== next.phase) {
    // The street advanced (or the hand ended), so this push bundles the
    // action that closed out betting: a check if already matched, a call
    // otherwise (a bet/raise can't be the one that ends a street).
    return prevPlayer.current_bet === prev.current_bet ? 'check' : 'call'
  }

  if (nextPlayer.current_bet === prevPlayer.current_bet) return 'check'
  if (nextPlayer.current_bet < prevPlayer.current_bet) return null

  if (nextPlayer.current_bet === next.current_bet) {
    if (prev.current_bet === 0) return 'bet'
    if (nextPlayer.current_bet > prev.current_bet) return 'raise'
    return 'call'
  }
  // Put in less than the new table-high bet: a short all-in call.
  return 'call'
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

function playTone(
  ctx: AudioContext,
  startTime: number,
  freq: number,
  duration: number,
  peakGain: number,
  type: OscillatorType,
) {
  const osc = ctx.createOscillator()
  const gainNode = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gainNode)
  gainNode.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

const ACTION_SOUND_NOTES: Record<PokerActionType, { freq: number; type: OscillatorType }[]> = {
  fold: [{ freq: 180, type: 'triangle' }],
  check: [{ freq: 440, type: 'sine' }],
  call: [{ freq: 523, type: 'sine' }],
  bet: [
    { freq: 660, type: 'sine' },
    { freq: 880, type: 'sine' },
  ],
  raise: [
    { freq: 660, type: 'square' },
    { freq: 880, type: 'square' },
    { freq: 1046, type: 'square' },
  ],
}

const NOTE_DURATION = 0.11
const NOTE_GAP = 0.09

/** Plays a short synthesized sound distinct per action type. No audio assets
 * required; uses the Web Audio API directly. */
export function playActionSound(action: PokerActionType): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const notes = ACTION_SOUND_NOTES[action]
  const peakGain = action === 'fold' ? 0.1 : action === 'raise' ? 0.16 : 0.13
  notes.forEach((note, i) => {
    playTone(ctx, ctx.currentTime + i * NOTE_GAP, note.freq, NOTE_DURATION, peakGain, note.type)
  })
}
