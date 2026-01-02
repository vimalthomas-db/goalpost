import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core'
import { motion } from 'framer-motion'
import { 
  Target, TrendingUp, AlertTriangle, CheckCircle2, 
  ArrowRight, Plus, Sparkles 
} from 'lucide-react'
import { format, startOfWeek, addWeeks } from 'date-fns'
import { Link } from 'react-router-dom'
import { dashboardApi, tasksApi } from '../api'
import { ProgressRing, WeekColumn, GoalCard, CreateGoalModal } from '../components'
import SmartRebalance from '../components/SmartRebalance'
import type { Task } from '../types'

export function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardApi.get,
  })

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || active.id === over.id) return

    // If dropping on a week column
    if (typeof over.id === 'string' && over.id.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const taskId = active.id as string
      const newWeekStart = over.id as string
      
      await tasksApi.move(taskId, newWeekStart)
    }
  }

  // Generate week columns
  const today = new Date()
  const currentWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const nextWeekStart = format(addWeeks(startOfWeek(today, { weekStartsOn: 1 }), 1), 'yyyy-MM-dd')

  // Group tasks by week
  const tasksByWeek: Record<string, Task[]> = {}
  tasksByWeek[currentWeekStart] = dashboard?.current_week || []
  tasksByWeek[nextWeekStart] = dashboard?.upcoming_week || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    )
  }

  const stats = dashboard?.stats

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <motion.h1 
            className="text-3xl font-display font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Welcome back <span className="gradient-text">👋</span>
          </motion.h1>
          <motion.p 
            className="text-surface-400 mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {format(today, 'EEEE, MMMM d, yyyy')}
          </motion.p>
        </div>
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <SmartRebalance />
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            <Plus size={18} />
            New Goal
          </button>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-lg bg-brand-500/20">
              <Target size={20} className="text-brand-400" />
            </div>
            <span className="text-surface-400 text-sm">Active Goals</span>
          </div>
          <p className="text-3xl font-bold">{stats?.active_goals || 0}</p>
        </motion.div>

        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-lg bg-blue-500/20">
              <TrendingUp size={20} className="text-blue-400" />
            </div>
            <span className="text-surface-400 text-sm">Completion Rate</span>
          </div>
          <p className="text-3xl font-bold">{stats?.completion_percent?.toFixed(0) || 0}%</p>
        </motion.div>

        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/20">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <span className="text-surface-400 text-sm">Tasks Completed</span>
          </div>
          <p className="text-3xl font-bold">
            {stats?.completed_tasks || 0}
            <span className="text-lg text-surface-500 font-normal">/{stats?.total_tasks || 0}</span>
          </p>
        </motion.div>

        <motion.div
          className="card p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-lg bg-amber-500/20">
              <AlertTriangle size={20} className="text-amber-400" />
            </div>
            <span className="text-surface-400 text-sm">Overdue</span>
          </div>
          <p className="text-3xl font-bold text-amber-400">{stats?.overdue_tasks || 0}</p>
        </motion.div>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Weekly View - Takes 2 columns */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles size={20} className="text-brand-400" />
              Weekly Planner
            </h2>
            <Link to="/planner" className="text-sm text-surface-400 hover:text-brand-400 flex items-center gap-1">
              View all weeks <ArrowRight size={14} />
            </Link>
          </div>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
              <WeekColumn
                weekStart={currentWeekStart}
                tasks={tasksByWeek[currentWeekStart] || []}
                title="This Week"
              />
              <WeekColumn
                weekStart={nextWeekStart}
                tasks={tasksByWeek[nextWeekStart] || []}
                title="Next Week"
              />
            </div>
          </DndContext>
        </motion.div>

        {/* Sidebar - Progress & Goals */}
        <motion.div
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          {/* Overall Progress */}
          <div className="card p-6">
            <h3 className="font-semibold mb-4">Overall Progress</h3>
            <div className="flex justify-center">
              <ProgressRing percent={stats?.completion_percent || 0} size={140} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-brand-400">{stats?.completed_tasks || 0}</p>
                <p className="text-xs text-surface-400">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats?.total_tasks || 0) - (stats?.completed_tasks || 0)}</p>
                <p className="text-xs text-surface-400">Remaining</p>
              </div>
            </div>
          </div>

          {/* Recent Goals */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-surface-800">
              <h3 className="font-semibold">Active Goals</h3>
              <Link to="/goals" className="text-xs text-surface-400 hover:text-brand-400">
                View all
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {dashboard?.recent_goals?.length ? (
                dashboard.recent_goals.slice(0, 3).map((goal, index) => (
                  <GoalCard key={goal.goal_id} goal={goal} index={index} />
                ))
              ) : (
                <div className="text-center py-8 text-surface-500">
                  <Target size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No active goals</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-2 text-sm text-brand-400 hover:underline"
                  >
                    Create your first goal
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Overdue Warning */}
          {dashboard?.overdue && dashboard.overdue.length > 0 && (
            <div className="card border-amber-500/30 bg-amber-500/5">
              <div className="p-4">
                <div className="flex items-center gap-2 text-amber-400 mb-3">
                  <AlertTriangle size={18} />
                  <h3 className="font-semibold">Overdue Tasks</h3>
                </div>
                <div className="space-y-2">
                  {dashboard.overdue.slice(0, 3).map((task) => (
                    <div
                      key={task.task_id}
                      className="flex items-center justify-between p-2 bg-surface-900/50 rounded-lg"
                    >
                      <span className="text-sm truncate">{task.title}</span>
                      <span className="text-xs text-amber-400">
                        {format(new Date(task.week_end), 'MMM d')}
                      </span>
                    </div>
                  ))}
                </div>
                {dashboard.overdue.length > 3 && (
                  <Link
                    to="/dashboard/overdue"
                    className="block text-center text-sm text-amber-400 hover:underline mt-3"
                  >
                    +{dashboard.overdue.length - 3} more
                  </Link>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Create Goal Modal */}
      <CreateGoalModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}

export default Dashboard

