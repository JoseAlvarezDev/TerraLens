import satIconPath from './assets/img/satelite512px.png';
// --- Configuration ---
const maplibregl = window.maplibregl;
const ROTATION_SPEED = 0.08;
let isPlaying = true;
let isTourMode = true;
let animationFrameId;
let clockInterval;
let currentCoords = { lng: -5.8447, lat: 43.3619 }; // Track current center for street toggle

// Start Location (Oviedo Centro)
const homeLocation = {
    name: "Oviedo | Capital",
    description: "Explorando el corazón de Asturias desde la capital. Utiliza el buscador superior para navegar por cualquier rincón del planeta.",
    coords: { lng: -5.8447, lat: 43.3619 },
    zoom: 14,
    pitch: 65,
    bearing: 0,
    alt: "500m",
    timezone: "Europe/Madrid",
    filter: "none"
};

// --- Elements ---
const elMap = document.getElementById('map');
const elInfoCard = document.getElementById('info-card');
const elTitle = document.getElementById('location-name');
const elDesc = document.getElementById('location-desc');
const elCoords = document.getElementById('location-coords');
const elIndex = document.getElementById('location-index');
const elMetaAlt = document.getElementById('meta-alt');
const elMetaTime = document.getElementById('meta-time');
const elMetaTemp = document.getElementById('meta-temp');
const elMetaHum = document.getElementById('meta-hum');
const elWeatherOverlay = document.getElementById('weather-overlay');
const elLoader = document.getElementById('loader');
const btnPlay = document.getElementById('btn-play-pause');
const btnStreet = document.getElementById('btn-street');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const filterOptions = document.querySelectorAll('.filter-option');

const elSidebar = document.getElementById('sidebar');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const elRecentList = document.getElementById('recent-searches');

const inputSearch = document.getElementById('input-search');
const btnSearch = document.getElementById('btn-search');
const elResults = document.getElementById('search-results');

const toggleRealSats = document.getElementById('toggle-real-satellites');
const realSatDot = document.getElementById('real-sat-dot');
const btnRealTracking = document.getElementById('btn-real-tracking');
const elTrackingMonitor = document.getElementById('tracking-monitor');
const elTrackedCount = document.getElementById('tracked-count');
const elIssPos = document.getElementById('iss-pos');
const elRealSatSection = document.getElementById('real-satellites-section');
const elRealSatList = document.getElementById('real-satellites-list');

// --- Tactical Cursor Elements ---
const elTacticalCursor = document.getElementById('tactical-cursor');
const elCursorLineX = document.querySelector('.cursor-line.x');
const elCursorLineY = document.querySelector('.cursor-line.y');
const elCursorCenter = document.querySelector('.cursor-center');
const elCursorCoords = document.getElementById('cursor-coords');

let isStreetLevel = false;
let isFlying = false;
let isRealTrackingActive = false;
let satelliteInterval;
let satellitesInOrbit = []; // Store parsed TLE objects
let searchHistory = JSON.parse(localStorage.getItem('terraLensHistory')) || [];
let searchDebounceTimer;

// --- Sound Manger & FX ---
const SoundManager = {
    ctx: null,
    isPlaying: false,
    osc: null,
    gain: null,

    init() {
        if (this.ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    },

    toggle() {
        if (!this.ctx) this.init();

        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.isPlaying = !this.isPlaying;

        if (this.isPlaying) {
            this.playAmbience();
            this.playUI('startup');
        } else {
            this.stopAmbience();
        }
        return this.isPlaying;
    },

    playAmbience() {
        if (!this.ctx) return;
        // Create Brown Noise for Space Rumble
        const bufferSize = 2 * this.ctx.sampleRate;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        this.avgNoise = this.ctx.createBufferSource();
        this.avgNoise.buffer = buffer;
        this.avgNoise.loop = true;

        // Lowpass filter to make it "deep"
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 120;

        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.15;

        this.avgNoise.connect(filter);
        filter.connect(this.gain);
        this.gain.connect(this.ctx.destination);
        this.avgNoise.start(0);
    },

    stopAmbience() {
        if (this.avgNoise) {
            this.avgNoise.stop();
            this.avgNoise = null;
        }
    },

    playUI(type) {
        if (!this.isPlaying || !this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        const now = this.ctx.currentTime;

        if (type === 'hover') {
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'click') {
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'startup') {
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(1000, now + 1);
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.1, now + 0.5);
            gain.gain.linearRampToValueAtTime(0, now + 1);
            osc.start(now);
            osc.stop(now + 1);
        }
    }
};

function scrambleText(element, finalText, speed = 30) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@&%';
    let iterations = 0;
    const maxIterations = 10; // How many scrambles before settling

    // Clear previous interval if any (not tracking per element here for simplicity, but good enough for sequential updates)
    if (element.dataset.scrambleInterval) clearInterval(Number(element.dataset.scrambleInterval));

    const interval = setInterval(() => {
        element.innerText = finalText
            .split('')
            .map((letter, index) => {
                if (index < iterations) {
                    return finalText[index];
                }
                return chars[Math.floor(Math.random() * chars.length)];
            })
            .join('');

        if (iterations >= finalText.length) {
            clearInterval(interval);
            element.dataset.scrambleInterval = '';
        }

        iterations += 1 / 2; // Slower reveal
    }, speed);

    element.dataset.scrambleInterval = interval;
}

// --- Sidebar Logic ---
function toggleSidebar() {
    elSidebar.classList.toggle('open');
    btnToggleSidebar.classList.toggle('hidden');
}

btnToggleSidebar.addEventListener('click', toggleSidebar);
btnCloseSidebar.addEventListener('click', toggleSidebar);

// --- Map Initialization ---
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'satellite': {
                type: 'raster',
                tiles: [
                    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: 'Esri, DigitalGlobe, GeoEye, Earthstar Geographics'
            }
        },
        layers: [
            {
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite',
                paint: {
                    'raster-fade-duration': 1000
                }
            }
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
    },
    center: [0, 20],
    zoom: 1,
    maxZoom: 18,
    attributionControl: false,
    pitch: 0,
    preserveDrawingBuffer: true,
    renderWorldCopies: false, // Prevent map duplication for a more orbital feel
    // projection: 'globe' // ⚠️ Reverted: Globe projection reduces raster resolution significantly.
});

map.addControl(new maplibregl.AttributionControl({ compact: true }));

map.on('load', () => {
    // Ensure map is correctly sized
    map.resize();

    // Load the original satellite logo (No tint) - Using a robust loader
    // Load the original satellite logo (No tint) - Using a robust loader
    const satIconUrl = satIconPath;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = satIconUrl;
    img.onload = () => {
        map.addImage('sat-icon-real', img);
        console.log("✅ Sistema de telemetría visual sincronizado.");
    };
    img.onerror = () => console.error("❌ Error crítico: No se pudo cargar el icono orbital.");

    renderFleet(); // Initialize the satellite fleet UI
    setTimeout(async () => {
        elLoader.classList.add('fade-out');
        // Set default satellite filter
        elMap.classList.add(satellites[currentSatIndex].filterClass);
        elSatName.innerText = satellites[currentSatIndex].name;

        // Try to auto-detect location and fly to capital
        await autoDetectLocation();

        renderHistory();
    }, 1500);
});

async function autoDetectLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.log("Sistema GPS no disponible.");
            goToLocation(homeLocation);
            return resolve();
        }

        console.log("Solicitando enlace GPS orbital...");

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    console.log(`Coordenadas de precisión: ${latitude}, ${longitude}`);

                    const locationData = {
                        name: "TU UBICACIÓN EXACTA",
                        description: "Enlace GPS directo establecido. Rastreando coordenadas de usuario.",
                        coords: { lat: latitude, lng: longitude }, // Use exact coords
                        zoom: 16, // Closer zoom for exact location
                        pitch: 60,
                        alt: `${Math.round(position.coords.altitude || 0)}m`,
                        filter: "none"
                    };

                    // Try to get a better name via reverse geocoding, but don't change coords
                    try {
                        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14`, {
                            headers: { 'User-Agent': 'TerraLens/1.0 (josealvarezdeveloper@gmail.com)' }
                        });
                        const data = await resp.json();
                        if (data && data.address) {
                            const city = data.address.city || data.address.town || data.address.village || "Ubicación Desconocida";
                            const road = data.address.road || "";
                            locationData.name = road ? `${city} | ${road}` : city;
                            locationData.description = data.display_name;
                        }
                    } catch (geoErr) {
                        console.warn("No se pudo resolver el nombre del lugar, usando genérico.");
                    }

                    goToLocation(locationData);
                    resolve();

                } catch (err) {
                    console.warn("Fallo crítico en GPS:", err);
                    goToLocation(homeLocation);
                    resolve();
                }
            },
            (error) => {
                console.warn(`GPS Error: ${error.message}`);
                goToLocation(homeLocation);
                resolve();
            },
            {
                timeout: 10000,
                enableHighAccuracy: true, // Force high accuracy
                maximumAge: 0
            }
        );
    });
}

// --- Tactical Cursor Logic ---
map.on('mousemove', (e) => {
    const { x, y } = e.point;
    const { lng, lat } = e.lngLat;

    elTacticalCursor.classList.remove('hidden');

    // Performance: Use transform instead of top/left
    elCursorCenter.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    elCursorCoords.style.transform = `translate(${x + 25}px, ${y + 25}px)`;
    elCursorLineX.style.transform = `translateY(${y}px)`;
    elCursorLineY.style.transform = `translateX(${x}px)`;

    // Update coordinates text
    elCursorCoords.innerText = `${lat.toFixed(4)}°N  ${lng.toFixed(4)}°E`;
});

map.on('mouseout', () => {
    elTacticalCursor.classList.add('hidden');
});

map.on('mousedown', () => { if (isTourMode) pauseTour(true); });
map.on('wheel', () => { if (isTourMode) pauseTour(true); });

function stopAutoRotation() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

function pauseTour(userInterrupted = false) {
    isPlaying = false;
    isTourMode = false;
    stopAutoRotation();
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    iconPlay.classList.add('blink'); // Make play icon blink when paused
}

function resumeTour() {
    isPlaying = true;
    isTourMode = true;
    iconPause.classList.remove('hidden');
    iconPlay.classList.add('hidden');
    iconPlay.classList.remove('blink'); // Stop blinking when resumed
    rotateCamera();
}

async function getWeatherData(lat, lng) {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,cloud_cover`);
        const data = await response.json();
        return data.current;
    } catch (error) {
        console.warn("Weather API failed:", error);
        return null;
    }
}

function updateWeatherUI(weather) {
    if (!weather) {
        elMetaTemp.innerText = "--°C";
        elMetaHum.innerText = "--%";
        elWeatherOverlay.className = "weather-overlay";
        return;
    }

    elMetaTemp.innerText = `${Math.round(weather.temperature_2m)}°C`;
    elMetaHum.innerText = `${weather.relative_humidity_2m}%`;

    // Visual effects based on weather code or cloud cover
    elWeatherOverlay.className = "weather-overlay";
    if (weather.cloud_cover > 50) elWeatherOverlay.classList.add('clouds');

    // Weather codes: 51, 53, 55 (Drizzle), 61, 63, 65 (Rain), 80, 81, 82 (Showers)
    const rainCodes = [51, 53, 55, 61, 63, 65, 80, 81, 82];
    if (rainCodes.includes(weather.weather_code)) {
        elWeatherOverlay.classList.add('rain');
    }
}

let lastTimeOffset = 0; // Offset in seconds

function startClock(timezone, apiOffset = null) {
    if (clockInterval) clearInterval(clockInterval);

    // If we have an official offset from the API, we can use it to be ultra-precise
    // otherwise we rely on the browser's IANA database
    const update = () => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-ES', {
            timeZone: timezone,
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
        elMetaTime.innerText = timeStr;
    };

    update();
    clockInterval = setInterval(update, 1000);
}

function estimateTimezone(lng) {
    // Basic geographic estimation
    const offset = Math.round(lng / 15);
    // Note: Etc/GMT sign is inverted in IANA (GMT+1 is Etc/GMT-1)
    return `Etc/GMT${offset >= 0 ? '-' : '+'}${Math.abs(offset)}`;
}

async function getOfficialTimezone(lat, lng) {
    try {
        const response = await fetch(`https://www.timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`);
        if (!response.ok) throw new Error("TimeAPI unavailable");
        const data = await response.json();
        return data.timeZone;
    } catch (error) {
        console.warn("Timezone link unstable, using geographic sync.");
        return estimateTimezone(lng);
    }
}

async function goToLocation(loc) {
    if (!loc || !loc.coords) return;

    isFlying = true;
    isStreetLevel = false;
    btnStreet.classList.remove('active');
    btnStreet.innerText = "VISTA CALLE";
    elMap.classList.remove('high-detail');

    stopAutoRotation();
    updateUI(loc);

    // 1. START FLYING IMMEDIATELY for better UX
    map.flyTo({
        center: [loc.coords.lng, loc.coords.lat],
        zoom: loc.zoom,
        pitch: loc.pitch,
        bearing: loc.bearing || 0,
        speed: 0.5,
        curve: 1.4,
        essential: true
    });

    currentCoords = loc.coords;

    // 2. FETCH METADATA IN BACKGROUND
    try {
        const [officialTz, weather] = await Promise.all([
            getOfficialTimezone(loc.coords.lat, loc.coords.lng),
            getWeatherData(loc.coords.lat, loc.coords.lng)
        ]);

        startClock(officialTz);
        updateWeatherUI(weather);

        let filterToApply = loc.filter || 'none';
        if (filterToApply === 'none') {
            const isNight = isNightAtLocation(officialTz);
            if (isNight) filterToApply = 'night';
        }

        applyFilter(filterToApply);
        updateFilterUI(filterToApply);
    } catch (e) {
        console.warn("Satellite link metadata fetch error:", e);
        // Fallback for clock if timezone fails
        if (loc.timezone) startClock(loc.timezone);
    }

    map.once('moveend', () => {
        isFlying = false;
        if (isPlaying) {
            elMetaAlt.innerText = "DRONE MODE ACTIVO";
            elMetaAlt.style.color = "var(--color-accent)";
            rotateCamera();
        }
    });
}

function rotateCamera() {
    if (!isTourMode || !isPlaying || isFlying) return;

    const currentBearing = map.getBearing();
    map.setBearing(currentBearing + ROTATION_SPEED);

    const zoom = map.getZoom();
    const driftFactor = Math.pow(2, 18 - zoom);
    const baseDrift = 0.000005;
    const scaledDrift = baseDrift / Math.max(1, driftFactor);

    const center = map.getCenter();
    const bearingRad = (currentBearing * Math.PI) / 180;

    const newLng = center.lng + Math.sin(bearingRad) * scaledDrift;
    const newLat = center.lat + Math.cos(bearingRad) * scaledDrift;

    map.setCenter([newLng, newLat]);

    const currentPitch = map.getPitch();
    map.setPitch(currentPitch + Math.sin(Date.now() / 3000) * 0.02);

    animationFrameId = requestAnimationFrame(rotateCamera);
}

function updateUI(loc) {
    elInfoCard.classList.add('hidden');

    // Play sound on transition
    SoundManager.playUI('click');

    setTimeout(() => {
        scrambleText(elTitle, loc.name);
        elDesc.innerText = loc.description; // Keep description static or scramble if desired
        // scrambleText(elDesc, loc.description, 10); 

        elCoords.innerText = `${formatCoord(loc.coords.lat, 'N')} ${formatCoord(loc.coords.lng, 'E')}`;
        elMetaAlt.innerText = loc.alt || 'N/A';
        elInfoCard.classList.remove('hidden');
    }, 500);
}

function formatCoord(val, type) {
    const dir = val >= 0 ? type : (type === 'N' ? 'S' : 'W');
    return `${Math.abs(val).toFixed(3)}°${dir}`;
}

function isNightAtLocation(timezone) {
    try {
        const now = new Date();
        const localHour = parseInt(now.toLocaleTimeString('en-US', {
            timeZone: timezone, hour: '2-digit', hour12: false
        }));
        return localHour >= 20 || localHour < 6;
    } catch (e) {
        return false;
    }
}

function applyFilter(filterName) {
    elMap.className = '';
    if (filterName && filterName !== 'none') {
        elMap.classList.add(`filter-${filterName}`);
    }
}

function updateFilterUI(filterName) {
    filterOptions.forEach(opt => {
        if (opt.dataset.filter === filterName) opt.classList.add('active');
        else opt.classList.remove('active');
    });
}

btnPlay.addEventListener('click', () => {
    if (isPlaying) pauseTour();
    else resumeTour();
});

filterOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
        const filter = e.target.dataset.filter;
        applyFilter(filter);
        updateFilterUI(filter);
    });
});

document.getElementById('btn-snapshot').addEventListener('click', () => {
    const canvas = map.getCanvas();
    const link = document.createElement('a');
    link.download = `terralens-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
});

function openStreetView() {
    if (!currentCoords) return;

    // 1. UI UX Feedback
    SoundManager.playUI('startup'); // Play a connecting sound
    btnStreet.innerText = "CONECTANDO...";
    btnStreet.classList.add('loading');

    // 2. Calculate URL
    // Google Maps Universal Link for Pano (Street View)
    // viewpoit=lat,lng | heading=0 (North)
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${currentCoords.lat},${currentCoords.lng}&heading=0&pitch=10&fov=90`;

    // 3. Open as a TACTICAL POPUP (Clean Window)
    const width = 1200;
    const height = 720;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    setTimeout(() => {
        window.open(url, 'TerraLensStreetView', `width=${width},height=${height},top=${top},left=${left},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`);
        btnStreet.innerText = "VISTA CALLE";
        btnStreet.classList.remove('loading');
    }, 800);
}

btnStreet.onclick = openStreetView; // Direct assignment instead of toggleStreetLevel

// --- Audio Controls ---
const btnAudio = document.getElementById('btn-audio');
const iconAudioOn = document.getElementById('icon-audio-on');
const iconAudioOff = document.getElementById('icon-audio-off');

btnAudio.addEventListener('click', () => {
    const isActive = SoundManager.toggle();
    if (isActive) {
        iconAudioOn.classList.remove('hidden');
        iconAudioOff.classList.add('hidden');
        btnAudio.classList.add('active'); // Add active style if needed
        btnAudio.style.color = 'var(--color-accent)';
        btnAudio.style.borderColor = 'var(--color-accent)';
    } else {
        iconAudioOn.classList.add('hidden');
        iconAudioOff.classList.remove('hidden');
        btnAudio.classList.remove('active');
        btnAudio.style.color = '';
        btnAudio.style.borderColor = '';
    }
});

// Add hover sounds to key interactive elements
document.querySelectorAll('button, .sat-card, .filter-option').forEach(el => {
    el.addEventListener('mouseenter', () => SoundManager.playUI('hover'));
    el.addEventListener('click', () => SoundManager.playUI('click'));
});

// --- Search Functionality ---

async function performSearch(query, autoNavigate = false) {
    if (!query) return;
    elResults.innerHTML = '<div class="search-item">Buscando...</div>';
    elResults.classList.remove('hidden');
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`, {
            headers: { 'User-Agent': 'TerraLens/1.0 (amarcordsoftware@gmail.com)' }
        });

        if (!response.ok) {
            if (response.status === 503) {
                elResults.innerHTML = '<div class="search-item">El satélite de búsqueda está saturado. Pulse ENTER para forzar conexión.</div>';
            } else {
                elResults.innerHTML = '<div class="search-item">Error en el enlace de datos.</div>';
            }
            return;
        }

        const data = await response.json();

        if (data.length === 0) {
            elResults.innerHTML = '<div class="search-item">No se encontraron resultados</div>';
            return;
        }

        // If autoNavigate is true (from Enter/Button), go to the first result immediately
        if (autoNavigate && data.length > 0) {
            selectResult(data[0]);
            return;
        }

        elResults.innerHTML = '';
        data.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.innerText = result.display_name;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                selectResult(result);
            });
            elResults.appendChild(item);
        });
    } catch (error) {
        console.warn("Search link timeout or data error:", error);
        elResults.innerHTML = '<div class="search-item">Sin respuesta del enlace satelital</div>';
    }
}

function selectResult(result) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) return;

    const searchLoc = {
        name: result.display_name.split(',')[0],
        description: `Ubicación encontrada: ${result.display_name}`,
        coords: { lat, lng },
        zoom: 16,
        pitch: 60,
        alt: "Sincronizando...",
        filter: "none"
    };

    addToHistory(searchLoc);
    goToLocation(searchLoc);
    elResults.classList.add('hidden');
    inputSearch.value = '';
    // If we're on mobile, close the sidebar too just in case
    if (window.innerWidth < 1024) elSidebar.classList.remove('open');
}

function addToHistory(loc) {
    // Avoid duplicates
    searchHistory = searchHistory.filter(h => h.name !== loc.name);

    searchHistory.unshift(loc);
    if (searchHistory.length > 20) searchHistory.pop();

    localStorage.setItem('terraLensHistory', JSON.stringify(searchHistory));
    renderHistory();
}

function renderHistory() {
    if (searchHistory.length === 0) {
        elRecentList.innerHTML = '<p class="empty-msg">No hay registros recientes</p>';
        return;
    }

    elRecentList.innerHTML = '';
    searchHistory.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'recent-item';
        item.innerText = loc.name;
        item.title = loc.description;
        item.onclick = () => {
            goToLocation(loc);
            if (window.innerWidth < 768) toggleSidebar(); // Close sidebar on mobile after selection
        };
        elRecentList.appendChild(item);
    });
}



inputSearch.oninput = (e) => {
    clearTimeout(searchDebounceTimer);
    const query = e.target.value.trim();

    if (query.length < 3) {
        elResults.classList.add('hidden');
        return;
    }

    // Increased debounce to 800ms to prevent 503 errors from Nominatim
    searchDebounceTimer = setTimeout(() => {
        performSearch(query);
    }, 800);
};

inputSearch.onkeydown = (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchDebounceTimer);
        performSearch(inputSearch.value, true); // true = auto-navigate
    }
};

btnSearch.onclick = () => performSearch(inputSearch.value, true); // true = auto-navigate

// --- Geolocation (Current Position) ---
const btnGPS = document.getElementById('btn-gps');

btnGPS.onclick = () => {
    if (isFlying) return;

    btnGPS.classList.add('loading');

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            const gpsLoc = {
                name: "TU UBICACIÓN",
                description: "Coordenadas recuperadas vía GPS satelital. Iniciando seguimiento orbital sobre tu posición actual.",
                coords: { lat: latitude, lng: longitude },
                zoom: 15,
                pitch: 65,
                bearing: 0,
                alt: "Detectada",
                filter: "none"
            };

            goToLocation(gpsLoc);
            btnGPS.classList.remove('loading');
        },
        (error) => {
            console.error("Error geolocalización:", error);
            alert("No se pudo obtener tu ubicación. Asegúrate de dar permisos en el navegador.");
            btnGPS.classList.remove('loading');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
};

// --- Satellite Fleet Logic ---
const elSatName = document.getElementById('satellite-name');
const elFleetList = document.getElementById('satellite-fleet');

const satellites = [
    { id: 'sentinel', name: "SENTINEL-2A", agency: "ESA", res: "10m", orbit: "786km", use: "Clima/Veg", filterClass: "sat-sentinel", info: "Colores más vivos y saturados (específicos para ver vegetación)." },
    { id: 'landsat', name: "LANDSAT-9", agency: "NASA", res: "15m", orbit: "705km", use: "Geología", filterClass: "sat-landsat", info: "Un look más crudo y contrastado (óptimo para geología)." },
    { id: 'worldview', name: "WORLDVIEW-3", agency: "MAXAR", res: "0.3m", orbit: "617km", use: "Alta-Res", filterClass: "sat-worldview", info: "Imagen más brillante y nítida (el rey de la alta resolución)." },
    { id: 'pleiades', name: "PLEIADES NEO", agency: "AIRBUS", res: "0.3m", orbit: "620km", use: "Incursión", filterClass: "sat-pleiades", info: "Un filtro ligeramente azulado y cinematográfico (estilo táctico)." },
    { id: 'terra', name: "TERRA-MODIS", agency: "NASA", res: "250m", orbit: "713km", use: "Global", filterClass: "sat-terra", info: "Colores más naturales y suaves para visión global." }
];

let currentSatIndex = 3; // Default to PLEIADES NEO
let userSelectedSat = false;

function renderFleet() {
    elFleetList.innerHTML = '';
    satellites.forEach((sat, index) => {
        const card = document.createElement('div');
        card.className = `sat-card ${index === currentSatIndex ? 'active' : ''}`;
        card.innerHTML = `
      <div class="sat-card-header">
        <div style="display:flex; align-items:center;">
          <span class="sat-name">${sat.name}</span>
          <div class="sat-info-btn" title="${sat.info}">i</div>
        </div>
        <span class="sat-agency">${sat.agency}</span>
      </div>
      <span class="sat-info-text">${sat.info}</span>
      <div class="sat-specs">
        <div class="spec-item"><span class="spec-label">RES:</span>${sat.res}</div>
        <div class="spec-item"><span class="spec-label">ORB:</span>${sat.orbit}</div>
      </div>
    `;
        card.onclick = () => selectSatellite(index);
        elFleetList.appendChild(card);
    });
}

function selectSatellite(index) {
    userSelectedSat = true;
    currentSatIndex = index;
    const sat = satellites[currentSatIndex];

    // 1. Visual Glitch during switch
    elMap.classList.add('map-glitch');
    setTimeout(() => elMap.classList.remove('map-glitch'), 400);

    // 2. Clear old satellite filters and apply new one
    satellites.forEach(s => elMap.classList.remove(s.filterClass));
    elMap.classList.add(sat.filterClass);

    // 3. Update Header UI
    elSatName.style.opacity = '0';
    setTimeout(() => {
        elSatName.innerText = sat.name;
        elSatName.style.opacity = '1';
        renderFleet();
    }, 400);
}

// Automatic rotation only if user hasn't selected one
setInterval(() => {
    if (!userSelectedSat && Math.random() > 0.7) {
        currentSatIndex = (currentSatIndex + 1) % satellites.length;
        elSatName.style.opacity = '0';
        setTimeout(() => {
            elSatName.innerText = satellites[currentSatIndex].name;
            elSatName.style.opacity = '1';
            renderFleet();
        }, 500);
    }
}, 12000);



// --- Real Satellite Tracking (TLE) ---
async function fetchTLEs() {
    console.log("📡 Iniciando descarga de efemérides satelitales...");

    // 1. ALWAYS start with simulated data to ensure visibility immediately
    satellitesInOrbit = [
        { name: 'ISS (ESTACIÓN ESPACIAL)', type: 'Scientific', directCoords: [0, 0], height: 408 }, // Temp coords
        { name: 'STARLINK-1001', type: 'Communication', tle: null, height: 550 },
        { name: 'STARLINK-1002', type: 'Communication', tle: null, height: 550 },
        { name: 'HUBBLE', type: 'Scientific', tle: null, height: 540 }
    ];

    // Generate fake cloud of Starlink for visual impact immediately
    for (let i = 0; i < 50; i++) {
        satellitesInOrbit.push({
            name: `STARLINK-${2000 + i}`,
            type: 'Communication',
            // Random movement simulation params
            lat: (Math.random() * 160) - 80,
            lng: (Math.random() * 360) - 180,
            height: 550
        });
    }

    try {
        const [issResponse] = await Promise.all([
            fetch('https://api.wheretheiss.at/v1/satellites/25544')
        ]);

        if (issResponse.ok) {
            const issData = await issResponse.json();
            // Update the real ISS
            const realISS = satellitesInOrbit.find(s => s.name.includes('ISS'));
            if (realISS) {
                realISS.directCoords = [issData.longitude, issData.latitude];
                realISS.height = Math.round(issData.altitude);
            }
        }
    } catch (error) {
        console.warn("Modo simulación activado (API Offline)", error);
    }

    updateSatellitePositions();
}

function updateSatellitePositions() {
    if (!isRealTrackingActive) return;

    // Simulate movement for the fake starlink cloud
    const now = Date.now();

    satellitesInOrbit.forEach(sat => {
        if (sat.lat !== undefined) {
            sat.lng = (sat.lng + 0.05) % 360; // Move east
        }
    });

    const features = satellitesInOrbit.map(sat => {
        let coords;
        if (sat.directCoords) coords = sat.directCoords;
        else if (sat.lat !== undefined) coords = [sat.lng, sat.lat];
        else return null; // Skip those without coords yet

        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords },
            properties: { name: sat.name, type: sat.type, height: sat.height }
        };
    }).filter(f => f !== null);

    const geojson = { type: 'FeatureCollection', features };

    if (map.getSource('real-satellites')) {
        map.getSource('real-satellites').setData(geojson);
    } else {
        // First time load: Add source and layers
        map.addSource('real-satellites', { type: 'geojson', data: geojson });

        // Add layers ON TOP of everything
        map.addLayer({
            id: 'real-sat-halo',
            type: 'circle',
            source: 'real-satellites',
            paint: {
                'circle-radius': 20,
                'circle-color': '#00ffcc', // Cyber Cyan
                'circle-opacity': 0.15,
                'circle-blur': 0.8
            }
        });

        // The core dot (Bright and visible)
        map.addLayer({
            id: 'real-satellites-layer',
            type: 'circle',
            source: 'real-satellites',
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff', // White core
                'circle-stroke-width': 2,
                'circle-stroke-color': '#00ffcc', // Cyan glow stroke
            }
        });

        setupSatHoverHandler();
        setupSatClickHandler();
    }

    // Update counter
    if (elTrackedCount) elTrackedCount.innerText = satellitesInOrbit.length;
}

function parseTLEData(text, defaultName, type, limit = 999) {
    const lines = text.trim().split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i += 3) {
        if (count >= limit) break;
        const name = lines[i].trim();
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];

        if (tle1 && tle2) {
            try {
                const satrec = satellite.twoline2satrec(tle1, tle2);
                satellitesInOrbit.push({
                    name: name || defaultName,
                    type: type,
                    satrec: satrec
                });
                count++;
            } catch (e) { }
        }
    }
}


// (Old function removed to avoid SyntaxError: Identifier 'updateSatellitePositions' has already been declared)






function setupSatClickHandler() {
    map.on('click', 'real-satellites-layer', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;

        // Custom Tactical Popup for Click (Persistent)
        const popupContent = `
            <div class="tactical-popup">
                <div class="tp-header">${props.name}</div>
                <div class="tp-row"><span>ALTI:</span><span>${props.height} km</span></div>
                <div class="tp-row"><span>TYPE:</span><span>${props.type ? props.type.toUpperCase() : 'UNKNOWN'}</span></div>
                <div class="tp-row"><span>STATUS:</span><span style="color:#00ffcc">LOCKED</span></div>
            </div>
        `;

        new maplibregl.Popup({
            className: 'tactical-popup-container',
            maxWidth: '300px',
            offset: 15
        })
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map);

        drawOrbitalTrail(coordinates);
    });
}

function setupSatHoverHandler() {
    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'tactical-popup-container',
        offset: 15
    });

    map.on('mouseenter', 'real-satellites-layer', (e) => {
        map.getCanvas().style.cursor = 'none';

        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties;

        const popupContent = `
            <div class="tactical-popup">
                <div class="tp-header">${props.name}</div>
                <div class="tp-row"><span>ALTI:</span><span>${props.height} km</span></div>
                <div class="tp-row"><span>TYPE:</span><span>${props.type ? props.type.toUpperCase() : 'UNKNOWN'}</span></div>
            </div>
        `;

        popup.setLngLat(coordinates).setHTML(popupContent).addTo(map);

        map.setPaintProperty('real-satellites-layer', 'circle-color', [
            'case',
            ['==', ['get', 'name'], props.name],
            '#ffffff',
            '#00ffcc'
        ]);

        drawOrbitalTrail(coordinates);
    });

    map.on('mouseleave', 'real-satellites-layer', () => {
        map.getCanvas().style.cursor = 'none';
        popup.remove();
        map.setPaintProperty('real-satellites-layer', 'circle-color', '#00ffcc');
    });
}

function drawOrbitalTrail(currentCoords) {
    const trailPoints = [];
    let [lng, lat] = currentCoords;
    for (let i = 0; i < 20; i++) {
        trailPoints.push([lng, lat]);
        lng -= 0.5;
    }

    const geojson = {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: trailPoints
        }
    };

    if (map.getSource('sat-trail')) {
        map.getSource('sat-trail').setData(geojson);
    } else {
        map.addSource('sat-trail', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'sat-trail-line',
            type: 'line',
            source: 'sat-trail',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#00ffcc',
                'line-width': 2,
                'line-opacity': 0.6,
                'line-dasharray': [2, 4]
            }
        });
    }
}

function renderRealSatList() {
    if (!elRealSatList) return;
    elRealSatList.innerHTML = '';

    // Sort so ISS is always first
    const sorted = [...satellitesInOrbit].sort((a, b) => a.name.includes('ISS') ? -1 : 1);

    sorted.forEach(sat => {
        const item = document.createElement('div');
        item.className = 'real-sat-item';
        item.innerHTML = `
            <span class="sat-name">${sat.name}</span>
            <span class="sat-info">${sat.height}km</span>
        `;
        item.onclick = () => {
            // Find current coordinates for this sat
            let targetCoords;
            if (sat.directCoords) {
                targetCoords = sat.directCoords;
            } else if (sat.tle) {
                const now = new Date();
                const gmst = satellite.gstime(now);
                const positionEci = satellite.propagate(sat.tle, now).position;
                const positionGd = satellite.eciToGeodetic(positionEci, gmst);
                targetCoords = [satellite.degreesLong(positionGd.longitude), satellite.degreesLat(positionGd.latitude)];
            }

            if (targetCoords) {
                // Tactical interception zoom
                map.flyTo({
                    center: targetCoords,
                    zoom: 6,
                    pitch: 45,
                    speed: 1.2,
                    essential: true
                });

                // Update Monitor with "Target Locked" status
                if (elIssPos) {
                    elIssPos.style.color = '#fff';
                    elIssPos.innerHTML = `<span style="color:var(--color-accent)">LOCKED:</span> ${sat.name}`;
                }
            }
        };
        elRealSatList.appendChild(item);
    });
}

function toggleRealTracking() {
    isRealTrackingActive = !isRealTrackingActive;

    // Update UI elements
    realSatDot.classList.toggle('active', isRealTrackingActive);
    btnRealTracking.classList.toggle('active', isRealTrackingActive);
    document.body.classList.toggle('radar-hud', isRealTrackingActive);

    if (isRealTrackingActive) {
        // Transition to "Orbital View" (DEEP SPACE MODE)
        elInfoCard.classList.add('hidden');
        elTrackingMonitor.classList.remove('hidden');
        elRealSatSection.classList.remove('hidden');

        // Fade out the blurry earth tiles to reveal stars
        if (map.getLayer('satellite-layer')) {
            map.setPaintProperty('satellite-layer', 'raster-opacity', 0.1); // Almost invisible, ghost earth
        }

        map.flyTo({
            center: [0, 20],
            zoom: 1.2, // See more world
            pitch: 0,
            bearing: 0,
            speed: 0.8,
            essential: true
        });

        fetchTLEs();
        satelliteInterval = setInterval(updateSatellitePositions, 500);
    } else {
        clearInterval(satelliteInterval);
        elTrackingMonitor.classList.add('hidden');
        elRealSatSection.classList.add('hidden');

        // Restore Earth Visibility
        if (map.getLayer('satellite-layer')) {
            map.setPaintProperty('satellite-layer', 'raster-opacity', 1);
        }

        if (map.getLayer('real-sat-labels')) map.removeLayer('real-sat-labels');
        if (map.getLayer('real-sat-halo')) map.removeLayer('real-sat-halo');
        if (map.getLayer('real-satellites-layer')) map.removeLayer('real-satellites-layer');
        if (map.getSource('real-satellites')) map.removeSource('real-satellites');
    }
}

toggleRealSats.onclick = toggleRealTracking;
btnRealTracking.onclick = toggleRealTracking;

// Close results when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        elResults.classList.add('hidden');
    }
});
