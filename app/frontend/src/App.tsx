import { Routes, Route, Navigate } from 'react-router-dom'
import { Navbar } from './components'
import { Dashboard, Goals, GoalDetail, Planner } from './pages'

function App() {
  return (
    <div className="min-h-screen bg-surface-950">
      {/* Background gradient */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-surface-900/0 via-surface-950 to-surface-950" />
      </div>

      {/* Navigation */}
      <Navbar />

      {/* Main content */}
      <main className="pt-20 pb-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/goals/new" element={<Goals />} />
          <Route path="/goals/:goalId" element={<GoalDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

