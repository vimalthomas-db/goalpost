import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { motion } from 'framer-motion'
import { format, parseISO, isThisWeek, isBefore, startOfWeek } from 'date-fns'
import clsx from 'clsx'
import type { Task } from '../types'
import { SortableTaskCard } from './SortableTaskCard'

interface WeekColumnProps {
  weekStart: string
  tasks: Task[]
  title?: string
}

export function WeekColumn({ weekStart, tasks, title }: WeekColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: weekStart,
  })

  const weekDate = parseISO(weekStart)
  const isCurrentWeek = isThisWeek(weekDate, { weekStartsOn: 1 })
  const isPast = isBefore(weekDate, startOfWeek(new Date(), { weekStartsOn: 1 }))

  const completedCount = tasks.filter(t => t.status === 'DONE').length
  const totalTarget = tasks.reduce((sum, t) => sum + t.target_count, 0)
  const totalCompleted = tasks.reduce((sum, t) => sum + t.completed_count, 0)
  const progressPercent = totalTarget > 0 ? (totalCompleted / totalTarget) * 100 : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'flex flex-col min-w-[280px] max-w-[320px] rounded-xl border transition-all duration-200',
        isCurrentWeek 
          ? 'bg-surface-900/80 border-brand-500/50 shadow-glow' 
          : 'bg-surface-900/50 border-surface-800',
        isOver && 'border-brand-400 bg-brand-500/5',
        isPast && !isCurrentWeek && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className={clsx(
        'p-4 border-b',
        isCurrentWeek ? 'border-brand-500/30' : 'border-surface-800'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className={clsx(
              'font-semibold',
              isCurrentWeek && 'text-brand-400'
            )}>
              {title || format(weekDate, 'MMM d')}
            </h3>
            <p className="text-xs text-surface-500">
              {format(weekDate, 'yyyy')} • Week {format(weekDate, 'w')}
            </p>
          </div>
          {isCurrentWeek && (
            <span className="px-2 py-0.5 text-xs font-medium bg-brand-500/20 text-brand-400 rounded-full">
              This Week
            </span>
          )}
        </div>

        {/* Week progress */}
        <div className="flex items-center gap-2 text-xs text-surface-400">
          <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
            <motion.div
              className={clsx(
                'h-full rounded-full',
                isCurrentWeek ? 'bg-brand-500' : 'bg-surface-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span>{completedCount}/{tasks.length}</span>
        </div>
      </div>

      {/* Tasks */}
      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 p-3 space-y-2 min-h-[200px] overflow-y-auto',
          isOver && 'bg-brand-500/5'
        )}
      >
        <SortableContext
          items={tasks.map(t => t.task_id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.task_id} task={task} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-surface-500 text-sm">
            No tasks this week
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default WeekColumn

