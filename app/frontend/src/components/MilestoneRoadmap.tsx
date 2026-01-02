import { motion } from 'framer-motion'
import { Flag, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, isPast } from 'date-fns'
import { useState } from 'react'
import clsx from 'clsx'
import type { Milestone, Task } from '../types'

interface MilestoneRoadmapProps {
  milestones: Milestone[]
  tasks: Task[]
  goalColor: string
}

export function MilestoneRoadmap({ milestones, tasks, goalColor }: MilestoneRoadmapProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    milestones.find(m => !m.completed)?.milestone_id || null
  )

  if (!milestones || milestones.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Flag size={20} style={{ color: goalColor }} />
        Roadmap to Success
      </h3>
      
      <div className="relative">
        {/* Vertical line connecting milestones */}
        <div 
          className="absolute left-[19px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-surface-600 via-surface-700 to-surface-800"
        />
        
        <div className="space-y-4">
          {milestones.map((milestone, index) => {
            const isExpanded = expandedId === milestone.milestone_id
            const milestoneTasks = tasks.filter(t => t.milestone_id === milestone.milestone_id)
            const isCompleted = milestone.completed || (milestone.progress_percent ?? 0) >= 100
            const isPastDue = milestone.due_date && isPast(parseISO(milestone.due_date)) && !isCompleted
            const isCurrent = !isCompleted && index === milestones.findIndex(m => !m.completed && (m.progress_percent ?? 0) < 100)
            
            return (
              <motion.div
                key={milestone.milestone_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className={clsx(
                  "relative",
                  isCurrent && "z-10"
                )}
              >
                {/* Milestone Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : milestone.milestone_id)}
                  className={clsx(
                    "w-full flex items-start gap-4 p-4 rounded-xl transition-all text-left",
                    isCurrent && "bg-gradient-to-r from-surface-800 to-surface-800/50 border-l-4",
                    !isCurrent && "hover:bg-surface-800/50",
                    isCompleted && "opacity-75"
                  )}
                  style={isCurrent ? { borderColor: goalColor } : {}}
                >
                  {/* Status Icon */}
                  <div className="relative z-10 shrink-0">
                    {isCompleted ? (
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: goalColor }}
                      >
                        <CheckCircle2 size={20} className="text-white" />
                      </div>
                    ) : (
                      <div 
                        className={clsx(
                          "w-10 h-10 rounded-full border-2 flex items-center justify-center bg-surface-900",
                          isCurrent ? "border-current" : "border-surface-600"
                        )}
                        style={isCurrent ? { borderColor: goalColor } : {}}
                      >
                        <span className="text-sm font-bold" style={isCurrent ? { color: goalColor } : {}}>
                          {index + 1}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={clsx(
                        "font-semibold",
                        isCompleted && "line-through text-surface-400"
                      )}>
                        {milestone.title}
                      </h4>
                      {isCurrent && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{ backgroundColor: `${goalColor}20`, color: goalColor }}>
                          Current Phase
                        </span>
                      )}
                      {isPastDue && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/20 text-red-400">
                          Overdue
                        </span>
                      )}
                    </div>
                    
                    {milestone.description && (
                      <p className="text-sm text-surface-400 mt-1 line-clamp-2">
                        {milestone.description.split('\n')[0]}
                      </p>
                    )}
                    
                    {/* Progress & Stats */}
                    <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                      {milestone.due_date && (
                        <span>Due: {format(parseISO(milestone.due_date), 'MMM d')}</span>
                      )}
                      <span>
                        {milestone.completed_tasks || 0}/{milestone.total_tasks || 0} tasks
                      </span>
                      {(milestone.progress_percent ?? 0) > 0 && (
                        <span style={{ color: goalColor }}>
                          {(milestone.progress_percent ?? 0).toFixed(0)}% complete
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {(milestone.total_tasks ?? 0) > 0 && (
                      <div className="mt-2 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: goalColor }}
                          initial={{ width: 0 }}
                          animate={{ width: `${milestone.progress_percent ?? 0}%` }}
                          transition={{ duration: 0.5, delay: index * 0.1 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Expand Button */}
                  <div className="shrink-0 text-surface-500">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="ml-14 mt-2 p-4 bg-surface-800/50 rounded-lg border border-surface-700"
                  >
                    {/* Full Description */}
                    {milestone.description && (
                      <div className="mb-4">
                        <h5 className="text-sm font-medium text-surface-300 mb-1">About This Phase</h5>
                        <p className="text-sm text-surface-400 whitespace-pre-wrap">
                          {milestone.description}
                        </p>
                      </div>
                    )}

                    {/* Tasks in this milestone */}
                    {milestoneTasks.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-surface-300 mb-2">
                          Tasks ({milestoneTasks.filter(t => t.status === 'DONE').length}/{milestoneTasks.length} done)
                        </h5>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {milestoneTasks.map(task => (
                            <div 
                              key={task.task_id}
                              className={clsx(
                                "flex items-center gap-2 p-2 rounded-lg text-sm",
                                task.status === 'DONE' ? 'bg-green-900/20 text-green-400' :
                                task.status === 'IN_PROGRESS' ? 'bg-blue-900/20 text-blue-400' :
                                'bg-surface-700/50 text-surface-300'
                              )}
                            >
                              {task.status === 'DONE' ? (
                                <CheckCircle2 size={14} />
                              ) : (
                                <Circle size={14} />
                              )}
                              <span className={task.status === 'DONE' ? 'line-through' : ''}>
                                {task.title}
                              </span>
                              <span className="ml-auto text-xs text-surface-500">
                                {task.year_week}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {milestoneTasks.length === 0 && (
                      <p className="text-sm text-surface-500 italic">No tasks in this phase yet.</p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MilestoneRoadmap

