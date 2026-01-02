import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Clock, ArrowRight, Check, AlertCircle, Loader2, AlertTriangle, Calendar, Settings2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { rebalanceApi, RebalancePlan, RebalanceChange } from '../api/rebalance'

interface OverloadedWeek {
  week: string
  hours: number
  capacity: number
  excess: number
  task_count: number
}

export function SmartRebalance() {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'config' | 'results'>('config')
  
  // Configuration options
  const [currentWeekHours, setCurrentWeekHours] = useState(5) // Hours available THIS week
  const [futureWeekHours, setFutureWeekHours] = useState(10) // Regular weekly hours
  const [allowTimelineExtension, setAllowTimelineExtension] = useState(false)
  const [useAi, setUseAi] = useState(true)
  
  const [plan, setPlan] = useState<RebalancePlan | null>(null)
  const queryClient = useQueryClient()

  // Calculate mutation
  const calculateMutation = useMutation({
    mutationFn: () => rebalanceApi.calculate(currentWeekHours, futureWeekHours, useAi),
    onSuccess: (data) => {
      setPlan(data)
      setStep('results')
      if (data.changes.length === 0 && (!data.summary?.overloaded_weeks || data.summary.overloaded_weeks.length === 0)) {
        toast.success('Your workload is already balanced!')
      }
    },
    onError: (error) => {
      toast.error('Failed to calculate: ' + (error as Error).message)
    }
  })

  // Apply mutation
  const applyMutation = useMutation({
    mutationFn: (changes: RebalanceChange[]) => rebalanceApi.apply(changes),
    onSuccess: (data) => {
      toast.success(`Applied ${data.total_applied} changes!`)
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['goals'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      handleClose()
    },
    onError: (error) => {
      toast.error('Failed to apply: ' + (error as Error).message)
    }
  })

  const handleClose = () => {
    setIsOpen(false)
    setPlan(null)
    setStep('config')
  }

  // Extract overloaded weeks from the plan summary if available
  const overloadedWeeks: OverloadedWeek[] = plan?.summary?.overloaded_weeks || []
  const hasOverloaded = overloadedWeeks.length > 0
  const canFix = plan?.changes && plan.changes.length > 0

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 
                   hover:from-purple-500 hover:to-blue-500 text-white rounded-xl font-medium 
                   transition-all shadow-lg hover:shadow-xl"
      >
        <Sparkles size={18} />
        Smart Rebalance
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0" style={{ zIndex: 9999 }}>
            {/* Backdrop */}
            <div
              onClick={handleClose}
              className="absolute inset-0 bg-black bg-opacity-70"
            />

            {/* Modal Content */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-2xl max-h-[90vh] overflow-auto bg-gray-900 
                         border border-gray-700 rounded-2xl shadow-2xl"
              >
                {/* Header */}
                <div className="sticky top-0 z-10 p-6 border-b border-gray-700 
                              bg-gradient-to-r from-purple-900/50 to-blue-900/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-purple-500/20">
                        <Sparkles size={24} className="text-purple-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Smart Rebalance</h2>
                        <p className="text-sm text-gray-400">
                          {step === 'config' ? 'Configure your availability' : 'Review suggested changes'}
                        </p>
                      </div>
                    </div>
                    <button onClick={handleClose} className="p-2 text-gray-400 hover:text-white">
                      <X size={24} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                  {step === 'config' ? (
                    <>
                      {/* Current Week Availability */}
                      <div className="p-5 rounded-xl bg-gradient-to-br from-amber-900/30 to-orange-900/30 border border-amber-500/30">
                        <div className="flex items-center gap-2 mb-4">
                          <Calendar size={20} className="text-amber-400" />
                          <h3 className="font-semibold text-amber-300">This Week's Availability</h3>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                          How many hours can you realistically spend <strong>this week</strong>?
                        </p>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="40"
                            value={currentWeekHours}
                            onChange={(e) => setCurrentWeekHours(Number(e.target.value))}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <input
                              type="number"
                              min="0"
                              max="168"
                              value={currentWeekHours}
                              onChange={(e) => setCurrentWeekHours(Number(e.target.value) || 0)}
                              className="w-16 px-3 py-2 bg-gray-800 border border-amber-500/30 rounded-lg text-white text-center"
                            />
                            <span className="text-gray-400">hrs</span>
                          </div>
                        </div>
                        {currentWeekHours === 0 && (
                          <p className="text-xs text-amber-400 mt-2">
                            Note: All tasks this week will be pushed to future weeks
                          </p>
                        )}
                      </div>

                      {/* Future Weeks Budget */}
                      <div className="p-5 rounded-xl bg-gray-800/50 border border-gray-700">
                        <div className="flex items-center gap-2 mb-4">
                          <Clock size={20} className="text-blue-400" />
                          <h3 className="font-semibold text-gray-200">Regular Weekly Budget</h3>
                        </div>
                        <p className="text-sm text-gray-400 mb-4">
                          How many hours can you typically spend each week going forward?
                        </p>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="1"
                            max="40"
                            value={futureWeekHours}
                            onChange={(e) => setFutureWeekHours(Number(e.target.value))}
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <input
                              type="number"
                              min="1"
                              max="168"
                              value={futureWeekHours}
                              onChange={(e) => setFutureWeekHours(Number(e.target.value) || 10)}
                              className="w-16 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center"
                            />
                            <span className="text-gray-400">hrs</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Extension Option */}
                      <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Settings2 size={20} className="text-purple-400" />
                            <div>
                              <div className="font-medium text-white">Allow Timeline Extension</div>
                              <div className="text-xs text-gray-400">
                                Can move tasks beyond original goal deadlines if needed
                              </div>
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={allowTimelineExtension}
                              onChange={(e) => setAllowTimelineExtension(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 rounded-full peer 
                                          peer-checked:bg-purple-600 after:content-[''] 
                                          after:absolute after:top-[2px] after:left-[2px] 
                                          after:bg-white after:rounded-full after:h-5 after:w-5 
                                          after:transition-all peer-checked:after:translate-x-full" />
                          </div>
                        </label>
                      </div>

                      {/* AI Toggle */}
                      <div className="p-4 rounded-xl bg-gray-800/50 border border-gray-700">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Sparkles size={20} className="text-purple-400" />
                            <div>
                              <div className="font-medium text-white">Use AI Recommendations</div>
                              <div className="text-xs text-gray-400">
                                Smart prioritization based on goals and deadlines
                              </div>
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={useAi}
                              onChange={(e) => setUseAi(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-700 rounded-full peer 
                                          peer-checked:bg-purple-600 after:content-[''] 
                                          after:absolute after:top-[2px] after:left-[2px] 
                                          after:bg-white after:rounded-full after:h-5 after:w-5 
                                          after:transition-all peer-checked:after:translate-x-full" />
                          </div>
                        </label>
                      </div>

                      {/* Summary Box */}
                      <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-500/30">
                        <h4 className="font-medium text-blue-300 mb-2">What will happen:</h4>
                        <ul className="text-sm text-gray-300 space-y-1">
                          <li>• This week: Fit tasks within <strong>{currentWeekHours}h</strong>, move overflow to later</li>
                          <li>• Future weeks: Balance to <strong>{futureWeekHours}h/week</strong></li>
                          {allowTimelineExtension && (
                            <li>• May extend goal deadlines if necessary</li>
                          )}
                          <li>• Will show overloaded weeks that can't be fixed</li>
                        </ul>
                      </div>

                      {/* Calculate Button */}
                      <button
                        onClick={() => calculateMutation.mutate()}
                        disabled={calculateMutation.isPending}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 
                                 hover:from-purple-500 hover:to-blue-500 text-white font-medium 
                                 rounded-xl transition-all disabled:opacity-50 flex items-center 
                                 justify-center gap-2"
                      >
                        {calculateMutation.isPending ? (
                          <>
                            <Loader2 size={20} className="animate-spin" />
                            {useAi ? 'AI is analyzing...' : 'Calculating...'}
                          </>
                        ) : (
                          <>
                            <Sparkles size={20} />
                            Analyze & Suggest Changes
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Plan Results */}
                      <div className="space-y-4">
                        {/* Summary */}
                        <div className={`p-4 rounded-xl border ${
                          hasOverloaded && !canFix
                            ? 'bg-red-900/20 border-red-500/30'
                            : hasOverloaded && canFix
                            ? 'bg-amber-900/20 border-amber-500/30'
                            : 'bg-green-900/20 border-green-500/30'
                        }`}>
                          <div className="flex items-start gap-3">
                            {hasOverloaded && !canFix ? (
                              <AlertTriangle size={20} className="text-red-400 mt-0.5" />
                            ) : hasOverloaded ? (
                              <AlertCircle size={20} className="text-amber-400 mt-0.5" />
                            ) : (
                              <Check size={20} className="text-green-400 mt-0.5" />
                            )}
                            <div>
                              <p className="text-gray-200">{plan?.message}</p>
                              <p className="text-sm text-gray-400 mt-1">
                                Analyzed {plan?.summary.total_tasks_analyzed} tasks
                                {plan?.changes && plan.changes.length > 0 && ` • ${plan.changes.length} can be moved`}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Overloaded Weeks (can't be fixed) */}
                        {hasOverloaded && (
                          <div className="p-4 rounded-xl bg-red-900/10 border border-red-500/30">
                            <div className="flex items-center gap-2 text-red-400 mb-3">
                              <AlertTriangle size={18} />
                              <h4 className="font-semibold">Overloaded Weeks</h4>
                            </div>
                            <div className="space-y-2">
                              {overloadedWeeks.map((week, i) => {
                                let weekLabel = week.week
                                try {
                                  weekLabel = format(parseISO(week.week), 'MMM d')
                                } catch {
                                  // Keep original format
                                }
                                return (
                                  <div key={i} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <Calendar size={16} className="text-gray-400" />
                                      <span className="text-white">Week of {weekLabel}</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="text-red-400 font-medium">{week.hours}h</span>
                                      <span className="text-gray-500"> / {week.capacity}h</span>
                                      <span className="text-red-400 text-sm ml-2">(+{week.excess}h over)</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <p className="text-xs text-gray-400 mt-3">
                              💡 To fix: Increase weekly hours, extend deadlines, or reduce scope.
                            </p>
                          </div>
                        )}

                        {/* Recommendations */}
                        {plan?.recommendations && plan.recommendations.length > 0 && (
                          <div className="p-4 rounded-xl bg-purple-900/20 border border-purple-500/30">
                            <h4 className="font-medium text-purple-300 mb-2">AI Recommendations:</h4>
                            <ul className="text-sm text-gray-300 space-y-1">
                              {plan.recommendations.map((rec, i) => (
                                <li key={i}>• {rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Changes that CAN be made */}
                        {plan?.changes && plan.changes.length > 0 ? (
                          <div className="space-y-2">
                            <h4 className="font-medium text-gray-300">
                              Proposed Changes ({plan.changes.length})
                            </h4>
                            <div className="max-h-60 overflow-y-auto space-y-2">
                              {plan.changes.map((change, i) => (
                                <div
                                  key={i}
                                  className="p-3 rounded-lg bg-gray-800 border border-gray-700 
                                           flex items-center gap-3"
                                >
                                  <div className="flex-1">
                                    <div className="font-medium text-white text-sm">
                                      {change.task_title}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                                      <span className="text-red-400">{change.from_week}</span>
                                      <ArrowRight size={12} />
                                      <span className="text-green-400">{change.to_week}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">{change.reason}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : !hasOverloaded ? (
                          <div className="p-6 text-center">
                            <Check size={48} className="mx-auto text-green-400 mb-3" />
                            <p className="text-gray-200">Your workload is perfectly balanced!</p>
                            <p className="text-sm text-gray-400 mt-1">No changes needed.</p>
                          </div>
                        ) : null}

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4 border-t border-gray-700">
                          <button
                            onClick={() => {
                              setPlan(null)
                              setStep('config')
                            }}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white 
                                     rounded-xl transition-colors"
                          >
                            Back to Settings
                          </button>
                          {plan?.changes && plan.changes.length > 0 && (
                            <button
                              onClick={() => applyMutation.mutate(plan.changes)}
                              disabled={applyMutation.isPending}
                              className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white 
                                       font-medium rounded-xl transition-colors disabled:opacity-50 
                                       flex items-center justify-center gap-2"
                            >
                              {applyMutation.isPending ? (
                                <>
                                  <Loader2 size={18} className="animate-spin" />
                                  Applying...
                                </>
                              ) : (
                                <>
                                  <Check size={18} />
                                  Apply {plan.changes.length} Changes
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}

export default SmartRebalance
