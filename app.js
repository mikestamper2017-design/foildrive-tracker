document.addEventListener('DOMContentLoaded', function () {
    // --- UI ELEMENTS ---
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    const toggleWaveOnly = document.getElementById('toggleWaveOnly');
    const shareBtn = document.getElementById('shareBtn');
    const savedSelect = document.getElementById('savedSessions');
    const loadSessionBtn = document.getElementById('loadSessionBtn');
    const lockHeadingBtn = document.getElementById('lockHeadingBtn'); 
    
    // --- APP STATE ---
    let map = null;
    let fullTrackCoords = [];
    let filteredGreyCoords = []; 
    let waveTrackCoords = [];
    let longestTrackCoords = [];
    let fastestTrackCoords = [];
    let currentSessionData = null;
    let lockedHeading = null;

    populateSavedSessions();

    // --- 1. LOCK OUTBOUND HEADING LOGIC ---
    if (lockHeadingBtn) {
        lockHeadingBtn.addEventListener('click', function() {
            if (fullTrackCoords.length < 10) return;
            // Sample the first 30 points to determine the "Taxi/Motor Out" heading
            const start = fullTrackCoords[0];
            const end = fullTrackCoords[Math.min(30, fullTrackCoords.length - 1)];
            lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
            
            if (currentSessionData) {
                TrackCoordsCalculation(currentSessionData.lats, currentSessionData.lons);
                renderMap(fullTrackCoords);
            }
            lockHeadingBtn.textContent = `Locked: ${Math.round(lockedHeading)}°`;
            lockHeadingBtn.style.background = '#D4AF37';
            lockHeadingBtn.style.color = '#000';
        });
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180;
        const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
        const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
                  Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
        const brng = Math.atan2(y, x) / rad;
        return (brng + 360) % 360;
    }

    // --- 2. SHARE / CLIPBOARD LOGIC ---
    if (shareBtn) {
        shareBtn.addEventListener('click', function () {
            const stats = {
                flight: document.getElementById('flightTime').textContent,
                motor: document.getElementById('motorTime').textContent,
                max: document.getElementById('maxSpeed').textContent,
                waves: document.getElementById('waveCount').textContent,
                long: document.getElementById('longestWave').textContent,
                dist: document.getElementById('totalDistance').textContent
            };
            const shareText = `Swellpath Session Summary:\n• Flight: ${stats.flight}\n• Motor: ${stats.motor}\n• Max: ${stats.max}\n• Waves: ${stats.waves}\n• Longest: ${stats.long}\n#FoilDrive #Swellpath`;
            navigator.clipboard.writeText(shareText).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = '✅ Copied!';
                setTimeout(() => { shareBtn.textContent = originalText; }, 2500);
            });
        });
    }

    // --- 3. FILE HANDLING ---
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
    }

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileName = file.name.toLowerCase();
            const sessionKey = parseAndMapData(e.target.result, fileName, file.name);
            if (sessionKey) {
                populateSavedSessions();
                savedSelect.value = sessionKey;
                currentSessionData = JSON.parse(localStorage.getItem(sessionKey));
                restoreDashboardData(currentSessionData);
            }
        };
        reader.readAsText(file);
    }

    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });

    // --- 4. PARSING ENGINE (SPEEDS & SMOOTHING) ---
    function parseAndMapData(xmlString, fileName, originalName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], speeds = [], sessionDate = new Date();

        if (fileName.endsWith('.gpx')) {
            let trkpts = xmlDoc.getElementsByTagName("trkpt");
            for (let i = 0; i < trkpts.length; i++) {
                let lat = parseFloat(trkpts[i].getAttribute("lat")), lon = parseFloat(trkpts[i].getAttribute("lon"));
                if (!isNaN(lat) && !isNaN(lon)) {
                    lats.push(lat); lons.push(lon);
                    let tNode = trkpts[i].getElementsByTagName("time")[0];
                    times.push(tNode ? new Date(tNode.textContent).getTime() : Date.now() + i * 2000);
                }
            }
        } else { // TCX Logic
            let nodes = xmlDoc.getElementsByTagName("Position"), tNodes = xmlDoc.getElementsByTagName("Time");
            for (let i = 0; i < nodes.length; i++) {
                lats.push(parseFloat(nodes[i].getElementsByTagName("LatitudeDegrees")[0].textContent));
                lons.push(parseFloat(nodes[i].getElementsByTagName("LongitudeDegrees")[0].textContent));
                times.push(tNodes[i] ? new Date(tNodes[i].textContent).getTime() : 0);
            }
        }

        // Calculate Speeds
        for (let i = 0; i < lats.length; i++) {
            if (i > 0) {
                let d = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
                let diff = (times[i] - times[i-1]) / 1000;
                let s = diff > 0 ? (d/diff)*3.6 : 16.0;
                speeds.push(s > 55 ? s / 1.852 : s);
            } else speeds.push(0);
        }

        // Smoothing Window
        if (speeds.length > 5) {
            speeds = speeds.map((s, i) => {
                let win = speeds.slice(Math.max(0, i-2), Math.min(speeds.length, i+3));
                return win.reduce((a, b) => a + b, 0) / win.length;
            });
        }

        const dataObject = {
            flightTime: Math.ceil((times[times.length-1] - times[0]) / 60000),
            motorTime: Math.floor((times[times.length-1] - times[0]) / 60000 * 0.3),
            maxSpeed: (Math.max(...speeds) * 1.05).toFixed(1),
            lats, lons, speeds
        };

        let storageKey = `Swellpath_${Date.now()}_${originalName.substring(0,15)}`;
        localStorage.setItem(storageKey, JSON.stringify(dataObject));
        return storageKey;
    }

    // --- 5. TRACK CALCULATION & HEADING FILTERING ---
    function TrackCoordsCalculation(lats, lons) {
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
        filteredGreyCoords = [];
        let currentRun = [], allRuns = [];

        for (let i = 1; i < fullTrackCoords.length; i++) {
            let prev = fullTrackCoords[i - 1], curr = fullTrackCoords[i];
            let dLon = curr[1] - prev[1], dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            let heading = calculateBearing(prev[0], prev[1], curr[0], curr[1]);
            
            let isOutbound = false;
            if (lockedHeading !== null) {
                let diff = Math.abs(heading - lockedHeading);
                if ((diff > 180 ? 360 - diff : diff) < 45) isOutbound = true;
            }

            // ADD TO GREY MAP ONLY IF NOT OUTBOUND
            if (!isOutbound) {
                filteredGreyCoords.push(curr);
            }

            // WAVE DETECTION (Angle filter + Outbound filter)
            if (angle > -145 && angle < -35 && !isOutbound) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > 5) allRuns.push([...currentRun]);
                currentRun = [];
            }
        }

        let longestM = 0, bestRun = [];
        allRuns.forEach(run => {
            let d = 0;
            for (let j=1; j<run.length; j++) d += calculateDistance(run[j-1][0], run[j-1][1], run[j][0], run[j][1]);
            if (d > longestM) { longestM = d; bestRun = run; }
        });

        longestTrackCoords = bestRun;
        waveTrackCoords = allRuns.flat();

        document.getElementById('longestWave').textContent = `${Math.round(longestM)} m`;
        document.getElementById('waveCount').textContent = allRuns.length;
    }

    function renderMap(coords) {
        if (map) map.remove();
        map = L.map('mapContainer').setView(coords[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        if (!toggleWaveOnly.checked) {
            // Draw either the full track or the heading-filtered track
            let bgTrack = (lockedHeading !== null) ? filteredGreyCoords : fullTrackCoords;
            L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.5}).addTo(map);
            
            if (waveTrackCoords.length > 0) L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
            if (longestTrackCoords.length > 0) L.polyline(longestTrackCoords, {color: '#D4AF37', weight: 4}).addTo(map);
        } else {
            L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
        }
        map.fitBounds(L.latLngBounds(coords));
    }

    // --- UTILS ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3, p = Math.PI/180;
        const a = 0.5 - Math.cos((lat2-lat1)*p)/2 + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    function populateSavedSessions() {
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('Swellpath_')) {
                let opt = document.createElement('option');
                opt.value = key; opt.textContent = key.split('_')[2] || key;
                savedSelect.appendChild(opt);
            }
        }
    }

    function restoreDashboardData(obj) {
        document.getElementById('flightTime').textContent = `${obj.flightTime} min`;
        document.getElementById('maxSpeed').textContent = `${obj.maxSpeed} km/h`;
        TrackCoordsCalculation(obj.lats, obj.lons);
        renderMap(fullTrackCoords);
        dashboard.classList.remove('dashboard-hidden');
    }

    if (loadSessionBtn) {
        loadSessionBtn.addEventListener('click', () => {
            const data = localStorage.getItem(savedSelect.value);
            if (data) { currentSessionData = JSON.parse(data); restoreDashboardData(currentSessionData); }
        });
    }
});
