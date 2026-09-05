// Kenosha Transit Brain - upload UI
//
// Every server reply is expected to be JSON. requestJSON() below verifies the
// Content-Type before parsing so that, if the server ever answers with an HTML
// page (413 too large, 404, crash page), the user sees the HTTP status and a
// snippet of the page instead of the cryptic
// "Unexpected token '<', "<!doctype "... is not valid JSON".

document.addEventListener('DOMContentLoaded', function () {
    // Hidden <input type="file"> inside each "browse" label
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function (e) {
            if (e.target.files.length > 0) {
                uploadFile(e.target.files[0], e.target.dataset.type);
                e.target.value = ''; // allow re-selecting the same file later
            }
        });
    });

    // Drag and drop for each drop zone
    ['schedule', 'map', 'gtfs', 'api'].forEach(type => {
        const dropZone = document.getElementById(`drop-${type}`);
        if (!dropZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        dropZone.addEventListener('drop', function (e) {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                uploadFile(files[0], type);
            }
        }, false);
    });
});

/**
 * fetch() wrapper that guarantees a parsed JSON object or throws a readable Error.
 */
async function requestJSON(url, options = {}) {
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) },
        });
    } catch (err) {
        throw new Error(`Could not reach the server (${err.message}). Is upload_server.py running?`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!contentType.includes('application/json')) {
        const snippet = text
            .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 140);
        throw new Error(
            `Server answered HTTP ${response.status} ${response.statusText} with a non-JSON page` +
            (snippet ? `: "${snippet}"` : '')
        );
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        throw new Error(`Server sent invalid JSON (HTTP ${response.status})`);
    }

    if (!response.ok || data.success === false) {
        throw new Error(data.error || `HTTP ${response.status} ${response.statusText}`);
    }
    return data;
}

function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

async function uploadFile(file, type) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    showStatus(`Uploading ${file.name} (${formatSize(file.size)})...`, 'info');

    try {
        const data = await requestJSON('/upload', { method: 'POST', body: formData });
        const verb = data.replaced ? 'Replaced' : 'Uploaded';
        showStatus(`✓ ${verb}: ${data.filename} (${formatSize(data.size)})`, 'success');
        setTimeout(() => location.reload(), 800);
    } catch (err) {
        showStatus(`✗ Upload failed: ${err.message}`, 'error');
    }
}

async function deleteFile(type, filename) {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
        await requestJSON(`/delete/${encodeURIComponent(type)}/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
        });
        location.reload();
    } catch (err) {
        showStatus(`✗ Delete failed: ${err.message}`, 'error');
    }
}

async function processFiles() {
    const btn = document.getElementById('processBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Processing...';

    showStatus('Processing files...', 'info');

    try {
        const data = await requestJSON('/process', { method: 'POST' });
        showStatus('✓ Files processed successfully!', 'success');
        console.log(data.output);
    } catch (err) {
        showStatus(`✗ Processing failed: ${err.message}`, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">⚡</span> Process Files';
    }
}

let statusTimer = null;
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status show ${type}`;
    status.style.display = 'block';

    clearTimeout(statusTimer);
    if (type === 'success' || type === 'error') {
        statusTimer = setTimeout(() => {
            status.style.display = 'none';
        }, type === 'error' ? 12000 : 5000);
    }
}
