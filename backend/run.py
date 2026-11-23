import argparse
import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(description="Adaptive Hybrid CPU Scheduler Backend")
    parser.add_argument("--host", default=os.environ.get("FLASK_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("FLASK_PORT", 5000)))
    parser.add_argument("--debug", action="store_true", default=False)
    args = parser.parse_args()

    try:
        from app import create_app

        app = create_app()
        app.run(host=args.host, port=args.port, debug=args.debug)
    except ImportError as exc:
        print(f"Flask dependencies not found ({exc}); starting Python stdlib SQLite API server...")
        from app.sqlite_bridge import run_bridge_server

        run_bridge_server(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
