from app.routes.analytics_routes import analytics_bp
from app.routes.process_routes import process_bp
from app.routes.report_routes import report_bp
from app.routes.scheduling_routes import scheduling_bp
from app.routes.simulation_routes import simulation_bp

__all__ = [
    "process_bp",
    "scheduling_bp",
    "simulation_bp",
    "analytics_bp",
    "report_bp",
]
