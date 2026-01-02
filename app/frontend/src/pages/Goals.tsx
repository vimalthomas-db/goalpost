import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Filter, Target, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { goalsApi } from '../api'
import { GoalCard, CreateGoalModal } from '../components'
import type { GoalStatus } from '../types'

const statusFilters: { value: GoalStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Goals' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ARCHIVED', label: 'Archived' },
]

export function Goals() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showCleanSlateModal, setShowCleanSlateModal] = useState(false)
  const [cleanSlateConfirm, setCleanSlateConfirm] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'ALL'>('ALL')
  const queryClient = useQueryClient()

  const { data: goals, isLoading, error } = useQuery({
    queryKey: ['goals', statusFilter === 'ALL' ? undefined : statusFilter],
    queryFn: () => goalsApi.list(statusFilter === 'ALL' ? undefined : statusFilter),
  })

  const cleanSlateMutation = useMutation({
    mutationFn: goalsApi.deleteAll,
    onSuccess: () => {
      toast.success('Clean slate! All goals have been deleted.')
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setShowCleanSlateModal(false)
      setCleanSlateConfirm('')
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + (error as Error).message)
    },
  })

  // Filter by search query
  const filteredGoals = goals?.filter((goal) =>
    goal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    goal.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    goal.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <motion.h1 
            className="text-3xl font-display font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Goals
          </motion.h1>
          <motion.p 
            className="text-surface-400 mt-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            Track and manage your goals
          </motion.p>
        </div>
        <motion.button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary self-start"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Plus size={18} />
          New Goal
        </motion.button>
      </div>

      {/* Filters */}
      <motion.div
        className="flex flex-col sm:flex-row gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            type="text"
            placeholder="Search goals..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-surface-500" />
          <div className="flex gap-1 bg-surface-800 rounded-lg p-1">
            {statusFilters.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  statusFilter === value
                    ? 'bg-surface-700 text-white'
                    : 'text-surface-400 hover:text-surface-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Goals Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <motion.div
              key="loading"
              className="col-span-full flex items-center justify-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Loader2 size={32} className="animate-spin text-brand-500" />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              className="col-span-full text-center py-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p className="text-red-400 mb-2">Failed to load goals</p>
              <button 
                onClick={() => window.location.reload()}
                className="text-sm text-surface-400 hover:text-brand-400"
              >
                Try again
              </button>
            </motion.div>
          ) : filteredGoals?.length === 0 ? (
            <motion.div
              key="empty"
              className="col-span-full flex flex-col items-center justify-center py-20 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mb-4">
                <Target size={32} className="text-surface-500" />
              </div>
              <h3 className="text-lg font-medium mb-1">No goals found</h3>
              <p className="text-surface-400 text-sm mb-4">
                {searchQuery ? 'Try a different search term' : 'Get started by creating your first goal'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary"
                >
                  <Plus size={18} />
                  Create Goal
                </button>
              )}
            </motion.div>
          ) : (
            filteredGoals?.map((goal, index) => (
              <GoalCard key={goal.goal_id} goal={goal} index={index} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Stats Footer */}
      {filteredGoals && filteredGoals.length > 0 && (
        <motion.div
          className="flex items-center justify-between pt-6 border-t border-surface-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-brand-400">
                {filteredGoals.filter(g => g.status === 'COMPLETED').length}
              </p>
              <p className="text-xs text-surface-500">Completed</p>
            </div>
            <div className="w-px h-10 bg-surface-800" />
            <div className="text-center">
              <p className="text-2xl font-bold">
                {filteredGoals.filter(g => g.status === 'ACTIVE').length}
              </p>
              <p className="text-xs text-surface-500">Active</p>
            </div>
            <div className="w-px h-10 bg-surface-800" />
            <div className="text-center">
              <p className="text-2xl font-bold">
                {Math.round(filteredGoals.reduce((sum, g) => sum + g.progress_percent, 0) / filteredGoals.length)}%
              </p>
              <p className="text-xs text-surface-500">Avg Progress</p>
            </div>
          </div>

          {/* Clean Slate Button */}
          <button
            onClick={() => setShowCleanSlateModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 
                     hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Clean Slate
          </button>
        </motion.div>
      )}

      {/* Create Goal Modal */}
      <CreateGoalModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />

      {/* Clean Slate Confirmation Modal */}
      <AnimatePresence>
        {showCleanSlateModal && (
          <div className="fixed inset-0" style={{ zIndex: 9999 }}>
            <div
              onClick={() => { setShowCleanSlateModal(false); setCleanSlateConfirm(''); }}
              className="absolute inset-0 bg-black bg-opacity-70"
            />
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-gray-900 border border-red-500/30 rounded-2xl shadow-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <AlertTriangle size={24} className="text-red-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-red-400">Clean Slate</h2>
                    <p className="text-sm text-surface-400">This action cannot be undone</p>
                  </div>
                </div>

                <p className="text-surface-300 mb-4">
                  This will permanently delete <strong>all {goals?.length || 0} goals</strong>, 
                  their tasks, and milestones. You'll start fresh with a clean slate.
                </p>

                <div className="mb-4">
                  <label className="text-sm text-surface-400 mb-2 block">
                    Type <span className="font-mono text-red-400">DELETE ALL</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={cleanSlateConfirm}
                    onChange={(e) => setCleanSlateConfirm(e.target.value)}
                    placeholder="DELETE ALL"
                    className="input border-red-500/30 focus:border-red-500"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCleanSlateModal(false); setCleanSlateConfirm(''); }}
                    className="flex-1 px-4 py-2 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => cleanSlateMutation.mutate()}
                    disabled={cleanSlateConfirm !== 'DELETE ALL' || cleanSlateMutation.isPending}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 
                             disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {cleanSlateMutation.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                    Delete Everything
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Goals

