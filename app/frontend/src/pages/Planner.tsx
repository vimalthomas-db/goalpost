import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  ChevronLeft, ChevronRight, Layers, CheckCircle2, Clock,
  CalendarDays, CalendarRange, CalendarClock
} from 'lucide-react'
import { 
  format, startOfWeek, addWeeks, subWeeks, 
  startOfMonth, endOfMonth, eachWeekOfInterval,
  startOfYear, endOfYear, isSameWeek,
  addMonths, addYears, parseISO
} from 'date-fns'
import { Link } from 'react-router-dom'
import { tasksApi, goalsApi } from '../api'
import type { Task } from '../types'

type ViewMode = 'week' | 'month' | 'year'

interface WeekData {
  weekStart: Date
  weekEnd: Date
  tasks: Task[]
  totalTarget: number
  completed: number
  isCurrentWeek: boolean
  isPast: boolean
}

export function Planner() {
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [focusDate, setFocusDate] = useState(new Date())
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch all tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => tasksApi.list(),
  })

  // Fetch all goals
  const { data: goals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.list(),
  })

  const isLoading = tasksLoading || goalsLoading

  // Filter tasks by selected goal
  const filteredTasks = selectedGoal 
    ? tasks.filter(t => t.goal_id === selectedGoal)
    : tasks

  // Generate weeks based on view mode
  const getWeeksForView = (): WeekData[] => {
    const today = new Date()
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
    
    let start: Date
    let end: Date
    
    switch (viewMode) {
      case 'week':
        // Show 4 weeks centered on focus
        start = subWeeks(startOfWeek(focusDate, { weekStartsOn: 1 }), 1)
        end = addWeeks(start, 3)
        break
      case 'month':
        // Show all weeks in focus month
        start = startOfWeek(startOfMonth(focusDate), { weekStartsOn: 1 })
        end = endOfMonth(focusDate)
        break
      case 'year':
        // Show all weeks in focus year
        start = startOfWeek(startOfYear(focusDate), { weekStartsOn: 1 })
        end = endOfYear(focusDate)
        break
    }
    
    const weekStarts = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
    
    return weekStarts.map(weekStart => {
      const weekEnd = addWeeks(weekStart, 1)
      const weekTasks = filteredTasks.filter(task => {
        const taskWeekStart = parseISO(task.week_start)
        return isSameWeek(taskWeekStart, weekStart, { weekStartsOn: 1 })
      })
      
      return {
        weekStart,
        weekEnd,
        tasks: weekTasks,
        totalTarget: weekTasks.reduce((sum, t) => sum + t.target_count, 0),
        completed: weekTasks.reduce((sum, t) => sum + t.completed_count, 0),
        isCurrentWeek: isSameWeek(weekStart, currentWeekStart, { weekStartsOn: 1 }),
        isPast: weekEnd < today && !isSameWeek(weekStart, currentWeekStart, { weekStartsOn: 1 })
      }
    })
  }

  const weeks = getWeeksForView()

  // Navigation
  const navigate = (direction: 'prev' | 'next') => {
    const delta = direction === 'prev' ? -1 : 1
    switch (viewMode) {
      case 'week':
        setFocusDate(addWeeks(focusDate, delta * 4))
        break
      case 'month':
        setFocusDate(addMonths(focusDate, delta))
        break
      case 'year':
        setFocusDate(addYears(focusDate, delta))
        break
    }
  }

  const goToToday = () => setFocusDate(new Date())

  // Scroll to current week on mount
  useEffect(() => {
    if (scrollRef.current && !isLoading) {
      const currentWeekEl = scrollRef.current.querySelector('[data-current="true"]')
      if (currentWeekEl) {
        currentWeekEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }
    }
  }, [isLoading, viewMode])

  // Get title for current view
  const getViewTitle = () => {
    switch (viewMode) {
      case 'week':
        return `${format(weeks[0]?.weekStart || focusDate, 'MMM d')} - ${format(weeks[weeks.length - 1]?.weekEnd || focusDate, 'MMM d, yyyy')}`
      case 'month':
        return format(focusDate, 'MMMM yyyy')
      case 'year':
        return format(focusDate, 'yyyy')
    }
  }

  // Calculate cell width based on view mode
  const getCellWidth = () => {
    switch (viewMode) {
      case 'week': return 'min-w-[200px]'
      case 'month': return 'min-w-[120px]'
      case 'year': return 'min-w-[24px]'
    }
  }

  // Get color intensity based on task density
  const getIntensity = (week: WeekData) => {
    if (week.tasks.length === 0) return 'bg-surface-800/30'
    
    const completionRate = week.totalTarget > 0 ? week.completed / week.totalTarget : 0
    
    if (week.isPast) {
      // Past weeks: red to green based on completion
      if (completionRate >= 0.9) return 'bg-emerald-500/40 border-emerald-500/50'
      if (completionRate >= 0.7) return 'bg-emerald-500/25 border-emerald-500/30'
      if (completionRate >= 0.5) return 'bg-amber-500/30 border-amber-500/40'
      return 'bg-red-500/30 border-red-500/40'
    }
    
    // Future/current: blue intensity based on task count
    const intensity = Math.min(week.tasks.length / 3, 1)
    if (intensity > 0.7) return 'bg-brand-500/50 border-brand-500/60'
    if (intensity > 0.4) return 'bg-brand-500/30 border-brand-500/40'
    return 'bg-brand-500/15 border-brand-500/25'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 h-full">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <motion.h1 
            className="text-3xl font-display font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Timeline Planner
          </motion.h1>
          <motion.p 
            className="text-surface-400 mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Visualize your goals across time
          </motion.p>
        </div>

        {/* View Mode Toggle */}
        <motion.div 
          className="flex items-center gap-2 bg-surface-800 p-1 rounded-xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {[
            { mode: 'week' as ViewMode, icon: CalendarDays, label: 'Week' },
            { mode: 'month' as ViewMode, icon: CalendarRange, label: 'Month' },
            { mode: 'year' as ViewMode, icon: CalendarClock, label: 'Year' },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                viewMode === mode 
                  ? 'bg-brand-500 text-white shadow-lg' 
                  : 'text-surface-400 hover:text-white hover:bg-surface-700'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </motion.div>
      </div>

      {/* Navigation Bar */}
      <motion.div 
        className="flex items-center justify-between bg-surface-800/50 backdrop-blur-sm rounded-xl p-3 sticky top-0 z-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate('prev')}
            className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
          >
            Today
          </button>
          <button 
            onClick={() => navigate('next')}
            className="p-2 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <h2 className="text-xl font-semibold">{getViewTitle()}</h2>

        {/* Goal Filter */}
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-surface-400" />
          <select
            value={selectedGoal || ''}
            onChange={(e) => setSelectedGoal(e.target.value || null)}
            className="bg-surface-700 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Goals</option>
            {goals.map(goal => (
              <option key={goal.goal_id} value={goal.goal_id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* Timeline Grid */}
      <motion.div 
        ref={scrollRef}
        className="overflow-x-auto pb-4 -mx-4 px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className={`flex gap-2 ${viewMode === 'year' ? 'gap-0.5' : 'gap-2'}`}>
          {weeks.map((week, idx) => (
            <motion.div
              key={week.weekStart.toISOString()}
              data-current={week.isCurrentWeek}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              className={`
                ${getCellWidth()} flex-shrink-0
                ${week.isCurrentWeek ? 'ring-2 ring-brand-400 ring-offset-2 ring-offset-surface-900' : ''}
              `}
            >
              {viewMode === 'year' ? (
                // Compact year view - heat map style
                <Link to={`/planner?date=${format(week.weekStart, 'yyyy-MM-dd')}&view=week`}>
                  <div 
                    className={`
                      h-8 rounded-sm cursor-pointer transition-all hover:scale-110 hover:z-10
                      border ${getIntensity(week)}
                    `}
                    title={`${format(week.weekStart, 'MMM d')} - ${week.tasks.length} tasks`}
                  />
                </Link>
              ) : (
                // Week/Month view - detailed cards
                <div 
                  className={`
                    card p-3 h-full border transition-all hover:border-brand-500/50
                    ${week.isCurrentWeek ? 'border-brand-500' : ''}
                    ${week.isPast ? 'opacity-75' : ''}
                  `}
                >
                  {/* Week Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs text-surface-400">
                        {format(week.weekStart, 'MMM')}
                      </p>
                      <p className="text-lg font-bold">
                        {format(week.weekStart, 'd')}
                        <span className="text-xs text-surface-500 ml-1">
                          - {format(addWeeks(week.weekStart, 1), 'd')}
                        </span>
                      </p>
                    </div>
                    {week.isCurrentWeek && (
                      <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full">
                        Now
                      </span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {week.totalTarget > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-surface-400">{week.completed}/{week.totalTarget}</span>
                        <span className={week.completed >= week.totalTarget ? 'text-emerald-400' : 'text-surface-400'}>
                          {Math.round((week.completed / week.totalTarget) * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            week.isPast && week.completed < week.totalTarget 
                              ? 'bg-red-500' 
                              : week.completed >= week.totalTarget 
                                ? 'bg-emerald-500' 
                                : 'bg-brand-500'
                          }`}
                          style={{ width: `${Math.min(100, (week.completed / week.totalTarget) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Task List */}
                  <div className="space-y-1.5">
                    {week.tasks.slice(0, viewMode === 'week' ? 5 : 3).map(task => (
                      <Link
                        key={task.task_id}
                        to={`/goals/${task.goal_id}`}
                        className="block p-2 bg-surface-800/50 hover:bg-surface-700/50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {task.status === 'DONE' ? (
                            <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                          ) : (
                            <Clock size={12} className="text-surface-500 flex-shrink-0" />
                          )}
                          <span className="text-xs truncate">{task.title}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-surface-500 truncate max-w-[80px]">
                            {goals.find(g => g.goal_id === task.goal_id)?.title || ''}
                          </span>
                          <span className="text-[10px] text-surface-400">
                            {task.completed_count}/{task.target_count}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {week.tasks.length > (viewMode === 'week' ? 5 : 3) && (
                      <p className="text-xs text-surface-500 text-center py-1">
                        +{week.tasks.length - (viewMode === 'week' ? 5 : 3)} more
                      </p>
                    )}
                    {week.tasks.length === 0 && (
                      <p className="text-xs text-surface-600 text-center py-4">
                        No tasks
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Year View Legend */}
      {viewMode === 'year' && (
        <motion.div 
          className="flex items-center justify-center gap-6 text-xs text-surface-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-surface-800/30 border border-surface-700" />
            <span>No tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-brand-500/30 border border-brand-500/40" />
            <span>Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500/40 border border-emerald-500/50" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500/30 border border-red-500/40" />
            <span>Missed</span>
          </div>
        </motion.div>
      )}

      {/* Summary Stats */}
      <motion.div 
        className="grid grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-brand-400">{weeks.length}</p>
          <p className="text-xs text-surface-500">Weeks Shown</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold">{filteredTasks.length}</p>
          <p className="text-xs text-surface-500">Total Tasks</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-emerald-400">
            {filteredTasks.filter(t => t.status === 'DONE').length}
          </p>
          <p className="text-xs text-surface-500">Completed</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">
            {filteredTasks.reduce((sum, t) => sum + t.target_count - t.completed_count, 0)}
          </p>
          <p className="text-xs text-surface-500">Remaining Units</p>
        </div>
      </motion.div>
    </div>
  )
}

export default Planner

