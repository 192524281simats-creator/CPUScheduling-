from app.extensions import db


class ExecutionRecord(db.Model):
    __tablename__ = "execution_records"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    simulation_id = db.Column(
        db.Integer, db.ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False
    )
    step_index = db.Column(db.Integer, nullable=False)
    pid = db.Column(db.String(64), nullable=False)
    start_time = db.Column(db.Integer, nullable=False)
    end_time = db.Column(db.Integer, nullable=False)
    duration = db.Column(db.Integer, nullable=False)
    queue_level = db.Column(db.Integer, nullable=True)
    event_type = db.Column(db.String(32), nullable=False)
    from_pid = db.Column(db.String(64), nullable=True)
    to_pid = db.Column(db.String(64), nullable=True)

    simulation = db.relationship("Simulation", back_populates="execution_records")

    def to_dict(self):
        result = {
            "id": self.id,
            "simulation_id": self.simulation_id,
            "step_index": self.step_index,
            "pid": self.pid,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration": self.duration,
            "queue_level": self.queue_level,
            "event_type": self.event_type,
        }
        if self.from_pid is not None:
            result["from_pid"] = self.from_pid
        if self.to_pid is not None:
            result["to_pid"] = self.to_pid
        return result
