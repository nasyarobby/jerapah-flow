export const CRON_PRESETS = [
  { id: "every-minute", label: "Every minute", schedule: "* * * * *" },
  { id: "every-5-minutes", label: "Every 5 minutes", schedule: "*/5 * * * *" },
  { id: "every-15-minutes", label: "Every 15 minutes", schedule: "*/15 * * * *" },
  { id: "every-30-minutes", label: "Every 30 minutes", schedule: "*/30 * * * *" },
  { id: "every-hour", label: "Every hour", schedule: "0 * * * *" },
  { id: "every-2-hours", label: "Every 2 hours", schedule: "0 */2 * * *" },
  { id: "every-6-hours", label: "Every 6 hours", schedule: "0 */6 * * *" },
  { id: "daily-midnight", label: "Every day at midnight", schedule: "0 0 * * *" },
  { id: "daily-1am", label: "Every day at 1:00 AM", schedule: "0 1 * * *" },
  { id: "weekdays-9am", label: "Weekdays at 9:00 AM", schedule: "0 9 * * 1-5" },
];

export const CRON_CUSTOM = "custom";

export function matchCronPreset(schedule) {
  const value = String(schedule ?? "").trim();
  const found = CRON_PRESETS.find((p) => p.schedule === value);
  return found?.id ?? CRON_CUSTOM;
}

export function scheduleForPreset(id) {
  return CRON_PRESETS.find((p) => p.id === id)?.schedule ?? null;
}
