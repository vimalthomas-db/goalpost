import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Target, Calendar, Trash2, Edit2,
  MoreHorizontal, CheckCircle2, Clock,
  TrendingUp, Loader2
} from 'lucide-react'
import { format, parseISO, differenceInWeeks, differenceInDays } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { goalsApi, tasksApi } from '../api'
import { ProgressRing, WeekColumn } from '../components'
import EditGoalModal from '../components/EditGoalModal'
import type { Task } from '../types'

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showMenu, setShowMenu] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data: goal, isLoading, error } = useQuery({
    queryKey: ['goals', goalId],
    queryFn: () => goalsApi.get(goalId!),
    enabled: !!goalId && !isDeleting,  // Don't fetch if deleting
    retry: false,  // Don't retry on 404
  })

  const deleteMutation = useMutation({
    mutationFn: () => goalsApi.delete(goalId!),
    onMutate: () => {
      setIsDeleting(true)  // Stop query from refetching
    },
    onSuccess: () => {
      toast.success('Goal deleted')
      queryClient.removeQueries({ queryKey: ['goals', goalId] })  // Remove from cache
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/goals', { replace: true })
    },
    onError: (error) => {
      setIsDeleting(false)
      toast.error(`Failed to delete: ${error.message}`)
    },
  })

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    if (typeof over.id === 'string' && over.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const taskId = active.id as string
      const newWeekStart = over.id as string
      await tasksApi.move(taskId, newWeekStart)
      queryClient.invalidateQueries({ queryKey: ['goals', goalId] })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={32} className="animate-spin text-brand-500" />
      </div>
    )
  }

  if (error || !goal) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Target size={48} className="text-surface-600 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Goal not found</h2>
        <p className="text-surface-400 mb-4">This goal may have been deleted</p>
        <Link to="/goals" className="btn-primary">
          <ArrowLeft size={18} />
          Back to Goals
        </Link>
      </div>
    )
  }

  const startDate = parseISO(goal.start_date)
  const endDate = parseISO(goal.end_date)
  const totalWeeks = differenceInWeeks(endDate, startDate) + 1
  const daysLeft = differenceInDays(endDate, new Date())
  const totalDays = differenceInDays(endDate, startDate)
  const daysElapsed = totalDays - daysLeft
  const timeProgress = Math.max(0, Math.min(100, (daysElapsed / totalDays) * 100))

  const isOnTrack = goal.progress_percent >= timeProgress - 10
  const isAhead = goal.progress_percent > timeProgress + 10

  // Group tasks by week
  const tasksByWeek: Record<string, Task[]> = {}
  goal.tasks?.forEach((task) => {
    if (!tasksByWeek[task.week_start]) {
      tasksByWeek[task.week_start] = []
    }
    tasksByWeek[task.week_start].push(task)
  })

  const sortedWeeks = Object.keys(tasksByWeek).sort()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Link
          to="/goals"
          className="inline-flex items-center gap-2 text-surface-400 hover:text-surface-200 transition-colors"
        >
          <ArrowLeft size={18} />
          Back to Goals
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${goal.color}20` }}
              >
                <Target size={28} style={{ color: goal.color }} />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold">{goal.title}</h1>
                {goal.description && (
                  <p className="text-surface-400 mt-1">{goal.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-surface-400">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} />
                    {totalWeeks} weeks
                  </span>
                  <span
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      goal.status === 'ACTIVE' && 'bg-brand-500/20 text-brand-400',
                      goal.status === 'COMPLETED' && 'bg-emerald-500/20 text-emerald-400',
                      goal.status === 'PAUSED' && 'bg-amber-500/20 text-amber-400',
                      goal.status === 'ARCHIVED' && 'bg-surface-700 text-surface-400'
                    )}
                  >
                    {goal.status}
                  </span>
                </div>
                {goal.tags && goal.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {goal.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-xs bg-surface-800 text-surface-400 rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="btn-ghost p-2"
              >
                <MoreHorizontal size={20} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface-800 border border-surface-700 
                              rounded-lg shadow-xl z-10 py-1 animate-fade-in">
                  <button 
                    onClick={() => {
                      setShowEditModal(true)
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 
                                   hover:bg-surface-700 transition-colors">
                    <Edit2 size={14} />
                    Edit Goal
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this goal and all its tasks?')) {
                        deleteMutation.mutate()
                      }
                      setShowMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 
                             text-red-400 hover:bg-surface-700 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete Goal
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        <div className="border-t border-surface-800 p-6">
          <div className="grid md:grid-cols-4 gap-6">
            {/* Progress Ring */}
            <div className="flex justify-center md:justify-start">
              <ProgressRing percent={goal.progress_percent} size={120} color={goal.color} />
            </div>

            {/* Stats */}
            <div className="md:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-surface-800/50 rounded-lg">
                <p className="text-3xl font-bold">{goal.current_count}</p>
                <p className="text-xs text-surface-400 mt-1">Completed</p>
              </div>
              <div className="text-center p-4 bg-surface-800/50 rounded-lg">
                <p className="text-3xl font-bold">{goal.target_count}</p>
                <p className="text-xs text-surface-400 mt-1">Target</p>
              </div>
              <div className="text-center p-4 bg-surface-800/50 rounded-lg">
                <p className="text-3xl font-bold">{goal.completed_tasks}</p>
                <p className="text-xs text-surface-400 mt-1">Tasks Done</p>
              </div>
              <div className="text-center p-4 bg-surface-800/50 rounded-lg">
                <p className={clsx(
                  'text-3xl font-bold',
                  daysLeft < 0 && 'text-red-400',
                  daysLeft >= 0 && daysLeft <= 7 && 'text-amber-400'
                )}>
                  {daysLeft >= 0 ? daysLeft : Math.abs(daysLeft)}
                </p>
                <p className="text-xs text-surface-400 mt-1">
                  {daysLeft >= 0 ? 'Days Left' : 'Days Overdue'}
                </p>
              </div>
            </div>
          </div>

          {/* Progress bar with time indicator */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <TrendingUp size={14} className={clsx(
                  isAhead && 'text-brand-400',
                  isOnTrack && !isAhead && 'text-blue-400',
                  !isOnTrack && 'text-amber-400'
                )} />
                <span className={clsx(
                  isAhead && 'text-brand-400',
                  isOnTrack && !isAhead && 'text-blue-400',
                  !isOnTrack && 'text-amber-400'
                )}>
                  {isAhead ? 'Ahead of schedule' : isOnTrack ? 'On track' : 'Behind schedule'}
                </span>
              </span>
              <span className="text-surface-400">{goal.progress_percent.toFixed(1)}% complete</span>
            </div>
            <div className="relative h-3 bg-surface-800 rounded-full overflow-hidden">
              {/* Time progress indicator */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-surface-500 z-10"
                style={{ left: `${timeProgress}%` }}
              />
              {/* Progress bar */}
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: goal.color }}
                initial={{ width: 0 }}
                animate={{ width: `${goal.progress_percent}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
            <div className="flex justify-between text-xs text-surface-500">
              <span>{format(startDate, 'MMM d')}</span>
              <span>Time: {timeProgress.toFixed(0)}%</span>
              <span>{format(endDate, 'MMM d')}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Milestones Roadmap */}
      {goal.milestones && goal.milestones.length > 0 && (
        <motion.div
          className="card p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span>🗺️</span> Roadmap to Success
          </h2>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-surface-700" />
            
            {/* Milestones */}
            <div className="space-y-4">
              {goal.milestones.map((milestone, index) => {
                const isComplete = milestone.progress_percent === 100
                const isActive = !isComplete && index === goal.milestones.findIndex(m => (m.progress_percent || 0) < 100)
                
                return (
                  <div
                    key={milestone.milestone_id}
                    className={clsx(
                      "relative pl-14 py-3 rounded-xl transition-all",
                      isActive && "bg-surface-800/50 border border-surface-700",
                      isComplete && "opacity-60"
                    )}
                  >
                    {/* Timeline dot */}
                    <div
                      className={clsx(
                        "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10",
                        isComplete ? "bg-brand-500 border-brand-500" : 
                        isActive ? "bg-surface-900 border-brand-500" : 
                        "bg-surface-800 border-surface-600"
                      )}
                    >
                      {isComplete && <CheckCircle2 size={12} className="text-white" />}
                      {isActive && <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />}
                    </div>
                    
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className={clsx(
                            "font-semibold",
                            isActive ? "text-white" : "text-surface-300"
                          )}>
                            {milestone.title}
                          </h3>
                          {isActive && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-brand-500/20 text-brand-400 rounded-full">
                              Current Phase
                            </span>
                          )}
                        </div>
                        {milestone.description && (
                          <p className="text-sm text-surface-400 mt-1">{milestone.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                          <span>{milestone.total_tasks || 0} tasks</span>
                          <span>Target: {milestone.target_count} units</span>
                        </div>
                      </div>
                      
                      {/* Progress */}
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold" style={{ color: goal.color }}>
                          {milestone.progress_percent?.toFixed(0) || 0}%
                        </div>
                        <div className="w-20 h-1.5 bg-surface-700 rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${milestone.progress_percent || 0}%`,
                              backgroundColor: goal.color 
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Tasks by Week */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-xl font-semibold mb-4">Weekly Tasks</h2>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
            {sortedWeeks.map((weekStart) => (
              <WeekColumn
                key={weekStart}
                weekStart={weekStart}
                tasks={tasksByWeek[weekStart]}
              />
            ))}
            {sortedWeeks.length === 0 && (
              <div className="flex items-center justify-center w-full py-20 text-surface-500">
                <div className="text-center">
                  <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No tasks generated yet</p>
                </div>
              </div>
            )}
          </div>
        </DndContext>
      </motion.div>

      {/* Edit Goal Modal */}
      <EditGoalModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        goal={goal}
      />
    </div>
  )
}

export default GoalDetail

