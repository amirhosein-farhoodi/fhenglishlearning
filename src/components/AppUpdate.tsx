import { applyUpdate, useUpdateReady } from '../lib/pwa'

/** Small bar shown when a new deploy has been downloaded. Reloading is the learner's call. */
export default function AppUpdate() {
  const ready = useUpdateReady()
  if (!ready) return null
  return (
    <div className="app-update" role="status">
      <span>A new version of the app is ready.</span>
      <button type="button" className="btn btn-dark btn-sm" onClick={applyUpdate}>
        Reload
      </button>
    </div>
  )
}
