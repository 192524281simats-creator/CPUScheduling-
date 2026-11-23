# Adaptive Hybrid CPU Scheduling Framework for Optimized Process Management

**Tagline:** *Intelligent Scheduling. Efficient Execution. Fair Process Management.*

## Project Introduction

The **Adaptive Hybrid CPU Scheduling Framework for Optimized Process Management** is a full-stack Operating Systems simulation and analytics platform. It implements traditional CPU scheduling policies alongside a three-level **Adaptive Hybrid Multilevel Feedback Queue (MLFQ)** engine with dynamic time quantum tuning and anti-starvation aging, backed by a Python scheduling engine, Flask + SQLAlchemy (SQLite) API, and a responsive React + TypeScript dashboard.

## Problem Statement & Objectives

Traditional single-policy schedulers each optimize one dimension at the expense of another:
- **FCFS** minimizes overhead but suffers from the convoy effect when long CPU-bound jobs block short interactive tasks.
- **SJF** optimizes average waiting time but risks starving long jobs when short jobs arrive continuously.
- **Round Robin** preserves responsiveness but increases context-switch overhead if the time quantum is too small or degrades toward FCFS if too large.
- **Priority Scheduling** respects urgency but causes starvation for low-priority processes unless aging is enforced.

**Objectives:**
1. Implement mathematically accurate, deterministic Python implementations of **FCFS, SJF, Round Robin, Priority (Preemptive & Non-Preemptive with Aging), and Adaptive Hybrid MLFQ**.
2. Compute and persist complete OS metrics (Waiting, Turnaround, Response, CPU Utilization, Throughput, Context Switches, Scheduling Overhead, and Jain's Fairness Index).
3. Explain every scheduling decision (dispatch, preemption, demotion, promotion, adaptive quantum adjustment) from real execution events.
4. Provide interactive Gantt playback, 5-algorithm empirical comparison, workload classification, what-if analysis, and downloadable PDF/CSV reports.

## Architecture

- **Frontend (`src/`):** React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Axios, Recharts, Lucide Icons — 14 interactive pages.
- **Gateway (`server.ts`):** Express server on port `3000` serving the React app and proxying `/api/*` requests to the Python backend.
- **Backend (`backend/app/`):**
  - `algorithms/`: Framework-independent pure Python schedulers (`base.py`, `fcfs.py`, `sjf.py`, `round_robin.py`, `priority.py`, `hybrid.py`).
  - `services/`: `metrics_service.py`, `scheduler_service.py`, `workload_service.py`, `report_service.py`.
  - `models/`: SQLAlchemy ORM models (`Process`, `Simulation`, `ExecutionRecord`, `SchedulingEvent`, `SimulationConfiguration`).
  - `routes/`: Flask blueprints for processes, scheduling, simulations, analytics, and reports.
  - `tests/`: Automated `pytest` suite verifying scheduling invariants, edge cases, metrics, and API persistence.

## Scheduling Algorithms Implemented

1. **First Come First Serve (`fcfs.py`):** Non-preemptive ordering by `(arrival_time, pid)`.
2. **Shortest Job First (`sjf.py`):** Non-preemptive selection of minimum `burst_time` among arrived processes, tie-broken by `(arrival_time, pid)`.
3. **Round Robin (`round_robin.py`):** Preemptive FIFO ready queue with configurable positive `time_quantum`, simultaneous arrival handling, and accurate process-to-process context-switch counting.
4. **Priority Scheduling (`priority.py`):** Supports both non-preemptive and preemptive modes (lower integer = higher priority) plus optional priority aging (`aging_interval`) to prevent starvation.
5. **Adaptive Hybrid MLFQ (`hybrid.py`):**
   - **Queue 1 (High Priority):** Adaptive Round Robin (base `high_quantum=2`). Newly arrived processes enter Q1.
   - **Queue 2 (Medium Priority):** Adaptive Round Robin (base `medium_quantum=4`). Processes exhausting their Q1 quantum are demoted to Q2.
   - **Queue 3 (Low Priority):** FCFS for CPU-intensive processes demoted from Q2 (preemptible when Q1/Q2 receives arrivals or promotions).
   - **Bounded Dynamic Quantum:** Adjusts Q1/Q2 quanta dynamically within `[1, max_quantum]` based on ready-queue contention, average remaining burst time, and tail-finish optimization.
   - **Aging Promotion:** Processes waiting `>= aging_threshold` in Q2 or Q3 are automatically promoted one queue level up to eliminate starvation.

## Database Schema (SQLite)

- `processes`: Active process dataset (`id`, `pid`, `arrival_time`, `burst_time`, `priority`, `created_at`).
- `simulation_configurations`: Saved algorithm parameters (`algorithm`, `time_quantum`, `high_quantum`, `medium_quantum`, `max_quantum`, `aging_threshold`, `preemptive`, `aging_enabled`, `context_switch_cost`).
- `simulations`: Persisted summary metrics, workload classification, and JSON snapshots.
- `execution_records`: Ordered timeline slices (`start_time`, `end_time`, `duration`, `queue_level`, `event_type`).
- `scheduling_events`: Chronological decision explanations (`event_time`, `pid`, `previous_queue`, `current_queue`, `event_type`, `explanation`).

## API Endpoints

- **Processes:** `GET /api/processes`, `POST /api/processes`, `PUT /api/processes/<id>`, `DELETE /api/processes/<id>`, `POST /api/processes/sample`, `POST /api/processes/bulk`
- **Scheduling:** `POST /api/schedule/fcfs`, `POST /api/schedule/sjf`, `POST /api/schedule/rr`, `POST /api/schedule/priority`, `POST /api/schedule/hybrid`
- **Simulations:** `POST /api/simulations`, `GET /api/simulations`, `GET /api/simulations/<id>`, `DELETE /api/simulations/<id>`, `POST /api/simulations/what-if`, `GET /api/events/<simulation_id>`
- **Analytics & Reports:** `GET /api/analytics/dashboard`, `GET|POST /api/analytics/comparison`, `GET /api/analytics/performance/<id>`, `POST /api/workload/classify`, `GET /api/reports/<simulation_id>?format=pdf|csv|json`, `GET /api/health`

## Installation & Startup (Windows PowerShell)

### 1. Backend (Flask + SQLite)
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### 2. Frontend / Integrated Full-Stack Server
From the project root:
```powershell
npm install
npm run dev
```

### 3. Running Automated Backend Tests (`pytest`)
```powershell
cd backend
venv\Scripts\activate
pytest -v
```

## Sample Process Input & Expected Output

**Sample Input:**
```json
[
  {"pid": "P1", "arrival_time": 0, "burst_time": 8, "priority": 3},
  {"pid": "P2", "arrival_time": 1, "burst_time": 3, "priority": 1},
  {"pid": "P3", "arrival_time": 2, "burst_time": 6, "priority": 2},
  {"pid": "P4", "arrival_time": 3, "burst_time": 2, "priority": 4}
]
```

**Expected FCFS Result (`context_switch_cost = 0`):**
- Timeline: `P1 [0->8]`, `P2 [8->11]`, `P3 [11->17]`, `P4 [17->19]`
- Average Waiting Time: `(0 + 7 + 9 + 14) / 4 = 7.50`
- Average Turnaround Time: `(8 + 10 + 15 + 16) / 4 = 12.25`

**Expected SJF Result (`context_switch_cost = 0`):**
- Timeline: `P1 [0->8]`, `P4 [8->10]`, `P2 [10->13]`, `P3 [13->19]`
- Average Waiting Time: `(0 + 9 + 11 + 5) / 4 = 6.25`
