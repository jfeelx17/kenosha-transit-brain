// File upload handling
document.addEventListener('DOMContentLoaded', function() {
    // Setup file inputs
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                uploadFile(e.target.files[0], e.target.dataset.type);
            }
        });
    });

    // Setup drag and drop for each drop zone
    ['schedule', 'map', 'gtfs', 'api'].forEach(type => {
        const dropZone = document.getElementById(`drop-${type}`);
        const fileInput = dropZone.querySelector('input[type="file"]');
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', function(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                uploadFile(files[0], type);
            }
        }, false);
    });
});

function uploadFile(file, type) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    showStatus('Uploading...', 'info');

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(`✓ Uploaded: ${data.filename}`, 'success');
            setTimeout(() => {
                location.reload();
            }, 1000);
        } else {
            showStatus(`✗ Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        showStatus(`✗ Upload failed: ${error.message}`, 'error');
    });
}

function deleteFile(type, filename) {
    if (!confirm(`Delete ${filename}?`)) return;

    fetch(`/delete/${type}/${filename}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload();
        } else {
            showStatus(`✗ Error: ${data.error}`, 'error');
        }
    })
    .catch(error => {
        showStatus(`✗ Delete failed: ${error.message}`, 'error');
    });
}

function processFiles() {
    const btn = document.getElementById('processBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> Processing...';

    showStatus('Processing files...', 'info');

    fetch('/process', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus('✓ Files processed successfully!', 'success');
            console.log(data.output);
        } else {
            showStatus(`✗ Error: ${data.error || 'Processing failed'}`, 'error');
            console.error(data.error);
        }
    })
    .catch(error => {
        showStatus(`✗ Processing failed: ${error.message}`, 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<span class="btn-icon">⚡</span> Process Files';
    });
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status show ${type}`;
    status.style.display = 'block';

    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}
