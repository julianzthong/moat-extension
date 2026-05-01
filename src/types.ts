export type ExtensionState = {
  enabled: boolean;
  blockedDomains: string[];
  notificationsEnabled: boolean;
  schedule: {
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    daysOfWeek: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  } | null;
};

