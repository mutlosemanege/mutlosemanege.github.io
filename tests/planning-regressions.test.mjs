import assert from 'node:assert/strict'
const { DEFAULT_PREFERENCES } = await import('../app/types/task.ts')

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

globalThis.usePreferences = () => ({
  preferences: { value: structuredClone(DEFAULT_PREFERENCES) },
  getDailyCommit: (date = new Date()) => ({
    dateKey: toDateKey(date),
    committedTaskIds: [],
    deferredTaskIds: [],
  }),
  getDailyReflection: (date = new Date()) => ({
    dateKey: toDateKey(date),
    tags: [],
    note: '',
  }),
})

const { useScheduler } = await import('../app/composables/useScheduler.ts')
const { parsePlanningPrompt } = await import('../app/utils/planningChatCore.ts')

function buildPreferences(overrides = {}) {
  return {
    ...structuredClone(DEFAULT_PREFERENCES),
    respectPublicHolidays: false,
    workDays: [1, 2, 3, 4, 5],
    deepWorkWindows: [],
    taskBufferMinutes: 0,
    lunchStartHour: 12,
    lunchEndHour: 13,
    ...overrides,
  }
}

function buildTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Testaufgabe',
    estimatedMinutes: 60,
    priority: 'high',
    status: 'todo',
    dependencies: [],
    isDeepWork: false,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

function buildEvent(startIso, endIso, summary = 'Busy') {
  return {
    summary,
    start: { dateTime: startIso },
    end: { dateTime: endIso },
  }
}

function totalMinutes(blocks) {
  return blocks.reduce((sum, block) => sum + ((block.end.getTime() - block.start.getTime()) / 60000), 0)
}

function withFixedNow(isoString, run) {
  const OriginalDate = Date
  const fixedTime = new OriginalDate(isoString).getTime()

  globalThis.Date = class extends OriginalDate {
    constructor(value) {
      if (arguments.length === 0) {
        super(fixedTime)
        return
      }
      super(value)
    }

    static now() {
      return fixedTime
    }

    static parse(value) {
      return OriginalDate.parse(value)
    }

    static UTC(...args) {
      return OriginalDate.UTC(...args)
    }
  }

  try {
    run()
  } finally {
    globalThis.Date = OriginalDate
  }
}

const cases = [
  {
    name: 'scheduler teilt lange Aufgaben ueber mehrere Bloecke ohne Ueberlappung',
    run: () => withFixedNow('2026-04-06T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        taskBufferMinutes: 15,
        workStartHour: 9,
        workEndHour: 18,
        lunchStartHour: 12,
        lunchEndHour: 13,
      })
      const task = buildTask({
        estimatedMinutes: 240,
        deadline: '2026-04-06T23:59:59.000Z',
      })
      const events = [
        buildEvent('2026-04-06T10:00:00.000Z', '2026-04-06T11:00:00.000Z', 'Meeting'),
        buildEvent('2026-04-06T15:00:00.000Z', '2026-04-06T16:00:00.000Z', 'Call'),
      ]

      const plan = scheduleTasks([task], events, prefs).get(task.id)

      assert.ok(plan, 'Aufgabe sollte geplant werden')
      assert.ok(plan.blocks.length >= 2, 'Aufgabe sollte in mehrere Bloecke aufgeteilt werden')
      assert.equal(totalMinutes(plan.blocks), 240)

      for (let index = 1; index < plan.blocks.length; index++) {
        assert.ok(plan.blocks[index].start >= plan.blocks[index - 1].end, 'Bloecke duerfen sich nicht ueberlappen')
      }
    }),
  },
  {
    name: 'scheduler respektiert Dependencies und plant Nachfolger erst nach dem Vorgaenger',
    run: () => withFixedNow('2026-04-06T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workStartHour: 9,
        workEndHour: 17,
        lunchStartHour: 12,
        lunchEndHour: 13,
      })
      const predecessor = buildTask({
        id: 'a',
        title: 'Teil 1',
        estimatedMinutes: 120,
        deadline: '2026-04-07T23:59:59.000Z',
      })
      const successor = buildTask({
        id: 'b',
        title: 'Teil 2',
        estimatedMinutes: 120,
        deadline: '2026-04-07T23:59:59.000Z',
        dependencies: ['a'],
      })

      const schedule = scheduleTasks([predecessor, successor], [], prefs)
      const aPlan = schedule.get('a')
      const bPlan = schedule.get('b')

      assert.ok(aPlan && bPlan, 'Beide Aufgaben sollten planbar sein')
      assert.ok(
        bPlan.blocks[0].start >= aPlan.blocks[aPlan.blocks.length - 1].end,
        'Nachfolger darf nicht vor dem Ende der Dependency starten',
      )
    }),
  },
  {
    name: 'scheduler laesst unplanbare Aufgaben ohne Ergebnis, wenn die Deadline nicht reicht',
    run: () => withFixedNow('2026-04-06T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workDays: [1],
        workStartHour: 9,
        workEndHour: 11,
        lunchStartHour: 11,
        lunchEndHour: 11,
      })
      const task = buildTask({
        estimatedMinutes: 240,
        deadline: '2026-04-06T23:59:59.000Z',
      })

      const schedule = scheduleTasks([task], [], prefs)
      assert.equal(schedule.has(task.id), false)
    }),
  },
  {
    name: 'scheduler respektiert gesetzliche Feiertage der gewählten Region als Blocker',
    run: () => withFixedNow('2026-12-25T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        respectPublicHolidays: true,
        publicHolidayRegion: 'DE',
        workDays: [5],
        workStartHour: 9,
        workEndHour: 17,
        lunchStartHour: 17,
        lunchEndHour: 17,
      })
      const task = buildTask({
        estimatedMinutes: 60,
        deadline: '2026-12-25T23:59:59.000Z',
      })

      const schedule = scheduleTasks([task], [], prefs)
      assert.equal(schedule.has(task.id), false)
    }),
  },
  {
    name: 'scheduler behandelt ganztagige Events als Blocker fuer den betroffenen Arbeitstag',
    run: () => withFixedNow('2026-04-06T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workDays: [1],
        workStartHour: 9,
        workEndHour: 17,
        lunchStartHour: 17,
        lunchEndHour: 17,
      })
      const task = buildTask({
        estimatedMinutes: 60,
        deadline: '2026-04-06T23:59:59.000Z',
      })
      const events = [{
        summary: 'Ganztagig',
        start: { date: '2026-04-06' },
        end: { date: '2026-04-07' },
      }]

      const schedule = scheduleTasks([task], events, prefs)
      assert.equal(schedule.has(task.id), false)
    }),
  },
  {
    name: 'scheduler respektiert ueber-Mitternacht-Termine am naechsten Tag',
    run: () => withFixedNow('2026-04-07T00:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workDays: [2],
        workStartHour: 0,
        workEndHour: 8,
        lunchStartHour: 8,
        lunchEndHour: 8,
      })
      const task = buildTask({
        estimatedMinutes: 60,
        deadline: '2026-04-07T23:59:59.000Z',
      })
      const events = [
        buildEvent('2026-04-06T22:30:00.000Z', '2026-04-07T02:30:00.000Z', 'Nachttermin'),
      ]

      const plan = scheduleTasks([task], events, prefs).get(task.id)
      assert.ok(plan, 'Aufgabe sollte nach dem Nachttermin planbar sein')
      assert.ok(
        plan.blocks[0].start >= new Date('2026-04-07T02:30:00.000Z'),
        'Der erste Block darf nicht in den ueber-Mitternacht-Termin hineinragen',
      )
    }),
  },
  {
    name: 'scheduler bleibt ueber DST-Grenzen mit expliziten Offsets stabil',
    run: () => withFixedNow('2026-03-29T00:45:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workDays: [0],
        workStartHour: 0,
        workEndHour: 8,
        lunchStartHour: 8,
        lunchEndHour: 8,
      })
      const task = buildTask({
        estimatedMinutes: 60,
        deadline: '2026-03-29T23:59:59.000Z',
      })
      const events = [
        buildEvent('2026-03-29T01:30:00+01:00', '2026-03-29T03:30:00+02:00', 'DST-Sprung'),
      ]

      const plan = scheduleTasks([task], events, prefs).get(task.id)
      assert.ok(plan, 'Aufgabe sollte trotz DST-Grenze planbar sein')
      assert.ok(
        plan.blocks[0].start >= new Date('2026-03-29T03:30:00+02:00'),
        'Der erste Block darf nicht in das DST-Event hineinragen',
      )
    }),
  },
  {
    name: 'reschedule-modus today bevorzugt einen Slot heute statt eine spaetere aehnliche Uhrzeit',
    run: () => withFixedNow('2026-04-06T08:00:00.000Z', () => {
      const { scheduleTasks } = useScheduler()
      const prefs = buildPreferences({
        workDays: [1, 2],
        workStartHour: 9,
        workEndHour: 18,
        lunchStartHour: 12,
        lunchEndHour: 13,
      })
      const task = buildTask({
        estimatedMinutes: 60,
        deadline: '2026-04-08T23:59:59.000Z',
      })
      const events = [
        buildEvent('2026-04-06T09:00:00.000Z', '2026-04-06T15:00:00.000Z', 'Block heute'),
        buildEvent('2026-04-06T16:00:00.000Z', '2026-04-06T18:00:00.000Z', 'Spaeter Block heute'),
      ]

      const sameTimeSchedule = scheduleTasks([task], events, prefs, {
        preferredStartByTaskId: { [task.id]: '2026-04-07T10:00:00.000Z' },
        rescheduleModeByTaskId: { [task.id]: 'same-time' },
      }).get(task.id)

      const todaySchedule = scheduleTasks([task], events, prefs, {
        preferredStartByTaskId: { [task.id]: '2026-04-07T10:00:00.000Z' },
        rescheduleModeByTaskId: { [task.id]: 'today' },
      }).get(task.id)

      assert.ok(sameTimeSchedule && todaySchedule, 'Beide Modi sollten einen Slot finden')
      const preferredStart = new Date('2026-04-07T10:00:00.000Z')
      const sameTimeDistance = Math.abs(sameTimeSchedule.blocks[0].start.getTime() - preferredStart.getTime())
      const todayDistance = Math.abs(todaySchedule.blocks[0].start.getTime() - preferredStart.getTime())

      assert.ok(
        sameTimeDistance < todayDistance,
        'same-time sollte naeher an der gewuenschten Uhrzeit bleiben als today',
      )
      assert.ok(
        sameTimeSchedule.blocks[0].start.getDate() !== todaySchedule.blocks[0].start.getDate(),
        'today und same-time sollten in diesem Szenario unterschiedliche Tage bevorzugen',
      )
    }),
  },
  {
    name: 'chat-parser erkennt Event, Task, Routine und Zeitfenster stabil',
    run: () => {
      const baseNow = new Date('2026-04-05T10:00:00.000Z')

      const eventRequest = parsePlanningPrompt('Treffen mit Bro morgen Abend', 60, 'auto', baseNow)
      assert.equal(eventRequest.intent, 'event')
      assert.equal(eventRequest.hasExplicitDate, true)
      assert.equal(eventRequest.preferredPeriod, 'evening')

      const taskRequest = parsePlanningPrompt('2h Videoschnitt naechste Woche vormittags', 60, 'auto', baseNow)
      assert.equal(taskRequest.intent, 'task')
      assert.equal(taskRequest.durationMinutes, 120)
      assert.equal(taskRequest.preferredPeriod, 'morning')
      assert.equal(taskRequest.hasExplicitDate, true)

      const routineRequest = parsePlanningPrompt('jeden Mittwoch Gym 18 bis 20 Uhr', 60, 'auto', baseNow)
      assert.equal(routineRequest.intent, 'routine')
      assert.equal(routineRequest.recurrenceDay, 3)
      assert.equal(routineRequest.timePreference?.startMinutes, 18 * 60)
      assert.equal(routineRequest.timePreference?.endMinutes, 20 * 60)

      const windowRequest = parsePlanningPrompt('uebermorgen 45 min review zwischen 14 und 17 uhr', 30, 'auto', baseNow)
      assert.equal(windowRequest.dateFrom.toISOString().slice(0, 10), '2026-04-07')
      assert.equal(windowRequest.timePreference?.startMinutes, 14 * 60)
      assert.equal(windowRequest.timePreference?.endMinutes, 17 * 60)

      const exactTimeRequest = parsePlanningPrompt('Treffen mit Bro 12 Uhr', 60, 'auto', baseNow)
      assert.equal(exactTimeRequest.intent, 'event')
      assert.equal(exactTimeRequest.timePreference?.exactStartMinutes, 12 * 60)
      assert.equal(exactTimeRequest.timePreference?.startMinutes, 12 * 60)
      assert.equal(exactTimeRequest.timePreference?.endMinutes, 13 * 60)
      assert.equal(exactTimeRequest.timePreference?.label, 'um 12:00')

      const numericDateRequest = parsePlanningPrompt('Treffen mit Bro am 12.05. 12 Uhr', 60, 'auto', baseNow)
      assert.equal(numericDateRequest.hasExplicitDate, true)
      assert.equal(numericDateRequest.dateFrom.getMonth(), 4)
      assert.equal(numericDateRequest.dateFrom.getDate(), 12)

      const fridayRequest = parsePlanningPrompt('Treffen diesen Freitag 12 Uhr', 60, 'auto', baseNow)
      assert.equal(fridayRequest.hasExplicitDate, true)
      assert.equal(fridayRequest.dateFrom.getDay(), 5)
      assert.equal(fridayRequest.timePreference?.exactStartMinutes, 12 * 60)

      const recurringFridayRequest = parsePlanningPrompt('freitags Gym 18 Uhr', 60, 'auto', baseNow)
      assert.equal(recurringFridayRequest.intent, 'routine')
      assert.equal(recurringFridayRequest.recurrenceDay, 5)

      const dailyRoutineRequest = parsePlanningPrompt('taeglich Lesen 20 Uhr', 45, 'auto', baseNow)
      assert.equal(dailyRoutineRequest.intent, 'routine')
      assert.equal(dailyRoutineRequest.recurrenceMode, 'daily')
      assert.equal(dailyRoutineRequest.recurrenceLabel, 'Täglich')

      const workdaysRoutineRequest = parsePlanningPrompt('mo-fr Gym 07:30 Uhr', 60, 'auto', baseNow)
      assert.equal(workdaysRoutineRequest.intent, 'routine')
      assert.equal(workdaysRoutineRequest.recurrenceMode, 'workdays')
      assert.equal(workdaysRoutineRequest.recurrenceLabel, 'An Arbeitstagen')
      assert.equal(workdaysRoutineRequest.timePreference?.exactStartMinutes, (7 * 60) + 30)

      const frequencyRoutineRequest = parsePlanningPrompt('3x die Woche Gym', 60, 'auto', baseNow)
      assert.equal(frequencyRoutineRequest.intent, 'routine')
      assert.equal(frequencyRoutineRequest.recurrenceFrequencyPerWeek, 3)
      assert.ok(frequencyRoutineRequest.ambiguityHints.some(hint => hint.includes('3x pro Woche')))
      assert.equal(frequencyRoutineRequest.title, 'gym')

      const highFrequencyRoutineRequest = parsePlanningPrompt('6mal die Woche Gym', 60, 'auto', baseNow)
      assert.equal(highFrequencyRoutineRequest.intent, 'routine')
      assert.equal(highFrequencyRoutineRequest.recurrenceFrequencyPerWeek, 6)
      assert.equal(highFrequencyRoutineRequest.title, 'gym')

      // Multi-weekday: plural forms → multipleWeekdays array
      const restDayRoutineRequest = parsePlanningPrompt('6x die Woche gym ruhetag donnerstag', 60, 'auto', baseNow)
      assert.equal(restDayRoutineRequest.intent, 'routine')
      assert.equal(restDayRoutineRequest.recurrenceFrequencyPerWeek, 6)
      assert.equal(restDayRoutineRequest.multipleWeekdays.length, 6)
      assert.deepStrictEqual([...restDayRoutineRequest.multipleWeekdays].sort((a, b) => a - b), [0, 1, 2, 3, 5, 6])
      assert.equal(restDayRoutineRequest.multipleWeekdays.includes(4), false)
      assert.equal(restDayRoutineRequest.title, 'gym')
      assert.equal(restDayRoutineRequest.title.includes('ruhetag'), false)

      const cycleRoutineRequest = parsePlanningPrompt('3 tage dann 1 tag pause', 60, 'auto', baseNow)
      assert.deepStrictEqual(cycleRoutineRequest.cyclePattern, { trainDays: 3, restDays: 1 })

      const everyFourDaysRoutineRequest = parsePlanningPrompt('alle 4 tage 1 ruhetag', 60, 'auto', baseNow)
      assert.deepStrictEqual(everyFourDaysRoutineRequest.cyclePattern, { trainDays: 3, restDays: 1 })

      const spacedSportRoutineRequest = parsePlanningPrompt('immer 2 tage dazwischen sport', 60, 'auto', baseNow)
      assert.deepStrictEqual(spacedSportRoutineRequest.cyclePattern, { trainDays: 1, restDays: 2 })

      const multiWeekdayRequest = parsePlanningPrompt('Gym montags mittwochs freitags 07:00 Uhr', 60, 'auto', baseNow)
      assert.equal(multiWeekdayRequest.intent, 'routine')
      assert.deepStrictEqual(multiWeekdayRequest.multipleWeekdays, [1, 3, 5])
      assert.equal(multiWeekdayRequest.recurrenceDay, undefined)
      assert.equal(multiWeekdayRequest.title, 'gym')
      assert.equal(multiWeekdayRequest.timePreference?.exactStartMinutes, 7 * 60)

      // Frequency-in-period: "diese Woche N mal"
      const freqInPeriodRequest = parsePlanningPrompt('diese Woche 4 mal lernen', 45, 'auto', baseNow)
      assert.equal(freqInPeriodRequest.frequencyInPeriod, 4)
      assert.equal(freqInPeriodRequest.recurrenceFrequencyPerWeek, null)
      assert.ok(freqInPeriodRequest.ambiguityHints.some(h => h.includes('4x in diesem Zeitraum')))

      // Ostern recognized as explicit date
      // Easter 2026 = April 5 — baseNow is 2024-01-15 so "ostern" resolves to 2026-04-05
      const easterRequest = parsePlanningPrompt('Osterabend essen mit Monique 19 Uhr', 120, 'auto', baseNow)
      assert.equal(easterRequest.hasExplicitDate, true)
      assert.equal(easterRequest.intent, 'event')
      assert.ok(!easterRequest.title.toLowerCase().includes('osterabend'))
      assert.equal(easterRequest.timePreference?.exactStartMinutes, 19 * 60)

      const christmasDinnerRequest = parsePlanningPrompt('Essen Heillig Abend 18 Uhr', 120, 'auto', baseNow)
      assert.equal(christmasDinnerRequest.hasExplicitDate, true)
      assert.equal(christmasDinnerRequest.dateFrom.getMonth(), 11)
      assert.equal(christmasDinnerRequest.dateFrom.getDate(), 24)
      assert.equal(christmasDinnerRequest.timePreference?.exactStartMinutes, 18 * 60)

      const nextYearHolidayRequest = parsePlanningPrompt('Essen Heiligabend 18 Uhr', 120, 'auto', new Date('2026-12-26T10:00:00.000Z'))
      assert.equal(nextYearHolidayRequest.hasExplicitDate, true)
      assert.equal(nextYearHolidayRequest.dateFrom.getFullYear(), 2027)
      assert.equal(nextYearHolidayRequest.dateFrom.getMonth(), 11)
      assert.equal(nextYearHolidayRequest.dateFrom.getDate(), 24)

      const ambiguousFridayRequest = parsePlanningPrompt('Treffen Freitag Abend', 90, 'event', baseNow)
      assert.equal(ambiguousFridayRequest.ambiguityHints.length > 0, true)
      assert.equal(ambiguousFridayRequest.preferredPeriod, 'evening')
      const scheduleKeywordTaskRequest = parsePlanningPrompt('morgen 45 min gesundheits review', 45, 'task', baseNow)
      assert.equal(scheduleKeywordTaskRequest.intent, 'task')
      assert.equal(scheduleKeywordTaskRequest.title.includes('review'), true)

      const restDayTitleRequest = parsePlanningPrompt('6x die Woche mobility ruhetag sonntag', 30, 'auto', baseNow)
      assert.equal(restDayTitleRequest.title, 'mobility')
      assert.equal(restDayTitleRequest.title.includes('ruhetag'), false)

      const exactGapRequest = parsePlanningPrompt('immer 1 tag dazwischen laufen', 60, 'auto', baseNow)
      assert.deepStrictEqual(exactGapRequest.cyclePattern, { trainDays: 1, restDays: 1 })
    },
  },
]

let failed = 0
for (const currentCase of cases) {
  try {
    currentCase.run()
    console.log(`PASS ${currentCase.name}`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${currentCase.name}`)
    console.error(error)
  }
}

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log(`OK ${cases.length} Regressionstests bestanden`)
}
