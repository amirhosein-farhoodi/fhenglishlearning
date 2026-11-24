import { useState } from 'react'
import { promptInstall, useInstall } from '../lib/pwa'

/** iOS "Share" glyph, so the instructions point at the button people actually see. */
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

/**
 * "Install the app" card for the home page. Shows only where installing is
 * possible and has not happened yet: a one-tap button on Chrome/Edge/Android,
 * step-by-step instructions on iPhone and iPad.
 */
export default function InstallApp() {
  const mode = useInstall()
  const [showSteps, setShowSteps] = useState(false)
  if (!mode) return null

  return (
    <section className="install-app" aria-labelledby="install-title">
      <img className="install-app-icon" src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div className="install-app-text">
        <h2 id="install-title">Get the app</h2>
        <p className="muted">
          Add FH Language Learning to your home screen. It opens full screen and lessons you have opened work offline.
        </p>
        {mode === 'ios' && showSteps && (
          <ol className="install-steps">
            <li>
              Tap <strong>Share</strong> <ShareIcon /> in Safari's toolbar.
            </li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>.
            </li>
          </ol>
        )}
      </div>
      {mode === 'prompt' ? (
        <button type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
          Install
        </button>
      ) : (
        !showSteps && (
          <button type="button" className="btn btn-primary" onClick={() => setShowSteps(true)}>
            How to install
          </button>
        )
      )}
    </section>
  )
}
