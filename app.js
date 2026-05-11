document.addEventListener('DOMContentLoaded', function () {
    // --- UI ELEMENTS ---
    const elements = {
        fileInput: document.getElementById('fileInput'),
        dropZone: document.getElementById('dropZone'),
        dashboard: document.getElementById('dashboard'),
        toggleWaveOnly: document.getElementById('toggleWaveOnly'),
        savedSelect: document.getElementById('savedSessions'),
        loadSessionBtn: document.getElementById('loadSessionBtn'),
        lockHeadingBtn: document.getElementById('lockHeadingBtn')
    };

    let state = {
        map: null,
        fullTrack: [],
        filteredTrack: [],
        waveTracks: [],
        longestTrack: [],
        fastestTrack: [],
        currentData: null,
        lockedHeading: null
    };

    populateSavedSessions();

    // --- 1. REACTIVE TOGGLES ---
    elements.toggleWaveOnly.addEventListener('change', () => {
        if (state.currentData) renderMap();
    });

    elements.lockHeadingBtn.addEventListener('click', function() {
        if (state.fullTrack.length < 10) return;

        if (state.lockedHeading !== null) {
            state.lockedHeading = null;
            this.textContent = `Lock Outbound`;
            this.style.background = 'transparent';
            this.style.color = '#FFFFFF';
        } else {
            const start = state.fullTrack[0];
            const end = state.fullTrack[Math.min(30, state.fullTrack.length - 1)];
            state.lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
            this.textContent = `Locked: ${Math.round(state.lockedHeading)}°`;
            this.style.background = '#D4AF37';
            this.style.color = '#000';
        }
        
        if (state.currentData) {
            calculateTracks(state.currentData);
            renderMap();
        }
    });

    // --- 2. THE PHYSICS ENGINE (Thresholds Adjusted) ---
    function parseGPX(xmlString, fileName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], speeds = [], sessionDate = new Date();

        let tNodes = xmlDoc.getElementsByTagName("time");
        if (tNodes.length > 0) sessionDate = new Date(tNodes[0].textContent);

        let nodes = xmlDoc.getElementsByTagName("trkpt").length > 0 ? 
                    xmlDoc.getElementsByTagName("trkpt") : xmlDoc.getElementsByTagName("Trackpoint");
        
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

        let motorSec = 0, flightSec = 0;
        for (let i = 1; i < lats.length; i++) {
            let d = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
            let diff = (times[i] - times[i-1]) / 1000;
            let s = diff > 0 ? (d/diff)*3.6 : 0;
            speeds.push(s);
            
            // ADJUSTED: 16km/h threshold for Flight vs Motor
            if (s > 0 && s < 16) motorSec += diff;
            else if (s >= 16) flightSec += diff;
        }

        const data = {
            name: fileName.replace('.gpx', '').replace('.tcx', ''),
            flightTime: Math.round(flightSec / 60),
            motorTime: Math.round(motorSec / 60),
            maxSpeed: Math.max(...speeds).toFixed(1),
            lats, lons, speeds, times
        };

        let key = `Swellpath_${sessionDate.getTime()}_${data.name}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.filteredTrack = [];
        state.waveTracks = [];
        let currentRun = [], allRuns = [], totalD = 0;

        for (let i = 1; i < state.fullTrack.length; i++) {
            let prev = state.fullTrack[i-1], curr = state.fullTrack[i];
            totalD += calculateDistance(prev[0], prev[1], curr[0], curr[1]);

            let brng = calculateBearing(prev[0], prev[1], curr[0], curr[1]);
            let dLon = curr[1] - prev[1], dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            
            let isOutbound = false;
            if (state.lockedHeading !== null) {
                let diff = Math.abs(brng - state.lockedHeading);
                if ((diff > 180 ? 360 - diff : diff) < 45) isOutbound = true;
            }

            if (!isOutbound) state.filteredTrack.push(curr);

            // WAVE DETECTION: Directional + Speed Threshold
            if (angle > -145 && angle < -35 && !isOutbound && data.speeds[i] > 15) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > 5) allRuns.push([...currentRun]);
                currentRun = [];
            }
        }

        // FIND LONGEST & FASTEST
        let longestM = 0;
        allRuns.forEach(run => {
            let rd = 0;
            for (let j=1; j<run.length; j++) rd += calculateDistance(run[j-1][0], run[j-1][1], run[j][0], run[j][1]);
            if (rd > longestM) { longestM = rd; state.longestTrack = run; }
        });

        state.waveTracks = allRuns.flat();
        
        document.getElementById('waveCount').textContent = allRuns.length;
        document.getElementById('longestWave').textContent = `${Math.round(longestM)} m`;
        document.getElementById('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) state.map.remove();
        
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        const showWavesOnly = elements.toggleWaveOnly.checked;
        const bgTrack = (state.lockedHeading !== null) ? state.filteredTrack : state.fullTrack;
        
        if (!showWavesOnly) {
            L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(state.map);
        }
        
        if (state.waveTracks.length > 0) {
            L.polyline(state.waveTracks, {color: '#000', weight: 3}).addTo(state.map);
        }
        
        if (state.longestTrack.length > 0) {
            L.polyline(state.longestTrack, {color: '#D4AF37', weight: 5}).addTo(state.map);
        }

        const viewBounds = (showWavesOnly && state.waveTracks.length > 0) ? state.waveTracks : bgTrack;
        state.map.fitBounds(L.latLngBounds(viewBounds));
    }

    // --- 3. SESSION MANAGEMENT ---
    function populateSavedSessions() {
        elements.savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        let keys = Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).sort().reverse();
        keys.forEach(key => {
            let parts = key.split('_');
            let d = new Date(parseInt(parts[1]));
            let opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${d.toLocaleDateString('en-CA', {month:'short', day:'numeric'})} - ${parts[2]}`;
            elements.savedSelect.appendChild(opt);
        });
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if (!data) return;
        state.currentData = data;
        state.lockedHeading = null; // Reset lock on new load
        
        document.getElementById('flightTime').textContent = `${data.flightTime} min`;
        document.getElementById('motorTime').textContent = `${data.motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        document.getElementById('fastestWave').textContent = `${data.maxSpeed} km/h`;
        
        calculateTracks(data);
        renderMap();
        elements.dashboard.classList.remove('dashboard-hidden');
    }

    elements.loadSessionBtn.addEventListener('click', () => {
        if (elements.savedSelect.value) loadSession(elements.savedSelect.value);
    });

    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                const key = parseGPX(ev.target.result, file.name);
                populateSavedSessions();
                elements.savedSelect.value = key;
                loadSession(key);
            };
            reader.readAsText(file);
        }
    });

    // --- 4. HELPERS ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3, p = Math.PI/180;
        const a = 0.5 - Math.cos((lat2-lat1)*p)/2 + Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2;
        return R * 2 * Math.asin(Math.sqrt(a));
    }
    function calculateBearing(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180;
        const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
        const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
        return (Math.atan2(y, x) / rad + 360) % 360;
    }
});
