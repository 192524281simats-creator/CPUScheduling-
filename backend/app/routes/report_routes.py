from flask import Blueprint, Response, jsonify, request

from app.extensions import db
from app.models.simulation import Simulation
from app.services.report_service import generate_csv_report, generate_pdf_report

report_bp = Blueprint("reports", __name__, url_prefix="/api")


@report_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "service": "adaptive-cpu-scheduler-api"}), 200


@report_bp.route("/reports/<int:simulation_id>", methods=["GET"])
def export_report(simulation_id: int):
    sim = db.session.get(Simulation, simulation_id)
    if not sim:
        return jsonify({"error": f"Simulation #{simulation_id} not found."}), 404

    sim_dict = sim.to_dict(include_details=True)
    fmt = str(request.args.get("format", "pdf")).strip().lower()

    if fmt == "csv":
        csv_text = generate_csv_report(sim_dict)
        return Response(
            csv_text,
            status=200,
            mimetype="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="simulation_{simulation_id}_report.csv"'
            },
        )
    if fmt == "json":
        return jsonify(sim_dict), 200

    pdf_bytes = generate_pdf_report(sim_dict)
    return Response(
        pdf_bytes,
        status=200,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="simulation_{simulation_id}_report.pdf"'
        },
    )
