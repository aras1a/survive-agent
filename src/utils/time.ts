export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function msUntil(targetIso: string): number {
  return Date.parse(targetIso) - Date.now();
}

export function humanizeMs(ms: number): string {
  if (ms < 0) return "expired";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86_400);
  const hours = Math.floor((sec % 86_400) / 3_600);
  const mins = Math.floor((sec % 3_600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}
