import { useMemo } from 'react'
import { useQuery } from 'react-query'
import api from '../services/api'
import { CollaboratorKPI } from '../types'
import { detectOutlier, OutlierAnalysis } from '../utils/outlierDetection'

/**
 * Fetches all historical assignments for (collaboratorId, kpiId) across periods,
 * then runs statistical outlier detection against the proposed `value`.
 */
export function useOutlierDetection(
  collaboratorId: number | undefined,
  kpiId: number | undefined,
  currentPeriodId: number | undefined,
  value: number | null
): OutlierAnalysis & { isLoading: boolean } {
  const { data: history, isLoading } = useQuery<CollaboratorKPI[]>(
    ['outlier-history', collaboratorId, kpiId],
    async () => {
      const res = await api.get(`/collaborator-kpis/collaborator/${collaboratorId}`)
      return res.data
    },
    {
      enabled: collaboratorId != null && kpiId != null,
      staleTime: 60_000,
    }
  )

  const analysis = useMemo(() => {
    if (value == null || !history) {
      return {
        isOutlier: false,
        severity: 'none' as const,
        zScore: null,
        mean: null,
        std: null,
        sampleSize: 0,
        direction: null,
        percentageDeviation: null,
        message: null,
        isLoading: false,
      }
    }

    // Only use closed/approved past periods with an actual value, excluding current period
    const historicalValues = history
      .filter(
        (k) =>
          k.kpiId === kpiId &&
          k.periodId !== currentPeriodId &&
          k.actual != null &&
          Number.isFinite(Number(k.actual)) &&
          (k.status === 'approved' || k.status === 'closed')
      )
      .map((k) => Number(k.actual))

    return {
      ...detectOutlier(value, historicalValues),
      isLoading: false,
    }
  }, [value, history, kpiId, currentPeriodId])

  return { ...analysis, isLoading }
}
