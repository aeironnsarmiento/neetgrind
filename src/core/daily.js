// Turns a week-based plan into "what to do today". NeetCode streaks roll over at UTC midnight,
// so days here are UTC days too.

import { costOf, EST_DURATION } from "./scheduler.js";

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

// Whole minutes, so the daily split below is exact integer math.
const minutesOf = (q) => Math.round(costOf({ duration: q.duration ?? EST_DURATION[q.difficulty] ?? 30 }));

// Today's quota: spread the backlog's minutes evenly over the days left in this week, so an
// easy day gets more questions than a medium one. Takes questions in plan order until today's
// share is reached (the last one may run over, like rounding up).
// Call once per UTC day and cache the result, so finishing questions doesn't grow today's list.
export function dailyTarget(plan, isDone, now = new Date()) {
  const pos = planPosition(plan, now);
  if (pos.state === "not-started") return { pos, slugs: [] };
  const pending = backlog(plan.questions, pos.week, isDone);
  const total = pending.reduce((sum, q) => sum + minutesOf(q), 0);
  const slugs = [];
  let used = 0;
  for (const q of pending) {
    if (used * pos.daysLeftInWeek >= total) break;
    used += minutesOf(q);
    slugs.push(q.slug);
  }
  return { pos, slugs };
}

// For "Start next day": the first upcoming day's quota that still has something to do, as if
// that day had already come. Walks forward past days whose share is already done.
export function nextDayTarget(plan, isDone, now = new Date()) {
  const daysLeft = plan.settings.weeks * 7 - (utcDay(now) - utcDay(plan.startDate));
  for (let d = 1; d <= Math.max(1, daysLeft); d++) {
    const next = dailyTarget(plan, isDone, new Date(new Date(now).getTime() + d * DAY_MS));
    if (next.slugs.length) return next;
  }
  return { pos: planPosition(plan, now), slugs: [] };
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
