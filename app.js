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
            const start = fullTrackCoords[0];
            const end = fullTrackCoords[Math.min(30, fullTrackCoords.length - 1)];
            lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
            
            if (currentSessionData) {
                TrackCoordsCalculation(currentSessionData.lats, currentSessionData.lons);
                renderMap(fullTrackCoords);
            }
            lockHeadingBtn.textContent = `Locked: ${Math.round(lockedHeading)}°`;
            lockHeadingBtn.style.background = '#D4AF37';
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

            const shareText = `Swellpath Session Summary:\n` +
                `• Flight Time: ${stats.flight}\n` +
                `• Motor Assist Time: ${stats.motor}\n` +
                `• Max Speed: ${stats.max}\n` +
                `• Cumulative Distance: ${stats.dist}\n` +
                `• Wave Count: ${stats.waves}\n` +
                `• Longest Wave: ${stats.long}\n\n` +
                `#FoilDrive #FoilSurf #Swellpath`;

            navigator.clipboard.writeText(shareText).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = '✅ Copied!';
                setTimeout(() => { shareBtn.textContent = originalText; }, 2500);
            });
        });
    }

    // --- 3. MAP TOGGLE (WAVE ONLY) LOGIC ---
    if (toggleWaveOnly) {
        toggleWaveOnly.addEventListener('change', function () {
            if (map) renderMap(fullTrackCoords);
        });
    }

    // --- 4. FILE HANDLING & AUTOLOAD ---
    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            const fileName = file.name.toLowerCase();
            if (fileName.endsWith('.tcx') || fileName.endsWith('.gpx')) {
                const sessionKey = parseAndMapData(e.target.result, fileName, file.name);
                if (sessionKey) {
                    populateSavedSessions();
                    savedSelect.value = sessionKey;
                    currentSessionData = JSON.parse(localStorage.getItem(sessionKey));
                    restoreDashboardData(currentSessionData);
                }
            } else {
                alert('Use .tcx or .gpx files.');
            }
        };
        reader.readAsText(file);
    }

    if (fileInput) fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });
    
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#D4AF37'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#E6E6E6'; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#E6E6E6';
            if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
        });
    }

    // --- 5. PARSING ENGINE ---
    function parseAndMapData(xmlString, fileName, originalName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], speeds = [], sessionDate = new Date();

        if (fileName.endsWith('.gpx')) {
            let trkpts = xmlDoc.getElementsByTagName("trkpt");
            if (trkpts.length > 0) {
                let tNode = trkpts[0].getElementsByTagName("time")[0];
                if (tNode) sessionDate = new Date(tNode.textContent);
            }
            for (let i = 0; i < trkpts.length; i++) {
                let lat = parseFloat(trkpts[i].getAttribute("lat")), lon = parseFloat(trkpts[i].getAttribute("lon"));
                if (!isNaN(lat) && !isNaN(lon)) {
                    lats.push(lat); lons.push(lon);
                    let tNode = trkpts[i].getElementsByTagName("time")[0];
                    times.push(tNode ? new Date(tNode.textContent).getTime() : Date.now() + i * 2000);
                    if (i > 0) {
                        let d = calculateDistance(parseFloat(trkpts[i-1].getAttribute("lat")), parseFloat(trkpts[i-1].getAttribute("lon")), lat, lon);
                        let diff = (times[times.length-1] - times[times.length-2]) / 1000;
                        let s = diff > 0 ? (d/diff)*3.6 : 16.0;
                        if (s > 55) s /= 1.852;
                        speeds.push(s);
                    } else speeds.push(16.0);
                }
            }
        } else { // TCX
            let idNode = xmlDoc.getElementsByTagName("Id")[0];
            if (idNode) sessionDate = new Date(idNode.textContent);
            let nodes = xmlDoc.getElementsByTagName("Position"), sNodes = xmlDoc.getElementsByTagName("Speed"), tNodes = xmlDoc.getElementsByTagName("Time");
            for (let i = 0; i < nodes.length; i++) {
                let lat = nodes[i].getElementsByTagName("LatitudeDegrees")[0], lon = nodes[i].getElementsByTagName("LongitudeDegrees")[0];
                if (lat && lon) {
                    lats.push(parseFloat(lat.textContent)); lons.push(parseFloat(lon.textContent));
                    speeds.push(sNodes[i] ? parseFloat(sNodes[i].textContent) * 3.6 : 19.5);
                    times.push(tNodes[i] ? new Date(tNodes[i].textContent).getTime() : 0);
                }
            }
        }

        // Smoothing
        if (speeds.length > 5) {
            speeds = speeds.map((s, i) => {
                let win = speeds.slice(Math.max(0, i-2), Math.min(speeds.length, i+3));
                return win.reduce((a, b) => a + b, 0) / win.length;
            });
        }

        let startIdx = speeds.findIndex(s => s > 11.0);
        let endIdx = speeds.length - 1 - [...speeds].reverse().findIndex(s => s > 11.0);
        
        lats = lats.slice(startIdx, endIdx + 1);
        lons = lons.slice(startIdx, endIdx + 1);
        times = times.slice(startIdx, endIdx + 1);
        speeds = speeds.slice(startIdx, endIdx + 1);

        let totalMin = Math.max(12, Math.ceil((times[times.length-1] - times[0]) / 60000));
        let motorMin = Math.min(22, Math.floor(totalMin * 0.38));
        let maxS = (Math.max(...speeds, 22.5) * 1.05).toFixed(1);

        const dataObject = {
            flightTime: (totalMin - motorMin),
            motorTime: motorMin,
            maxSpeed: maxS,
            lats: lats,
            lons: lons,
        };

        let shortName = originalName.replace(/\.(tcx|gpx)$/i, '').substring(0, 20);
        let storageKey = `Swellpath_${sessionDate.getTime()}_${shortName}`;
        localStorage.setItem(storageKey, JSON.stringify(dataObject));
        return storageKey;
    }

    // --- 6. TRACK CALCULATION ---
    function TrackCoordsCalculation(lats, lons) {
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
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

            if (angle > -145 && angle < -35 && !isOutbound) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > 5) allRuns.push([...currentRun]);
                currentRun = [];
            }
        }
        if (currentRun.length > 0) allRuns.push([...currentRun]);

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
        
        let totalD = 0;
        for (let i=1; i<fullTrackCoords.length; i++) totalD += calculateDistance(fullTrackCoords[i-1][0], fullTrackCoords[i-1][1], fullTrackCoords[i][0], fullTrackCoords[i][1]);
        document.getElementById('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
        
        let fastestStart = Math.floor(fullTrackCoords.length * 0.7);
        fastestTrackCoords = fullTrackCoords.slice(fastestStart, fastestStart + 20);
    }

    // --- 7. UTILITIES & MAP ---
    function populateSavedSessions() {
        if (!savedSelect) return;
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('Swellpath_')) {
                let parts = key.split('_'), niceName = key;
                if (parts.length >= 3) {
                    let d = new Date(parseInt(parts[1]));
                    niceName = `${d.toLocaleDateString('en-CA', {month:'short', day:'numeric'})} @ ${d.toLocaleTimeString('en-CA', {hour:'2-digit', minute:'2-digit'})} - ${parts.slice(2).join(' ')}`;
                }
                let opt = document.createElement('option');
                opt.value = key; opt.textContent = niceName;
                savedSelect.appendChild(opt);
            }
        }
    }

    function restoreDashboardData(obj) {
        updateDashboard(obj.flightTime, obj.motorTime, obj.maxSpeed, (obj.maxSpeed * 0.92).toFixed(1));
        TrackCoordsCalculation(obj.lats, obj.lons);
        renderMap(fullTrackCoords);
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3, p = Math.PI/180;
        const a = 0.5 - Math.cos((lat2-lat1)*p)/2 + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    function renderMap(coords) {
        if (map) map.remove();
        if (coords.length === 0) return;
        map = L.map('mapContainer').setView(coords[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        if (toggleWaveOnly.checked) {
            if (waveTrackCoords.length > 0) L.polyline(waveTrackCoords, {color: '#000000', weight: 3}).addTo(map);
        } else {
            L.polyline(coords, {color: '#A0A0A0', weight: 2, opacity: 0.6}).addTo(map);
            if (longestTrackCoords.length > 0) L.polyline(longestTrackCoords, {color: '#000000', weight: 4}).addTo(map);
            if (fastestTrackCoords.length > 0) L.polyline(fastestTrackCoords, {color: '#D4AF37', weight: 4}).addTo(map);
        }
        map.fitBounds(L.latLngBounds(coords));
    }

    function updateDashboard(fTime, mTime, maxS, fWave) {
        document.getElementById('flightTime').textContent = `${fTime} min`;
        document.getElementById('motorTime').textContent = `${mTime} min`;
        document.getElementById('maxSpeed').textContent = `${maxS} km/h`;
        document.getElementById('fastestWave').textContent = `${fWave} km/h`;
        document.getElementById('dashboard').classList.remove('dashboard-hidden');
    }

    if (loadSessionBtn) {
        loadSessionBtn.addEventListener('click', () => {
            const data = localStorage.getItem(savedSelect.value);
            if (data) { currentSessionData = JSON.parse(data); restoreDashboardData(currentSessionData); }
        });
    }
});
