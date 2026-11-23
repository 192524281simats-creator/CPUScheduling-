import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { GanttChart } from '../charts/GanttChart';
import {
  EmptyState,
  ErrorAlert,
  LoadingSkeleton,
  PageHeader,
} from '../components/PageState';
import { SchedulingEventLog } from '../components/SchedulingEventLog';
import { extractApiError, schedulerApi } from '../services/api';
import type {
  ProcessResult,
  SchedulingEvent,
  SimulationRecord,
  TimelineEntry,
} from '../types/scheduler';

export function GanttVisualizationPage() {
  const [searchParams] = useSearchParams();
  const initialSimId = searchParams.get('simId');

  const [simulations, setSimulations] = useState<SimulationRecord[]>([]);
  const [selectedSimId, setSelectedSimId] = useState<number | null>(
    initialSimId ? Number(initialSimId) : null,
  );
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);
  const [events, setEvents] = useState<SchedulingEvent[]>([]);
  const [activeTitle, setActiveTitle] = useState<string>('Simulation Timeline');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(1);

  const totalTime = useMemo(
    () => timeline.reduce((max, s) => Math.max(max, s.end_time), 0),
    [timeline],
  );

  const loadSimDetails = useCallback(async (simId: number) => {
    const sim = await schedulerApi.getSimulation(simId);
    setTimeline(sim.timeline || []);
    setProcessResults(sim.process_results || []);
    setEvents(sim.events || []);
    setActiveTitle(`Simulation #${sim.id} · ${sim.algorithm}`);
    setPlaybackTime(0);
    setIsPlaying(false);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sims = await schedulerApi.listSimulations();
      setSimulations(sims);
      if (initialSimId && sims.some((s) => s.id === Number(initialSimId))) {
        const id = Number(initialSimId);
        setSelectedSimId(id);
        await loadSimDetails(id);
      } else if (sims.length > 0) {
        setSelectedSimId(sims[0].id);
        await loadSimDetails(sims[0].id);
      } else {
        // Fallback: run live hybrid on current DB processes without requiring prior saved run
        const procs = await schedulerApi.listProcesses();
        if (procs.length > 0) {
          const live = await schedulerApi.runSchedule('hybrid', { processes: procs });
          setTimeline(live.timeline);
          setProcessResults(live.process_results);
          setEvents(live.events);
          setActiveTitle('Live Preview · Adaptive Hybrid MLFQ');
          setPlaybackTime(0);
        }
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load Gantt timeline.'));
    } finally {
      setLoading(false);
    }
  }, [initialSimId, loadSimDetails]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (!isPlaying || totalTime <= 0) return;
    const intervalMs = Math.max(120, Math.round(600 / speed));
    const timer = window.setInterval(() => {
      setPlaybackTime((prev) => {
        if (prev >= totalTime) {
          setIsPlaying(false);
          return totalTime;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed, totalTime]);

  const currentSegment = useMemo(() => {
    return (
      timeline.find((s) => playbackTime >= s.start_time && playbackTime < s.end_time) ||
      (playbackTime >= totalTime && timeline.length > 0 ? timeline[timeline.length - 1] : null)
    );
  }, [timeline, playbackTime, totalTime]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gantt Chart Visualization & Playback"
        subtitle="Inspect execution slices, CPU idle windows, context-switch overhead, and step through the simulator timeline."
        actions={
          simulations.length > 0 && (
            <select
              value={selectedSimId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedSimId(id);
                void loadSimDetails(id);
              }}
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              {simulations.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} · {s.name} ({s.algorithm})
                </option>
              ))}
            </select>
          )
        }
      />

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : error ? (
        <ErrorAlert message={error} onRetry={loadInitial} />
      ) : timeline.length === 0 ? (
        <EmptyState
          title="No timeline data available"
          description="Add processes and run a scheduling algorithm to visualize the execution timeline."
        />
      ) : (
        <>
          {/* Playback Controls */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (playbackTime >= totalTime) setPlaybackTime(0);
                    setIsPlaying((p) => !p);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : playbackTime > 0 && playbackTime < totalTime ? 'Resume' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setPlaybackTime(0);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Speed:</span>
                {[0.5, 1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSpeed(spd)}
                    className={`px-2.5 py-1 rounded text-xs font-mono ${
                      speed === spd
                        ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 w-24">
                Tick: {playbackTime} / {totalTime}
              </span>
              <input
                type="range"
                min={0}
                max={totalTime}
                value={playbackTime}
                onChange={(e) => {
                  setIsPlaying(false);
                  setPlaybackTime(Number(e.target.value));
                }}
                className="flex-1 accent-cyan-500"
              />
            </div>

            {currentSegment && (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span>
                  Active CPU State at t={playbackTime}:{' '}
                  <strong className="text-blue-600 dark:text-cyan-400">{currentSegment.pid}</strong>{' '}
                  ({currentSegment.event_type})
                </span>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  Slice [{currentSegment.start_time} → {currentSegment.end_time}]
                  {currentSegment.queue_level ? ` · Queue ${currentSegment.queue_level}` : ''}
                </span>
              </div>
            )}
          </div>

          <GanttChart
            timeline={timeline}
            title={activeTitle}
            playbackTime={playbackTime}
          />

          {/* Process Progress Snapshot at playbackTime */}
          {processResults.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0d1527] p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                Process State at Tick t={playbackTime}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {processResults.map((p) => {
                  const status =
                    playbackTime < p.arrival_time
                      ? 'Not Arrived'
                      : playbackTime >= p.completion_time
                        ? 'Completed'
                        : currentSegment?.event_type === 'execution' && currentSegment.pid === p.pid
                          ? 'Running'
                          : 'Waiting';
                  return (
                    <div
                      key={p.pid}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between text-xs font-mono"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{p.pid}</div>
                        <div className="text-[11px] text-slate-500">
                          AT={p.arrival_time} · BT={p.burst_time}
                        </div>
                      </div>
                      <span
                        className={`font-sans font-semibold ${
                          status === 'Running'
                            ? 'text-cyan-500'
                            : status === 'Completed'
                              ? 'text-emerald-500'
                              : status === 'Waiting'
                                ? 'text-amber-500'
                                : 'text-slate-400'
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <SchedulingEventLog events={events} />
        </>
      )}
    </div>
  );
}
