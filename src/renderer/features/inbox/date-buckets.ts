export type InboxMail = {
  date?: string;
  [key: string]: unknown;
};

export type InboxBucket = 'today' | 'week' | 'month' | 'older';

export type DateBucketContext = {
  todayStr: string;
  weekStart: Date;
  weekEnd: Date;
  monthStart: Date;
  monthEnd: Date;
};

export type GroupedInbox = {
  order: InboxBucket[];
  labels: Record<InboxBucket, string>;
  groups: Record<InboxBucket, InboxMail[]>;
};

export function parseMailDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildDateContext(nowInput?: Date): DateBucketContext {
  const now = nowInput instanceof Date ? nowInput : new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return {
    todayStr,
    weekStart,
    weekEnd,
    monthStart,
    monthEnd,
  };
}

export function getDateBucket(d: Date | null, ctx: DateBucketContext): InboxBucket {
  if (!d) return 'older';
  const ds = d.toISOString().slice(0, 10);
  if (ds === ctx.todayStr) return 'today';
  if (d >= ctx.weekStart && d <= ctx.weekEnd) return 'week';
  if (d >= ctx.monthStart && d <= ctx.monthEnd) return 'month';
  return 'older';
}

export function groupInboxMailsByDate(mails: InboxMail[], nowInput?: Date): GroupedInbox {
  const ctx = buildDateContext(nowInput);
  const order: InboxBucket[] = ['today', 'week', 'month', 'older'];
  const labels: Record<InboxBucket, string> = {
    today: "Aujourd'hui",
    week: 'Cette semaine',
    month: 'Ce mois',
    older: 'Plus ancien',
  };
  const groups: Record<InboxBucket, InboxMail[]> = {
    today: [],
    week: [],
    month: [],
    older: [],
  };

  for (const mail of mails || []) {
    const d = parseMailDate(mail?.date);
    const bucket = getDateBucket(d, ctx);
    groups[bucket].push(mail);
  }

  return {
    order,
    labels,
    groups,
  };
}
