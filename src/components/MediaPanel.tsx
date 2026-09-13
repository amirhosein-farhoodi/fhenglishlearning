import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MediaClip } from '../content/types'
import { Film, Headphones, Pause, Play, Skip } from './Icons'

/**
 * The recordings that ship with a unit - the book's own audio tracks and Speaking
 * test videos - played inline in the lesson and again above the quiz.
 *
 * Audio gets a hand-built transport (the native one differs on every browser and
 * cannot be themed), video keeps the platform controls because fullscreen,
 * picture-in-picture and captions live there. Both sit in the same panel so a unit
 * with one of each reads as one place to find its media.
 */

const RATES = [0.75, 1, 1.25, 1.5]
/** Listening practice is all re-listening, so the jump buttons are short. */
const JUMP = 5

const clock = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function AudioClip({ clip }: { clip: MediaClip }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  // A new src on the same element keeps the old rate but resets everything else.
  useEffect(() => {
    setPlaying(false)
    setTime(0)
    setDuration(0)
    setFailed(false)
    setReady(false)
  }, [clip.src])

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate
  }, [rate, clip.src, ready])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) el.play().catch(() => setFailed(true))
    else el.pause()
  }, [])

  const jump = (by: number) => {
    const el = ref.current
    if (!el) return
    el.currentTime = Math.min(Math.max(el.currentTime + by, 0), el.duration || 0)
  }

  const pct = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className={`audio-player${failed ? ' is-failed' : ''}`}>
      <audio
        ref={ref}
        src={clip.src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration)
          setReady(true)
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        className="audio-play"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? `Pause ${clip.title}` : `Play ${clip.title}`}
      >
        {playing ? <Pause size={24} /> : <Play size={24} />}
      </button>

      <div className="audio-body">
        <input
          className="audio-seek"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={time}
          disabled={!duration || failed}
          onChange={(e) => {
            const v = Number(e.target.value)
            setTime(v)
            if (ref.current) ref.current.currentTime = v
          }}
          style={{ ['--played' as string]: `${pct}%` }}
          aria-label="Seek"
        />
        <div className="audio-row">
          <span className="audio-time" aria-live="off">
            {clock(time)} <span className="sep">/</span> {duration ? clock(duration) : '--:--'}
          </span>
          <div className="audio-tools">
            <button type="button" className="audio-btn" onClick={() => jump(-JUMP)} disabled={failed} aria-label={`Back ${JUMP} seconds`}>
              <Skip size={18} seconds={JUMP} back />
            </button>
            <button type="button" className="audio-btn" onClick={() => jump(JUMP)} disabled={failed} aria-label={`Forward ${JUMP} seconds`}>
              <Skip size={18} seconds={JUMP} />
            </button>
            <button
              type="button"
              className="audio-btn rate"
              onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
              disabled={failed}
              aria-label={`Playback speed: ${rate} times. Click to change.`}
            >
              {rate}×
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function VideoClip({ clip }: { clip: MediaClip }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="video-frame">
      {/* key so switching clips reloads the element rather than keeping the old buffer */}
      <video key={clip.src} src={clip.src} controls playsInline preload="metadata" onError={() => setFailed(true)} />
      {failed && <p className="media-error">This video could not be loaded.</p>}
    </div>
  )
}

export default function MediaPanel({ media, compact = false }: { media: MediaClip[]; compact?: boolean }) {
  const [active, setActive] = useState(0)
  const clip = media[active]
  const kinds = useMemo(() => new Set(media.map((m) => m.kind)), [media])

  if (!clip) return null

  const heading =
    kinds.size > 1 ? 'Watch and listen' : clip.kind === 'video' ? (media.length > 1 ? 'Watch' : 'Watch this') : media.length > 1 ? 'Listen' : 'Listen to this'

  return (
    <section className={`media-panel${compact ? ' compact' : ''}`} aria-label="Unit recordings">
      <div className="media-head">
        <span className="media-icon" aria-hidden="true">
          {kinds.has('video') ? <Film size={18} /> : <Headphones size={18} />}
        </span>
        <h2>{heading}</h2>
        <span className="media-count muted">
          {media.length === 1 ? clip.label ?? '1 recording' : `${media.length} recordings`}
        </span>
      </div>

      {media.length > 1 && (
        <div className="media-list" role="tablist" aria-label="Recordings in this unit">
          {media.map((m, i) => (
            <button
              key={m.src}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`media-chip${i === active ? ' on' : ''}`}
              onClick={() => setActive(i)}
            >
              <span className="chip-icon" aria-hidden="true">
                {m.kind === 'video' ? <Film size={14} /> : <Headphones size={14} />}
              </span>
              <span className="chip-label">{m.label ?? `${m.kind === 'video' ? 'Video' : 'Track'} ${i + 1}`}</span>
            </button>
          ))}
        </div>
      )}

      <div className="media-now">
        <h3>{clip.title}</h3>
        {clip.caption && <p className="muted">{clip.caption}</p>}
      </div>

      {clip.kind === 'video' ? <VideoClip clip={clip} /> : <AudioClip clip={clip} />}
    </section>
  )
}
