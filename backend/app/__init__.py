import os
from typing import Optional

from app.config import Config, INSTANCE_DIR
from app.services.workload_service import DEFAULT_SAMPLE_PROCESSES


def seed_initial_processes() -> None:
    from app.extensions import db
    from app.models.process import Process

    if Process.query.count() == 0:
        for item in DEFAULT_SAMPLE_PROCESSES:
            db.session.add(
                Process(
                    pid=item["pid"],
                    arrival_time=item["arrival_time"],
                    burst_time=item["burst_time"],
                    priority=item["priority"],
                )
            )
        db.session.commit()


def create_app(config_override: Optional[dict] = None):
    from flask import Flask, jsonify
    from app.extensions import cors, db

    os.makedirs(INSTANCE_DIR, exist_ok=True)

    app = Flask(__name__)
    app.config.from_object(Config)
    if config_override:
        app.config.update(config_override)

    db.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    from app.routes import (
        analytics_bp,
        process_bp,
        report_bp,
        scheduling_bp,
        simulation_bp,
    )

    app.register_blueprint(process_bp)
    app.register_blueprint(scheduling_bp)
    app.register_blueprint(simulation_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(report_bp)

    @app.errorhandler(404)
    def not_found(_err):
        return jsonify({"error": "Endpoint or resource not found."}), 404

    @app.errorhandler(500)
    def server_error(err):
        return jsonify({"error": f"Internal server error: {err}"}), 500

    with app.app_context():
        db.create_all()
        if not app.config.get("TESTING", False):
            seed_initial_processes()

    return app
