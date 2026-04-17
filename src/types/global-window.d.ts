import type { ElectronApiContract } from '@shared/contracts/ipc/electron-api.dto';

declare global {
  interface Window {
    electronAPI: ElectronApiContract;
    NeurailStateApi?: {
      fetchState: () => Promise<Record<string, unknown> | null>;
      fetchContacts: () => Promise<Array<{ name?: string; email?: string }>>;
      persistState: (state: Record<string, unknown>) => Promise<boolean>;
    };
    NeurailInboxBuckets?: {
      parseMailDate: (dateStr?: string) => Date | null;
      buildDateContext: (nowInput?: Date) => {
        todayStr: string;
        weekStart: Date;
        weekEnd: Date;
        monthStart: Date;
        monthEnd: Date;
      };
      getDateBucket: (d: Date | null, ctx: {
        todayStr: string;
        weekStart: Date;
        weekEnd: Date;
        monthStart: Date;
        monthEnd: Date;
      }) => 'today' | 'week' | 'month' | 'older';
      groupInboxMailsByDate: (mails: Array<{ date?: string; [key: string]: unknown }>, nowInput?: Date) => {
        order: Array<'today' | 'week' | 'month' | 'older'>;
        labels: Record<'today' | 'week' | 'month' | 'older', string>;
        groups: Record<'today' | 'week' | 'month' | 'older', Array<{ date?: string; [key: string]: unknown }>>;
      };
    };
  }
}

export {};
