from datetime import datetime, timezone

from app.extensions import db


class Process(db.Model):
    __tablename__ = "processes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    pid = db.Column(db.String(64), unique=True, nullable=False)
    arrival_time = db.Column(db.Integer, nullable=False)
    burst_time = db.Column(db.Integer, nullable=False)
    priority = db.Column(db.Integer, nullable=False, default=1)
    created_at = db.Column(
        db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "pid": self.pid,
            "arrival_time": self.arrival_time,
            "burst_time": self.burst_time,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
