from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.process import Process
from app.models.simulation import Simulation
from app.services.scheduler_service import compare_all_algorithms
from app.utils.validators import ValidationError

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/analytics")


@analytics_bp.route("/dashboard", methods=["GET"])
def dashboard_analytics():
    processes = [
        p.to_dict()
        for p in Process.query.order_by(Process.arrival_time.asc(), Process.pid.asc()).all()
    ]
    sims = Simulation.query.order_by(Simulation.created_at.desc(), Simulation.id.desc()).all()

    latest_sim = sims[0].to_dict(include_details=True) if sims else None
    recent_sims = [s.to_dict(include_details=False) for s in sims[:8]]

    algo_counts = {}
    for s in sims:
        algo_counts[s.algorithm] = algo_counts.get(s.algorithm, 0) + 1

    comparison_summary = None
    if processes:
        try:
            comparison_summary = compare_all_algorithms(processes)
        except ValidationError:
            comparison_summary = None

    return (
        jsonify(
            {
                "process_count": len(processes),
                "total_simulations": len(sims),
                "latest_simulation": latest_sim,
                "recent_simulations": recent_sims,
                "algorithm_distribution": algo_counts,
                "live_comparison": comparison_summary,
            }
        ),
        200,
    )


@analytics_bp.route("/comparison", methods=["GET", "POST"])
def comparison_analytics():
    payload = request.get_json(silent=True) or {} if request.method == "POST" else {}
    if "processes" in payload and payload["processes"] is not None:
        processes = payload["processes"]
    else:
        processes = [
            p.to_dict()
            for p in Process.query.order_by(Process.arrival_time.asc(), Process.pid.asc()).all()
        ]

    config = {
        "time_quantum": int(payload.get("time_quantum", request.args.get("time_quantum", 4))),
        "high_quantum": int(payload.get("high_quantum", request.args.get("high_quantum", 2))),
        "medium_quantum": int(payload.get("medium_quantum", request.args.get("medium_quantum", 4))),
        "max_quantum": int(payload.get("max_quantum", request.args.get("max_quantum", 12))),
        "aging_threshold": int(payload.get("aging_threshold", request.args.get("aging_threshold", 10))),
        "preemptive": bool(payload.get("preemptive", False)),
        "aging_enabled": bool(payload.get("aging_enabled", False)),
        "aging_interval": int(payload.get("aging_interval", 5)),
        "context_switch_cost": int(
            payload.get("context_switch_cost", request.args.get("context_switch_cost", 0))
        ),
    }

    try:
        result = compare_all_algorithms(processes, config)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result), 200


@analytics_bp.route("/performance/<int:sim_id>", methods=["GET"])
def simulation_performance(sim_id: int):
    sim = db.session.get(Simulation, sim_id)
    if not sim:
        return jsonify({"error": f"Simulation #{sim_id} not found."}), 404

    sim_dict = sim.to_dict(include_details=True)
    process_results = sim_dict["process_results"]
    timeline = sim_dict["timeline"]
    events = sim_dict["events"]

    promotions = [e for e in events if e["event_type"] == "promotion"]
    demotions = [e for e in events if e["event_type"] == "demotion"]
    quantum_adjustments = [e for e in events if e["event_type"] == "quantum_adjustment"]
    context_switches = [t for t in timeline if t["event_type"] == "context_switch"]

    return (
        jsonify(
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
            }
        ),
        200,
    )
