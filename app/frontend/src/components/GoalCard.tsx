import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Target, Calendar, ArrowRight } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import clsx from 'clsx'
import type { Goal } from '../types'

interface GoalCardProps {
  goal: Goal
  index?: number
}

export function GoalCard({ goal, index = 0 }: GoalCardProps) {
  const startDate = parseISO(goal.start_date)
  const endDate = parseISO(goal.end_date)
  const daysLeft = differenceInDays(endDate, new Date())
  const totalDays = differenceInDays(endDate, startDate)
  const daysElapsed = totalDays - daysLeft
  const timeProgress = Math.max(0, Math.min(100, (daysElapsed / totalDays) * 100))

  const isOnTrack = goal.progress_percent >= timeProgress - 10
  const isAhead = goal.progress_percent > timeProgress + 10

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Link
        to={`/goals/${goal.goal_id}`}
        className="block card-hover group"
      >
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${goal.color}20` }}
              >
                <Target size={20} style={{ color: goal.color }} />
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-brand-400 transition-colors">
                  {goal.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-surface-400">
                  <Calendar size={12} />
                  <span>
                    {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>
            <ArrowRight 
              size={18} 
              className="text-surface-500 group-hover:text-brand-400 group-hover:translate-x-1 transition-all" 
            />
          </div>

          {/* Progress section */}
          <div className="space-y-3">
            {/* Count progress */}
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-surface-300">
                  {goal.current_count} / {goal.target_count}
                </span>
                <span 
                  className={clsx(
                    'font-medium',
                    isAhead && 'text-brand-400',
                    isOnTrack && !isAhead && 'text-blue-400',
                    !isOnTrack && 'text-amber-400'
                  )}
                >
                  {goal.progress_percent.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: goal.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${goal.progress_percent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Time progress (subtle indicator) */}
            <div className="flex items-center gap-2 text-xs text-surface-500">
              <div className="flex-1 h-1 bg-surface-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-surface-600 rounded-full"
                  style={{ width: `${timeProgress}%` }}
                />
              </div>
              <span>
                {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today' : 'Overdue'}
              </span>
            </div>
          </div>

          {/* Tags */}
          {goal.tags && goal.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {goal.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-surface-800 text-surface-400 rounded-md"
                >
                  #{tag}
                </span>
              ))}
              {goal.tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs text-surface-500">
                  +{goal.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Status indicator */}
          {goal.status !== 'ACTIVE' && (
            <div className={clsx(
              'mt-3 inline-flex items-center px-2 py-1 rounded text-xs font-medium',
              goal.status === 'COMPLETED' && 'bg-brand-500/20 text-brand-400',
              goal.status === 'PAUSED' && 'bg-amber-500/20 text-amber-400',
              goal.status === 'ARCHIVED' && 'bg-surface-700 text-surface-400'
            )}>
              {goal.status}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}

export default GoalCard

