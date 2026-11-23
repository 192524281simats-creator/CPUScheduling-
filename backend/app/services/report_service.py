import csv
import io
from typing import Any, Dict, List


def generate_csv_report(simulation: Dict[str, Any]) -> str:
    """Generate a structured CSV report containing summary metrics, process results, and timeline."""
    output = io.StringIO()
    writer = csv.writer(output)

    metrics = simulation.get("metrics", {})
    writer.writerow(["ADAPTIVE HYBRID CPU SCHEDULING FRAMEWORK - SIMULATION REPORT"])
    writer.writerow(["Simulation ID", simulation.get("id", "")])
    writer.writerow(["Name", simulation.get("name", "")])
    writer.writerow(["Algorithm", simulation.get("algorithm", "")])
    writer.writerow(["Created At", simulation.get("created_at", "")])
    writer.writerow([])

    writer.writerow(["PERFORMANCE METRICS"])
    writer.writerow(["Metric", "Value"])
    for key in [
        "average_waiting_time",
        "average_turnaround_time",
        "average_response_time",
        "cpu_utilization",
        "cpu_idle_time",
        "productive_busy_time",
        "total_simulation_time",
        "throughput",
        "total_context_switches",
        "total_scheduling_overhead",
        "fairness_index",
    ]:
        writer.writerow([key, metrics.get(key, "")])
    writer.writerow([])

    writer.writerow(["PROCESS RESULTS"])
    writer.writerow(
        [
            "PID",
            "Arrival Time",
            "Burst Time",
            "Priority",
            "First Start Time",
            "Completion Time",
            "Turnaround Time",
            "Waiting Time",
            "Response Time",
        ]
    )
    for proc in simulation.get("process_results", []):
        writer.writerow(
            [
                proc.get("pid"),
                proc.get("arrival_time"),
                proc.get("burst_time"),
                proc.get("priority"),
                proc.get("first_start_time"),
                proc.get("completion_time"),
                proc.get("turnaround_time"),
                proc.get("waiting_time"),
                proc.get("response_time"),
            ]
        )
    writer.writerow([])

    writer.writerow(["EXECUTION TIMELINE"])
    writer.writerow(["Step", "PID", "Start Time", "End Time", "Duration", "Queue Level", "Event Type"])
    for idx, seg in enumerate(simulation.get("timeline", []), start=1):
        writer.writerow(
            [
                idx,
                seg.get("pid"),
                seg.get("start_time"),
                seg.get("end_time"),
                seg.get("duration"),
                seg.get("queue_level") if seg.get("queue_level") is not None else "-",
                seg.get("event_type"),
            ]
        )

    return output.getvalue()


def _escape_pdf_text(text: str) -> str:
    safe = (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )
    # Keep printable ASCII for core PDF Type1 Helvetica encoding
    return "".join(ch if 32 <= ord(ch) <= 126 else " " for ch in safe)


def _build_minimal_pdf(lines: List[str]) -> bytes:
    """
    Build a valid multi-page PDF 1.4 document using only the Python standard library
    so PDF reports work reliably with or without ReportLab installed.
    """
    lines_per_page = 46
    pages_lines = [
        lines[i : i + lines_per_page] for i in range(0, max(1, len(lines)), lines_per_page)
    ]

    objects: List[bytes] = []

    def add_obj(content: bytes) -> int:
        objects.append(content)
        return len(objects)

    # Reserve IDs: 1 = Catalog, 2 = Pages, 3 = Font Helvetica, 4 = Font Courier
    add_obj(b"")  # placeholder 1
    add_obj(b"")  # placeholder 2
    font_sans_id = add_obj(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    )
    font_mono_id = add_obj(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"
    )

    page_ids: List[int] = []
    for page_idx, page_lines in enumerate(pages_lines):
        stream_cmds = ["BT", f"/F2 9 Tf", "45 755 Td", "14 TL"]
        for line_idx, line in enumerate(page_lines):
            if page_idx == 0 and line_idx == 0:
                stream_cmds.append(f"/F1 13 Tf ({_escape_pdf_text(line)}) Tj T* /F2 9 Tf")
            elif line.startswith("===") or line.startswith("---"):
                stream_cmds.append(f"/F1 10 Tf ({_escape_pdf_text(line)}) Tj T* /F2 9 Tf")
            else:
                stream_cmds.append(f"({_escape_pdf_text(line)}) Tj T*")
        stream_cmds.append(
            f"0 -20 Td /F1 8 Tf (Page {page_idx + 1} of {len(pages_lines)}) Tj ET"
        )
        stream_bytes = "\n".join(stream_cmds).encode("latin-1", errors="replace")
        content_id = add_obj(
            f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("ascii")
            + stream_bytes
            + b"\nendstream"
        )
        page_id = add_obj(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_sans_id} 0 R /F2 {font_mono_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>".encode("ascii")
        )
        page_ids.append(page_id)

    kids_ref = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>"
    objects[1] = f"<< /Type /Pages /Kids [{kids_ref}] /Count {len(page_ids)} >>".encode("ascii")

    buf = io.BytesIO()
    buf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for obj_num, obj_body in enumerate(objects, start=1):
        offsets.append(buf.tell())
        buf.write(f"{obj_num} 0 obj\n".encode("ascii"))
        buf.write(obj_body)
        buf.write(b"\nendobj\n")

    xref_pos = buf.tell()
    buf.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    buf.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    buf.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return buf.getvalue()


def generate_pdf_report(simulation: Dict[str, Any]) -> bytes:
    """
    Generate a formatted PDF report for a simulation.
    Uses ReportLab when available and falls back to the built-in PDF 1.4 generator.
    """
    metrics = simulation.get("metrics", {})
    process_results = simulation.get("process_results", [])
    timeline = simulation.get("timeline", [])
    events = simulation.get("events", [])

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=letter)
        width, height = letter
        y = height - 48

        def draw_line(text: str, font: str = "Helvetica", size: int = 10, dy: int = 14) -> None:
            nonlocal y
            if y < 56:
                c.showPage()
                y = height - 48
            c.setFont(font, size)
            c.drawString(44, y, text[:105])
            y -= dy

        draw_line("ADAPTIVE HYBRID CPU SCHEDULING FRAMEWORK", "Helvetica-Bold", 14, 18)
        draw_line(
            f"Simulation #{simulation.get('id', '-')} | {simulation.get('name', 'Simulation')} | Algorithm: {simulation.get('algorithm', '-')}",
            "Helvetica",
            10,
            16,
        )
        draw_line(f"Generated: {simulation.get('created_at', '-')}", "Helvetica", 9, 18)

        draw_line("Performance Metrics Summary", "Helvetica-Bold", 11, 16)
        for label, key, unit in [
            ("Average Waiting Time", "average_waiting_time", "units"),
            ("Average Turnaround Time", "average_turnaround_time", "units"),
            ("Average Response Time", "average_response_time", "units"),
            ("CPU Utilization", "cpu_utilization", "%"),
            ("Throughput", "throughput", "proc/unit"),
            ("Context Switches", "total_context_switches", "switches"),
            ("Scheduling Overhead", "total_scheduling_overhead", "units"),
            ("CPU Idle Time", "cpu_idle_time", "units"),
            ("Jain Fairness Index", "fairness_index", ""),
        ]:
            draw_line(f"  {label:<28}: {metrics.get(key, '-')} {unit}".rstrip(), "Courier", 9, 13)

        y -= 6
        draw_line("Process Completion Results", "Helvetica-Bold", 11, 16)
        draw_line("  PID   Arr   Burst   Prio   Start   Comp    TAT     WT     RT", "Courier-Bold", 9, 13)
        for p in process_results:
            draw_line(
                f"  {str(p['pid']):<5} {p['arrival_time']:>3}   {p['burst_time']:>5}   {p['priority']:>4}   "
                f"{p['first_start_time']:>5}   {p['completion_time']:>4}   {p['turnaround_time']:>4}   "
                f"{p['waiting_time']:>4}   {p['response_time']:>4}",
                "Courier",
                9,
                13,
            )

        y -= 6
        draw_line("Execution Timeline Segments", "Helvetica-Bold", 11, 16)
        for idx, seg in enumerate(timeline[:35], start=1):
            q = f"Q{seg['queue_level']}" if seg.get("queue_level") else "-"
            draw_line(
                f"  #{idx:<3} {seg['pid']:<6} [{seg['start_time']} -> {seg['end_time']}] dur={seg['duration']}  {seg['event_type']} ({q})",
                "Courier",
                9,
                13,
            )

        y -= 6
        draw_line("Key Scheduling Decision Events", "Helvetica-Bold", 11, 16)
        for ev in events[:25]:
            draw_line(f"  t={ev.get('event_time', 0):<3} [{ev.get('event_type', '')}] {ev.get('explanation', '')}", "Helvetica", 8.5, 12)

        c.save()
        return buf.getvalue()
    except ImportError:
        pass

    lines: List[str] = [
        "ADAPTIVE HYBRID CPU SCHEDULING FRAMEWORK - REPORT",
        f"Simulation #{simulation.get('id', '-')} | {simulation.get('name', 'Simulation')} | Algorithm: {simulation.get('algorithm', '-')}",
        f"Timestamp: {simulation.get('created_at', '-')}",
        "",
        "=== PERFORMANCE METRICS ===",
        f"Average Waiting Time     : {metrics.get('average_waiting_time', '-')} units",
        f"Average Turnaround Time  : {metrics.get('average_turnaround_time', '-')} units",
        f"Average Response Time    : {metrics.get('average_response_time', '-')} units",
        f"CPU Utilization          : {metrics.get('cpu_utilization', '-')} %",
        f"Throughput               : {metrics.get('throughput', '-')} proc/unit",
        f"Context Switches         : {metrics.get('total_context_switches', '-')}",
        f"Scheduling Overhead      : {metrics.get('total_scheduling_overhead', '-')} units",
        f"CPU Idle Time            : {metrics.get('cpu_idle_time', '-')} units",
        f"Fairness Index           : {metrics.get('fairness_index', '-')}",
        "",
        "=== PROCESS RESULTS ===",
        "PID   Arr  Burst  Prio  Start  Comp   TAT    WT    RT",
    ]
    for p in process_results:
        lines.append(
            f"{str(p['pid']):<5} {p['arrival_time']:>3}  {p['burst_time']:>5}  {p['priority']:>4}  "
            f"{p['first_start_time']:>5}  {p['completion_time']:>4}  {p['turnaround_time']:>4}  "
            f"{p['waiting_time']:>4}  {p['response_time']:>4}"
        )

    lines.append("")
    lines.append("=== EXECUTION TIMELINE ===")
    for idx, seg in enumerate(timeline, start=1):
        q = f"Q{seg['queue_level']}" if seg.get("queue_level") else "-"
        lines.append(
            f"#{idx:<3} {seg['pid']:<6} [{seg['start_time']} -> {seg['end_time']}] dur={seg['duration']}  {seg['event_type']} ({q})"
        )

    lines.append("")
    lines.append("=== SCHEDULING DECISION LOG ===")
    for ev in events[:40]:
        lines.append(
            f"t={ev.get('event_time', 0):<3} [{ev.get('event_type', '')}] {ev.get('explanation', '')}"
        )

    return _build_minimal_pdf(lines)
