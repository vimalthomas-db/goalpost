import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Target, Palette, Save, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { goalsApi } from '../api'
import type { GoalWithTasks, GoalStatus } from '../types'

interface EditGoalModalProps {
  isOpen: boolean
  onClose: () => void
  goal: GoalWithTasks
}

const colorOptions = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

const statusOptions: GoalStatus[] = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']

export function EditGoalModal({ isOpen, onClose, goal }: EditGoalModalProps) {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    title: goal.title,
    description: goal.description || '',
    target_count: goal.target_count,
    priority: goal.priority,
    color: goal.color,
    status: goal.status,
  })

  // Reset form when goal changes
  useEffect(() => {
    setFormData({
      title: goal.title,
      description: goal.description || '',
      target_count: goal.target_count,
      priority: goal.priority,
      color: goal.color,
      status: goal.status,
    })
  }, [goal])

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<typeof formData>) => goalsApi.update(goal.goal_id, updates),
    onSuccess: () => {
      toast.success('Goal updated!')
      queryClient.invalidateQueries({ queryKey: ['goals', goal.goal_id] })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (error) => {
      toast.error('Failed to update: ' + (error as Error).message)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Only send changed fields
    const updates: Record<string, unknown> = {}
    if (formData.title !== goal.title) updates.title = formData.title
    if (formData.description !== (goal.description || '')) updates.description = formData.description
    if (formData.target_count !== goal.target_count) updates.target_count = formData.target_count
    if (formData.priority !== goal.priority) updates.priority = formData.priority
    if (formData.color !== goal.color) updates.color = formData.color
    if (formData.status !== goal.status) updates.status = formData.status
    
    if (Object.keys(updates).length === 0) {
      toast.error('No changes to save')
      return
    }
    
    updateMutation.mutate(updates)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          {/* Backdrop */}
          <div onClick={onClose} className="absolute inset-0 bg-black bg-opacity-70" />

          {/* Modal */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg max-h-[90vh] overflow-auto bg-gray-900 
                       border border-gray-700 rounded-2xl shadow-2xl"
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b 
                            border-gray-700 bg-gray-900">
                <div className="flex items-center gap-3">
                  <div
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: `${formData.color}20` }}
                  >
                    <Target size={24} style={{ color: formData.color }} />
                  </div>
                  <h2 className="text-xl font-bold text-white">Edit Goal</h2>
                </div>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl 
                             text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl 
                             text-white focus:outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                {/* Target Count & Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Target Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.target_count}
                      onChange={(e) => setFormData({ ...formData, target_count: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl 
                               text-white focus:outline-none focus:border-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Priority (1=High, 5=Low)
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                      className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl 
                               text-white focus:outline-none focus:border-purple-500"
                    >
                      {[1, 2, 3, 4, 5].map((p) => (
                        <option key={p} value={p}>
                          {p} - {p === 1 ? 'Highest' : p === 5 ? 'Lowest' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Status
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setFormData({ ...formData, status })}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          formData.status === status
                            ? status === 'ACTIVE' ? 'bg-green-600 text-white' :
                              status === 'PAUSED' ? 'bg-amber-600 text-white' :
                              status === 'COMPLETED' ? 'bg-blue-600 text-white' :
                              'bg-gray-600 text-white'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    <Palette size={14} className="inline mr-1" />
                    Color
                  </label>
                  <div className="flex gap-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-lg transition-all ${
                          formData.color === color
                            ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Current Progress Info */}
                <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                  <div className="text-sm text-gray-400">
                    <span className="font-medium text-gray-300">Current Progress:</span>{' '}
                    {goal.current_count} / {goal.target_count} ({goal.progress_percent.toFixed(1)}%)
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Note: Changing target count won't redistribute tasks. Use Smart Rebalance for that.
                  </div>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                  <button type="button" onClick={onClose} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    {updateMutation.isPending ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default EditGoalModal

