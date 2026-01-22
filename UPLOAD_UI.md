# Upload UI - Web Interface

## 🎨 Modern Web-Based File Upload

A beautiful, smooth web interface for uploading files to Kenosha Transit Brain.

## 🚀 Quick Start

### Start the Server

```bash
python3 scripts/upload_server.py
```

Or use the convenience script:

```bash
./scripts/start_upload_server.sh
```

### Access the Interface

Open your browser to:
```
http://localhost:5000
```

## ✨ Features

- **Drag & Drop** - Drop files directly onto upload zones
- **Visual Feedback** - Smooth animations and status updates
- **File Management** - View and delete uploaded files
- **One-Click Processing** - Process all files with a single button
- **Dark Mode** - Modern, eye-friendly dark theme
- **Responsive** - Works on desktop, tablet, and mobile

## 📁 Upload Types

1. **Schedules** - PDF schedule files
2. **Route Maps** - PDF route map files
3. **GTFS Feeds** - ZIP files containing GTFS data
4. **API Config** - JSON files with API endpoints

## 🎯 How to Use

1. **Start Server**: Run `python3 scripts/upload_server.py`
2. **Open Browser**: Go to `http://localhost:5000`
3. **Upload Files**: 
   - Drag files onto the appropriate card
   - Or click "browse" to select files
4. **Process**: Click "Process Files" button
5. **Done**: Files are automatically processed and knowledge base updated

## 🛠️ Technical Details

- **Framework**: Flask (Python web framework)
- **Frontend**: Vanilla JavaScript (no dependencies)
- **Styling**: Modern CSS with gradients and animations
- **File Handling**: Secure filename sanitization
- **Max File Size**: 100MB per file

## 🎨 Design Philosophy

- **Buttery Smooth**: 60fps animations, instant feedback
- **Gen Z Vibes**: Modern gradients, clean typography
- **2026 Ready**: Dark mode, smooth transitions
- **Intuitive**: Clear visual hierarchy, obvious actions

## 🔧 Customization

Edit these files to customize:
- `static/css/upload.css` - Styling and colors
- `templates/upload.html` - HTML structure
- `static/js/upload.js` - JavaScript behavior

## 📝 Notes

- Server runs on port 5000 by default
- Files are saved to `uploads/` directory
- Processing happens via `scripts/process_uploads.py`
- All uploads are validated before saving
