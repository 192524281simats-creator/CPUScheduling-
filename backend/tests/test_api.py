import os
import tempfile
import pytest

from tests.conftest import SAMPLE_PROCESSES


def test_flask_api_and_persistence_if_available():
    flask = pytest.importorskip("flask")
    assert flask is not None

    from app import create_app

    fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            }
        )
        client = app.test_client()

        assert client.get("/api/health").status_code == 200

        # Create processes
        for p in SAMPLE_PROCESSES:
            r = client.post("/api/processes", json=p)
            assert r.status_code == 201

        listed = client.get("/api/processes").get_json()["processes"]
        assert len(listed) == 4

        # Run and persist simulation
        sim_resp = client.post(
            "/api/simulations",
            json={"algorithm": "hybrid", "name": "Test Hybrid Run"},
        )
        assert sim_resp.status_code == 201
        sim_id = sim_resp.get_json()["simulation"]["id"]

        # Retrieve persisted simulation & events & reports
        assert client.get(f"/api/simulations/{sim_id}").status_code == 200
        assert client.get(f"/api/events/{sim_id}").status_code == 200
        assert client.get(f"/api/analytics/comparison").status_code == 200
        assert client.get(f"/api/reports/{sim_id}?format=pdf").data.startswith(b"%PDF")
        assert client.get(f"/api/reports/{sim_id}?format=csv").status_code == 200
    finally:
        if os.path.exists(db_path):
            os.remove(db_path)
