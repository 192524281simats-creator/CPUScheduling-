from datetime import datetime, timezone

from app.extensions import db


class SimulationConfiguration(db.Model):
    __tablename__ = "simulation_configurations"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    algorithm = db.Column(db.String(64), nullable=False)
    time_quantum = db.Column(db.Integer, nullable=False, default=4)
    high_quantum = db.Column(db.Integer, nullable=False, default=2)
    medium_quantum = db.Column(db.Integer, nullable=False, default=4)
    max_quantum = db.Column(db.Integer, nullable=False, default=12)
    aging_threshold = db.Column(db.Integer, nullable=False, default=10)
    preemptive = db.Column(db.Boolean, nullable=False, default=False)
    aging_enabled = db.Column(db.Boolean, nullable=False, default=False)
    aging_interval = db.Column(db.Integer, nullable=False, default=5)
    context_switch_cost = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    simulations = db.relationship("Simulation", back_populates="configuration")

    def to_dict(self):
        return {
            "id": self.id,
            "algorithm": self.algorithm,
            "time_quantum": self.time_quantum,
            "high_quantum": self.high_quantum,
            "medium_quantum": self.medium_quantum,
            "max_quantum": self.max_quantum,
            "aging_threshold": self.aging_threshold,
            "preemptive": self.preemptive,
            "aging_enabled": self.aging_enabled,
            "aging_interval": self.aging_interval,
            "context_switch_cost": self.context_switch_cost,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
