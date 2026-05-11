document.addEventListener('DOMContentLoaded', function () {
    const elements = {
        fileInput: document.getElementById('fileInput'),
        dropZone: document.getElementById('dropZone'),
        dashboard: document.getElementById('dashboard'),
        toggleWaveOnly: document.getElementById('toggleWaveOnly'),
        savedSelect: document.getElementById('savedSessions'),
        loadSessionBtn: document.getElementById('loadSessionBtn'),
        lockHeadingBtn: document.getElementById('lockHeadingBtn'),
        shareBtn: document.getElementById('shareBtn')
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

    // --- 1. INTERACTION ---
    elements.toggleWaveOnly.addEventListener('change', () => { if (state.currentData) renderMap(); });

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

    // --- 2. PHYSICS & PARSING ---
    function parseGPX(xmlString, fileName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], rawSpeeds = [], calibratedSpeeds = [];
        
        let tNodes = xmlDoc.getElementsByTagName("time");
        let sessionDate = tNodes.length > 0 ? new Date(tNodes[0].textContent) : new Date();

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

        for (let i = 1; i < lats.length; i++) {
            let d = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
            let diff = (times[i] - times[i-1]) / 1000;
            let s = diff > 0 ? (d/diff)*3.6 : 0;
            rawSpeeds.push(s > 65 ? 0 : s);
        }

        let motorSec = 0, flightSec = 0;
        for (let i = 0; i < rawSpeeds.length; i++) {
            let window = rawSpeeds.slice(Math.max(0, i-2), i+3);
            window.sort((a, b) => a - b);
            let median = window[Math.floor(window.length / 2)];
            let finalSpeed = (median || 0) * 0.92;
            calibratedSpeeds.push(finalSpeed);

            let timeDiff = (times[i+1] - times[i]) / 1000;
            if (finalSpeed > 0.5 && finalSpeed < 18.5) motorSec += timeDiff;
            else if (finalSpeed >= 18.5) flightSec += timeDiff;
        }

        const data = {
            displayName: fileName.split('.')[0].replace(/_/g, ' ').replace(/-/g, ' '),
            dateStr: sessionDate.toLocaleDateString('en-CA', {month:'short', day:'numeric'}),
            flightTime: Math.round(flightSec / 60),
            motorTime: Math.round(motorSec / 60),
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1),
            lats, lons, speeds: calibratedSpeeds, times
        };

        let key = `Swellpath_${sessionDate.getTime()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.filteredTrack = [];
        state.waveTracks = [];
        state.longestTrack = [];
        state.fastestTrack = []; 
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
                if ((diff > 180 ? 360 - diff : diff) < 50) isOutbound = true; 
            }

            if (!isOutbound) state.filteredTrack.push(curr);

            if (!isOutbound && data.speeds[i] > 17 && angle > -145 && angle < -35) {
                currentRun.push({coord: curr, speed: data.speeds[i]});
            } else {
                if (currentRun.length > 8) allRuns.push([...currentRun]); 
                currentRun = [];
            }
        }

        let longestM = 0, maxWaveSpeed = 0;
        allRuns.forEach(run => {
            let coordsOnly = run.map(p => p.coord);
            let rd = 0;
            for (let j=1; j<coordsOnly.length; j++) rd += calculateDistance(coordsOnly[j-1][0], coordsOnly[j-1][1], coordsOnly[j][0], coordsOnly[j][1]);
            
            if (rd > longestM) { longestM = rd; state.longestTrack = coordsOnly; }

            let avgSpeed = run.reduce((sum, p) => sum + p.speed, 0) / run.length;
            if (avgSpeed > maxWaveSpeed) {
                maxWaveSpeed = avgSpeed;
                state.fastestTrack = coordsOnly;
            }
        });

        state.waveTracks = allRuns.map(run => run.map(p => p.coord)).flat();
        document.getElementById('waveCount').textContent = allRuns.length;
        document.getElementById('longestWave').textContent = `${Math.round(longestM)} m`;
        document.getElementById('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) { state.map.remove(); state.map = null; }
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);

        const showWavesOnly = elements.toggleWaveOnly.checked;
        const bgTrack = (state.lockedHeading !== null) ? state.filteredTrack : state.fullTrack;
        
        if (!showWavesOnly) {
            L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(state.map);
        }
        if (state.waveTracks.length > 0) L.polyline(state.waveTracks, {color: '#000', weight: 3}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6, opacity: 0.9}).addTo(state.map);
        if (state.fastestTrack.length > 0) L.polyline(state.fastestTrack, {color: '#00FFFF', weight: 4, dashArray: '5, 10'}).addTo(state.map);

        const bounds = (showWavesOnly && state.waveTracks.length > 0) ? state.waveTracks : state.fullTrack;
        state.map.fitBounds(L.latLngBounds(bounds));
    }

    // --- 3. SESSION LOADING ---
    function populateSavedSessions() {
        elements.savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        let keys = Object.keys(localStorage).filter(k => k.startsWith('Swellpath_'))
                    .sort((a,b) => b.split('_')[1] - a.split('_')[1]);

        keys.forEach(key => {
            const data = JSON.parse(localStorage.getItem(key));
            let opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${data.dateStr} - ${data.displayName}`;
            elements.savedSelect.appendChild(opt);
        });
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if (!data) return;
        state.currentData = data;
        state.lockedHeading = null;
        
        // Update values
        document.getElementById('flightTime').textContent = `${data.flightTime} min`;
        document.getElementById('motorTime').textContent = `${data.motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        
        // Setup visual "Key" on cards
        const fastestEl = document.getElementById('fastestWave');
        fastestEl.textContent = `${data.maxSpeed} km/h`;
        
        // Clear old highlights first
        document.querySelectorAll('.highlight-fastest, .highlight-longest').forEach(el => {
            el.classList.remove('highlight-fastest', 'highlight-longest');
        });

        // Apply new highlights to parent card
        fastestEl.closest('.stat-card')?.classList.add('highlight-fastest');
        document.getElementById('longestWave').closest('.stat-card')?.classList.add('highlight-longest');
        
        calculateTracks(data);
        renderMap();
        elements.dashboard.classList.remove('dashboard-hidden');
    }

    // --- 4. SYSTEM EVENTS ---
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

    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', function() {
            const stats = `Swellpath Session:\n• Flight: ${document.getElementById('flightTime').textContent}\n• Motor: ${document.getElementById('motorTime').textContent}\n• Max: ${document.getElementById('maxSpeed').textContent}\n• Waves: ${document.getElementById('waveCount').textContent}\n#FoilDrive`;
            navigator.clipboard.writeText(stats).then(() => {
                this.textContent = "✅ Copied";
                setTimeout(() => { this.textContent = "Share Session"; }, 2000);
            });
        });
    }

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
