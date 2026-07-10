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

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A quick high-to-low whoosh: a card being flicked/thrown onto the table. */
function playCardThrow(ctx: AudioContext, startTime: number) {
  const duration = 0.18
  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.7
  filter.frequency.setValueAtTime(4000, startTime)
  filter.frequency.exponentialRampToValueAtTime(500, startTime + duration)
  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  source.connect(filter)
  filter.connect(gainNode)
  gainNode.connect(ctx.destination)
  source.start(startTime)
  source.stop(startTime + duration + 0.02)
}

/** A single sharp chip clack, layered to sound like poker chips being set down. */
function playChipClack(ctx: AudioContext, startTime: number, peakGain: number) {
  const duration = 0.06
  const source = ctx.createBufferSource()
  source.buffer = createNoiseBuffer(ctx, duration)
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 3000
  filter.Q.value = 4
  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.003)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  source.connect(filter)
  filter.connect(gainNode)
  gainNode.connect(ctx.destination)
  source.start(startTime)
  source.stop(startTime + duration + 0.02)
}

/** A single knuckle-on-table knock. */
function playKnock(ctx: AudioContext, startTime: number) {
  const duration = 0.09
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, startTime)
  osc.frequency.exponentialRampToValueAtTime(55, startTime + duration)
  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(0.22, startTime + 0.004)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.connect(gainNode)
  gainNode.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.02)
}

const CHIP_CLACK_GAP = 0.05
const KNOCK_GAP = 0.16

/** Plays a short synthesized sound distinct per action type: a card throw for
 * fold, chip clacks for bet/raise/call, and a double knock for check. No
 * audio assets required; uses the Web Audio API directly. */
export function playActionSound(action: PokerActionType): void {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime
  switch (action) {
    case 'fold':
      playCardThrow(ctx, now)
      break
    case 'check':
      playKnock(ctx, now)
      playKnock(ctx, now + KNOCK_GAP)
      break
    case 'call':
      playChipClack(ctx, now, 0.14)
      break
    case 'bet':
      playChipClack(ctx, now, 0.14)
      playChipClack(ctx, now + CHIP_CLACK_GAP, 0.13)
      break
    case 'raise':
      playChipClack(ctx, now, 0.15)
      playChipClack(ctx, now + CHIP_CLACK_GAP, 0.14)
      playChipClack(ctx, now + CHIP_CLACK_GAP * 2, 0.15)
      break
  }
}
