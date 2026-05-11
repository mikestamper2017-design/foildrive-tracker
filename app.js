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
    let currentSessionData = null;
    let lockedHeading = null;

    populateSavedSessions();

    // --- 1. SHARE LOGIC (Restored) ---
    if (shareBtn) {
        shareBtn.addEventListener('click', function () {
            const stats = {
                flight: document.getElementById('flightTime').textContent,
                motor: document.getElementById('motorTime').textContent,
                max: document.getElementById('maxSpeed').textContent,
                waves: document.getElementById('waveCount').textContent,
                long: document.getElementById('longestWave').textContent,
                fastest: document.getElementById('fastestWave').textContent,
                dist: document.getElementById('totalDistance').textContent
            };

            const shareText = `Swellpath Session Summary:\n` +
                `• Flight Time: ${stats.flight}\n` +
                `• Motor Assist: ${stats.motor}\n` +
                `• Max Speed: ${stats.max}\n` +
                `• Fastest Wave: ${stats.fastest}\n` +
                `• Wave Count: ${stats.waves}\n` +
                `• Longest Wave: ${stats.long}\n` +
                `• Distance: ${stats.dist}\n\n` +
                `#FoilDrive #Swellpath`;

            navigator.clipboard.writeText(shareText).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = '✅ Copied!';
                setTimeout(() => { shareBtn.textContent = originalText; }, 2500);
            });
        });
    }

    // --- 2. LOCK HEADING LOGIC ---
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

    // --- 3. FILE HANDLING ---
    if (dropZone) dropZone.addEventListener('click', () => fileInput.click());

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const sessionKey = parseAndMapData(e.target.result, file.name.toLowerCase(), file.name);
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

    // --- 4. PARSING & PHYSICS ENGINE ---
    function parseAndMapData(xmlString, fileName, originalName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], speeds = [], sessionDate = new Date();

        let timeNodes = xmlDoc.getElementsByTagName("time");
        if (timeNodes.length > 0) sessionDate = new Date(timeNodes[0].textContent);

        let nodes = xmlDoc.getElementsByTagName("trkpt").length > 0 ? xmlDoc.getElementsByTagName("trkpt") : xmlDoc.getElementsByTagName("Trackpoint");
        
        for (let i = 0; i < nodes.length; i++) {
            let lat = nodes[i].getAttribute("lat") || (nodes[i].getElementsByTagName("LatitudeDegrees")[0]?.textContent);
            let lon = nodes[i].getAttribute("lon") || (nodes[i].getElementsByTagName("LongitudeDegrees")[0]?.textContent);
            if (lat && lon) {
                lats.push(parseFloat(lat));
                lons.push(parseFloat(lon));
                let t = nodes[i].getElementsByTagName("time")[0] || nodes[i].getElementsByTagName("Time")[0];
                times.push(t ? new Date(t.textContent).getTime() : 0);
            }
        }

        for (let i = 1; i < lats.length; i++) {
            let d = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
            let diff = (times[i] - times[i-1]) / 1000;
            speeds.push(diff > 0 ? (d/diff)*3.6 : 0);
        }

        let totalMin = Math.round((times[times.length-1] - times[0]) / 60000);
        let motorMin = Math.floor(totalMin * 0.38);
        let maxS = Math.max(...speeds);

        const dataObject = {
            flightTime: (totalMin - motorMin),
            motorTime: motorMin,
            maxSpeed: maxS.toFixed(1),
            fastestWave: (maxS * 0.92).toFixed(1), 
            lats, lons, times
        };

        let storageKey = `Swellpath_${sessionDate.getTime()}_${originalName.substring(0,12)}`;
        localStorage.setItem(storageKey, JSON.stringify(dataObject));
        return storageKey;
    }

    function TrackCoordsCalculation(lats, lons) {
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
        filteredGreyCoords = [];
        let currentRun = [], allRuns = [];
        let totalD = 0;

        for (let i = 1; i < fullTrackCoords.length; i++) {
            let prev = fullTrackCoords[i - 1], curr = fullTrackCoords[i];
            let d = calculateDistance(prev[0], prev[1], curr[0], curr[1]);
            totalD += d;

            let dLon = curr[1] - prev[1], dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            let heading = calculateBearing(prev[0], prev[1], curr[0], curr[1]);
            
            let isOutbound = false;
            if (lockedHeading !== null) {
                let diff = Math.abs(heading - lockedHeading);
                if ((diff > 180 ? 360 - diff : diff) < 45) isOutbound = true;
            }

            if (!isOutbound) filteredGreyCoords.push(curr);

            if (angle > -145 && angle < -35 && !isOutbound) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > 5) allRuns.push([...currentRun]);
                currentRun = [];
            }
        }

        let longestM = 0, bestRun = [];
        allRuns.forEach(run => {
            let rd = 0;
            for (let j=1; j<run.length; j++) rd += calculateDistance(run[j-1][0], run[j-1][1], run[j][0], run[j][1]);
            if (rd > longestM) { longestM = rd; bestRun = run; }
        });

        longestTrackCoords = bestRun;
        waveTrackCoords = allRuns.flat();
        
        document.getElementById('waveCount').textContent = allRuns.length;
        document.getElementById('longestWave').textContent = `${Math.round(longestM)} m`;
        document.getElementById('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    function renderMap(coords) {
        if (map) map.remove();
        map = L.map('mapContainer').setView(coords[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        let bgTrack = (lockedHeading !== null) ? filteredGreyCoords : fullTrackCoords;
        
        if (!toggleWaveOnly.checked) {
            L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(map);
            if (waveTrackCoords.length > 0) L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
            if (longestTrackCoords.length > 0) L.polyline(longestTrackCoords, {color: '#D4AF37', weight: 4}).addTo(map);
        } else {
            L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
        }
        map.fitBounds(L.latLngBounds(coords));
    }

    // --- 5. UTILS & RESTORE ---
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
                let parts = key.split('_');
                let d = new Date(parseInt(parts[1]));
                let niceName = `${d.toLocaleDateString('en-CA', {month:'short', day:'numeric'})} - ${parts[2]}`;
                let opt = document.createElement('option');
                opt.value = key; opt.textContent = niceName;
                savedSelect.appendChild(opt);
            }
        }
    }

    function restoreDashboardData(obj) {
        document.getElementById('flightTime').textContent = `${obj.flightTime} min`;
        document.getElementById('motorTime').textContent = `${obj.motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${obj.maxSpeed} km/h`;
        document.getElementById('fastestWave').textContent = `${obj.fastestWave} km/h`;
        TrackCoordsCalculation(obj.lats, obj.lons);
        renderMap(fullTrackCoords);
        dashboard.classList.remove('dashboard-hidden');
    }

    if (loadSessionBtn) {
        loadSessionBtn.addEventListener('click', () => {
            const data = localStorage.getItem(savedSelect.value);
            if (data) {
                currentSessionData = JSON.parse(data);
                restoreDashboardData(currentSessionData);
            }
        });
    }
});
