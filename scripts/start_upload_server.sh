#!/bin/bash
# Quick start script for the upload server

cd "$(dirname "$0")/.."
echo "Starting Kenosha Transit Brain Upload Server..."
echo ""
python3 scripts/upload_server.py
