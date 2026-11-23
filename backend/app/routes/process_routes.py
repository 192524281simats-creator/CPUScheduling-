from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.process import Process
from app.services.workload_service import generate_sample_workload
from app.utils.validators import ValidationError, validate_processes, validate_single_process

process_bp = Blueprint("processes", __name__, url_prefix="/api/processes")


@process_bp.route("", methods=["GET"])
def list_processes():
    rows = Process.query.order_by(Process.arrival_time.asc(), Process.pid.asc()).all()
    return jsonify({"processes": [r.to_dict() for r in rows]}), 200


@process_bp.route("", methods=["POST"])
def create_process():
    payload = request.get_json(silent=True) or {}
    try:
        clean = validate_single_process(payload)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    existing = Process.query.filter_by(pid=clean["pid"]).first()
    if existing:
        return jsonify({"error": f"Process ID '{clean['pid']}' already exists."}), 409

    proc = Process(
        pid=clean["pid"],
        arrival_time=clean["arrival_time"],
        burst_time=clean["burst_time"],
        priority=clean["priority"],
    )
    db.session.add(proc)
    db.session.commit()
    return jsonify({"process": proc.to_dict()}), 201


@process_bp.route("/<int:process_id>", methods=["PUT"])
def update_process(process_id: int):
    proc = db.session.get(Process, process_id)
    if not proc:
        return jsonify({"error": f"Process #{process_id} not found."}), 404

    payload = request.get_json(silent=True) or {}
    candidate = {
        "pid": payload.get("pid", proc.pid),
        "arrival_time": payload.get("arrival_time", proc.arrival_time),
        "burst_time": payload.get("burst_time", proc.burst_time),
        "priority": payload.get("priority", proc.priority),
    }
    try:
        clean = validate_single_process(candidate)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    conflict = Process.query.filter(
        Process.pid == clean["pid"], Process.id != process_id
    ).first()
    if conflict:
        return jsonify({"error": f"Process ID '{clean['pid']}' already exists."}), 409

    proc.pid = clean["pid"]
    proc.arrival_time = clean["arrival_time"]
    proc.burst_time = clean["burst_time"]
    proc.priority = clean["priority"]
    db.session.commit()
    return jsonify({"process": proc.to_dict()}), 200


@process_bp.route("/<int:process_id>", methods=["DELETE"])
def delete_process(process_id: int):
    proc = db.session.get(Process, process_id)
    if not proc:
        return jsonify({"error": f"Process #{process_id} not found."}), 404
    db.session.delete(proc)
    db.session.commit()
    return jsonify({"deleted": process_id}), 200


@process_bp.route("", methods=["DELETE"])
def clear_processes():
    Process.query.delete()
    db.session.commit()
    return jsonify({"cleared": True}), 200


@process_bp.route("/bulk", methods=["POST"])
def bulk_replace_processes():
    payload = request.get_json(silent=True) or {}
    items = payload.get("processes")
    replace = bool(payload.get("replace", True))
    try:
        clean_list = validate_processes(items)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400

    if replace:
        Process.query.delete()
        db.session.flush()
    else:
        existing_pids = {p.pid for p in Process.query.all()}
        for item in clean_list:
            if item["pid"] in existing_pids:
                return (
                    jsonify({"error": f"Duplicate process ID '{item['pid']}' already exists."}),
                    409,
                )

    created = []
    for item in clean_list:
        proc = Process(
            pid=item["pid"],
            arrival_time=item["arrival_time"],
            burst_time=item["burst_time"],
            priority=item["priority"],
        )
        db.session.add(proc)
        created.append(proc)

    db.session.commit()
    return jsonify({"processes": [p.to_dict() for p in created]}), 201


@process_bp.route("/sample", methods=["POST"])
def load_sample_processes():
    payload = request.get_json(silent=True) or {}
    preset = str(payload.get("preset", "classic"))
    count = int(payload.get("count", 6))
    sample = generate_sample_workload(preset=preset, count=count)

    Process.query.delete()
    db.session.flush()
    created = []
    for item in sample:
        proc = Process(
            pid=item["pid"],
            arrival_time=item["arrival_time"],
            burst_time=item["burst_time"],
            priority=item["priority"],
        )
        db.session.add(proc)
        created.append(proc)
    db.session.commit()
    return jsonify({"processes": [p.to_dict() for p in created], "preset": preset}), 201
