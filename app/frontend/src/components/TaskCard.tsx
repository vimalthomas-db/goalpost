import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, MoreHorizontal, GripVertical, AlertCircle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import type { Task } from '../types'
import { tasksApi } from '../api'

interface TaskCardProps {
  task: Task
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
}

const statusStyles: Record<string, string> = {
  NEW: 'badge-new',
  IN_PROGRESS: 'badge-progress',
  DONE: 'badge-done',
  BLOCKED: 'badge-blocked',
  ROLLED_OVER: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  CANCELLED: 'bg-surface-700 text-surface-400',
}

const priorityColors: Record<number, string> = {
  1: 'border-l-red-500',
  2: 'border-l-orange-500',
  3: 'border-l-blue-500',
  4: 'border-l-surface-500',
  5: 'border-l-surface-600',
}

export function TaskCard({ task, isDragging, dragHandleProps }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const queryClient = useQueryClient()

  const completeMutation = useMutation({
    mutationFn: () => tasksApi.complete(task.task_id),
    onSuccess: () => {
      toast.success('Task completed!')
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => tasksApi.update(task.task_id, { status: status as Task['status'] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const progressPercent = task.target_count > 0 
    ? (task.completed_count / task.target_count) * 100 
    : 0

  const isOverdue = new Date(task.week_end) < new Date() && task.status !== 'DONE'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={clsx(
        'group relative bg-surface-800/80 rounded-lg border-l-4 overflow-hidden',
        'hover:bg-surface-800 transition-all duration-200',
        priorityColors[task.priority] || priorityColors[3],
        isDragging && 'shadow-2xl ring-2 ring-brand-500/50 rotate-2',
        task.status === 'DONE' && 'opacity-60'
      )}
      style={{
        borderColor: task.goal_color ? undefined : undefined,
      }}
    >
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100 
                   cursor-grab active:cursor-grabbing text-surface-500 hover:text-surface-300 transition-opacity"
      >
        <GripVertical size={14} />
      </div>

      <div className="p-3 pl-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h4 className={clsx(
              'font-medium text-sm truncate',
              task.status === 'DONE' && 'line-through text-surface-400'
            )}>
              {task.title}
            </h4>
            {task.goal_title && (
              <p className="text-xs text-surface-500 truncate mt-0.5">
                <span 
                  className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: task.goal_color || '#3B82F6' }}
                />
                {task.goal_title}
              </p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-1">
            {isOverdue && (
              <AlertCircle size={14} className="text-red-400" />
            )}
            {task.status !== 'DONE' && (
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-brand-400 transition-colors"
                title="Mark complete"
              >
                <Check size={14} />
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
              >
                <MoreHorizontal size={14} />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-surface-800 border border-surface-700 
                              rounded-lg shadow-xl z-10 py-1 animate-fade-in">
                  {task.status !== 'IN_PROGRESS' && (
                    <button
                      onClick={() => {
                        updateStatusMutation.mutate('IN_PROGRESS')
                        setShowMenu(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-700 transition-colors"
                    >
                      Start working
                    </button>
                  )}
                  {task.status !== 'BLOCKED' && (
                    <button
                      onClick={() => {
                        updateStatusMutation.mutate('BLOCKED')
                        setShowMenu(false)
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs hover:bg-surface-700 transition-colors text-red-400"
                    >
                      Mark blocked
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-surface-400 mb-1">
            <span>{task.completed_count} / {task.target_count}</span>
            <span className={statusStyles[task.status]}>{task.status.replace('_', ' ')}</span>
          </div>
          <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: task.goal_color || '#22c55e' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Notes preview */}
        {task.notes && (
          <p className="text-xs text-surface-500 truncate">
            📝 {task.notes}
          </p>
        )}
      </div>
    </motion.div>
  )
}

export default TaskCard

