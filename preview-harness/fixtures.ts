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
import { createTask, periodKey } from '@/entities'

const CREATED = new Date(Date.now() - 90 * 864e5)
const TODAY = periodKey('daily', new Date())

/** N check-offs in the current day, which is all the rack reads. */
function checks(count: number) {
  return Array.from({ length: count }, () => ({ key: TODAY, at: new Date() }))
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
    completions: checks(1),
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
  task({ title: 'Arrumar a cama', categoryId: 'c2', timesPerPeriod: 2, completions: checks(2) }),

  // Estudo -- other cadences, so the bands below Diaria are not empty.
  task({
    title: 'Revisar anotacoes',
    categoryId: 'c3',
    frequency: 'weekly',
    weekday: 1,
    timesPerPeriod: 1,
  }),
  task({ title: 'Ensaio mensal', categoryId: 'c3', frequency: 'monthly', timesPerPeriod: 1 }),
  task({ title: 'Renovar certificado', categoryId: 'c3', frequency: 'yearly', timesPerPeriod: 1 }),
  task({ title: 'Escolher um curso', categoryId: 'c3', frequency: 'once', timesPerPeriod: 1 }),

  // Unfiled -- the bucket has no ink, and settles like any other card.
  task({ title: 'Responder emails', turns: [2], timesPerPeriod: 1, completions: checks(1) }),
]
