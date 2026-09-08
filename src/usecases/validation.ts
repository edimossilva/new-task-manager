import { MAX_TIMES_PER_PERIOD } from '@/entities'

/** Returns a Portuguese error message, or null when the value is acceptable. */
export function validateRequiredText(value: string, fieldLabel: string): string | null {
  if (value.trim().length === 0) return `${fieldLabel} e obrigatorio.`
  return null
}

/**
 * The number of check-offs a period needs. Rejected rather than clamped: a form
 * that silently turns 0 into 1 leaves the user thinking they saved something else.
 */
export function validateTimesPerPeriod(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMES_PER_PERIOD) {
    return `Vezes por periodo deve ser um numero inteiro entre 1 e ${MAX_TIMES_PER_PERIOD}.`
  }
  return null
}
