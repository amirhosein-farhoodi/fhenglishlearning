import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import type { ListeningPart } from '../../content/ielts-mock/types'
import { isAnswered, layoutPaper, listeningTimeline, passageRanges, type Answers, type ListeningSeg } from '../../lib/mock/engine'
import { playableUrl } from '../../lib/mock/audioCache'
import ExamNav from './ExamNav'
import QuestionGroupView from './QuestionGroupView'

/**
 * The live Listening paper, run off a timeline that copies the official recording:
 * opening announcement -> for each part: reading time, the recording (with any mid-part
 * reading time), checking time -> final two minutes. Every silent stretch is shown as a
 * countdown, so the candidate always knows what is happening and for how long.
 *
 * As in the test centre the recording plays once, straight through - no pause, rewind or
 * seek, only volume. Position comes from the wall clock (startedAt), so leaving or
 * refreshing does not stop the test; on return one click resumes the sound where it now is.
 */

interface Props {
  parts: ListeningPart[]
  answers: Answers
  flagged: number[]
  startedAt: number
  onAnswer: (num: number, value: string) => void
  onToggleFlag: (num: number) => void
  /** Move the whole paper forward by this many seconds (a skipped pause or part). */
  onSkip: (seconds: number) => void
  /** End the Listening section (asks for confirmation first). */
  onFinish: () => void
}

const parseNum = (el: EventTarget | null): number | null => {
  const t = el as HTMLInputElement | null
  const m = (t?.id || t?.name || '').match(/^q-(\d+)$/)
  return m ? Number(m[1]) : null
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`

/** What the banner says for the stretch now running. */
function Phase({ seg, left, parts, playingRange, onSkip, onFinish }: { seg: ListeningSeg | undefined; left: number; parts: ListeningPart[]; playingRange: [number, number] | null; onSkip: () => void; onFinish: () => void }) {
  if (!seg) return <span className="ls-status is-done">The Listening test has ended</span>
  const partNo = seg.part + 1
  switch (seg.kind) {
    case 'intro':
      return (
        <span className="ls-status">
          <span className="ls-pulse" aria-hidden="true" /> Listen to the instructions
          <button type="button" className="ls-skip" onClick={onSkip}>
            Skip introduction
          </button>
        </span>
      )
    case 'read':
      return (
        <span className="ls-status is-read">
          <b>Reading time</b> · Look at questions {seg.questions![0]}–{seg.questions![1]} now. The recording continues in <b className="ls-count">{clock(left)}</b>
          <button type="button" className="ls-skip" onClick={onSkip}>
            Start the recording now
          </button>
        </span>
      )
    case 'play':
      return (
        <span className="ls-status">
          <span className="ls-pulse" aria-hidden="true" /> Part {partNo} · {playingRange ? `Listen and answer questions ${playingRange[0]}–${playingRange[1]}` : parts[seg.part].title}
        </span>
      )
    case 'check':
      return (
        <span className="ls-status is-check">
          <b>Checking time</b> · Check your answers to Part {partNo} · <b className="ls-count">{clock(left)}</b>
          <button type="button" className="ls-skip" onClick={onSkip}>
            {seg.part + 1 < parts.length ? 'Go to the next part' : 'Go to the final check'}
          </button>
        </span>
      )
    case 'final':
      return (
        <span className="ls-status is-check">
          <b>Final checking time</b> · Check all your answers · <b className="ls-count">{clock(left)}</b>
          <button type="button" className="ls-skip" onClick={onFinish}>
            Finish the test
          </button>
        </span>
      )
  }
}

export default function ListeningSection({ parts, answers, flagged, startedAt, onAnswer, onToggleFlag, onSkip, onFinish }: Props) {
  const slots = useMemo(() => layoutPaper(parts), [parts])
  const ranges = useMemo(() => passageRanges(slots, parts.length), [slots, parts.length])
  const timeline = useMemo(() => listeningTimeline(parts), [parts])
  const total = ranges[ranges.length - 1]?.[1] ?? 0

  const audioRef = useRef<HTMLAudioElement>(null)
  const [now, setNow] = useState(Date.now())
  const [blocked, setBlocked] = useState(false)
  const [failed, setFailed] = useState(false)
  const [volume, setVolume] = useState(1)
  /** The part on screen during the final review, when every part can be revisited. */
  const [reviewPart, setReviewPart] = useState(0)
  const [current, setCurrent] = useState(1)
  const [confirmNext, setConfirmNext] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  const elapsed = (now - startedAt) / 1000
  const segIdx = timeline.findIndex((s) => elapsed >= s.t0 && elapsed < s.t1)
  const seg = segIdx >= 0 ? timeline[segIdx] : undefined
  const left = seg ? seg.t1 - elapsed : 0
  /** In the final check (and after it) every part is open for review; before that, only the part being played. */
  const reviewing = !seg || seg.kind === 'final'
  const livePart = seg && seg.part >= 0 ? seg.part : 0
  const part = reviewing ? reviewPart : livePart

  /** Jump the paper to a point on the timeline (skipping a pause, or the rest of a part). */
  const skipTo = (t: number) => {
    if (t > elapsed) onSkip(t - elapsed)
  }
  /** Start of the next part, or of the final check after the last part. */
  const nextPartStart = () => {
    const next = timeline.find((s) => s.t0 >= elapsed && (s.part > livePart || s.kind === 'final'))
    return next ? next.t0 : elapsed
  }
  /** Recording still to come in this part - moving on would skip it, so ask first. */
  const audioLeft = timeline.some((s) => s.part === livePart && s.kind === 'play' && s.t1 > elapsed + 0.5)

  /** The questions the recording is on: those of the latest reading step in this part. */
  const playingRange = useMemo<[number, number] | null>(() => {
    if (!seg || seg.part < 0) return null
    for (let i = segIdx; i >= 0 && timeline[i].part === seg.part; i--) if (timeline[i].kind === 'read') return timeline[i].questions!
    return ranges[seg.part]
  }, [seg, segIdx, timeline, ranges])

  /** Make the audio element match the timeline: right file, right moment, playing or silent. */
  const sync = () => {
    const el = audioRef.current
    if (!el) return
    const e = (Date.now() - startedAt) / 1000
    const s = timeline.find((x) => e >= x.t0 && e < x.t1)
    if (!s || !s.src) {
      el.pause()
      return
    }
    const want = (s.from ?? 0) + (e - s.t0)
    // Play the in-memory copy downloaded before the section started (see audioCache).
    const url = playableUrl(s.src)
    if (el.src !== new URL(url, window.location.href).href) el.src = url
    const go = () => {
      if (Math.abs(el.currentTime - want) > 0.8) el.currentTime = want
      el.play()
        .then(() => setBlocked(false))
        .catch(() => setBlocked(true))
    }
    if (el.readyState >= 1) go()
    else el.addEventListener('loadedmetadata', go, { once: true })
  }

  // Each new stretch: start, move or silence the recording. Also on mount (the Start button
  // on the intro page is the user gesture browsers need to allow sound).
  useEffect(() => {
    if (!blocked) sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segIdx])

  // A silent stretch must stay silent even if the previous clip would run on.
  useEffect(() => {
    const el = audioRef.current
    if (el && seg && !seg.src && !el.paused) el.pause()
  }, [seg, now])

  // Reading time: bring the questions being introduced into view.
  useEffect(() => {
    if (seg?.kind !== 'read') return
    requestAnimationFrame(() => document.getElementById(`q-${seg.questions![0]}`)?.closest('.q-group')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [segIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    document.querySelector('.ls-scroll')?.scrollTo({ top: 0 })
  }, [part])

  const goTo = (n: number) => {
    const c = Math.min(Math.max(1, n), total)
    const owner = Math.max(0, ranges.findIndex(([a, b]) => c >= a && c <= b))
    // Before the final check only the current part's questions are reachable.
    if (!reviewing && owner !== livePart) return
    setCurrent(c)
    if (reviewing) setReviewPart(owner)
    requestAnimationFrame(() => {
      const el = document.getElementById(`q-${c}`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.focus({ preventScroll: true })
    })
  }

  const onFocus = (e: FocusEvent) => {
    const n = parseNum(e.target)
    if (n) setCurrent(n)
  }

  const p = parts[part]
  const tone = seg?.kind === 'read' ? ' is-read' : seg?.kind === 'check' || seg?.kind === 'final' ? ' is-check' : ''
  const timed = seg && (seg.kind === 'read' || seg.kind === 'check' || seg.kind === 'final')

  return (
    <div className="rp ls">
      <audio ref={audioRef} preload="auto" onError={() => setFailed(true)} />

      <div className={`ls-bar${tone}`}>
        <Phase seg={seg} left={left} parts={parts} playingRange={playingRange} onSkip={() => seg && skipTo(seg.t1)} onFinish={onFinish} />
        <label className="ls-volume">
          <span aria-hidden="true">🔊</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
        </label>
      </div>
      {timed && (
        <div className={`ls-meter${tone}`} aria-hidden="true">
          <span style={{ width: `${(left / (seg.t1 - seg.t0)) * 100}%` }} />
        </div>
      )}

      <div className="rp-part-head">
        <b>Part {part + 1}</b>
        <span>
          Listen and answer questions {ranges[part][0]}–{ranges[part][1]}.
        </span>
      </div>

      <div className="rp-scroll ls-scroll" onFocusCapture={onFocus}>
        <div className="ls-inner">
          {seg?.kind === 'intro' && (
            <div className="ls-intro-card">
              <b>Introduction</b>
              <p>
                You will hear four different recordings and you will have to answer questions on what you hear. There will be time for you to read the instructions and questions, and you will
                have a chance to check your work. All the recordings will be played once only.
              </p>
            </div>
          )}
          <p className="ls-intro">{p.intro}</p>
          {slots
            .filter((s) => s.passage === part)
            .map((s) => (
              <QuestionGroupView
                key={`${part}-${s.group}`}
                group={p.groups[s.group]}
                start={s.start}
                end={s.end}
                passageNo={part + 1}
                mode="listening"
                answers={answers}
                onAnswer={onAnswer}
                flagged={flagged}
              />
            ))}
        </div>
        <div style={{ height: 80 }} />
      </div>

      {reviewing ? (
        <ExamNav ranges={ranges} part={part} current={current} flagged={flagged} isAnswered={(n) => isAnswered(parts, answers, n)} goTo={goTo} onToggleFlag={onToggleFlag} />
      ) : (
        <nav className="exam-nav" aria-label={`Part ${part + 1} questions`}>
          <button
            type="button"
            className={`exam-flag${flagged.includes(current) ? ' on' : ''}`}
            onClick={() => onToggleFlag(current)}
            aria-pressed={flagged.includes(current)}
            title="Mark this question to come back to it in the final check"
          >
            <span aria-hidden="true">⚑</span> Review
          </button>
          <div className="exam-parts">
            <div className="exam-part is-active">
              <span className="exam-part-name">Part {part + 1}</span>
              <div className="exam-nums">
                {Array.from({ length: ranges[part][1] - ranges[part][0] + 1 }, (_, i) => ranges[part][0] + i).map((n) => {
                  const done = isAnswered(parts, answers, n)
                  return (
                    <button
                      type="button"
                      key={n}
                      className={`exam-num${done ? ' is-done' : ''}${flagged.includes(n) ? ' is-flagged' : ''}${n === current ? ' is-current' : ''}`}
                      onClick={() => goTo(n)}
                      aria-label={`Question ${n}${done ? ', answered' : ''}`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-dark btn-sm ls-next" onClick={() => (audioLeft ? setConfirmNext(true) : skipTo(nextPartStart()))}>
            {seg?.kind === 'intro' ? 'Start Part 1' : part + 1 < parts.length ? `Next: Part ${part + 2}` : 'Go to the final check'}
          </button>
        </nav>
      )}

      {confirmNext && (
        <div className="exam-modal" role="dialog" aria-modal="true" aria-labelledby="next-title">
          <div className="exam-modal-card">
            <h2 id="next-title">Move on before the recording ends?</h2>
            <p>The recording for Part {part + 1} has not finished. If you move on now you will not hear the rest of it, and you cannot come back to this part until the final check.</p>
            <div className="exam-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmNext(false)}>
                Keep listening
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmNext(false)
                  skipTo(nextPartStart())
                }}
              >
                Move on
              </button>
            </div>
          </div>
        </div>
      )}

      {(blocked || failed) && seg && (
        <div className="exam-modal" role="dialog" aria-modal="true" aria-labelledby="audio-title">
          <div className="exam-modal-card">
            <h2 id="audio-title">{failed ? 'The recording could not be loaded' : 'The test is still running'}</h2>
            <p>
              {failed
                ? 'Check your connection, then try again. The test clock does not stop.'
                : 'You left the test while it was running. It has carried on without you, as it would in the exam. Press Continue to pick it up from where it is now.'}
            </p>
            <div className="exam-modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFailed(false)
                  setBlocked(false)
                  sync()
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
