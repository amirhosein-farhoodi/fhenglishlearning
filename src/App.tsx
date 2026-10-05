import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import Header from './components/Header'
import Home from './pages/Home'
import Course from './pages/Course'
import Lesson from './pages/Lesson'
import Quiz from './pages/Quiz'
import Review from './pages/Review'
// The mock test is a separate, heavier area - load it only when someone opens it.
const MockLobby = lazy(() => import('./pages/MockLobby'))
const MockExam = lazy(() => import('./pages/MockExam'))
const MockResult = lazy(() => import('./pages/MockResult'))

const loading = (
  <main className="page">
    <div className="container center">
      <div className="spinner" />
    </div>
  </main>
)

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  const { pathname } = useLocation()
  // The quiz and the mock exam are full-screen: the exam brings its own top bar.
  const inQuiz = /\/quiz$/.test(pathname) || pathname === '/ielts-mock/exam'
  // Lesson, quiz and answer key (/learn/<slug>/<unit>...) read on a narrower
  // measure; the class puts the header and fixed bars on that same column edge.
  const reading = /^\/learn\/[^/]+\/[^/]+/.test(pathname)
  return (
    <div className={`app${reading ? ' reading' : ''}`}>
      <ScrollToTop />
      {!inQuiz && <Header />}
      <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/learn/:slug" element={<Course />} />
        <Route path="/learn/:slug/:unit" element={<Lesson />} />
        <Route path="/learn/:slug/:unit/quiz" element={<Quiz />} />
        <Route path="/learn/:slug/:unit/answers" element={<Review />} />
        <Route path="/ielts-mock" element={<MockLobby />} />
        <Route path="/ielts-mock/exam" element={<MockExam />} />
        <Route path="/ielts-mock/result/:id" element={<MockResult />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </div>
  )
}
