import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Target, Plus, Settings, Calendar } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/planner', label: 'Timeline', icon: Calendar },
  { path: '/goals', label: 'Goals', icon: Target },
]

export function Navbar() {
  const location = useLocation()

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-400 to-emerald-600 
                          flex items-center justify-center shadow-glow group-hover:shadow-glow-lg transition-shadow">
              <Target size={20} className="text-white" />
            </div>
            <span className="font-display font-semibold text-xl tracking-tight">
              <span className="gradient-text">Goal</span>
              <span className="text-white">post</span>
            </span>
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path))
              const Icon = item.icon

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'relative px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors',
                    isActive 
                      ? 'text-white' 
                      : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
                  )}
                >
                  <Icon size={18} />
                  <span className="hidden sm:inline">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className="absolute inset-0 bg-surface-800 rounded-lg -z-10"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link
              to="/goals/new"
              className="btn-primary text-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">New Goal</span>
            </Link>
            <button className="btn-ghost p-2">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar

