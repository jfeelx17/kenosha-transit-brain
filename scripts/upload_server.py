#!/usr/bin/env python3
"""
Web-based file upload interface for Kenosha Transit Brain.

Design rule: EVERY response from this server is JSON, including errors.

The browser code in static/js/upload.js calls fetch() and parses the reply as
JSON. Flask/Werkzeug normally answer errors (413 file too large, 404, 405,
unhandled 500, the debugger page) with an HTML document that starts with
"<!doctype html>", which is exactly what produced:

    Upload failed: Unexpected token '<', "<!doctype "... is not valid JSON

The error handlers below convert all of those into JSON payloads of the form
{"success": false, "error": "...", "status": <code>} so the UI can show the
real reason instead of a parser error.
"""

import json
import os
import subprocess
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

# Runtime knobs (all optional). Defaults suit a single user on one machine.
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "100"))
HOST = os.environ.get("HOST", "0.0.0.0")  # 0.0.0.0 so Chrome OS / phones on LAN can reach it
PORT = int(os.environ.get("PORT", "5000"))
DEBUG = os.environ.get("FLASK_DEBUG", "").lower() in {"1", "true", "yes", "on"}

app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

# Upload directories
UPLOAD_DIRS = {
    "schedule": UPLOADS_DIR / "schedules",
    "map": UPLOADS_DIR / "maps",
    "gtfs": UPLOADS_DIR / "gtfs",
    "api": UPLOADS_DIR / "api",
}

ALLOWED_EXTENSIONS = {
    "schedule": {"pdf"},
    "map": {"pdf"},
    "gtfs": {"zip"},
    "api": {"json"},
}


# ---------------------------------------------------------------------------
# JSON error handling -- the actual bug fix
# ---------------------------------------------------------------------------

def json_error(message, status=400, **extra):
    """Build a uniform JSON error response."""
    payload = {"success": False, "error": message, "status": status}
    payload.update(extra)
    return jsonify(payload), status


@app.errorhandler(RequestEntityTooLarge)
def handle_too_large(_exc):
    return json_error(
        f"File is larger than the {MAX_UPLOAD_MB} MB limit. "
        f"Raise it with MAX_UPLOAD_MB=<n> when starting the server.",
        413,
    )


@app.errorhandler(HTTPException)
def handle_http_exception(exc):
    """404 / 405 / 400 / ... -> JSON instead of Werkzeug's HTML page."""
    return json_error(exc.description or exc.name, exc.code or 500, name=exc.name)


@app.errorhandler(Exception)
def handle_unexpected(exc):
    """Any crash inside a route -> JSON 500 (never the HTML debugger page)."""
    app.logger.exception("Unhandled error while serving %s %s", request.method, request.path)
    return json_error(f"{type(exc).__name__}: {exc}", 500)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def file_extension(filename):
    return filename.rsplit(".", 1)[1].lower() if "." in filename else ""


def allowed_file(filename, file_type):
    """Check if file extension is allowed for this upload type."""
    return file_extension(filename) in ALLOWED_EXTENSIONS.get(file_type, set())


def get_uploaded_files():
    """Get list of uploaded files per type."""
    files = {}
    for file_type, dir_path in UPLOAD_DIRS.items():
        entries = []
        if dir_path.exists():
            for f in sorted(dir_path.iterdir()):
                if f.is_file() and not f.name.startswith("."):
                    stat = f.stat()
                    entries.append({"name": f.name, "size": stat.st_size, "modified": stat.st_mtime})
        files[file_type] = entries
    return files


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Main upload interface."""
    return render_template("upload.html", files=get_uploaded_files())


@app.route("/api/health")
def health():
    """Quick liveness check used by scripts/dev.sh and the docs."""
    return jsonify({
        "ok": True,
        "service": "kenosha-transit-brain-upload-server",
        "uploads_dir": str(UPLOADS_DIR),
        "max_upload_mb": MAX_UPLOAD_MB,
    })


@app.route("/upload", methods=["POST"])
def upload_file():
    """Handle a single file upload from the drag-and-drop UI."""
    file_type = request.form.get("type", "schedule")
    upload_dir = UPLOAD_DIRS.get(file_type)
    if not upload_dir:
        return json_error(f"Unknown upload type '{file_type}'", 400)

    if "file" not in request.files:
        return json_error("No file field in the request", 400)

    file = request.files["file"]
    if not file or file.filename == "":
        return json_error("No file selected", 400)

    if not allowed_file(file.filename, file_type):
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS[file_type]))
        return json_error(
            f"'{file.filename}' is not allowed for {file_type} uploads (expected .{allowed})",
            400,
        )

    filename = secure_filename(file.filename)
    if not filename or filename.startswith("."):
        # secure_filename() strips everything unsafe; a name like "日本語.pdf" becomes "pdf".
        filename = f"upload.{file_extension(file.filename)}"

    upload_dir.mkdir(parents=True, exist_ok=True)
    filepath = upload_dir / filename
    replaced = filepath.exists()

    try:
        file.save(str(filepath))
    except OSError as exc:
        return json_error(f"Could not write {filepath}: {exc}", 500)

    return jsonify({
        "success": True,
        "filename": filename,
        "type": file_type,
        "size": filepath.stat().st_size,
        "replaced": replaced,
        "path": str(filepath.relative_to(BASE_DIR)),
    })


@app.route("/files")
def list_files():
    """Get list of uploaded files."""
    return jsonify(get_uploaded_files())


@app.route("/process", methods=["POST"])
def process_files():
    """Run scripts/process_uploads.py and report its output."""
    processor_script = BASE_DIR / "scripts" / "process_uploads.py"
    try:
        result = subprocess.run(
            [os.environ.get("PYTHON", "python3"), str(processor_script)],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(BASE_DIR),
        )
    except subprocess.TimeoutExpired:
        return json_error("Processing timed out after 120 seconds", 504)

    ok = result.returncode == 0
    return jsonify({
        "success": ok,
        "output": result.stdout,
        "error": None if ok else (result.stderr.strip() or f"exit code {result.returncode}"),
        "returncode": result.returncode,
    })


@app.route("/delete/<file_type>/<path:filename>", methods=["DELETE"])
def delete_file(file_type, filename):
    """Delete an uploaded file."""
    upload_dir = UPLOAD_DIRS.get(file_type)
    if not upload_dir:
        return json_error(f"Unknown upload type '{file_type}'", 400)

    safe_name = secure_filename(filename)
    filepath = upload_dir / safe_name
    if not safe_name or not filepath.exists():
        return json_error("File not found", 404)

    filepath.unlink()
    return jsonify({"success": True, "filename": safe_name})


@app.route("/status")
def status():
    """Get the last processing report."""
    report_path = DATA_DIR / "processing_report.json"
    if report_path.exists():
        with open(report_path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    return jsonify({"message": "No processing report found"})


if __name__ == "__main__":
    for dir_path in UPLOAD_DIRS.values():
        dir_path.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Kenosha Transit Brain - Upload Server")
    print("=" * 60)
    print(f"\n  Server:  http://localhost:{PORT}")
    print(f"  Uploads: {UPLOADS_DIR}")
    print(f"  Limit:   {MAX_UPLOAD_MB} MB per file")
    print(f"  Debug:   {'on' if DEBUG else 'off (set FLASK_DEBUG=1 to enable)'}")
    print("\nPress Ctrl+C to stop\n")

    app.run(debug=DEBUG, host=HOST, port=PORT)
