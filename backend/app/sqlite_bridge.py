"""
Pure-Python SQLite + HTTP API bridge for environments where Flask/SQLAlchemy
packages are not installed. Uses the exact same SQLite schema, parameterized
SQL queries, scheduling algorithms, services, validators, and REST contract.
"""

from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import sqlite3
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from app.config import INSTANCE_DIR
from app.services.report_service import generate_csv_report, generate_pdf_report
from app.services.scheduler_service import (
    compare_all_algorithms,
    run_algorithm,
    run_what_if_comparison,
)
from app.services.workload_service import (
    DEFAULT_SAMPLE_PROCESSES,
    classify_workload,
    generate_sample_workload,
)
from app.utils.validators import (
    ValidationError,
    validate_processes,
    validate_single_process,
)

DB_PATH = os.environ.get("SCHEDULER_DB_PATH", os.path.join(INSTANCE_DIR, "scheduler.db"))


def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_sqlite_db() -> None:
    conn = _get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS processes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid TEXT NOT NULL UNIQUE,
                arrival_time INTEGER NOT NULL,
                burst_time INTEGER NOT NULL,
                priority INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS simulation_configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                algorithm TEXT NOT NULL,
                time_quantum INTEGER NOT NULL DEFAULT 4,
                high_quantum INTEGER NOT NULL DEFAULT 2,
                medium_quantum INTEGER NOT NULL DEFAULT 4,
                max_quantum INTEGER NOT NULL DEFAULT 12,
                aging_threshold INTEGER NOT NULL DEFAULT 10,
                preemptive INTEGER NOT NULL DEFAULT 0,
                aging_enabled INTEGER NOT NULL DEFAULT 0,
                aging_interval INTEGER NOT NULL DEFAULT 5,
                context_switch_cost INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS simulations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                algorithm TEXT NOT NULL,
                configuration_id INTEGER NOT NULL,
                process_count INTEGER NOT NULL,
                avg_waiting_time REAL NOT NULL,
                avg_turnaround_time REAL NOT NULL,
                avg_response_time REAL NOT NULL,
                cpu_utilization REAL NOT NULL,
                cpu_idle_time INTEGER NOT NULL DEFAULT 0,
                throughput REAL NOT NULL,
                total_context_switches INTEGER NOT NULL DEFAULT 0,
                total_scheduling_overhead INTEGER NOT NULL DEFAULT 0,
                total_simulation_time INTEGER NOT NULL DEFAULT 0,
                fairness_index REAL NOT NULL DEFAULT 1.0,
                workload_type TEXT,
                recommended_algorithm TEXT,
                process_results_json TEXT NOT NULL,
                metrics_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (configuration_id) REFERENCES simulation_configurations(id)
            );

            CREATE TABLE IF NOT EXISTS execution_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                simulation_id INTEGER NOT NULL,
                step_index INTEGER NOT NULL,
                pid TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                duration INTEGER NOT NULL,
                queue_level INTEGER,
                event_type TEXT NOT NULL,
                from_pid TEXT,
                to_pid TEXT,
                FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS scheduling_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                simulation_id INTEGER NOT NULL,
                event_index INTEGER NOT NULL,
                event_time INTEGER NOT NULL,
                pid TEXT NOT NULL,
                previous_queue INTEGER,
                current_queue INTEGER,
                selected_algorithm TEXT NOT NULL,
                remaining_burst_time INTEGER NOT NULL,
                selected_time_quantum INTEGER,
                event_type TEXT NOT NULL,
                explanation TEXT NOT NULL,
                FOREIGN KEY (simulation_id) REFERENCES simulations(id) ON DELETE CASCADE
            );
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM processes").fetchone()[0]
        if count == 0:
            now = datetime.now(timezone.utc).isoformat()
            for p in DEFAULT_SAMPLE_PROCESSES:
                conn.execute(
                    "INSERT INTO processes (pid, arrival_time, burst_time, priority, created_at) VALUES (?, ?, ?, ?, ?)",
                    (p["pid"], p["arrival_time"], p["burst_time"], p["priority"], now),
                )
        conn.commit()
    finally:
        conn.close()


def _row_to_process(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "pid": row["pid"],
        "arrival_time": row["arrival_time"],
        "burst_time": row["burst_time"],
        "priority": row["priority"],
        "created_at": row["created_at"],
    }


def _row_to_config(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if not row:
        return None
    return {
        "id": row["id"],
        "algorithm": row["algorithm"],
        "time_quantum": row["time_quantum"],
        "high_quantum": row["high_quantum"],
        "medium_quantum": row["medium_quantum"],
        "max_quantum": row["max_quantum"],
        "aging_threshold": row["aging_threshold"],
        "preemptive": bool(row["preemptive"]),
        "aging_enabled": bool(row["aging_enabled"]),
        "aging_interval": row["aging_interval"],
        "context_switch_cost": row["context_switch_cost"],
        "created_at": row["created_at"],
    }


def _fetch_simulation(conn: sqlite3.Connection, sim_id: int, include_details: bool = True) -> Optional[Dict[str, Any]]:
    sim = conn.execute("SELECT * FROM simulations WHERE id = ?", (sim_id,)).fetchone()
    if not sim:
        return None
    cfg = conn.execute(
        "SELECT * FROM simulation_configurations WHERE id = ?", (sim["configuration_id"],)
    ).fetchone()
    data: Dict[str, Any] = {
        "id": sim["id"],
        "name": sim["name"],
        "algorithm": sim["algorithm"],
        "configuration_id": sim["configuration_id"],
        "configuration": _row_to_config(cfg),
        "process_count": sim["process_count"],
        "avg_waiting_time": sim["avg_waiting_time"],
        "avg_turnaround_time": sim["avg_turnaround_time"],
        "avg_response_time": sim["avg_response_time"],
        "cpu_utilization": sim["cpu_utilization"],
        "cpu_idle_time": sim["cpu_idle_time"],
        "throughput": sim["throughput"],
        "total_context_switches": sim["total_context_switches"],
        "total_scheduling_overhead": sim["total_scheduling_overhead"],
        "total_simulation_time": sim["total_simulation_time"],
        "fairness_index": sim["fairness_index"],
        "workload_type": sim["workload_type"],
        "recommended_algorithm": sim["recommended_algorithm"],
        "metrics": json.loads(sim["metrics_json"]) if sim["metrics_json"] else {},
        "created_at": sim["created_at"],
    }
    if include_details:
        data["process_results"] = (
            json.loads(sim["process_results_json"]) if sim["process_results_json"] else []
        )
        tl_rows = conn.execute(
            "SELECT * FROM execution_records WHERE simulation_id = ? ORDER BY step_index ASC",
            (sim_id,),
        ).fetchall()
        data["timeline"] = [
            {
                "id": r["id"],
                "simulation_id": r["simulation_id"],
                "step_index": r["step_index"],
                "pid": r["pid"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "duration": r["duration"],
                "queue_level": r["queue_level"],
                "event_type": r["event_type"],
                **({"from_pid": r["from_pid"]} if r["from_pid"] is not None else {}),
                **({"to_pid": r["to_pid"]} if r["to_pid"] is not None else {}),
            }
            for r in tl_rows
        ]
        ev_rows = conn.execute(
            "SELECT * FROM scheduling_events WHERE simulation_id = ? ORDER BY event_index ASC",
            (sim_id,),
        ).fetchall()
        data["events"] = [
            {
                "id": r["id"],
                "simulation_id": r["simulation_id"],
                "event_index": r["event_index"],
                "event_time": r["event_time"],
                "pid": r["pid"],
                "previous_queue": r["previous_queue"],
                "current_queue": r["current_queue"],
                "selected_algorithm": r["selected_algorithm"],
                "remaining_burst_time": r["remaining_burst_time"],
                "selected_time_quantum": r["selected_time_quantum"],
                "event_type": r["event_type"],
                "explanation": r["explanation"],
            }
            for r in ev_rows
        ]
    return data


class SchedulerBridgeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_bytes(
        self,
        status: int,
        content: bytes,
        content_type: str = "application/json",
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(content)

    def _send_json(self, status: int, data: Any) -> None:
        payload = json.dumps(data).encode("utf-8")
        self._send_bytes(status, payload, "application/json; charset=utf-8")

    def _read_json(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _get_db_processes(self, conn: sqlite3.Connection) -> List[Dict[str, Any]]:
        rows = conn.execute(
            "SELECT * FROM processes ORDER BY arrival_time ASC, pid ASC"
        ).fetchall()
        return [_row_to_process(r) for r in rows]

    def do_OPTIONS(self) -> None:
        self._send_bytes(204, b"", "text/plain")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        conn = _get_conn()
        try:
            if path == "/api/health":
                self._send_json(200, {"status": "ok", "service": "adaptive-cpu-scheduler-api"})
                return

            if path == "/api/processes":
                self._send_json(200, {"processes": self._get_db_processes(conn)})
                return

            if path == "/api/simulations":
                rows = conn.execute(
                    "SELECT id FROM simulations ORDER BY created_at DESC, id DESC"
                ).fetchall()
                sims = [_fetch_simulation(conn, r["id"], include_details=False) for r in rows]
                self._send_json(200, {"simulations": [s for s in sims if s is not None]})
                return

            m_sim = re.fullmatch(r"/api/simulations/(\d+)", path)
            if m_sim:
                sim = _fetch_simulation(conn, int(m_sim.group(1)), include_details=True)
                if not sim:
                    self._send_json(404, {"error": f"Simulation #{m_sim.group(1)} not found."})
                    return
                self._send_json(200, {"simulation": sim})
                return

            m_ev = re.fullmatch(r"/api/events/(\d+)", path)
            if m_ev:
                sim_id = int(m_ev.group(1))
                sim = _fetch_simulation(conn, sim_id, include_details=True)
                if not sim:
                    self._send_json(404, {"error": f"Simulation #{sim_id} not found."})
                    return
                self._send_json(200, {"simulation_id": sim_id, "events": sim["events"]})
                return

            if path == "/api/analytics/dashboard":
                processes = self._get_db_processes(conn)
                rows = conn.execute(
                    "SELECT id, algorithm FROM simulations ORDER BY created_at DESC, id DESC"
                ).fetchall()
                latest = _fetch_simulation(conn, rows[0]["id"], include_details=True) if rows else None
                recent = [
                    _fetch_simulation(conn, r["id"], include_details=False) for r in rows[:8]
                ]
                algo_dist: Dict[str, int] = {}
                for r in rows:
                    algo_dist[r["algorithm"]] = algo_dist.get(r["algorithm"], 0) + 1
                live_comp = None
                if processes:
                    try:
                        live_comp = compare_all_algorithms(processes)
                    except ValidationError:
                        live_comp = None
                self._send_json(
                    200,
                    {
                        "process_count": len(processes),
                        "total_simulations": len(rows),
                        "latest_simulation": latest,
                        "recent_simulations": [s for s in recent if s is not None],
                        "algorithm_distribution": algo_dist,
                        "live_comparison": live_comp,
                    },
                )
                return

            if path == "/api/analytics/comparison":
                processes = self._get_db_processes(conn)
                cfg = {
                    "time_quantum": int(qs.get("time_quantum", [4])[0]),
                    "high_quantum": int(qs.get("high_quantum", [2])[0]),
                    "medium_quantum": int(qs.get("medium_quantum", [4])[0]),
                    "max_quantum": int(qs.get("max_quantum", [12])[0]),
                    "aging_threshold": int(qs.get("aging_threshold", [10])[0]),
                    "context_switch_cost": int(qs.get("context_switch_cost", [0])[0]),
                }
                try:
                    res = compare_all_algorithms(processes, cfg)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                self._send_json(200, res)
                return

            m_perf = re.fullmatch(r"/api/analytics/performance/(\d+)", path)
            if m_perf:
                sim_id = int(m_perf.group(1))
                sim_dict = _fetch_simulation(conn, sim_id, include_details=True)
                if not sim_dict:
                    self._send_json(404, {"error": f"Simulation #{sim_id} not found."})
                    return
                events = sim_dict["events"]
                timeline = sim_dict["timeline"]
                process_results = sim_dict["process_results"]
                promotions = [e for e in events if e["event_type"] == "promotion"]
                demotions = [e for e in events if e["event_type"] == "demotion"]
                quantum_adjustments = [e for e in events if e["event_type"] == "quantum_adjustment"]
                context_switches = [t for t in timeline if t["event_type"] == "context_switch"]
                self._send_json(
                    200,
                    {
                        "simulation": sim_dict,
                        "starvation_and_fairness": {
                            "fairness_index": sim_dict["fairness_index"],
                            "max_waiting_time": sim_dict["metrics"].get("max_waiting_time", 0),
                            "waiting_time_std_dev": sim_dict["metrics"].get("waiting_time_std_dev", 0),
                            "promotions_count": len(promotions),
                            "demotions_count": len(demotions),
                            "promotions": promotions,
                            "per_process_wait": [
                                {
                                    "pid": p["pid"],
                                    "waiting_time": p["waiting_time"],
                                    "turnaround_time": p["turnaround_time"],
                                    "response_time": p["response_time"],
                                    "priority": p["priority"],
                                }
                                for p in process_results
                            ],
                        },
                        "context_switch_analysis": {
                            "total_context_switches": sim_dict["total_context_switches"],
                            "total_scheduling_overhead": sim_dict["total_scheduling_overhead"],
                            "overhead_percentage": sim_dict["metrics"].get("overhead_percentage", 0),
                            "productive_busy_time": sim_dict["metrics"].get("productive_busy_time", 0),
                            "cpu_idle_time": sim_dict["cpu_idle_time"],
                            "switches": context_switches,
                        },
                        "quantum_adjustments": quantum_adjustments,
                    },
                )
                return

            m_rep = re.fullmatch(r"/api/reports/(\d+)", path)
            if m_rep:
                sim_id = int(m_rep.group(1))
                sim_dict = _fetch_simulation(conn, sim_id, include_details=True)
                if not sim_dict:
                    self._send_json(404, {"error": f"Simulation #{sim_id} not found."})
                    return
                fmt = str(qs.get("format", ["pdf"])[0]).strip().lower()
                if fmt == "csv":
                    csv_bytes = generate_csv_report(sim_dict).encode("utf-8")
                    self._send_bytes(
                        200,
                        csv_bytes,
                        "text/csv; charset=utf-8",
                        {"Content-Disposition": f'attachment; filename="simulation_{sim_id}_report.csv"'},
                    )
                    return
                if fmt == "json":
                    self._send_json(200, sim_dict)
                    return
                pdf_bytes = generate_pdf_report(sim_dict)
                self._send_bytes(
                    200,
                    pdf_bytes,
                    "application/pdf",
                    {"Content-Disposition": f'attachment; filename="simulation_{sim_id}_report.pdf"'},
                )
                return

            self._send_json(404, {"error": "Endpoint not found."})
        except Exception as exc:
            self._send_json(500, {"error": f"Internal server error: {exc}"})
        finally:
            conn.close()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        payload = self._read_json()
        conn = _get_conn()
        try:
            if path == "/api/processes":
                try:
                    clean = validate_single_process(payload)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                exists = conn.execute(
                    "SELECT id FROM processes WHERE pid = ?", (clean["pid"],)
                ).fetchone()
                if exists:
                    self._send_json(409, {"error": f"Process ID '{clean['pid']}' already exists."})
                    return
                now = datetime.now(timezone.utc).isoformat()
                cur = conn.execute(
                    "INSERT INTO processes (pid, arrival_time, burst_time, priority, created_at) VALUES (?, ?, ?, ?, ?)",
                    (clean["pid"], clean["arrival_time"], clean["burst_time"], clean["priority"], now),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM processes WHERE id = ?", (cur.lastrowid,)).fetchone()
                self._send_json(201, {"process": _row_to_process(row)})
                return

            if path == "/api/processes/bulk":
                items = payload.get("processes")
                replace = bool(payload.get("replace", True))
                try:
                    clean_list = validate_processes(items)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                if replace:
                    conn.execute("DELETE FROM processes")
                else:
                    existing = {
                        r["pid"] for r in conn.execute("SELECT pid FROM processes").fetchall()
                    }
                    for item in clean_list:
                        if item["pid"] in existing:
                            self._send_json(
                                409, {"error": f"Duplicate process ID '{item['pid']}' already exists."}
                            )
                            return
                now = datetime.now(timezone.utc).isoformat()
                for item in clean_list:
                    conn.execute(
                        "INSERT INTO processes (pid, arrival_time, burst_time, priority, created_at) VALUES (?, ?, ?, ?, ?)",
                        (item["pid"], item["arrival_time"], item["burst_time"], item["priority"], now),
                    )
                conn.commit()
                self._send_json(201, {"processes": self._get_db_processes(conn)})
                return

            if path == "/api/processes/sample":
                preset = str(payload.get("preset", "classic"))
                count = int(payload.get("count", 6))
                sample = generate_sample_workload(preset=preset, count=count)
                conn.execute("DELETE FROM processes")
                now = datetime.now(timezone.utc).isoformat()
                for item in sample:
                    conn.execute(
                        "INSERT INTO processes (pid, arrival_time, burst_time, priority, created_at) VALUES (?, ?, ?, ?, ?)",
                        (item["pid"], item["arrival_time"], item["burst_time"], item["priority"], now),
                    )
                conn.commit()
                self._send_json(
                    201, {"processes": self._get_db_processes(conn), "preset": preset}
                )
                return

            m_sched = re.fullmatch(r"/api/schedule/(fcfs|sjf|rr|priority|hybrid)", path)
            if m_sched:
                algo = m_sched.group(1)
                processes = payload.get("processes")
                if processes is None:
                    processes = self._get_db_processes(conn)
                cfg = {
                    "time_quantum": payload.get("time_quantum", 4),
                    "high_quantum": payload.get("high_quantum", 2),
                    "medium_quantum": payload.get("medium_quantum", 4),
                    "max_quantum": payload.get("max_quantum", 12),
                    "aging_threshold": payload.get("aging_threshold", 10),
                    "preemptive": payload.get("preemptive", False),
                    "aging_enabled": payload.get("aging_enabled", False),
                    "aging_interval": payload.get("aging_interval", 5),
                    "context_switch_cost": payload.get("context_switch_cost", 0),
                }
                try:
                    res = run_algorithm(algo, processes, cfg)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                self._send_json(200, res)
                return

            if path == "/api/workload/classify":
                processes = payload.get("processes")
                if processes is None:
                    processes = self._get_db_processes(conn)
                try:
                    classification = classify_workload(processes)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                self._send_json(200, classification)
                return

            if path == "/api/analytics/comparison":
                processes = payload.get("processes")
                if processes is None:
                    processes = self._get_db_processes(conn)
                cfg = {
                    "time_quantum": payload.get("time_quantum", 4),
                    "high_quantum": payload.get("high_quantum", 2),
                    "medium_quantum": payload.get("medium_quantum", 4),
                    "max_quantum": payload.get("max_quantum", 12),
                    "aging_threshold": payload.get("aging_threshold", 10),
                    "preemptive": payload.get("preemptive", False),
                    "aging_enabled": payload.get("aging_enabled", False),
                    "aging_interval": payload.get("aging_interval", 5),
                    "context_switch_cost": payload.get("context_switch_cost", 0),
                }
                try:
                    res = compare_all_algorithms(processes, cfg)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                self._send_json(200, res)
                return

            if path == "/api/simulations":
                algorithm = payload.get("algorithm", "hybrid")
                processes = payload.get("processes")
                if processes is None:
                    processes = self._get_db_processes(conn)
                cfg_in = payload.get("configuration") or payload
                cfg = {
                    "time_quantum": cfg_in.get("time_quantum", 4),
                    "high_quantum": cfg_in.get("high_quantum", 2),
                    "medium_quantum": cfg_in.get("medium_quantum", 4),
                    "max_quantum": cfg_in.get("max_quantum", 12),
                    "aging_threshold": cfg_in.get("aging_threshold", 10),
                    "preemptive": bool(cfg_in.get("preemptive", False)),
                    "aging_enabled": bool(cfg_in.get("aging_enabled", False)),
                    "aging_interval": cfg_in.get("aging_interval", 5),
                    "context_switch_cost": cfg_in.get("context_switch_cost", 0),
                }
                try:
                    res = run_algorithm(algorithm, processes, cfg)
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return

                now = datetime.now(timezone.utc).isoformat()
                cur_cfg = conn.execute(
                    """
                    INSERT INTO simulation_configurations (
                        algorithm, time_quantum, high_quantum, medium_quantum, max_quantum,
                        aging_threshold, preemptive, aging_enabled, aging_interval,
                        context_switch_cost, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        res["algorithm_key"],
                        int(cfg["time_quantum"]),
                        int(cfg["high_quantum"]),
                        int(cfg["medium_quantum"]),
                        int(cfg["max_quantum"]),
                        int(cfg["aging_threshold"]),
                        1 if cfg["preemptive"] else 0,
                        1 if cfg["aging_enabled"] else 0,
                        int(cfg["aging_interval"]),
                        int(cfg["context_switch_cost"]),
                        now,
                    ),
                )
                cfg_id = cur_cfg.lastrowid
                metrics = res["metrics"]
                workload = res.get("workload", {})
                sim_name = str(
                    payload.get("name")
                    or f"{res['algorithm']} ({len(res['process_results'])} processes)"
                ).strip()

                cur_sim = conn.execute(
                    """
                    INSERT INTO simulations (
                        name, algorithm, configuration_id, process_count,
                        avg_waiting_time, avg_turnaround_time, avg_response_time,
                        cpu_utilization, cpu_idle_time, throughput,
                        total_context_switches, total_scheduling_overhead,
                        total_simulation_time, fairness_index, workload_type,
                        recommended_algorithm, process_results_json, metrics_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sim_name,
                        res["algorithm"],
                        cfg_id,
                        len(res["process_results"]),
                        metrics["average_waiting_time"],
                        metrics["average_turnaround_time"],
                        metrics["average_response_time"],
                        metrics["cpu_utilization"],
                        metrics["cpu_idle_time"],
                        metrics["throughput"],
                        metrics["total_context_switches"],
                        metrics["total_scheduling_overhead"],
                        metrics["total_simulation_time"],
                        metrics["fairness_index"],
                        workload.get("workload_type"),
                        workload.get("recommended_algorithm"),
                        json.dumps(res["process_results"]),
                        json.dumps(metrics),
                        now,
                    ),
                )
                sim_id = cur_sim.lastrowid

                for idx, entry in enumerate(res["timeline"]):
                    conn.execute(
                        """
                        INSERT INTO execution_records (
                            simulation_id, step_index, pid, start_time, end_time,
                            duration, queue_level, event_type, from_pid, to_pid
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sim_id,
                            idx,
                            entry["pid"],
                            entry["start_time"],
                            entry["end_time"],
                            entry["duration"],
                            entry.get("queue_level"),
                            entry["event_type"],
                            entry.get("from_pid"),
                            entry.get("to_pid"),
                        ),
                    )

                for idx, ev in enumerate(res["events"]):
                    conn.execute(
                        """
                        INSERT INTO scheduling_events (
                            simulation_id, event_index, event_time, pid,
                            previous_queue, current_queue, selected_algorithm,
                            remaining_burst_time, selected_time_quantum, event_type, explanation
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            sim_id,
                            idx,
                            ev["event_time"],
                            ev["pid"],
                            ev.get("previous_queue"),
                            ev.get("current_queue"),
                            ev["selected_algorithm"],
                            ev["remaining_burst_time"],
                            ev.get("selected_time_quantum"),
                            ev["event_type"],
                            ev["explanation"],
                        ),
                    )
                conn.commit()
                sim_dict = _fetch_simulation(conn, sim_id, include_details=True)
                self._send_json(201, {"simulation": sim_dict, "workload": workload})
                return

            if path == "/api/simulations/what-if":
                processes = payload.get("processes")
                if processes is None:
                    processes = self._get_db_processes(conn)
                try:
                    comparison = run_what_if_comparison(
                        processes=processes,
                        baseline_algorithm=payload.get("baseline_algorithm", "rr"),
                        baseline_config=payload.get("baseline_config", {}),
                        modified_algorithm=payload.get("modified_algorithm", "hybrid"),
                        modified_config=payload.get("modified_config", {}),
                    )
                except ValidationError as exc:
                    self._send_json(400, {"error": str(exc)})
                    return
                self._send_json(200, comparison)
                return

            self._send_json(404, {"error": "Endpoint not found."})
        except Exception as exc:
            self._send_json(500, {"error": f"Internal server error: {exc}"})
        finally:
            conn.close()

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        m_proc = re.fullmatch(r"/api/processes/(\d+)", parsed.path)
        if not m_proc:
            self._send_json(404, {"error": "Endpoint not found."})
            return
        proc_id = int(m_proc.group(1))
        payload = self._read_json()
        conn = _get_conn()
        try:
            row = conn.execute("SELECT * FROM processes WHERE id = ?", (proc_id,)).fetchone()
            if not row:
                self._send_json(404, {"error": f"Process #{proc_id} not found."})
                return
            candidate = {
                "pid": payload.get("pid", row["pid"]),
                "arrival_time": payload.get("arrival_time", row["arrival_time"]),
                "burst_time": payload.get("burst_time", row["burst_time"]),
                "priority": payload.get("priority", row["priority"]),
            }
            try:
                clean = validate_single_process(candidate)
            except ValidationError as exc:
                self._send_json(400, {"error": str(exc)})
                return

            conflict = conn.execute(
                "SELECT id FROM processes WHERE pid = ? AND id != ?", (clean["pid"], proc_id)
            ).fetchone()
            if conflict:
                self._send_json(409, {"error": f"Process ID '{clean['pid']}' already exists."})
                return

            conn.execute(
                "UPDATE processes SET pid = ?, arrival_time = ?, burst_time = ?, priority = ? WHERE id = ?",
                (clean["pid"], clean["arrival_time"], clean["burst_time"], clean["priority"], proc_id),
            )
            conn.commit()
            updated = conn.execute("SELECT * FROM processes WHERE id = ?", (proc_id,)).fetchone()
            self._send_json(200, {"process": _row_to_process(updated)})
        finally:
            conn.close()

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        conn = _get_conn()
        try:
            if path == "/api/processes":
                conn.execute("DELETE FROM processes")
                conn.commit()
                self._send_json(200, {"cleared": True})
                return

            m_proc = re.fullmatch(r"/api/processes/(\d+)", path)
            if m_proc:
                proc_id = int(m_proc.group(1))
                cur = conn.execute("DELETE FROM processes WHERE id = ?", (proc_id,))
                conn.commit()
                if cur.rowcount == 0:
                    self._send_json(404, {"error": f"Process #{proc_id} not found."})
                    return
                self._send_json(200, {"deleted": proc_id})
                return

            m_sim = re.fullmatch(r"/api/simulations/(\d+)", path)
            if m_sim:
                sim_id = int(m_sim.group(1))
                cur = conn.execute("DELETE FROM simulations WHERE id = ?", (sim_id,))
                conn.commit()
                if cur.rowcount == 0:
                    self._send_json(404, {"error": f"Simulation #{sim_id} not found."})
                    return
                self._send_json(200, {"deleted": sim_id})
                return

            self._send_json(404, {"error": "Endpoint not found."})
        finally:
            conn.close()


def run_bridge_server(host: str = "127.0.0.1", port: int = 5000) -> None:
    init_sqlite_db()
    server = ThreadingHTTPServer((host, port), SchedulerBridgeHandler)
    print(f"Python SQLite Bridge API running on http://{host}:{port}")
    server.serve_forever()
