import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Header from './components/Header'
import Home from './pages/Home'
import Course from './pages/Course'
import Lesson from './pages/Lesson'
import Quiz from './pages/Quiz'
import Review from './pages/Review'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

export default function App() {
  const { pathname } = useLocation()
  const inQuiz = /\/quiz$/.test(pathname)
  return (
    <div className="app">
      <ScrollToTop />
      {!inQuiz && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/learn/:slug" element={<Course />} />
        <Route path="/learn/:slug/:unit" element={<Lesson />} />
        <Route path="/learn/:slug/:unit/quiz" element={<Quiz />} />
        <Route path="/learn/:slug/:unit/answers" element={<Review />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
