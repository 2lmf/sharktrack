// ============================================================
// photo.js - Camera capture and photo upload
// ============================================================

let currentPhotoBase64 = null;
let currentPhotoFilename = null;

function initPhoto() {
    const btnPhoto = document.getElementById('btnPhoto');
    const photoInput = document.getElementById('photoInput');
    const photoPreview = document.getElementById('photoPreview');
    const photoPreviewWrap = document.getElementById('photoPreviewWrap');
    const photoRemove = document.getElementById('photoRemove');

    btnPhoto.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = ev => {
            currentPhotoBase64 = ev.target.result;
            currentPhotoFilename = `sharktrack_${Date.now()}.jpg`;
            photoPreview.src = currentPhotoBase64;
            photoPreviewWrap.classList.add('show');
        };
        reader.readAsDataURL(file);
    });

    photoRemove.addEventListener('click', () => {
        clearPhoto();
    });
}

function clearPhoto() {
    currentPhotoBase64 = null;
    currentPhotoFilename = null;
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreviewWrap').classList.remove('show');
    document.getElementById('photoInput').value = '';
}

async function uploadCurrentPhoto() {
    if (!currentPhotoBase64) return null;
    try {
        const result = await window.SheetsAPI.uploadPhoto(currentPhotoBase64, currentPhotoFilename);
        if (result.success) return result.photoLink;
    } catch (err) {
        console.warn('Photo upload failed:', err);
    }
    return null;
}

function hasPhoto() { return !!currentPhotoBase64; }

window.PhotoCapture = {
    init: initPhoto,
    uploadCurrentPhoto,
    clearPhoto,
    hasPhoto
};
