document.addEventListener('DOMContentLoaded', function () {
    
    // --- 1. SYSTEM STATE ---
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

    function getEl(id) { return document.getElementById(id); }

    // --- 2. USER INTERACTION INTERFACES ---
    const toggleWaveOnly = getEl('toggleWaveOnly');
    if (toggleWaveOnly) toggleWaveOnly.addEventListener('change', () => { if (state.currentData) renderMap(); });

    const lockHeadingBtn = getEl('lockHeadingBtn');
    if (lockHeadingBtn) {
        lockHeadingBtn.addEventListener('click', function() {
            if (state.fullTrack.length < 10) return;
            if (state.lockedHeading !== null) {
                state.lockedHeading = null;
                this.textContent = `Lock Outbound Heading`;
                this.style.background = 'transparent';
                this.style.color = 'var(--text-primary)';
                this.style.border = '1px solid var(--border-color)';
            } else {
                const start = state.fullTrack[0];
                const end = state.fullTrack[Math.min(30, state.fullTrack.length - 1)];
                state.lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
                this.textContent = `Locked: ${Math.round(state.lockedHeading)}°`;
                this.style.background = '#D4AF37'; 
                this.style.color = '#111';
                this.style.border = 'none';
            }
            if (state.currentData) { calculateTracks(state.currentData); renderMap(); }
        });
    }

    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const key = parseGPX(ev.target.result, e.target.files[0].name);
                    populateSavedSessions();
                    loadSession(key);
                };
                reader.readAsText(e.target.files[0]);
            }
        });
    }

    // --- 3. GPX PARSING ---
    function parseGPX(xmlString, fileName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], rawSpeeds = [], calibratedSpeeds = [];
        
        let tNodes = xmlDoc.getElementsByTagName("time");
        let sessionDate = tNodes.length > 0 ? new Date(tNodes[0].textContent) : new Date();
        let nodes = xmlDoc.getElementsByTagName("trkpt").length > 0 ? xmlDoc.getElementsByTagName("trkpt") : xmlDoc.getElementsByTagName("Trackpoint");
        
        for (let i = 0; i < nodes.length; i++) {
            let lat = nodes[i].getAttribute("lat") || nodes[i].getElementsByTagName("LatitudeDegrees")[0]?.textContent;
            let lon = nodes[i].getAttribute("lon") || nodes[i].getElementsByTagName("LongitudeDegrees")[0]?.textContent;
            if (lat && lon) {
                lats.push(parseFloat(lat)); lons.push(parseFloat(lon));
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
            let median = window.sort((a, b) => a - b)[Math.floor(window.length / 2)] || 0;
            let finalSpeed = median * 0.92;
            calibratedSpeeds.push(finalSpeed);
            let timeDiff = (times[i+1] - times[i]) / 1000;
            if (finalSpeed > 2.0) motorSec += timeDiff;
            if (finalSpeed >= 16.5) flightSec += timeDiff;
        }

        const data = {
            displayName: fileName.split('.')[0].replace(/_/g, ' '),
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

    // --- 4. TRACK & WAVE ANALYTICS ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.waveTracks = []; state.longestTrack = [];
        let currentRun = [], allRuns = [], totalD = 0, isCurrentlyOnWave = false;

        for (let i = 1; i < state.fullTrack.length; i++) {
            let prev = state.fullTrack[i-1], curr = state.fullTrack[i];
            totalD += calculateDistance(prev[0], prev[1], curr[0], curr[1]);
            let dLon = curr[1] - prev[1], dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            
            let speedCondition = (!isCurrentlyOnWave) ? data.speeds[i] >= 16.5 : data.speeds[i] >= 13.0;
            if (data.speeds[i] >= 16.5) isCurrentlyOnWave = true;
            else if (data.speeds[i] < 13.0) isCurrentlyOnWave = false;

            if (speedCondition && (angle > -170 && angle < -10)) {
                currentRun.push({coord: curr, speed: data.speeds[i]});
            } else {
                if (currentRun.length >= 6) allRuns.push([...currentRun]); 
                currentRun = [];
            }
        }
        if (currentRun.length >= 6) allRuns.push([...currentRun]);

        let longestM = 0;
        allRuns.forEach(run => {
            let coordsOnly = run.map(p => p.coord);
            let rd = 0;
            for (let j=1; j<coordsOnly.length; j++) rd += calculateDistance(coordsOnly[j-1][0], coordsOnly[j-1][1], coordsOnly[j][0], coordsOnly[j][1]);
            if (rd > longestM) { longestM = rd; state.longestTrack = coordsOnly; }
        });
        state.waveTracks = allRuns.map(run => run.map(p => p.coord)).flat();
        
        if (getEl('waveCount')) getEl('waveCount').textContent = allRuns.length;
        if (getEl('longestWave')) getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        if (getEl('totalDistance')) getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    // --- 5. MAP RENDERING ENGINE ---
    function renderMap() {
        if (!state.fullTrack.length || !getEl('mapContainer')) return;
        if (state.map) { state.map.remove(); state.map = null; }
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        L.polyline(state.fullTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6}).addTo(state.map);
        state.map.fitBounds(L.latLngBounds(state.fullTrack));
    }

    // --- 6. UI MANAGEMENT ---
    function populateSavedSessions() {
        const savedSelect = getEl('savedSessions');
        if (!savedSelect) return;
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).sort((a,b) => b.split('_')[1] - a.split('_')[1]).forEach(key => {
            const data = JSON.parse(localStorage.getItem(key));
            let opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${data.dateStr} - ${data.displayName}`;
            savedSelect.appendChild(opt);
        });
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if (!data) return;
        state.currentData = data;
        if (getEl('flightTime')) getEl('flightTime').textContent = `${data.flightTime} min`;
        if (getEl('motorTime')) getEl('motorTime').textContent = `${data.motorTime} min`;
        if (getEl('maxSpeed')) getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        calculateTracks(data);
        renderMap();
        if (getEl('dashboard')) getEl('dashboard').classList.remove('dashboard-hidden');
    }

    // --- 7. CANVAS SHARE BADGE GENERATOR ---
    const shareBtn = getEl('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (!state.currentData) return;
            const canvas = document.createElement('canvas');
            canvas.width = 1080; canvas.height = 1350;
            const ctx = canvas.getContext('2d');
            const data = state.currentData;
            
            const totalDurationMin = Math.round((data.times[data.times.length - 1] - data.times[0]) / 60000);
            const locationText = getEl('locationInput') ? getEl('locationInput').value : "";

            ctx.fillStyle = '#001f3f'; ctx.fillRect(0, 0, 1080, 1350);

            // Mapping
            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            state.fullTrack.forEach(pt => {
                if (pt[0] < minLat) minLat = pt[0]; if (pt[0] > maxLat) maxLat = pt[0];
                if (pt[1] < minLon) minLon = pt[1]; if (pt[1] > maxLon) maxLon = pt[1];
            });
            const scale = Math.min(920 / (maxLon - minLon || 0.001), 400 / (maxLat - minLat || 0.001));
            const xOffset = 80 + (920 - (maxLon - minLon) * scale) / 2;
            const yOffset = 220 + (400 - (maxLat - minLat) * scale) / 2;
            function sX(lon) { return xOffset + (lon - minLon) * scale; }
            function sY(lat) { return (yOffset + 400) - (lat - minLat) * scale; }

            // Paths
            ctx.strokeStyle = '#7FDBFF'; ctx.lineWidth = 4;
            ctx.beginPath(); state.fullTrack.forEach(pt => ctx.lineTo(sX(pt[1]), sY(pt[0]))); ctx.stroke();
            if (state.longestTrack.length > 0) {
                ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 8;
                ctx.beginPath(); state.longestTrack.forEach((pt, i) => i === 0 ? ctx.moveTo(sX(pt[1]), sY(pt[0])) : ctx.lineTo(sX(pt[1]), sY(pt[0]))); ctx.stroke();
            }

            // Text
            ctx.fillStyle = '#FFF'; ctx.font = 'bold 56px sans-serif'; ctx.fillText(data.displayName, 80, 80);
            ctx.fillStyle = '#7FDBFF'; ctx.font = '36px sans-serif'; ctx.fillText(`${locationText} • ${data.dateStr}`, 80, 150);

            function drawM(i, l, v, x, y) {
                ctx.fillStyle = '#FFF'; ctx.font = '60px sans-serif'; ctx.fillText(i, x, y + 50);
                ctx.fillStyle = '#AAA'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(l, x + 80, y);
                ctx.fillStyle = '#FFF'; ctx.font = 'bold 48px sans-serif'; ctx.fillText(v, x + 80, y + 60);
            }
            drawM('🦅', 'HERO RIDE', getEl('longestWave').textContent, 80, 700);
            drawM('⚡', 'MAX SPEED', `${data.maxSpeed} km/h`, 580, 700);
            drawM('⏱️', 'SESSION', `${totalDurationMin} min`, 80, 900);
            drawM('🌊', 'WAVES', getEl('waveCount').textContent, 580, 900);
            drawM('✈️', 'FLIGHT', `${data.flightTime} min`, 80, 1100);
            drawM('🔋', 'MOTOR', `${data.motorTime} min`, 580, 1100);

            const imgUrl = canvas.toDataURL('image/png');
            if (getEl('imageContainer')) getEl('imageContainer').innerHTML = `<img src="${imgUrl}" style="width:100%; border-radius:8px;"/>`;
            if (getEl('shareModal')) getEl('shareModal').style.display = 'flex';
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
