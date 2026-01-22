# Upload Directory

Place your source files here for processing.

## Directory Structure

- `schedules/` - Schedule PDFs (e.g., schedule_2025.pdf)
- `maps/` - Route map PDFs (e.g., route_map.pdf)
- `gtfs/` - GTFS static feed ZIP files
- `api/` - API configuration JSON files

## How to Use

1. **Upload files**: Place files in the appropriate subdirectory
2. **Run processor**: `python scripts/process_uploads.py`
3. **Check results**: See `data/processing_report.json`

## Example API Config

Create `api/endpoints.json`:

```json
{
  "vehicle_positions": "https://api.example.com/gtfs-rt/vehiclepositions.pb",
  "trip_updates": "https://api.example.com/gtfs-rt/tripupdates.pb",
  "service_alerts": "https://api.example.com/gtfs-rt/alerts.pb",
  "auth_required": false
}
```

## File Naming

- Schedule PDFs: `schedule_2025.pdf`, `schedule_2024.pdf`, etc.
- Route maps: `route_map.pdf`, `routes.pdf`, etc.
- GTFS: `gtfs.zip`, `kenosha_gtfs.zip`, etc.

## Processing

After uploading files, run:

```bash
python scripts/process_uploads.py
```

This will:
- Copy files to `data/` directory
- Extract information where possible
- Update the knowledge base
- Generate a processing report
