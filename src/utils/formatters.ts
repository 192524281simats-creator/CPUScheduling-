import type { ProcessItem } from '../types/scheduler';

const PID_PALETTE = [
  { bg: 'bg-blue-600', text: 'text-white', hex: '#2563eb', border: 'border-blue-500' },
  { bg: 'bg-cyan-600', text: 'text-white', hex: '#0891b2', border: 'border-cyan-500' },
  { bg: 'bg-emerald-600', text: 'text-white', hex: '#059669', border: 'border-emerald-500' },
  { bg: 'bg-indigo-600', text: 'text-white', hex: '#4f46e5', border: 'border-indigo-500' },
  { bg: 'bg-amber-600', text: 'text-white', hex: '#d97706', border: 'border-amber-500' },
  { bg: 'bg-rose-600', text: 'text-white', hex: '#e11d48', border: 'border-rose-500' },
  { bg: 'bg-sky-600', text: 'text-white', hex: '#0284c7', border: 'border-sky-500' },
  { bg: 'bg-teal-600', text: 'text-white', hex: '#0d9488', border: 'border-teal-500' },
];

export function getProcessColor(pid: string) {
  let hash = 0;
  for (let i = 0; i < pid.length; i += 1) {
    hash = (hash * 31 + pid.charCodeAt(i)) >>> 0;
  }
  return PID_PALETTE[hash % PID_PALETTE.length];
}

export function formatNumber(val: number | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || Number.isNaN(val)) return '—';
  return Number(val).toFixed(decimals);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function parseProcessesCsv(csvText: string): ProcessItem[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const results: ProcessItem[] = [];
  const startIdx = lines[0].toLowerCase().includes('pid') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i += 1) {
    const parts = lines[i].split(',').map((s) => s.trim());
    if (parts.length < 3) {
      throw new Error(`Row ${i + 1}: expected at least 3 columns (pid, arrival_time, burst_time, priority).`);
    }
    const pid = parts[0];
    const arrival_time = Number(parts[1]);
    const burst_time = Number(parts[2]);
    const priority = parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : 1;

    if (!pid) throw new Error(`Row ${i + 1}: missing PID.`);
    if (!Number.isInteger(arrival_time) || arrival_time < 0) {
      throw new Error(`Row ${i + 1} (${pid}): arrival_time must be a non-negative integer.`);
    }
    if (!Number.isInteger(burst_time) || burst_time <= 0) {
      throw new Error(`Row ${i + 1} (${pid}): burst_time must be a positive integer.`);
    }
    if (!Number.isInteger(priority) || priority < 0) {
      throw new Error(`Row ${i + 1} (${pid}): priority must be a non-negative integer.`);
    }

    results.push({ pid, arrival_time, burst_time, priority });
  }

  if (results.length === 0) {
    throw new Error('No process rows found in CSV.');
  }
  return results;
}

export function exportProcessesToCsv(processes: ProcessItem[]): string {
  const header = 'pid,arrival_time,burst_time,priority';
  const rows = processes.map((p) => `${p.pid},${p.arrival_time},${p.burst_time},${p.priority}`);
  return [header, ...rows].join('\n');
}
