document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    const toggleWaveOnly = document.getElementById('toggleWaveOnly');
    const shareBtn = document.getElementById('shareBtn');
    const savedSelect = document.getElementById('savedSessions');
    const loadSessionBtn = document.getElementById('loadSessionBtn');
    const lockHeadingBtn = document.getElementById('lockHeadingBtn'); 
    
    let map = null;
    let fullTrackCoords = [];
    let filteredGreyCoords = []; 
    let waveTrackCoords = [];
    let longestTrackCoords = [];
    let currentSessionData = null;
    let lockedHeading = null;

    populateSavedSessions();

    // --- 1. TOGGLE LOGIC (WAVES ONLY) ---
    if (toggleWaveOnly) {
        toggleWaveOnly.addEventListener('change', () => {
            if (currentSessionData) renderMap(fullTrackCoords);
        });
    }

    // --- 2. LOCK HEADING TOGGLE ---
    if (lockHeadingBtn) {
        lockHeadingBtn.addEventListener('click', function() {
            if (fullTrackCoords.length < 10) return;

            if (lockedHeading !== null) {
                lockedHeading = null;
                lockHeadingBtn.textContent = `Lock Outbound`;
                lockHeadingBtn.style.background = 'transparent';
                lockHeadingBtn.style.color = '#FFFFFF';
            } else {
                const start = fullTrackCoords[0];
                const end = fullTrackCoords[Math.min(30, fullTrackCoords.length - 1)];
                lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
                lockHeadingBtn.textContent = `Locked: ${Math.round(lockedHeading)}°`;
                lockHeadingBtn.style.background = '#D4AF37';
                lockHeadingBtn.style.color = '#000';
            }
            
            if (currentSessionData) {
                TrackCoordsCalculation(currentSessionData.lats, currentSessionData.lons, currentSessionData.speeds || []);
                renderMap(fullTrackCoords);
            }
        });
    }

    // --- 3. PHYSICS & PARSING ---
    function parseAndMapData(xmlString, originalName) {
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

        let motorSeconds = 0, flightSeconds = 0;
        for (let i = 1; i < lats.length; i++) {
            let d = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
            let diff = (times[i] - times[i-1]) / 1000;
            let s = diff > 0 ? (d/diff)*3.6 : 0;
            speeds.push(s);
            if (s > 0 && s < 12.5) motorSeconds += diff;
            else if (s >= 12.5) flightSeconds += diff;
        }

        const dataObject = {
            flightTime: Math.round(flightSeconds / 60),
            motorTime: Math.round(motorSeconds / 60),
            maxSpeed: Math.max(...speeds).toFixed(1),
            fastestWave: Math.max(...speeds).toFixed(1), 
            lats, lons, speeds, times
        };

        let storageKey = `Swellpath_${sessionDate.getTime()}_${originalName.substring(0,12)}`;
        localStorage.setItem(storageKey, JSON.stringify(dataObject));
        return storageKey;
    }

    function TrackCoordsCalculation(lats, lons, speeds) {
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
        filteredGreyCoords = [];
        let currentRun = [], allRuns = [];
        let totalD = 0;

        for (let i = 1; i < fullTrackCoords.length; i++) {
            let prev = fullTrackCoords[i - 1], curr = fullTrackCoords[i];
            totalD += calculateDistance(prev[0], prev[1], curr[0], curr[1]);

            let heading = calculateBearing(prev[0], prev[1], curr[0], curr[1]);
            let dLon = curr[1] - prev[1], dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            
            let isOutbound = false;
            if (lockedHeading !== null) {
                let diff = Math.abs(heading - lockedHeading);
                if ((diff > 180 ? 360 - diff : diff) < 45) isOutbound = true;
            }

            if (!isOutbound) filteredGreyCoords.push(curr);

            // Speed & Angle gate for Wave Detection
            let currentSpeed = speeds[i] || 0;
            if (angle > -145 && angle < -35 && !isOutbound && currentSpeed > 13.5) {
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
        if (!coords || coords.length === 0) return;
        if (map) map.remove();
        map = L.map('mapContainer').setView(coords[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        // This is the fix for the grey lines
        let bgTrack = (lockedHeading !== null) ? filteredGreyCoords : fullTrackCoords;
        
        if (!toggleWaveOnly.checked) {
            L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(map);
            if (waveTrackCoords.length > 0) L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
            if (longestTrackCoords.length > 0) L.polyline(longestTrackCoords, {color: '#D4AF37', weight: 4}).addTo(map);
        } else {
            // ONLY SHOW WAVES MODE
            if (waveTrackCoords.length > 0) L.polyline(waveTrackCoords, {color: '#000', weight: 3}).addTo(map);
            if (longestTrackCoords.length > 0) L.polyline(longestTrackCoords, {color: '#D4AF37', weight: 4}).addTo(map);
        }

        const bounds = toggleWaveOnly.checked && waveTrackCoords.length > 0 ? waveTrackCoords : fullTrackCoords;
        map.fitBounds(L.latLngBounds(bounds));
    }

    // --- 4. HELPERS ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3, p = Math.PI/180;
        const a = 0.5 - Math.cos((lat2-lat1)*p)/2 + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180;
        const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
        const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
                  Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
        const brng = Math.atan2(y, x) / rad;
        return (brng + 360) % 360;
    }

    function populateSavedSessions() {
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        let keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            if (localStorage.key(i).startsWith('Swellpath_')) keys.push(localStorage.key(i));
        }
        keys.sort().reverse().forEach(key => {
            let d = new Date(parseInt(key.split('_')[1]));
            let opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${d.toLocaleDateString('en-CA', {month:'short', day:'numeric'})} - ${key.split('_')[2] || 'Session'}`;
            savedSelect.appendChild(opt);
        });
    }

    function restoreDashboardData(obj) {
        if (!obj) return;
        document.getElementById('flightTime').textContent = `${obj.flightTime || 0} min`;
        document.getElementById('motorTime').textContent = `${obj.motorTime || 0} min`;
        document.getElementById('maxSpeed').textContent = `${obj.maxSpeed || 0} km/h`;
        document.getElementById('fastestWave').textContent = `${obj.fastestWave || 0} km/h`;
        
        // Pass empty array if speeds are missing to prevent crash
        TrackCoordsCalculation(obj.lats, obj.lons, obj.speeds || []);
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

    if (dropZone) dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const key = parseAndMapData(event.target.result, file.name);
                populateSavedSessions();
                savedSelect.value = key;
                currentSessionData = JSON.parse(localStorage.getItem(key));
                restoreDashboardData(currentSessionData);
            };
            reader.readAsText(file);
        }
    });
});
