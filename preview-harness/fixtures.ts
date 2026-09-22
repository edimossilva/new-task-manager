/**
 * The states worth looking at, in one screenful.
 *
 * Tuned so that in the AFTERNOON the rack shows every row state at once: a
 * missed turn, a running one, a kept one, a turn still ahead, a repeat part
 * done, an inactive task, an unfiled bucket, and a category with nothing left.
 * Add to this rather than editing a case away -- the point of the harness is
 * that the awkward combinations stay on screen.
 */
import type { Category, Task } from '@/entities'
import { createTask, isoWeekKey, periodKey } from '@/entities'

const CREATED = new Date(Date.now() - 90 * 864e5)
const TODAY = periodKey('daily', new Date())
/** Three days back at 09:15, inside the current month on all but the first days of one. */
const EARLIER = new Date(new Date().setHours(9, 15, 0, 0) - 3 * 864e5)

/** N check-offs in the current day, which is all the rack reads. */
function checks(count: number) {
  return Array.from({ length: count }, () => ({ key: TODAY, at: new Date() }))
}

/**
 * N check-offs `daysAgo` days back, at midday. The rack ignores them, the week
 * strip on the same page does not -- without a past day carrying anything the
 * strip would always be one bar and six empty cells, which is exactly the state
 * that hides a scaling bug.
 */
function past(daysAgo: number, count: number) {
  const day = new Date(Date.now() - daysAgo * 864e5)
  day.setHours(12, 0, 0, 0)
  return Array.from({ length: count }, () => ({ key: periodKey('daily', day), at: day }))
}

/**
 * N check-offs in the ISO week `weeksAgo` weeks back, on its Wednesday, which is
 * what gives the weekly curve on Hoje a shape to draw instead of eight weeks of
 * nothing.
 */
function pastWeek(weeksAgo: number, count: number) {
  const day = new Date(Date.now() - weeksAgo * 7 * 864e5)
  day.setHours(12, 0, 0, 0)
  return Array.from({ length: count }, () => ({ key: isoWeekKey(day), at: day }))
}

/** A one-off finished `daysAgo` days back: it belongs to that day and no other. */
function settled(daysAgo: number) {
  const day = new Date(Date.now() - daysAgo * 864e5)
  day.setHours(12, 0, 0, 0)
  return [{ key: 'once', at: day }]
}

function task(over: Partial<Task> & { title: string }): Task {
  return { ...createTask({ title: over.title, frequency: 'daily' }), createdAt: CREATED, ...over }
}

function category(id: string, name: string, ink: Category['ink']): Category {
  return { id, name, ink, description: '', createdAt: CREATED, updatedAt: CREATED }
}

export const categories: Category[] = [
  category('c1', 'Saude', 'teal'),
  category('c2', 'Casa', 'ochre'),
  category('c3', 'Estudo', 'ultra'),
]

export const tasks: Task[] = [
  // Saude -- every row state in one card.
  task({
    title: 'Beber agua',
    categoryId: 'c1',
    turns: [1, 1, 2, 3],
    timesPerPeriod: 5,
    completions: [
      ...past(8, 4),
      ...past(7, 5),
      ...past(6, 3),
      ...past(5, 5),
      ...past(4, 2),
      ...past(3, 5),
      ...past(2, 4),
      ...past(1, 5),
      ...checks(1),
    ],
  }),
  task({ title: 'Tomar remedio', categoryId: 'c1', turns: [1], timesPerPeriod: 1 }),
  task({ title: 'Caminhada', categoryId: 'c1', turns: [2], timesPerPeriod: 1 }),
  task({ title: 'Ler 20 paginas', categoryId: 'c1', turns: [3], timesPerPeriod: 1 }),
  task({ title: 'Alongamento', categoryId: 'c1', timesPerPeriod: 1 }),
  task({ title: 'Corrida', categoryId: 'c1', timesPerPeriod: 1, active: false }),

  // Casa -- a category with nothing left, so its name rules through.
  task({
    title: 'Lavar louca',
    categoryId: 'c2',
    turns: [1],
    timesPerPeriod: 1,
    completions: checks(1),
  }),
  task({
    title: 'Arrumar a cama',
    categoryId: 'c2',
    timesPerPeriod: 2,
    completions: [...past(2, 2), ...past(1, 1), ...checks(2)],
  }),

  // Estudo -- other cadences, so the bands below Diaria are not empty.
  task({
    title: 'Revisar anotacoes',
    categoryId: 'c3',
    frequency: 'weekly',
    weekday: 1,
    timesPerPeriod: 1,
    completions: [
      ...pastWeek(7, 1),
      ...pastWeek(6, 1),
      ...pastWeek(4, 1),
      ...pastWeek(3, 1),
      ...pastWeek(2, 1),
      ...pastWeek(1, 1),
      // This week too, and on a day that is NOT its pinned Monday: the weekly
      // curve then shows the shelf on one column and the work on another, which
      // is the case a per-day reading of a weekly cadence exists to show.
      ...pastWeek(0, 1),
    ],
  }),
  // A second weekly cadence, so the weekly curve has a target above one.
  task({
    title: 'Feira',
    categoryId: 'c2',
    frequency: 'weekly',
    weekday: 6,
    timesPerPeriod: 1,
    completions: [...pastWeek(5, 1), ...pastWeek(3, 1), ...pastWeek(2, 1), ...pastWeek(1, 1)],
  }),
  // A weekly task with NO weekday and several check-offs a week: the only case
  // that draws the pace line as a RAMP, since an unpinned target is charged to
  // no day and spread across all seven.
  task({
    title: 'Ler um artigo',
    categoryId: 'c3',
    frequency: 'weekly',
    timesPerPeriod: 3,
    completions: [...pastWeek(1, 2), ...pastWeek(0, 1)],
  }),
  task({ title: 'Ensaio mensal', categoryId: 'c3', frequency: 'monthly', timesPerPeriod: 1 }),
  // Finished on an EARLIER day of the period, so the conclusion reads with its
  // date -- the daily rows above say the hour alone.
  task({
    title: 'Pagar contas',
    categoryId: 'c3',
    frequency: 'monthly',
    timesPerPeriod: 1,
    completions: [{ key: periodKey('monthly', new Date()), at: EARLIER }],
  }),
  task({ title: 'Renovar certificado', categoryId: 'c3', frequency: 'yearly', timesPerPeriod: 1 }),
  task({ title: 'Escolher um curso', categoryId: 'c3', frequency: 'once', timesPerPeriod: 1 }),
  // Finished two days ago: it belongs to THAT day, and Hoje should not show it
  // here -- browse back to it and the row is there, struck through.
  task({
    title: 'Comprar tenis novo',
    categoryId: 'c3',
    frequency: 'once',
    timesPerPeriod: 1,
    completions: settled(2),
  }),

  // Unfiled -- the bucket has no ink, and settles like any other card.
  task({ title: 'Responder emails', turns: [2], timesPerPeriod: 1, completions: checks(1) }),
]
