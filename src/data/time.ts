import { format, parseISO, isValid } from "date-fns";

export function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

export function formatFullDateTime(date: Date): string {
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function parseTimestamp(timestamp: string | number | Date): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  if (typeof timestamp === "number") {
    return new Date(timestamp);
  }
  
  if (typeof timestamp === "string") {
    // Try ISO format first
    try {
      const isoDate = parseISO(timestamp);
      if (isValid(isoDate)) {
        return isoDate;
      }
    } catch {
      // Fall through to other attempts
    }
    
    // Try direct Date parsing
    const directDate = new Date(timestamp);
    if (isValid(directDate)) {
      return directDate;
    }
  }
  
  // Fallback to current time
  return new Date();
}

export function groupSessionsByDate(sessions: import("./types.ts").Session[]): Map<string, import("./types.ts").Session[]> {
  const byDate = new Map<string, import("./types.ts").Session[]>();
  
  for (const session of sessions) {
    const dateKey = formatDateKey(session.startedAt);
    const existing = byDate.get(dateKey) || [];
    existing.push(session);
    byDate.set(dateKey, existing);
  }
  
  // Sort sessions within each date
  for (const [dateKey, sessionsForDate] of byDate) {
    sessionsForDate.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    byDate.set(dateKey, sessionsForDate);
  }
  
  return byDate;
}

export function sortDateKeysDescending(dateKeys: string[]): string[] {
  return dateKeys.sort((a, b) => b.localeCompare(a)); // Descending (newest first)
}