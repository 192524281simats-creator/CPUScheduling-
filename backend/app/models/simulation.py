from datetime import datetime, timezone
import json

from app.extensions import db


class Simulation(db.Model):
    __tablename__ = "simulations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128), nullable=False)
    algorithm = db.Column(db.String(64), nullable=False)
    configuration_id = db.Column(
        db.Integer, db.ForeignKey("simulation_configurations.id"), nullable=False
    )
    process_count = db.Column(db.Integer, nullable=False)
    avg_waiting_time = db.Column(db.Float, nullable=False)
    avg_turnaround_time = db.Column(db.Float, nullable=False)
    avg_response_time = db.Column(db.Float, nullable=False)
    cpu_utilization = db.Column(db.Float, nullable=False)
    cpu_idle_time = db.Column(db.Integer, nullable=False, default=0)
    throughput = db.Column(db.Float, nullable=False)
    total_context_switches = db.Column(db.Integer, nullable=False, default=0)
    total_scheduling_overhead = db.Column(db.Integer, nullable=False, default=0)
    total_simulation_time = db.Column(db.Integer, nullable=False, default=0)
    fairness_index = db.Column(db.Float, nullable=False, default=1.0)
    workload_type = db.Column(db.String(128), nullable=True)
    recommended_algorithm = db.Column(db.String(64), nullable=True)
    process_results_json = db.Column(db.Text, nullable=False)
    metrics_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    configuration = db.relationship(
        "SimulationConfiguration", back_populates="simulations"
    )
    execution_records = db.relationship(
        "ExecutionRecord",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="ExecutionRecord.step_index",
    )
    scheduling_events = db.relationship(
        "SchedulingEvent",
        back_populates="simulation",
        cascade="all, delete-orphan",
        order_by="SchedulingEvent.event_index",
    )

    def to_dict(self, include_details: bool = False):
        data = {
            "id": self.id,
            "name": self.name,
            "algorithm": self.algorithm,
            "configuration_id": self.configuration_id,
            "configuration": self.configuration.to_dict() if self.configuration else None,
            "process_count": self.process_count,
            "avg_waiting_time": self.avg_waiting_time,
            "avg_turnaround_time": self.avg_turnaround_time,
            "avg_response_time": self.avg_response_time,
            "cpu_utilization": self.cpu_utilization,
            "cpu_idle_time": self.cpu_idle_time,
            "throughput": self.throughput,
            "total_context_switches": self.total_context_switches,
            "total_scheduling_overhead": self.total_scheduling_overhead,
            "total_simulation_time": self.total_simulation_time,
            "fairness_index": self.fairness_index,
            "workload_type": self.workload_type,
            "recommended_algorithm": self.recommended_algorithm,
            "metrics": json.loads(self.metrics_json) if self.metrics_json else {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_details:
            data["process_results"] = (
                json.loads(self.process_results_json)
                if self.process_results_json
                else []
            )
            data["timeline"] = [rec.to_dict() for rec in self.execution_records]
            data["events"] = [ev.to_dict() for ev in self.scheduling_events]
        return data
