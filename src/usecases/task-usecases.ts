import type { Completion, CreateTaskInput, Task, TaskFrequency } from '@/entities'
import {
  FREQUENCIES,
  addPeriods,
  addWeeks,
  createTask,
  formatPeriodShort,
  formatWeekShort,
  isoWeekKey,
  isoWeekday,
  matchesFrequency,
  parseDailyKey,
  periodIndex,
  periodKey,
  weekDates,
  weekStart,
} from '@/entities'
import type { TaskRepository } from './ports'
import { validateRequiredText, validateTimesPerPeriod } from './validation'

export interface UseCaseResult {
  success: boolean
  error?: string
}

/** Check-level progress over a set of tasks, as `checkTally` reports it. */
export interface CheckTally {
  done: number
  total: number
}

/**
 * A tally as a whole percentage.
 *
 * Never rounds UP to 100 while a check is still open: a band of two hundred
 * expected with one missing must not read `100%` beside `Tudo concluido`.
 * Exported so no two meters in the app can round differently.
 */
export function percentOf(tally: CheckTally): number {
  if (tally.total === 0) return 0
  if (tally.done >= tally.total) return 100
  return Math.min(Math.round((tally.done / tally.total) * 100), 99)
}

/** One task's week: what the routine asked of it, and what actually happened. */
export interface WeekTaskRow {
  task: Task
  /** Every check-off placed in the week. The honest volume, nothing clamped. */
  done: number
  /**
   * The part of `done` the week can credit: clamped per PERIOD, and only for
   * keys written under the task's current frequency. `done - credited` is work
   * that happened with no expectation to sit against.
   */
  credited: number
  /** What the week asked of this task. 0 for a frequency with no weekly cadence. */
  expected: number
  /** The check-offs that could be placed on a DAY, Monday first. Always length 7. */
  byWeekday: number[]
  /** Counted in `done`, but no day could be derived for them. */
  undated: number
}

/** One frequency band's week. `expected` is 0 for the bands the week cannot ask of. */
export interface WeekBand {
  frequency: TaskFrequency
  /** Every check-off placed in the week, clamped nowhere. */
  done: number
  /** The part of it the week can credit -- what the band's meter reads. */
  credited: number
  expected: number
}

/** Everything the summary page reads, for one ISO week. */
export interface WeekSummary {
  /** The ISO week key the whole reading is about, e.g. `2026-W37`. */
  key: string
  start: Date
  end: Date
  /** The routine: only the tasks this week actually asked something of. */
  routine: CheckTally
  /** Done, but never asked for this week -- no weekly cadence, or out of the routine. */
  extras: number
  /** Check-offs per weekday, Monday first. */
  byWeekday: number[]
  /**
   * What each day asked for, Monday first -- the DAILIES' demand and nothing
   * else, since no other cadence belongs to a single day. It therefore does NOT
   * sum to `routine.total`, and the page must not present it as if it did; it
   * does sum to the Diaria band's `expected`, which is the same figure.
   */
  expectedByWeekday: number[]
  /** Counted in the totals, but placeable on no day. */
  undated: number
  /** Legacy check-offs that belong to no week at all. Reported, never dropped. */
  unplaced: number
  bands: WeekBand[]
  rows: WeekTaskRow[]
}

/** One bar of the trend strip. */
export interface WeekTrendPoint {
  key: string
  start: Date
  /** `W37` -- a bar is too narrow for the week-year. */
  label: string
  done: number
  expected: number
  extras: number
  /** The week still running: an unfinished week is not a shortfall. */
  isCurrent: boolean
}

/** Weeks the trend strip carries, the focused one included. */
const TREND_WEEKS = 8

/** One period on the task's own run chart. */
export interface PeriodPoint {
  key: string
  /** Four characters at most: `01/09`, `W37`, `Set`, `2026`. */
  label: string
  count: number
  target: number
  /** The period the clock is in. Still running, so short of target is not a miss. */
  isCurrent: boolean
  /** The task already existed. Periods before that are blank, never shortfalls. */
  existed: boolean
}

/** One day of the daily heatmap. */
export interface HeatCell {
  key: string
  date: Date
  count: number
  target: number
  existed: boolean
  isFuture: boolean
}

/**
 * Everything the task's own page reads about its past, in ONE pass over its
 * check-offs.
 *
 * Figures that count PERIODS only count the ones written under the task's
 * current frequency, the rule `completionHistory`'s callers already live by: a
 * key left behind by a frequency change is real work under a cadence the task
 * has left, and it cannot be placed on this one's number line.
 */
export interface TaskInsight {
  /** Every check-off, whatever format its key is in. */
  total: number
  /** The part of it written under the CURRENT frequency -- what the figures measure. */
  counted: number
  /** Periods that reached their target. */
  periodsDone: number
  /** Periods the task has existed through, the running one included. */
  periodsElapsed: number
  /** `periodsDone / periodsElapsed`, rounded the way every meter in the app rounds. */
  rate: number
  /**
   * Completed periods in an unbroken run ending now. The RUNNING period does
   * not break it while it is still open -- a daily streak must not read zero
   * every morning until the box is ticked.
   */
  streak: number
  /** The longest such run the task has ever had, the current one included. */
  bestStreak: number
  /** The most recent recorded moment, absent when no check-off carries one. */
  lastAt?: Date
  /** Whole days between that moment's day and today. */
  daysSince?: number
  /** The last N periods, oldest first. Empty for a one-off, which has one period. */
  timeline: PeriodPoint[]
  /** The last `HEAT_WEEKS` weeks as days, column by column. Daily tasks only. */
  heat: HeatCell[]
  /** Check-offs per weekday, Monday first. Anything that pins to a day. */
  byWeekday: number[]
  /** Check-offs per hour, 0..23. Only the ones carrying a moment can say. */
  byHour: number[]
  /** How many carry a moment -- the hour dial's own denominator. */
  dated: number
}

/** How far back the run chart reaches, per cadence. */
const TIMELINE_PERIODS: Record<TaskFrequency, number> = {
  // A one-off has one period and it is the current one; a chart of it is a dot.
  once: 0,
  daily: 14,
  weekly: 12,
  monthly: 12,
  yearly: 8,
}

/** Weeks in the daily heatmap: a season, and 18 columns still fit a phone. */
const HEAT_WEEKS = 18

/** One period's worth of check-offs, as `completionHistory` reports it. */
export interface CompletionPeriod {
  key: string
  entries: Completion[]
  /** Epoch ms of the newest recorded moment, or 0 when none of them carry one. */
  latest: number
}

/** Entries sort by period key only, so the order inside a period stays as recorded. */
function byKey(a: Completion, b: Completion): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * Retention cap for `completions`: ten years of once-a-day check-offs. At a key
 * plus a timestamp per entry that is a few hundred KB, inside Firestore's 1 MiB
 * per-document limit, and it keeps retention from being something the UI has to
 * be tuned around. A task checked several times a day spends the budget
 * proportionally faster -- eight a day still buys well over a year of history.
 */
const MAX_COMPLETIONS = 3650

export class TaskUseCases {
  constructor(private taskRepo: TaskRepository) {}

  getAll(): Task[] {
    return this.taskRepo.getAll()
  }

  getById(id: string): Task | undefined {
    return this.taskRepo.getById(id)
  }

  create(input: CreateTaskInput): UseCaseResult {
    const error =
      validateRequiredText(input.title, 'Titulo') ??
      validateTimesPerPeriod(input.timesPerPeriod ?? 1)
    if (error) return { success: false, error }

    this.taskRepo.create(
      createTask({
        ...input,
        title: input.title.trim(),
        weekday: input.frequency === 'weekly' ? input.weekday : undefined,
      }),
    )
    return { success: true }
  }

  update(task: Task): UseCaseResult {
    const error =
      validateRequiredText(task.title, 'Titulo') ?? validateTimesPerPeriod(task.timesPerPeriod)
    if (error) return { success: false, error }

    // Changing the frequency leaves the old period keys in place. They can never
    // match a lookup in the new format, so the task correctly shows as pending,
    // and keeping them costs nothing while preserving the history.
    //
    // The weekday is different: a stale one would silently hide the task if the
    // frequency ever came back to weekly, so the invariant "weekday set implies
    // weekly" is enforced here rather than trusted to the form.
    this.taskRepo.update({
      ...task,
      title: task.title.trim(),
      weekday: task.frequency === 'weekly' ? task.weekday : undefined,
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Takes a task in or out of the routine. Deliberately NOT part of `isDueOn`:
   * the tasks page has to keep listing an inactive task, or there would be no
   * way back from the state -- only the home page filters on it.
   */
  setActive(id: string, active: boolean): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }
    if (task.active === active) return { success: true }

    this.taskRepo.update({ ...task, active, updatedAt: new Date() })
    return { success: true }
  }

  delete(id: string): UseCaseResult {
    if (!this.taskRepo.getById(id)) return { success: false, error: 'Tarefa nao encontrada.' }
    this.taskRepo.delete(id)
    return { success: true }
  }

  /**
   * How many times the task has been checked off in the period containing
   * `referenceDate`. The key is stored once per check-off, so this is a count of
   * occurrences rather than a tally the app has to keep in step with the clock.
   */
  completionCountFor(task: Task, referenceDate: Date = new Date()): number {
    const key = periodKey(task.frequency, referenceDate)
    return task.completions.filter((completion) => completion.key === key).length
  }

  /**
   * Whether the period containing `referenceDate` is fully checked off.
   *
   * `>=`, not `===`: lowering `timesPerPeriod` on a task with more check-offs
   * already recorded must leave the period done, not permanently overdone.
   */
  isCompletedFor(task: Task, referenceDate: Date = new Date()): boolean {
    return this.completionCountFor(task, referenceDate) >= task.timesPerPeriod
  }

  /**
   * Check-level progress across a set of tasks for the period containing
   * `referenceDate`: every required check-off counts on its own, so a task at
   * three of eight contributes three rather than nothing until it is finished.
   * This is what the meters read, and it is the model's own question -- both
   * list pages ask it, and a tally computed twice is a tally that can drift.
   *
   * Done is clamped per task: lowering `timesPerPeriod` can leave more
   * check-offs recorded than the target asks for, and an over-full task must not
   * lend credit to the ones beside it.
   */
  checkTally(tasks: Task[], referenceDate: Date = new Date()): CheckTally {
    return tasks.reduce<CheckTally>(
      (tally, task) => ({
        done:
          tally.done + Math.min(this.completionCountFor(task, referenceDate), task.timesPerPeriod),
        total: tally.total + task.timesPerPeriod,
      }),
      { done: 0, total: 0 },
    )
  }

  /**
   * The ISO week a check-off lands in, or null when it lands in none.
   *
   * The MOMENT wins when the entry carries one, so the page answers "when was
   * the work done" rather than "which period did it satisfy". The consequence is
   * deliberate and has to be said out loud: catching up today on last week's
   * task counts in TODAY's week, and the week that was short stays short.
   *
   * With no moment, the KEY's own shape is tested rather than the task's current
   * frequency -- a frequency change leaves keys of the old format behind, and a
   * daily key is still a day whatever the task has since become. A monthly,
   * yearly or one-off key names no day and no week, so it places nowhere.
   */
  private placeCompletion(completion: Completion): string | null {
    if (completion.at) return isoWeekKey(completion.at)
    if (matchesFrequency('weekly', completion.key)) return completion.key
    const day = parseDailyKey(completion.key)
    return day ? isoWeekKey(day) : null
  }

  /**
   * The day a check-off happened on, or null when nothing says.
   *
   * The same order as `placeCompletion`, one resolution finer: a weekday strip
   * can only show what pins to a day, and a weekly key names seven of them.
   */
  private completionDay(completion: Completion): Date | null {
    return completion.at ?? parseDailyKey(completion.key)
  }

  /**
   * What one DAY asks of one task.
   *
   * Dailies and nothing else, because a single day is the only period a daily
   * owns: a weekly, monthly or yearly target belongs to a span of days and
   * cannot be charged to one of them. It is written once, here, so the day strip
   * and the Diaria band can never disagree about the same number -- the strip
   * sums it across tasks, `weekExpectation` sums it across days.
   *
   * A day that has not happened asks nothing, compared by KEY rather than by
   * timestamp: the day cells are built at noon and the clock is not, so
   * `day <= now` would drop today every morning. `isDueOn` carries existence and
   * the weekday gate, so this can never claim work the list pages never showed
   * as due, and an inactive task asks nothing at all -- the rule the home page's
   * ratio already uses.
   */
  private dailyDemand(task: Task, day: Date, now: Date): number {
    if (!task.active || task.frequency !== 'daily') return 0
    if (periodKey('daily', day) > periodKey('daily', now)) return 0
    return this.isDueOn(task, day) ? task.timesPerPeriod : 0
  }

  /**
   * How many check-offs the week asked of one task.
   *
   * Only `daily` and `weekly` have a weekly cadence. A monthly or yearly target
   * belongs to a month or a year; a seventh of it is a number nobody chose, and
   * it would differ between a four-week and a five-week month -- so those ask
   * nothing and their check-offs are reported as extras instead. Inactive tasks
   * ask nothing either, the rule the home page's ratio already uses; the flag is
   * today's, so switching a task off lowers what past weeks are judged against.
   */
  private weekExpectation(task: Task, days: Date[], now: Date): number {
    if (!task.active) return 0

    if (task.frequency === 'daily') {
      return days.reduce((total, day) => total + this.dailyDemand(task, day, now), 0)
    }
    if (task.frequency === 'weekly') {
      // One demand for the whole week, from the day it comes up: an unpinned
      // weekly task is due from Monday, a Sabado task not until Saturday. The
      // last ELAPSED day answers both halves, since `existsIn` is week-granular
      // for a weekly task and the weekday gate lives inside `isDueOn`.
      const todayKey = periodKey('daily', now)
      const elapsed = days.filter((day) => periodKey('daily', day) <= todayKey)
      const last = elapsed[elapsed.length - 1]
      return last && this.isDueOn(task, last) ? task.timesPerPeriod : 0
    }
    return 0
  }

  /**
   * Splits a week's check-offs for one task into what it can credit and how many
   * there were, given the entries grouped by their own period key.
   *
   * Crediting is per PERIOD -- `Math.min(count, target)`, the clamp `checkTally`
   * makes -- so eleven check-offs on Monday for a task wanting three cannot
   * cover Tuesday. A key left behind by a frequency change credits nothing: it
   * is real work under a cadence the task has left, and it is reported as an
   * extra rather than measured against a target it never had.
   */
  private creditCounts(
    task: Task,
    counts: Map<string, number>,
  ): { credited: number; placed: number } {
    let credited = 0
    let placed = 0
    for (const [key, count] of counts) {
      placed += count
      if (matchesFrequency(task.frequency, key)) {
        credited += Math.min(count, task.timesPerPeriod)
      }
    }
    return { credited, placed }
  }

  /**
   * The whole reading for the ISO week containing `referenceDate`.
   *
   * `tasks` is a parameter for the same reason `checkTally`'s is: the views hold
   * that array and re-render from it, while a method reading the repository
   * itself would not re-run when a check-off is written.
   *
   * An EXPECTATION is what makes a check-off part of the routine's ratio. Work
   * the week never asked for -- a monthly task, one out of the routine, a
   * surplus tick, a key from an old frequency -- is counted apart in `extras`
   * rather than dropped or averaged into a percentage it would distort. The
   * invariant: `routine.done + extras` is every check-off the week owns.
   */
  weekSummary(tasks: Task[], referenceDate: Date, now: Date = new Date()): WeekSummary {
    const days = weekDates(referenceDate)
    const key = isoWeekKey(days[0]!)

    const bands = new Map<TaskFrequency, WeekBand>(
      FREQUENCIES.map((frequency) => [frequency, { frequency, done: 0, credited: 0, expected: 0 }]),
    )
    const byWeekday = [0, 0, 0, 0, 0, 0, 0]
    const expectedByWeekday = [0, 0, 0, 0, 0, 0, 0]
    const routine: CheckTally = { done: 0, total: 0 }
    const rows: WeekTaskRow[] = []
    let extras = 0
    let undated = 0
    let unplaced = 0

    for (const task of tasks) {
      const row: WeekTaskRow = {
        task,
        done: 0,
        credited: 0,
        expected: this.weekExpectation(task, days, now),
        byWeekday: [0, 0, 0, 0, 0, 0, 0],
        undated: 0,
      }

      // Grouped by their own period key, because crediting is per period.
      const counts = new Map<string, number>()

      for (const completion of task.completions) {
        const placed = this.placeCompletion(completion)
        if (placed === null) {
          // Belongs to no week at all, so it is not this week's -- but it is
          // still history, and the page says so rather than losing it silently.
          unplaced += 1
          continue
        }
        if (placed !== key) continue

        row.done += 1
        counts.set(completion.key, (counts.get(completion.key) ?? 0) + 1)

        const day = this.completionDay(completion)
        if (day) row.byWeekday[isoWeekday(day) - 1]! += 1
        else row.undated += 1
      }

      // Nothing expected, nothing creditable: a monthly task's check-off is an
      // extra whatever its own target says, so `credited` must not imply
      // otherwise to anything reading a row later.
      row.credited = row.expected > 0 ? this.creditCounts(task, counts).credited : 0

      const band = bands.get(task.frequency)!
      band.done += row.done
      band.credited += row.credited
      band.expected += row.expected

      if (row.expected > 0) {
        routine.done += row.credited
        routine.total += row.expected
        extras += row.done - row.credited
      } else {
        extras += row.done
      }

      row.byWeekday.forEach((count, index) => {
        byWeekday[index]! += count
      })
      days.forEach((day, index) => {
        expectedByWeekday[index]! += this.dailyDemand(task, day, now)
      })
      undated += row.undated
      rows.push(row)
    }

    return {
      key,
      start: days[0]!,
      end: days[6]!,
      routine,
      extras,
      byWeekday,
      expectedByWeekday,
      undated,
      unplaced,
      bands: FREQUENCIES.map((frequency) => bands.get(frequency)!),
      rows,
    }
  }

  /**
   * The focused week and the ones before it, oldest first, so the strip reads
   * left to right into the present.
   *
   * The bars measure exactly what the headline does -- credited against expected
   * -- so a bar and the page it jumps to cannot disagree.
   *
   * One pass over every check-off rather than one per week: a task can hold
   * `MAX_COMPLETIONS` entries, and the strip would otherwise read all of them
   * eight times over.
   */
  weekTrend(
    tasks: Task[],
    referenceDate: Date,
    weeks: number = TREND_WEEKS,
    now: Date = new Date(),
  ): WeekTrendPoint[] {
    const currentKey = isoWeekKey(now)
    const points: WeekTrendPoint[] = Array.from({ length: weeks }, (_, index) => {
      const start = addWeeks(referenceDate, index - (weeks - 1))
      const key = isoWeekKey(start)
      return {
        key,
        start,
        label: formatWeekShort(start),
        done: 0,
        expected: 0,
        extras: 0,
        isCurrent: key === currentKey,
      }
    })

    // Built once, outside the task loop: seven Dates per week per task is a lot
    // of garbage for a figure that does not depend on the task.
    const grids = points.map((point) => weekDates(point.start))
    const indexByKey = new Map(points.map((point, index) => [point.key, index]))

    for (const task of tasks) {
      const expectations = grids.map((days) => this.weekExpectation(task, days, now))
      expectations.forEach((expected, index) => {
        points[index]!.expected += expected
      })

      // Bucketed by week, then by period key, since both the window test and the
      // per-period clamp have to happen before anything is credited.
      const counts = new Map<number, Map<string, number>>()
      for (const completion of task.completions) {
        const placed = this.placeCompletion(completion)
        if (placed === null) continue
        const index = indexByKey.get(placed)
        if (index === undefined) continue

        let byKey = counts.get(index)
        if (!byKey) {
          byKey = new Map()
          counts.set(index, byKey)
        }
        byKey.set(completion.key, (byKey.get(completion.key) ?? 0) + 1)
      }

      for (const [index, byKey] of counts) {
        const point = points[index]!
        const { credited, placed } = this.creditCounts(task, byKey)
        if (expectations[index]! > 0) {
          point.done += credited
          point.extras += placed - credited
        } else {
          point.extras += placed
        }
      }
    }

    return points
  }

  /**
   * Records one check-off for the period containing `referenceDate`, or clears
   * the period when it is already full.
   *
   * The wrap is what keeps a once-a-period task a plain toggle: 0 -> 1 -> 0. For
   * a task needing several it is the coarse undo, starting the period over;
   * `undoCompletion` takes back a single check. Keyed on the period rather than
   * a flag, so rollover into the next period is derived rather than written and
   * repeated clicks cannot corrupt the state.
   */
  advanceCompletion(id: string, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const key = periodKey(task.frequency, referenceDate)

    // Writing a future key would break the "rollover is derived, never written"
    // invariant: the task would silently read as already done once that period
    // arrives. Comparing keys lexicographically is safe because both are in the
    // same frequency's zero-padded format, where lexicographic order is
    // chronological -- including across ISO week-years (2025-W52 < 2026-W01).
    if (key > periodKey(task.frequency, new Date())) {
      return { success: false, error: 'Nao e possivel concluir um periodo futuro.' }
    }

    const count = this.isCompletedFor(task, referenceDate)
      ? 0
      : this.completionCountFor(task, referenceDate) + 1

    this.taskRepo.update({
      ...task,
      completions: this.withCount(task.completions, key, count),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Writes an exact number of check-offs for the period, which is what tapping a
   * cell on the gauge means: "I am at four of eight". Clamped rather than
   * refused, so a gauge rendered from a stale count cannot write past the target.
   */
  setCompletionCount(id: string, count: number, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const key = periodKey(task.frequency, referenceDate)
    if (key > periodKey(task.frequency, new Date())) {
      return { success: false, error: 'Nao e possivel concluir um periodo futuro.' }
    }

    const clamped = Math.min(Math.max(Math.trunc(count), 0), task.timesPerPeriod)
    if (clamped === this.completionCountFor(task, referenceDate)) return { success: true }

    this.taskRepo.update({
      ...task,
      completions: this.withCount(task.completions, key, clamped),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Takes back a single check-off in the period containing `referenceDate`.
   *
   * Nothing to undo is a success, not an error: the control is disabled at zero,
   * so reaching here means a stale render, and a toast about it would be noise.
   * Which occurrence is dropped does not matter -- they are the same string.
   */
  undoCompletion(id: string, referenceDate: Date = new Date()): UseCaseResult {
    const task = this.taskRepo.getById(id)
    if (!task) return { success: false, error: 'Tarefa nao encontrada.' }

    const count = this.completionCountFor(task, referenceDate)
    if (count === 0) return { success: true }

    this.taskRepo.update({
      ...task,
      completions: this.withCount(
        task.completions,
        periodKey(task.frequency, referenceDate),
        count - 1,
      ),
      updatedAt: new Date(),
    })
    return { success: true }
  }

  /**
   * Rewrites the period to hold exactly `count` copies of `key`, enforcing the
   * retention cap by dropping the oldest OTHER keys.
   *
   * Pruning the plain tail instead would drop the array minimum -- which is the
   * key just written whenever the user checks off a period older than everything
   * stored. That silently swallowed the write and re-rendered the box unchecked.
   *
   * Duplicates are the point: the sort keeps them adjacent, so the array stays
   * chronological. `count` is bounded by MAX_TIMES_PER_PERIOD, far below the cap,
   * so the slice length can never reach zero and swallow the prune.
   */
  private withCount(completions: Completion[], key: string, count: number): Completion[] {
    // Kept entries keep their original moment; only the surplus is new. Slicing
    // from the FRONT is what makes undo take back the most recent check rather
    // than the first one, which would rewrite history the user can see.
    const mine = completions.filter((completion) => completion.key === key).slice(0, count)
    const now = new Date()
    while (mine.length < count) mine.push({ key, at: now })

    const others = completions
      .filter((completion) => completion.key !== key)
      .sort(byKey)
      .slice(-(MAX_COMPLETIONS - count))

    // A stable sort by key alone, so entries within one period keep the order
    // they were recorded in -- which is chronological.
    return [...others, ...mine].sort(byKey)
  }

  /**
   * The task's check-offs grouped into the periods they belong to, most recent
   * first. Grouping lives here rather than in the view because "which period is
   * this check-off part of" is the completion model's own question.
   *
   * Periods are ordered by their latest recorded moment, falling back to the key:
   * a frequency change leaves keys of several formats behind, and those do not
   * sort chronologically against each other.
   */
  completionHistory(task: Task): CompletionPeriod[] {
    const periods = new Map<string, Completion[]>()
    for (const completion of task.completions) {
      const entries = periods.get(completion.key)
      if (entries) entries.push(completion)
      else periods.set(completion.key, [completion])
    }

    return [...periods]
      .map(([key, entries]) => ({
        key,
        entries,
        latest: Math.max(0, ...entries.map((entry) => entry.at?.getTime() ?? 0)),
      }))
      .sort((a, b) => b.latest - a.latest || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
  }

  /**
   * The whole reading of one task's past: streaks, adherence, the run chart,
   * the heatmap and the two rhythms.
   *
   * It lives here for the reason `completionHistory` does -- "which period is
   * this check-off part of" is the completion model's own question -- and it is
   * ONE method rather than six because all six answers come from the same pass
   * over `completions`, which can hold `MAX_COMPLETIONS` entries.
   */
  taskInsight(task: Task, now: Date = new Date()): TaskInsight {
    const target = task.timesPerPeriod

    // Every key, then the subset this cadence can actually measure.
    const counts = new Map<string, number>()
    const byWeekday = [0, 0, 0, 0, 0, 0, 0]
    const byHour = Array.from({ length: 24 }, () => 0)
    let dated = 0
    let lastAt: Date | undefined

    for (const completion of task.completions) {
      counts.set(completion.key, (counts.get(completion.key) ?? 0) + 1)

      if (completion.at) {
        dated += 1
        const hour = completion.at.getHours()
        byHour[hour] = (byHour[hour] ?? 0) + 1
        if (!lastAt || completion.at > lastAt) lastAt = completion.at
      }
      // A weekday is the coarser question, so a dateless daily key can still
      // answer it -- the same fallback order `placeCompletion` uses.
      const day = this.completionDay(completion)
      if (day) {
        const weekday = isoWeekday(day) - 1
        byWeekday[weekday] = (byWeekday[weekday] ?? 0) + 1
      }
    }

    let counted = 0
    const doneIndices = new Set<number>()
    for (const [key, count] of counts) {
      if (!matchesFrequency(task.frequency, key)) continue
      counted += count
      if (count < target) continue
      const index = periodIndex(task.frequency, key)
      if (index !== null) doneIndices.add(index)
    }

    const nowIndex = periodIndex(task.frequency, periodKey(task.frequency, now))
    const createdIndex = periodIndex(task.frequency, periodKey(task.frequency, task.createdAt))
    const periodsElapsed =
      nowIndex !== null && createdIndex !== null ? Math.max(1, nowIndex - createdIndex + 1) : 1

    /*
     * A one-off has no index and so lands in no `doneIndices`, but it does have
     * a period and it can be finished: without this a completed one-off would
     * read 0% kept, which is the opposite of the truth.
     */
    const periodsDone =
      task.frequency === 'once' ? ((counts.get('once') ?? 0) >= target ? 1 : 0) : doneIndices.size

    return {
      total: task.completions.length,
      counted,
      periodsDone,
      periodsElapsed,
      rate: percentOf({ done: Math.min(periodsDone, periodsElapsed), total: periodsElapsed }),
      streak: this.currentStreak(doneIndices, nowIndex),
      bestStreak: this.bestStreak(doneIndices),
      lastAt,
      daysSince: lastAt ? this.daysBetween(lastAt, now) : undefined,
      timeline: this.timeline(task, counts, now),
      heat: task.frequency === 'daily' ? this.heatmap(task, counts, now) : [],
      byWeekday,
      byHour,
      dated,
    }
  }

  /**
   * Completed periods in an unbroken run ending at the present one.
   *
   * The running period is skipped rather than counted as a miss when it is not
   * done yet: a task that has been kept for forty days must not read zero every
   * morning until the box is ticked. Once it IS ticked the run includes it, so
   * the figure only ever grows on the day.
   */
  private currentStreak(doneIndices: Set<number>, nowIndex: number | null): number {
    if (nowIndex === null) return 0
    let cursor = doneIndices.has(nowIndex) ? nowIndex : nowIndex - 1
    let streak = 0
    while (doneIndices.has(cursor)) {
      streak += 1
      cursor -= 1
    }
    return streak
  }

  /**
   * The longest run of consecutive completed periods.
   *
   * Consecutive is an arithmetic question here, not a calendar one, which is
   * the whole reason `periodIndex` exists: `2026-W52` is followed by `2026-W53`
   * in some years and `2027-W01` in others.
   */
  private bestStreak(doneIndices: Set<number>): number {
    let best = 0
    let run = 0
    let previous: number | undefined
    for (const index of [...doneIndices].sort((a, b) => a - b)) {
      run = previous !== undefined && index === previous + 1 ? run + 1 : 1
      if (run > best) best = run
      previous = index
    }
    return best
  }

  /** Whole days between two moments, by calendar day rather than by clock. */
  private daysBetween(from: Date, to: Date): number {
    const fromIndex = periodIndex('daily', periodKey('daily', from))!
    const toIndex = periodIndex('daily', periodKey('daily', to))!
    return toIndex - fromIndex
  }

  /**
   * The last N periods of the task's own cadence, oldest first, so the chart
   * reads left to right into the present.
   *
   * Walked as DATES rather than by decrementing an index, because a key cannot
   * be built from an index -- `addPeriods` is what knows that stepping back a
   * month from the 31st must not land in the wrong one.
   */
  private timeline(task: Task, counts: Map<string, number>, now: Date): PeriodPoint[] {
    const span = TIMELINE_PERIODS[task.frequency]
    if (span === 0) return []

    const currentKey = periodKey(task.frequency, now)
    const createdKey = periodKey(task.frequency, task.createdAt)

    return Array.from({ length: span }, (_, index) => {
      const key = periodKey(task.frequency, addPeriods(task.frequency, now, index - (span - 1)))
      return {
        key,
        label: formatPeriodShort(task.frequency, key),
        count: counts.get(key) ?? 0,
        target: task.timesPerPeriod,
        isCurrent: key === currentKey,
        // One format, so a string comparison is a chronological one.
        existed: createdKey <= key,
      }
    })
  }

  /**
   * `HEAT_WEEKS` weeks of days, ordered COLUMN BY COLUMN -- a week per column,
   * Monday at the top -- because that is the order a CSS grid flowing down its
   * rows will lay them out.
   *
   * Daily tasks only: for any other cadence every cell in a column but one
   * would be blank, which reads as a task nobody keeps rather than as a
   * cadence that does not visit every day.
   */
  private heatmap(task: Task, counts: Map<string, number>, now: Date): HeatCell[] {
    const firstMonday = addWeeks(weekStart(now), -(HEAT_WEEKS - 1))
    const todayKey = periodKey('daily', now)
    const createdKey = periodKey('daily', task.createdAt)

    return Array.from({ length: HEAT_WEEKS * 7 }, (_, index) => {
      const date = new Date(firstMonday)
      date.setDate(firstMonday.getDate() + index)
      const key = periodKey('daily', date)
      return {
        key,
        date,
        count: counts.get(key) ?? 0,
        target: task.timesPerPeriod,
        existed: createdKey <= key,
        // The current week runs past today; those cells are not misses.
        isFuture: key > todayKey,
      }
    })
  }

  /**
   * Whether the task already existed in the period containing `referenceDate`.
   *
   * Browsing back to a month before a task was created would otherwise show it
   * as not done, counting work that was impossible against that period.
   */
  existsIn(task: Task, referenceDate: Date = new Date()): boolean {
    // A one-off's key carries no date, so it cannot answer "did this exist yet".
    // Its existence is a plain calendar comparison instead; without this, a task
    // created today would show up while browsing last month.
    if (task.frequency === 'once') {
      return periodKey('daily', task.createdAt) <= periodKey('daily', referenceDate)
    }
    return periodKey(task.frequency, task.createdAt) <= periodKey(task.frequency, referenceDate)
  }

  /**
   * The weekday gate on its own: a weekly task pinned to a weekday does not show
   * before that day of the week.
   *
   * Gating on `frequency` here too means a legacy or hand-edited document
   * carrying a weekday on a non-weekly task still behaves correctly, rather than
   * relying on the write path having always been clean.
   */
  private appearsOn(task: Task, referenceDate: Date): boolean {
    if (task.frequency !== 'weekly' || task.weekday === undefined) return true
    return isoWeekday(referenceDate) >= task.weekday
  }

  /**
   * The single predicate the views filter by: the task existed then, and its
   * weekday (if any) has come up.
   */
  isDueOn(task: Task, referenceDate: Date = new Date()): boolean {
    return this.existsIn(task, referenceDate) && this.appearsOn(task, referenceDate)
  }

  /**
   * Past its weekday within the same week and still not done, so it can still be
   * caught up. Note a Sunday task can never be late -- there is no day after
   * Sunday in an ISO week.
   */
  isLateOn(task: Task, referenceDate: Date = new Date()): boolean {
    if (task.frequency !== 'weekly' || task.weekday === undefined) return false
    if (isoWeekday(referenceDate) <= task.weekday) return false
    if (this.isCompletedFor(task, referenceDate)) return false

    // 'Atrasada' is a claim about the past. Browsing forward inside the current
    // week must not make a day that has not happened look overdue.
    if (referenceDate > new Date()) return false

    // `existsIn` compares period keys, so a weekly task created on Friday
    // "existed" from Monday of that week. Without this a task seconds old would
    // be overdue for a due day that predates it.
    const createdThisWeek =
      periodKey('weekly', task.createdAt) === periodKey('weekly', referenceDate)
    if (createdThisWeek && isoWeekday(task.createdAt) > task.weekday) return false

    return true
  }

  /** Active tasks due in the period containing `referenceDate` and still open. */
  pendingFor(referenceDate: Date = new Date()): Task[] {
    return this.taskRepo
      .getAll()
      .filter((task) => task.active)
      .filter((task) => this.isDueOn(task, referenceDate))
      .filter((task) => !this.isCompletedFor(task, referenceDate))
  }
}
