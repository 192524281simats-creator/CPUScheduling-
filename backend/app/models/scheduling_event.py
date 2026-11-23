from app.extensions import db


class SchedulingEvent(db.Model):
    __tablename__ = "scheduling_events"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    simulation_id = db.Column(
        db.Integer, db.ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False
    )
    event_index = db.Column(db.Integer, nullable=False)
    event_time = db.Column(db.Integer, nullable=False)
    pid = db.Column(db.String(64), nullable=False)
    previous_queue = db.Column(db.Integer, nullable=True)
    current_queue = db.Column(db.Integer, nullable=True)
    selected_algorithm = db.Column(db.String(64), nullable=False)
    remaining_burst_time = db.Column(db.Integer, nullable=False)
    selected_time_quantum = db.Column(db.Integer, nullable=True)
    event_type = db.Column(db.String(32), nullable=False)
    explanation = db.Column(db.Text, nullable=False)

    simulation = db.relationship("Simulation", back_populates="scheduling_events")

    def to_dict(self):
        return {
            "id": self.id,
            "simulation_id": self.simulation_id,
            "event_index": self.event_index,
            "event_time": self.event_time,
            "pid": self.pid,
            "previous_queue": self.previous_queue,
            "current_queue": self.current_queue,
            "selected_algorithm": self.selected_algorithm,
            "remaining_burst_time": self.remaining_burst_time,
            "selected_time_quantum": self.selected_time_quantum,
            "event_type": self.event_type,
            "explanation": self.explanation,
        }
