import { FREQUENCIES, type TaskFrequency } from '@/entities'

/**
 * Which readout is holding the home page: one of the two annunciators, or a
 * band's gauge. A frequency here means "every task in that band", so a gauge
 * and the stratum it measures are one control -- tap the meter, light the rows
 * it is reading.
 */
export type Spotlight = 'late' | 'now' | TaskFrequency

export function isBandSpotlight(value: Spotlight | null | undefined): value is TaskFrequency {
  return (FREQUENCIES as readonly string[]).includes(value ?? '')
}
