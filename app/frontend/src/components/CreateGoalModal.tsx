import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, Target, Calendar, Sparkles, ArrowRight, ArrowLeft,
  CheckCircle2, AlertTriangle, Loader2, Clock, Brain,
  ListChecks, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format, addMonths, parseISO, differenceInWeeks } from 'date-fns'
import { goalsApi, GoalPlanResponse, GoalPlanTask } from '../api/goals'
import type { GoalCreateInput } from '../types'

interface CreateGoalModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'input' | 'planning' | 'review'

interface FormData extends GoalCreateInput {
  weekly_hours: number
  experience_level: 'beginner' | 'intermediate' | 'advanced'
}

// Group tasks by week for display
function groupTasksByWeek(tasks: GoalPlanTask[]): Map<number, GoalPlanTask[]> {
  const grouped = new Map<number, GoalPlanTask[]>()
  for (const task of tasks) {
    const week = task.week_number
    if (!grouped.has(week)) {
      grouped.set(week, [])
    }
    grouped.get(week)!.push(task)
  }
  return grouped
}

function WeekTaskGroup({ 
  weekNum, 
  tasks, 
  weeklyHours,
  isOverloaded
}: { 
  weekNum: number
  tasks: GoalPlanTask[]
  weeklyHours: number
  isOverloaded: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(weekNum <= 2) // First 2 weeks expanded
  const totalHours = tasks.reduce((sum, t) => sum + t.estimated_hours, 0)
  const weekStart = tasks[0]?.week_start
  
  return (
    <div className={`border rounded-xl overflow-hidden ${
      isOverloaded 
        ? 'border-red-500/50 bg-red-500/5' 
        : 'border-surface-700 bg-surface-800/30'
    }`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 text-left hover:bg-surface-800/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              isOverloaded 
                ? 'bg-red-500/20 text-red-400' 
                : 'bg-brand-500/20 text-brand-400'
            }`}>
              {weekNum}
            </div>
            <div>
              <span className="font-medium">Week {weekNum}</span>
              {weekStart && (
                <span className="text-surface-500 text-sm ml-2">
                  {format(parseISO(weekStart), 'MMM d')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-surface-400">{tasks.length} tasks</span>
            <span className={isOverloaded ? 'text-red-400 font-medium' : 'text-surface-400'}>
              {totalHours}h / {weeklyHours}h
            </span>
            {isOverloaded && <AlertCircle size={16} className="text-red-400" />}
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-surface-700"
          >
            <div className="p-3 space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-start gap-3 p-2 bg-surface-900/50 rounded-lg">
                  <div className="w-4 h-4 rounded border border-surface-600 flex items-center justify-center shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-surface-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{task.title}</p>
                    {task.description && task.description !== task.title && (
                      <p className="text-xs text-surface-500 mt-0.5 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-surface-400">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        ~{task.estimated_hours}h
                      </span>
                      <span className="px-1.5 py-0.5 bg-surface-700 rounded text-surface-400">
                        {task.type}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CreateGoalModal({ isOpen, onClose }: CreateGoalModalProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const today = format(new Date(), 'yyyy-MM-dd')
  const defaultEnd = format(addMonths(new Date(), 3), 'yyyy-MM-dd')

  const [step, setStep] = useState<Step>('input')
  const [plan, setPlan] = useState<GoalPlanResponse | null>(null)

  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    start_date: today,
    end_date: defaultEnd,
    priority: 3,
    tags: [],
    weekly_hours: 5,
    experience_level: 'intermediate',
  })

  const numWeeks = Math.max(1, differenceInWeeks(parseISO(formData.end_date), parseISO(formData.start_date)) + 1)
  const totalHours = numWeeks * formData.weekly_hours

  // Generate plan mutation
  const planMutation = useMutation({
    mutationFn: () => goalsApi.generatePlan({
      title: formData.title,
      description: formData.description || '',
      start_date: formData.start_date,
      end_date: formData.end_date,
      weekly_hours: formData.weekly_hours,
      experience_level: formData.experience_level,
    }),
    onMutate: () => setStep('planning'),
    onSuccess: (data) => {
      setPlan(data)
      setStep('review')
    },
    onError: (error) => {
      toast.error(`Failed to generate plan: ${(error as Error).message}`)
      setStep('input')
    },
  })

  // Create goal mutation
  const createMutation = useMutation({
    mutationFn: () => goalsApi.create({
      title: formData.title,
      description: formData.description,
      start_date: formData.start_date,
      end_date: formData.end_date,
      priority: formData.priority,
      tags: formData.tags,
      target_count: plan?.summary.total_tasks || numWeeks,
      use_ai: true,
    }),
    onSuccess: (data) => {
      toast.success('Goal created with tailored tasks!', { duration: 5000 })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
      navigate(`/goals/${data.id}`)
    },
    onError: (error) => {
      toast.error(`Failed to create goal: ${(error as Error).message}`)
    },
  })

  const handleClose = () => {
    setStep('input')
    setPlan(null)
    setFormData({
      title: '',
      description: '',
      start_date: today,
      end_date: defaultEnd,
      priority: 3,
      tags: [],
      weekly_hours: 5,
      experience_level: 'intermediate',
    })
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      toast.error('Please enter a goal title')
      return
    }
    planMutation.mutate()
  }

  const groupedTasks = plan ? groupTasksByWeek(plan.tasks) : new Map()
  const overloadedWeekNums = new Set(plan?.overloaded_weeks.map(w => {
    // Parse week from week_start string
    const weekStart = w.week
    const matchingTask = plan.tasks.find(t => t.week_start === weekStart)
    return matchingTask?.week_number
  }).filter(Boolean))

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0" style={{ zIndex: 9999 }}>
          <div onClick={handleClose} className="absolute inset-0 bg-black bg-opacity-70" />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-auto bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl"
            >
              {/* Header */}
              <div className="sticky top-0 bg-gray-900 z-10 border-b border-surface-800 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                      {step === 'planning' ? (
                        <Loader2 size={20} className="text-purple-400 animate-spin" />
                      ) : step === 'review' ? (
                        <ListChecks size={20} className="text-green-400" />
                      ) : (
                        <Target size={20} className="text-brand-400" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">
                        {step === 'input' && 'Create Goal'}
                        {step === 'planning' && 'AI Analyzing...'}
                        {step === 'review' && 'Your Tailored Plan'}
                      </h2>
                      {step === 'review' && plan && (
                        <p className="text-xs text-surface-400">
                          {plan.summary.total_tasks} specific tasks over {plan.summary.total_weeks} weeks
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={handleClose} className="p-2 rounded-lg hover:bg-surface-800 text-surface-400">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Step 1: Input */}
              {step === 'input' && (
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  {/* Goal Title */}
                  <div>
                    <label className="label text-lg">What do you want to achieve?</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., Learn Python, Write 12 blog posts, Run a marathon"
                      className="input text-lg py-3"
                      autoFocus
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="label">Details (be specific for better task planning)</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Examples:&#10;• Learn Python from scratch to be able to automate data tasks&#10;• Write technical blog posts about React and TypeScript&#10;• Train for my first 5K race starting from zero running experience"
                      rows={4}
                      className="input resize-none"
                    />
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label"><Calendar size={14} className="inline mr-1" />Start Date</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label"><Calendar size={14} className="inline mr-1" />Target Date</label>
                      <input
                        type="date"
                        value={formData.end_date}
                        min={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>

                  {/* Weekly Hours */}
                  <div className="card p-4 border-purple-500/30 bg-purple-500/5">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock size={18} className="text-purple-400" />
                      <label className="font-semibold">Weekly time commitment</label>
                    </div>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={1}
                        max={40}
                        value={formData.weekly_hours}
                        onChange={(e) => setFormData({ ...formData, weekly_hours: parseInt(e.target.value) })}
                        className="flex-1 h-2 bg-surface-700 rounded-full appearance-none cursor-pointer accent-purple-500"
                      />
                      <div className="text-center w-20">
                        <span className="text-2xl font-bold text-purple-400">{formData.weekly_hours}</span>
                        <span className="text-surface-400 text-sm ml-1">h/wk</span>
                      </div>
                    </div>
                    <p className="text-xs text-surface-500 mt-2">
                      {numWeeks} weeks × {formData.weekly_hours}h = <span className="text-white font-medium">{totalHours}h total</span>
                    </p>
                  </div>

                  {/* Experience Level */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <Brain size={14} />
                      Your experience level
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: 'beginner', label: 'Beginner', level: 1 },
                        { value: 'intermediate', label: 'Intermediate', level: 2 },
                        { value: 'advanced', label: 'Advanced', level: 3 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, experience_level: opt.value as FormData['experience_level'] })}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            formData.experience_level === opt.value
                              ? 'border-purple-500 bg-purple-500/10'
                              : 'border-surface-700 hover:border-surface-600'
                          }`}
                        >
                          <div className="flex justify-center gap-1 mb-1">
                            {[1, 2, 3].map((i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  i <= opt.level ? 'bg-purple-500' : 'bg-gray-600'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="block text-sm">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="label flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Goal Priority (for rebalancing)
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: 1 })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          formData.priority === 1
                            ? 'border-red-500 bg-red-500/20 ring-2 ring-red-500/50'
                            : 'border-surface-700 hover:border-red-500/50 hover:bg-red-500/10'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-red-500 mx-auto"></span>
                        <span className="block text-xs mt-1">Urgent</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: 2 })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          formData.priority === 2
                            ? 'border-orange-500 bg-orange-500/20 ring-2 ring-orange-500/50'
                            : 'border-surface-700 hover:border-orange-500/50 hover:bg-orange-500/10'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-orange-500 mx-auto"></span>
                        <span className="block text-xs mt-1">High</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: 3 })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          formData.priority === 3
                            ? 'border-yellow-500 bg-yellow-500/20 ring-2 ring-yellow-500/50'
                            : 'border-surface-700 hover:border-yellow-500/50 hover:bg-yellow-500/10'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-yellow-500 mx-auto"></span>
                        <span className="block text-xs mt-1">Medium</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: 4 })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          formData.priority === 4
                            ? 'border-green-500 bg-green-500/20 ring-2 ring-green-500/50'
                            : 'border-surface-700 hover:border-green-500/50 hover:bg-green-500/10'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-green-500 mx-auto"></span>
                        <span className="block text-xs mt-1">Low</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: 5 })}
                        className={`p-2 rounded-xl border text-center transition-all cursor-pointer ${
                          formData.priority === 5
                            ? 'border-gray-500 bg-gray-500/20 ring-2 ring-gray-500/50'
                            : 'border-surface-700 hover:border-gray-500/50 hover:bg-gray-500/10'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-gray-400 mx-auto"></span>
                        <span className="block text-xs mt-1">Optional</span>
                      </button>
                    </div>
                    <p className="text-xs text-surface-500 mt-2">
                      Lower priority tasks will be moved first during rebalancing
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                    <button type="button" onClick={handleClose} className="btn-secondary">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={planMutation.isPending}
                      className="btn-primary bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 flex items-center gap-2"
                    >
                      <Sparkles size={18} />
                      Generate Tasks
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Planning Animation */}
              {step === 'planning' && (
                <div className="p-12 flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <div className="w-24 h-24 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <Sparkles size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-400" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-2">AI is learning your goal...</h3>
                    <p className="text-surface-400">"{formData.title}"</p>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-surface-500">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-400" /> Analyzing goal requirements
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-400" /> Creating specific, actionable tasks
                    </motion.div>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="flex items-center gap-2">
                      <Loader2 size={14} className="text-purple-400 animate-spin" /> Distributing across {numWeeks} weeks...
                    </motion.div>
                  </div>
                </div>
              )}

              {/* Step 3: Review Plan */}
              {step === 'review' && plan && (
                <div className="p-6 space-y-5">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-brand-400">{plan.summary.total_tasks}</div>
                      <div className="text-xs text-surface-400">Tasks</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{plan.summary.total_weeks}</div>
                      <div className="text-xs text-surface-400">Weeks</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">{plan.summary.total_hours_estimated}h</div>
                      <div className="text-xs text-surface-400">Estimated</div>
                    </div>
                    <div className="card p-3 text-center">
                      <div className={`text-2xl font-bold ${plan.summary.is_achievable ? 'text-green-400' : 'text-amber-400'}`}>
                        {plan.summary.is_achievable ? 'Yes' : 'Warning'}
                      </div>
                      <div className="text-xs text-surface-400">
                        {plan.summary.is_achievable ? 'Achievable' : 'Overloaded'}
                      </div>
                    </div>
                  </div>

                  {/* Goal Analysis */}
                  <div className="card p-4">
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <Brain size={16} className="text-purple-400" />
                      Goal Analysis
                    </h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <span className="text-surface-500">Category:</span>
                        <span className="text-white ml-2 capitalize">{plan.analysis.category}</span>
                      </div>
                      <div>
                        <span className="text-surface-500">Complexity:</span>
                        <span className="text-white ml-2 capitalize">{plan.analysis.complexity}</span>
                      </div>
                      <div>
                        <span className="text-surface-500">Skills needed:</span>
                        <span className="text-white ml-2">{plan.analysis.key_skills_needed?.slice(0, 3).join(', ') || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-surface-500">Est. total hours:</span>
                        <span className="text-white ml-2">{plan.analysis.estimated_total_hours}h</span>
                      </div>
                    </div>
                    {plan.analysis.success_criteria && (
                      <div className="mt-2 pt-2 border-t border-surface-700">
                        <span className="text-surface-500 text-sm">Success: </span>
                        <span className="text-green-400 text-sm">{plan.analysis.success_criteria}</span>
                      </div>
                    )}
                  </div>

                  {/* Warnings */}
                  {plan.warnings.length > 0 && (
                    <div className="card p-4 border-amber-500/30 bg-amber-500/5">
                      <div className="flex items-center gap-2 text-amber-400 mb-2">
                        <AlertTriangle size={16} />
                        <h4 className="font-semibold">Workload Warnings</h4>
                      </div>
                      <ul className="space-y-1 text-sm text-amber-300">
                        {plan.warnings.map((warning, i) => (
                          <li key={i}>• {warning}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-surface-400 mt-2">
                        Consider increasing weekly hours or extending the deadline.
                      </p>
                    </div>
                  )}

                  {/* Tasks by Week */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <ListChecks size={16} className="text-brand-400" />
                      Your Tasks ({plan.tasks.length} total)
                    </h4>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                      {Array.from(groupedTasks.entries())
                        .sort(([a], [b]) => a - b)
                        .map(([weekNum, tasks]) => (
                          <WeekTaskGroup
                            key={weekNum}
                            weekNum={weekNum}
                            tasks={tasks}
                            weeklyHours={plan.summary.weekly_hours}
                            isOverloaded={overloadedWeekNums.has(weekNum)}
                          />
                        ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between gap-3 pt-4 border-t border-gray-700">
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <ArrowLeft size={18} />
                      Adjust Goal
                    </button>
                    <button
                      onClick={() => createMutation.mutate()}
                      disabled={createMutation.isPending}
                      className="btn-primary bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 flex items-center gap-2"
                    >
                      {createMutation.isPending ? (
                        <><Loader2 size={18} className="animate-spin" /> Creating...</>
                      ) : (
                        <><CheckCircle2 size={18} /> Accept & Create Goal</>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CreateGoalModal
