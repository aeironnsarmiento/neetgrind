// Turns a week-based plan into "what to do today". NeetCode streaks roll over at UTC midnight,
// so days here are UTC days too.

export const DAY_MS = 86_400_000;

export const utcDay = (date) => Math.floor(new Date(date).getTime() / DAY_MS);

export function todayUtcISO(now = new Date()) {
  return new Date(utcDay(now) * DAY_MS).toISOString().slice(0, 10);
}

// Where the calendar says you are in the plan.
export function planPosition(plan, now = new Date()) {
  const weeks = plan.settings.weeks;
  const dayIndex = utcDay(now) - utcDay(plan.startDate);
  const totalDays = weeks * 7;
  if (dayIndex < 0) return { state: "not-started", dayIndex, week: 1, weeks, daysLeftInWeek: 7, daysUntilStart: -dayIndex };
  if (dayIndex >= totalDays) return { state: "overtime", dayIndex, week: weeks, weeks, daysLeftInWeek: 1 };
  const week = Math.floor(dayIndex / 7) + 1;
  return { state: "active", dayIndex, week, weeks, dayOfWeek: (dayIndex % 7) + 1, daysLeftInWeek: 7 - (dayIndex % 7) };
}

// Undone questions scheduled up to and including the current week, in plan order.
export function backlog(questions, week, isDone) {
  return questions.filter((q) => q.week <= week && !isDone(q));
}

// Today's quota: spread the backlog evenly over the days left in this week.
// Call once per UTC day and cache the result, so finishing questions doesn't grow today's list.
export function dailyTarget(plan, isDone, now = new Date()) {
  const pos = planPosition(plan, now);
  if (pos.state === "not-started") return { pos, slugs: [] };
  const pending = backlog(plan.questions, pos.week, isDone);
  const count = Math.ceil(pending.length / pos.daysLeftInWeek);
  return { pos, slugs: pending.slice(0, count).map((q) => q.slug) };
}

export function paceSummary(plan, isDone, now = new Date()) {
  const pos = planPosition(plan, now);
  const done = plan.questions.filter(isDone).length;
  const overdue = plan.questions.filter((q) => q.week < pos.week && !isDone(q)).length;
  const thisWeek = plan.questions.filter((q) => q.week === pos.week);
  return {
    pos,
    done,
    total: plan.questions.length,
    overdue: pos.state === "not-started" ? 0 : overdue,
    weekDone: thisWeek.filter(isDone).length,
    weekTotal: thisWeek.length,
  };
}
