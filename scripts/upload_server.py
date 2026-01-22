#!/usr/bin/env python3
"""
Web-based file upload interface for Kenosha Transit Brain.
Modern, smooth UI for uploading source files.
"""

import os
import json
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import subprocess

BASE_DIR = Path(__file__).parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
DOCS_DIR = BASE_DIR / "docs"

app = Flask(__name__, 
            template_folder=str(BASE_DIR / "templates"),
            static_folder=str(BASE_DIR / "static"))
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max

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

def allowed_file(filename, file_type):
    """Check if file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS.get(file_type, set())

def get_uploaded_files():
    """Get list of uploaded files."""
    files = {}
    for file_type, dir_path in UPLOAD_DIRS.items():
        if dir_path.exists():
            files[file_type] = [
                {
                    "name": f.name,
                    "size": f.stat().st_size,
                    "modified": f.stat().st_mtime
                }
                for f in dir_path.iterdir() 
                if f.is_file() and not f.name.startswith('.')
            ]
        else:
            files[file_type] = []
    return files

@app.route('/')
def index():
    """Main upload interface."""
    files = get_uploaded_files()
    return render_template('upload.html', files=files)

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file upload."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    file_type = request.form.get('type', 'schedule')
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(file.filename, file_type):
        return jsonify({"error": f"File type not allowed for {file_type}"}), 400
    
    # Save file
    upload_dir = UPLOAD_DIRS.get(file_type)
    if not upload_dir:
        return jsonify({"error": "Invalid upload type"}), 400
    
    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = secure_filename(file.filename)
    filepath = upload_dir / filename
    
    file.save(str(filepath))
    
    return jsonify({
        "success": True,
        "filename": filename,
        "type": file_type,
        "size": filepath.stat().st_size
    })

@app.route('/files')
def list_files():
    """Get list of uploaded files."""
    return jsonify(get_uploaded_files())

@app.route('/process', methods=['POST'])
def process_files():
    """Run the file processor."""
    try:
        processor_script = BASE_DIR / "scripts" / "process_uploads.py"
        result = subprocess.run(
            ['python3', str(processor_script)],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        return jsonify({
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr if result.returncode != 0 else None
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/delete/<file_type>/<filename>', methods=['DELETE'])
def delete_file(file_type, filename):
    """Delete an uploaded file."""
    upload_dir = UPLOAD_DIRS.get(file_type)
    if not upload_dir:
        return jsonify({"error": "Invalid file type"}), 400
    
    filepath = upload_dir / secure_filename(filename)
    if filepath.exists():
        filepath.unlink()
        return jsonify({"success": True})
    else:
        return jsonify({"error": "File not found"}), 404

@app.route('/status')
def status():
    """Get processing status."""
    report_path = DATA_DIR / "processing_report.json"
    if report_path.exists():
        with open(report_path, 'r') as f:
            report = json.load(f)
        return jsonify(report)
    return jsonify({"message": "No processing report found"})

if __name__ == '__main__':
    # Ensure directories exist
    for dir_path in UPLOAD_DIRS.values():
        dir_path.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Kenosha Transit Brain - Upload Server")
    print("=" * 60)
    print(f"\n🌐 Server starting at: http://localhost:5000")
    print(f"📁 Upload directory: {UPLOADS_DIR}")
    print("\nPress Ctrl+C to stop\n")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
