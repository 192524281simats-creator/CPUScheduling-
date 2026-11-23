import { useMemo, useState } from 'react';
import type { TimelineEntry } from '../types/scheduler';
import { getProcessColor } from '../utils/formatters';

interface GanttChartProps {
  timeline: TimelineEntry[];
  title?: string;
  playbackTime?: number | null;
}

export function GanttChart({ timeline, title, playbackTime = null }: GanttChartProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const totalTime = useMemo(
    () => timeline.reduce((max, seg) => Math.max(max, seg.end_time), 0),
    [timeline],
  );

  const uniquePids = useMemo(() => {
    const set = new Set<string>();
    timeline.forEach((seg) => {
      if (seg.event_type === 'execution') set.add(seg.pid);
    });
    return Array.from(set);
  }, [timeline]);

  const timeTicks = useMemo(() => {
    if (totalTime <= 0) return [0];
    const step = totalTime <= 20 ? 1 : totalTime <= 45 ? 2 : Math.ceil(totalTime / 15);
    const ticks: number[] = [];
    for (let t = 0; t <= totalTime; t += step) {
      ticks.push(t);
    }
    if (ticks[ticks.length - 1] !== totalTime) ticks.push(totalTime);
    return ticks;
  }, [totalTime]);

  if (timeline.length === 0 || totalTime === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No execution timeline entries available.
      </div>
    );
  }

  const activeSegment =
    selectedIdx !== null && timeline[selectedIdx] ? timeline[selectedIdx] : null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {title || 'CPU Execution Gantt Timeline'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any block to inspect execution start, duration, queue level, or overhead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          {uniquePids.map((pid) => {
            const color = getProcessColor(pid);
            return (
              <span key={pid} className="inline-flex items-center gap-1.5 font-mono">
                <span className={`w-2.5 h-2.5 rounded-sm ${color.bg}`} />
                {pid}
              </span>
            );
          })}
          {timeline.some((s) => s.event_type === 'idle') && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-500" />
              IDLE
            </span>
          )}
          {timeline.some((s) => s.event_type === 'context_switch') && (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              CS Overhead
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Timeline Bar */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[640px]">
          <div className="relative h-16 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/70 flex overflow-hidden">
            {timeline.map((seg, idx) => {
              const widthPct = (seg.duration / totalTime) * 100;
              const isSelected = selectedIdx === idx;
              const isDimmedByPlayback =
                playbackTime !== null && seg.start_time >= playbackTime;
              const isCurrentPlayback =
                playbackTime !== null &&
                playbackTime >= seg.start_time &&
                playbackTime < seg.end_time;

              let blockClasses = '';
              if (seg.event_type === 'idle') {
                blockClasses =
                  'bg-slate-200 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-r border-slate-300 dark:border-slate-700';
              } else if (seg.event_type === 'context_switch') {
                blockClasses =
                  'bg-amber-500/90 text-slate-950 border-r border-amber-600';
              } else {
                const c = getProcessColor(seg.pid);
                blockClasses = `${c.bg} ${c.text} border-r border-black/15`;
              }

              return (
                <button
                  key={`${seg.pid}-${seg.start_time}-${idx}`}
                  type="button"
                  onClick={() => setSelectedIdx(isSelected ? null : idx)}
                  style={{ width: `${widthPct}%` }}
                  title={`${seg.pid}: [${seg.start_time} -> ${seg.end_time}] (${seg.duration}u)`}
                  className={`relative h-full flex flex-col items-center justify-center px-1 text-center transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${blockClasses} ${
                    isDimmedByPlayback ? 'opacity-25' : 'opacity-100'
                  } ${isSelected || isCurrentPlayback ? 'ring-2 ring-inset ring-white' : ''}`}
                >
                  {widthPct >= 3.2 && (
                    <>
                      <span className="text-xs font-bold font-mono leading-none truncate max-w-full">
                        {seg.pid}
                      </span>
                      <span className="text-[10px] font-mono opacity-85 mt-1 tabular-nums leading-none">
                        {seg.queue_level ? `Q${seg.queue_level} · ` : ''}
                        {seg.duration}u
                      </span>
                    </>
                  )}
                </button>
              );
            })}

            {/* Playback Cursor */}
            {playbackTime !== null && totalTime > 0 && (
              <div
                style={{ left: `${Math.min(100, (playbackTime / totalTime) * 100)}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] pointer-events-none"
              />
            )}
          </div>

          {/* Tick Ruler */}
          <div className="relative h-6 mt-1">
            {timeTicks.map((tick) => {
              const leftPct = (tick / totalTime) * 100;
              return (
                <div
                  key={tick}
                  style={{ left: `${leftPct}%` }}
                  className="absolute -translate-x-1/2 flex flex-col items-center"
                >
                  <span className="w-px h-1.5 bg-slate-300 dark:bg-slate-700" />
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {tick}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Segment Details */}
      {activeSegment && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Segment: </span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {activeSegment.pid}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Interval: </span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                t = {activeSegment.start_time} → {activeSegment.end_time}
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Duration: </span>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                {activeSegment.duration} units
              </span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Type: </span>
              <span className="font-mono text-slate-900 dark:text-white">
                {activeSegment.event_type}
              </span>
            </div>
            {activeSegment.queue_level !== null && (
              <div>
                <span className="text-slate-500 dark:text-slate-400">Queue: </span>
                <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                  Queue {activeSegment.queue_level}
                </span>
              </div>
            )}
            {activeSegment.from_pid && activeSegment.to_pid && (
              <div>
                <span className="text-slate-500 dark:text-slate-400">Transition: </span>
                <span className="font-mono text-amber-600 dark:text-amber-400">
                  {activeSegment.from_pid} → {activeSegment.to_pid}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedIdx(null)}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
