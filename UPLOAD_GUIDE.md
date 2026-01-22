# Quick Upload Guide

## 📁 Where to Put Files

Simply drag and drop files into these folders:

```
uploads/
├── schedules/    ← Put schedule PDFs here
├── maps/        ← Put route map PDFs here  
├── gtfs/        ← Put GTFS ZIP files here
└── api/         ← Put API config JSON here
```

## 🚀 How to Process

After uploading files, run:

```bash
python scripts/process_uploads.py
```

This automatically:
- ✅ Copies files to `data/` directory
- ✅ Updates knowledge base
- ✅ Generates processing report

## 📋 What to Upload

### 1. Schedule PDF
- **Where**: `uploads/schedules/`
- **Name**: `schedule_2025.pdf` (or any name)
- **Source**: https://www.kenosha.org/departments/transit/published_bus_schedules.php

### 2. Route Map PDF
- **Where**: `uploads/maps/`
- **Name**: `route_map.pdf` (or any name)
- **Source**: https://www.kenosha.org/English%20Bus%20Routes.pdf

### 3. GTFS Static Feed (if available)
- **Where**: `uploads/gtfs/`
- **Name**: `gtfs.zip` (or any name)
- **Source**: Check if Kenosha publishes GTFS feed

### 4. API Endpoints (when you find them)
- **Where**: `uploads/api/`
- **Name**: `endpoints.json`
- **Format**:
```json
{
  "vehicle_positions": "https://api.example.com/gtfs-rt/vehiclepositions.pb",
  "trip_updates": "https://api.example.com/gtfs-rt/tripupdates.pb",
  "service_alerts": "https://api.example.com/gtfs-rt/alerts.pb",
  "auth_required": false
}
```

## ✅ Current Status

Run the processor to see what's been uploaded:

```bash
python scripts/process_uploads.py
```

Check the report: `data/processing_report.json`

## 💡 Tips

- Files are automatically organized
- Source files stay in `uploads/` (tracked in git)
- Processed files go to `data/` (ignored in git)
- You can re-run the processor anytime
