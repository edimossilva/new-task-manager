import { MAX_TIMES_PER_PERIOD, type Turn } from '@/entities'

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

/**
 * A turn plan cannot ask for more check-offs than the period has. Rejected
 * rather than truncated, the trade `validateTimesPerPeriod` makes: a form that
 * silently drops a turn leaves the user thinking they saved something else.
 *
 * The frequency is deliberately NOT checked here -- "turns set implies daily" is
 * coerced by the use case, the way `weekday` is, so changing a task's cadence
 * never has to be refused.
 */
export function validateTurns(turns: Turn[], timesPerPeriod: number): string | null {
  if (turns.some((turn) => turn !== 1 && turn !== 2 && turn !== 3)) {
    return 'Turno invalido.'
  }
  if (turns.length > timesPerPeriod) {
    return 'Os turnos somam mais marcacoes do que a tarefa pede.'
  }
  return null
}
