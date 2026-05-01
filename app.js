// State
let currentStream = null;
let currentFacingMode = 'environment';
let locationData = {
    address: 'Unknown Location',
    fullAddress: 'Unknown Full Address',
    lat: 0,
    lng: 0,
    time: ''
};
let isStampEnabled = true;
let mapImg = null;

// DOM Elements
const video = document.getElementById('camera-feed');
const captureCanvas = document.getElementById('capture-canvas');
const ctx = captureCanvas.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Controls
const captureBtn = document.getElementById('capture-btn');
const switchCameraBtn = document.getElementById('switch-camera-btn');
const toggleStampBtn = document.getElementById('toggle-stamp-btn');
const galleryBtn = document.getElementById('gallery-btn');

// Live Badge
const liveBadge = document.getElementById('live-location-badge');
const liveAddress = document.getElementById('live-address');
const liveLatLng = document.getElementById('live-latlng');
const liveTime = document.getElementById('live-time');

// Preview Modal
const previewModal = document.getElementById('preview-modal');
const previewImage = document.getElementById('preview-image');
const retakeBtn = document.getElementById('retake-btn');
const downloadBtn = document.getElementById('download-btn');
const closePreviewBtn = document.getElementById('close-preview-btn');

const toast = document.getElementById('toast');

// --- Initialization ---

function getFormattedTime() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const mins = String(now.getMinutes()).padStart(2, '0');
    
    const tzOffset = -now.getTimezoneOffset();
    const tzSign = tzOffset <= 0 ? '+' : '-'; // JS offset is reversed (e.g., -330 for IST +05:30)
    const tzH = String(Math.floor(Math.abs(tzOffset) / 60)).padStart(2, '0');
    const tzM = String(Math.abs(tzOffset) % 60).padStart(2, '0');
    
    return `${dd}/${mm}/${yy} ${hours}:${mins} ${ampm} GMT ${tzSign}${tzH}:${tzM}`;
}

async function init() {
    await setupCamera();
    fetchLocation();
    
    // Update live time every second
    setInterval(() => {
        locationData.time = getFormattedTime();
        const now = new Date();
        liveTime.textContent = now.toLocaleTimeString();
    }, 1000);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

galleryBtn.addEventListener('click', () => {
    showToast("Gallery feature coming soon!");
});

// --- Camera Logic ---

let currentRatioMode = 'portrait';
const videoContainer = document.getElementById('video-container');
const btnPortrait = document.getElementById('btn-portrait');
const btnLandscape = document.getElementById('btn-landscape');

function updateRatioUI() {
    btnPortrait.classList.toggle('active', currentRatioMode === 'portrait');
    btnLandscape.classList.toggle('active', currentRatioMode === 'landscape');
    
    videoContainer.classList.remove('portrait', 'landscape');
    videoContainer.classList.add(currentRatioMode);
}

btnPortrait.addEventListener('click', async () => {
    if (currentRatioMode === 'portrait') return;
    currentRatioMode = 'portrait';
    updateRatioUI();
    loadingOverlay.classList.add('active');
    await setupCamera();
});

btnLandscape.addEventListener('click', async () => {
    if (currentRatioMode === 'landscape') return;
    currentRatioMode = 'landscape';
    updateRatioUI();
    loadingOverlay.classList.add('active');
    await setupCamera();
});

async function setupCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        const isPortrait = currentRatioMode === 'portrait';
        const targetAspectRatio = isPortrait ? 9/16 : 16/9;
        
        const constraints = {
            video: {
                facingMode: currentFacingMode,
                aspectRatio: { ideal: targetAspectRatio },
                width: { ideal: isPortrait ? 1080 : 1920 },
                height: { ideal: isPortrait ? 1920 : 1080 }
            },
            audio: false
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                loadingOverlay.classList.remove('active');
                captureBtn.classList.remove('disabled');
                captureBtn.disabled = false;
                resolve();
            };
        });
    } catch (err) {
        console.error("Error accessing camera: ", err);
        loadingText.textContent = "Camera access denied or unavailable.";
        showToast("Camera access failed.");
    }
}

switchCameraBtn.addEventListener('click', async () => {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    loadingOverlay.classList.add('active');
    loadingText.textContent = "Switching camera...";
    captureBtn.classList.add('disabled');
    captureBtn.disabled = true;
    await setupCamera();
});

// --- Geolocation Logic ---

function fetchLocation() {
    if (!navigator.geolocation) {
        liveAddress.textContent = "Geolocation not supported";
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            locationData.lat = latitude;
            locationData.lng = longitude;
            liveLatLng.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            
            try {
                // Reverse Geocoding using OpenStreetMap Nominatim
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
                const data = await response.json();
                
                if (data && data.display_name) {
                    // Extract a shorter address
                    const parts = data.display_name.split(',');
                    const shortAddress = parts.slice(0, 3).join(',').trim();
                    locationData.address = shortAddress || "Unknown Address";
                    locationData.fullAddress = data.display_name;
                    liveAddress.textContent = locationData.address;
                }
                
                // Load Satellite Map Image
                const bboxRadius = 0.005; // approx 500m
                const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${longitude-bboxRadius},${latitude-bboxRadius},${longitude+bboxRadius},${latitude+bboxRadius}&bboxSR=4326&size=200,200&format=png&f=image&_t=${Date.now()}`;
                mapImg = new Image();
                mapImg.crossOrigin = "anonymous";
                mapImg.src = url;
            } catch (err) {
                console.error("Geocoding failed: ", err);
                locationData.address = "Address unavailable";
                locationData.fullAddress = "Address unavailable";
                liveAddress.textContent = "Address unavailable";
            }
        },
        (error) => {
            console.error("Geolocation error: ", error);
            locationData.address = "Location access denied";
            liveAddress.textContent = "Location access denied";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// --- Toggle Stamp ---
toggleStampBtn.addEventListener('click', () => {
    isStampEnabled = !isStampEnabled;
    toggleStampBtn.classList.toggle('active', isStampEnabled);
    
    if (isStampEnabled) {
        liveBadge.classList.remove('hidden');
    } else {
        liveBadge.classList.add('hidden');
    }
});

// --- Capture & Overlay Logic ---

captureBtn.addEventListener('click', () => {
    if (captureBtn.disabled) return;
    
    // Target dimensions
    const isPortrait = currentRatioMode === 'portrait';
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? 1280 : 720;
    
    captureCanvas.width = targetW;
    captureCanvas.height = targetH;
    
    // Calculate aspect ratio crop logic to mimic object-fit: cover
    const videoRatio = video.videoWidth / video.videoHeight;
    const targetRatio = targetW / targetH;
    
    let drawWidth = targetW;
    let drawHeight = targetH;
    let offsetX = 0;
    let offsetY = 0;
    
    if (videoRatio > targetRatio) {
        // Video is wider than target
        drawWidth = targetH * videoRatio;
        offsetX = (targetW - drawWidth) / 2;
    } else {
        // Video is taller than target
        drawHeight = targetW / videoRatio;
        offsetY = (targetH - drawHeight) / 2;
    }
    
    // Draw the current video frame
    // Handle mirroring if using front camera
    if (currentFacingMode === 'user') {
        ctx.translate(captureCanvas.width, 0);
        ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    
    // Reset transform before drawing text to avoid mirrored text
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    if (isStampEnabled) {
        drawLocationStamp();
    }
    
    // Get image data
    try {
        const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);
        
        // Show preview
        previewImage.src = dataUrl;
        downloadBtn.href = dataUrl;
        downloadBtn.download = `geocam-${Date.now()}.jpg`;
        
        // Open Modal
        previewModal.classList.remove('hidden');
    } catch (e) {
        console.error("Canvas export error:", e);
        showToast("Error saving image. CORS policy blocked the action.");
    }
});

function drawCustomRoundedRect(ctx, x, y, width, height, radii) {
    const tl = radii[0];
    const tr = radii[1];
    const br = radii[2];
    const bl = radii[3];
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + width - tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + tr);
    ctx.lineTo(x + width, y + height - br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    ctx.lineTo(x + bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
}

function drawLocationStamp() {
    const w = captureCanvas.width;
    const h = captureCanvas.height;
    
    const scale = Math.max(w, h) / 1080;
    
    // Dimensions
    const padX = 40 * scale;
    const padY = 40 * scale;
    const mapSize = 180 * scale;
    const boxPadding = 20 * scale;
    const lineSpacing = 8 * scale;
    
    // Font setup
    const fontSizeTitle = 20 * scale;
    const fontSizeSub = 16 * scale;
    
    const fontBold = `600 ${fontSizeTitle}px Inter, sans-serif`;
    const fontRegular = `500 ${fontSizeSub}px Inter, sans-serif`;
    
    // Content
    const line1 = locationData.address;
    
    let addressParts = (locationData.fullAddress || locationData.address).split(',').map(s => s.trim());
    let line2 = addressParts.slice(0, Math.ceil(addressParts.length/2)).join(', ') + ',';
    let line3 = addressParts.slice(Math.ceil(addressParts.length/2)).join(', ');
    
    const line4 = `Lat ${locationData.lat.toFixed(5)}° Long ${locationData.lng.toFixed(5)}°`;
    const line5 = locationData.time;
    
    ctx.font = fontBold;
    const w1 = ctx.measureText(line1).width;
    ctx.font = fontRegular;
    const w2 = ctx.measureText(line2).width;
    const w3 = ctx.measureText(line3).width;
    const w4 = ctx.measureText(line4).width;
    const w5 = ctx.measureText(line5).width;
    
    const textWidth = Math.max(w1, w2, w3, w4, w5);
    const boxWidth = textWidth + (boxPadding * 2);
    
    // Coordinates
    const mapX = padX;
    const mapY = h - padY - mapSize;
    const boxX = mapX + mapSize;
    const boxY = mapY;
    
    // 1. Draw Map Image
    if (mapImg && mapImg.complete && mapImg.naturalWidth > 0) {
        ctx.save();
        drawCustomRoundedRect(ctx, mapX, mapY, mapSize, mapSize, [12 * scale, 0, 0, 12 * scale]);
        ctx.clip();
        ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);
        ctx.restore();
        
        // Draw red pin
        const pinX = mapX + mapSize / 2;
        const pinY = mapY + mapSize / 2;
        
        ctx.fillStyle = '#E43E36';
        ctx.beginPath();
        ctx.arc(pinX, pinY - 8*scale, 8*scale, Math.PI, 0);
        ctx.quadraticCurveTo(pinX + 8*scale, pinY, pinX, pinY + 12*scale);
        ctx.quadraticCurveTo(pinX - 8*scale, pinY, pinX - 8*scale, pinY - 8*scale);
        ctx.fill();
        
        // Inner dark circle
        ctx.fillStyle = '#6B231E';
        ctx.beginPath();
        ctx.arc(pinX, pinY - 8*scale, 3.5*scale, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw Google watermark
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${14*scale}px Inter, sans-serif`;
        ctx.fillText('Google', mapX + 8*scale, mapY + mapSize - 10*scale);
    } else {
        ctx.fillStyle = '#333';
        drawCustomRoundedRect(ctx, mapX, mapY, mapSize, mapSize, [12 * scale, 0, 0, 12 * scale]);
        ctx.fill();
    }
    
    // 2. Draw Text Box Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    drawCustomRoundedRect(ctx, boxX, boxY, boxWidth, mapSize, [0, 12 * scale, 12 * scale, 0]);
    ctx.fill();
    
    // 3. Draw Text
    ctx.fillStyle = '#ffffff';
    let textY = boxY + boxPadding + fontSizeTitle - (4 * scale);
    
    ctx.font = fontBold;
    ctx.fillText(line1, boxX + boxPadding, textY);
    
    ctx.font = fontRegular;
    textY += fontSizeSub + lineSpacing;
    ctx.fillText(line2, boxX + boxPadding, textY);
    
    textY += fontSizeSub + lineSpacing;
    ctx.fillText(line3, boxX + boxPadding, textY);
    
    textY += fontSizeSub + lineSpacing;
    ctx.fillText(line4, boxX + boxPadding, textY);
    
    textY += fontSizeSub + lineSpacing;
    ctx.fillText(line5, boxX + boxPadding, textY);
}

// --- Modal Actions ---
retakeBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
});

closePreviewBtn.addEventListener('click', () => {
    previewModal.classList.add('hidden');
});

downloadBtn.addEventListener('click', () => {
    showToast("Photo saved!");
    // The download is handled by the <a> tag href and download attributes
    setTimeout(() => {
        previewModal.classList.add('hidden');
    }, 500);
});

// Removed polyfill since we use our custom draw function

// Start app
window.addEventListener('load', () => {
    // Show badge instantly so layout is correct
    liveBadge.classList.remove('hidden');
    init();
});
