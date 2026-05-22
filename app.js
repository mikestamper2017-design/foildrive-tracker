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

    // Initialize drop list views
    populateSavedSessions();

    // PERSISTENCE RESTORE: Pull previous gear profiles out of localStorage caching
    function getEl(id) { return document.getElementById(id); }
    if (getEl('gearFoilDrive')) getEl('gearFoilDrive').value = localStorage.getItem('swellpath_pref_foildrive') || '';
    if (getEl('gearFoil')) getEl('gearFoil').value = localStorage.getItem('swellpath_pref_foil') || '';
    if (getEl('gearWing')) getEl('gearWing').value = localStorage.getItem('swellpath_pref_wing') || '';

    // --- 2. USER INTERACTION INTERFACES ---
    const toggleWaveOnly = getEl('toggleWaveOnly');
    if (toggleWaveOnly) {
        toggleWaveOnly.addEventListener('change', () => { 
            if (state.currentData) renderMap(); 
        });
    }

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
            if (state.currentData) {
                calculateTracks(state.currentData);
                renderMap();
            }
        });
    }

    const loadSessionBtn = getEl('loadSessionBtn');
    if (loadSessionBtn) {
        loadSessionBtn.addEventListener('click', () => {
            const savedSessions = getEl('savedSessions');
            if (savedSessions && savedSessions.value) {
                loadSession(savedSessions.value);
            }
        });
    }

    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const key = parseGPX(ev.target.result, file.name);
                    populateSavedSessions();
                    const savedSessions = getEl('savedSessions');
                    if (savedSessions) savedSessions.value = key;
                    loadSession(key);
                };
                reader.readAsText(file);
            }
        });
    }

    // --- 3. GPX PARSING & CALIBRATED PHYSICS ---
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
            let median = window[Math.floor(window.length / 2)] || 0;
            let finalSpeed = median * 0.92;
            calibratedSpeeds.push(finalSpeed);

            let timeDiff = (times[i+1] - times[i]) / 1000;
            if (finalSpeed > 2.0) motorSec += timeDiff;
            if (finalSpeed >= 16.5) flightSec += timeDiff;
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

    // --- 4. TRACK & WAVE ANALYTICS ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.filteredTrack = [];
        state.waveTracks = [];
        state.longestTrack = [];
        state.fastestTrack = []; 
        let currentRun = [], allRuns = [], totalD = 0;
        let isCurrentlyOnWave = false;

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

            let speedCondition = false;
            if (!isCurrentlyOnWave) {
                if (data.speeds[i] >= 16.5) { 
                    speedCondition = true;
                    isCurrentlyOnWave = true;
                }
            } else {
                if (data.speeds[i] >= 13.0) speedCondition = true;
                else isCurrentlyOnWave = false;
            }

            let directionCondition = (angle > -170 && angle < -10);

            if (!isOutbound && speedCondition && directionCondition) {
                currentRun.push({coord: curr, speed: data.speeds[i]});
            } else {
                if (currentRun.length >= 6) allRuns.push([...currentRun]); 
                currentRun = [];
                isCurrentlyOnWave = false;
            }
        }
        
        if (currentRun.length >= 6) allRuns.push([...currentRun]);

        let longestM = 0, maxWaveAvg = 0;
        allRuns.forEach(run => {
            let coordsOnly = run.map(p => p.coord);
            let rd = 0;
            for (let j=1; j<coordsOnly.length; j++) rd += calculateDistance(coordsOnly[j-1][0], coordsOnly[j-1][1], coordsOnly[j][0], coordsOnly[j][1]);
            
            if (rd > longestM) { longestM = rd; state.longestTrack = coordsOnly; }

            let avgSpeed = run.reduce((sum, p) => sum + p.speed, 0) / run.length;
            if (avgSpeed > maxWaveAvg) {
                maxWaveAvg = avgSpeed;
                state.fastestTrack = coordsOnly;
            }
        });

        state.waveTracks = allRuns.map(run => run.map(p => p.coord)).flat();
        
        if (getEl('waveCount')) getEl('waveCount').textContent = allRuns.length;
        if (getEl('longestWave')) getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        if (getEl('fastestWave')) getEl('fastestWave').textContent = maxWaveAvg > 0 ? `${maxWaveAvg.toFixed(1)} km/h` : "0.0 km/h";
        if (getEl('totalDistance')) getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    // --- 5. MAP RENDERING ENGINE ---
    function renderMap() {
        if (!state.fullTrack.length || !getEl('mapContainer')) return;
        if (state.map) { state.map.remove(); state.map = null; }
        
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);

        const showWavesOnly = toggleWaveOnly ? toggleWaveOnly.checked : false;
        const bgTrack = (state.lockedHeading !== null) ? state.filteredTrack : state.fullTrack;
        
        if (!showWavesOnly) L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(state.map);
        if (state.waveTracks.length > 0) L.polyline(state.waveTracks, {color: '#000', weight: 3}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6, opacity: 0.9}).addTo(state.map);
        if (state.fastestTrack.length > 0) L.polyline(state.fastestTrack, {color: '#00BCD4', weight: 4, dashArray: '5, 10'}).addTo(state.map);

        const bounds = (showWavesOnly && state.waveTracks.length > 0) ? state.waveTracks : state.fullTrack;
        state.map.fitBounds(L.latLngBounds(bounds));
    }

    // --- 6. UI MANAGEMENT & PERSISTENCE ---
    function populateSavedSessions() {
        const savedSelect = getEl('savedSessions');
        if (!savedSelect) return;
        
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        let keys = Object.keys(localStorage).filter(k => k.startsWith('Swellpath_'))
                    .sort((a,b) => b.split('_')[1] - a.split('_')[1]);

        keys.forEach(key => {
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
        state.lockedHeading = null;
        
        if (getEl('flightTime')) getEl('flightTime').textContent = `${data.flightTime} min`;
        if (getEl('motorTime')) getEl('motorTime').textContent = `${data.motorTime} min`;
        if (getEl('maxSpeed')) getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;

        document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('longest-wave-card', 'fastest-wave-card'));
        
        calculateTracks(data);
        renderMap();

        if (getEl('longestWave')) getEl('longestWave').closest('.metric-card').classList.add('longest-wave-card');
        if (getEl('fastestWave')) getEl('fastestWave').closest('.metric-card').classList.add('fastest-wave-card');
        if (getEl('dashboard')) getEl('dashboard').classList.remove('dashboard-hidden');
    }

    // --- 7. CANVAS SHARE BADGE GENERATOR (INSTAGRAM 4:5 FORMAT) ---
    const shareBtn = getEl('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (!state.currentData || !state.fullTrack.length) {
                alert("Please load a session before sharing!");
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1350;
            const ctx = canvas.getContext('2d');

            const data = state.currentData;
            // Existing metrics
            const waveCount = getEl('waveCount') ? getEl('waveCount').textContent : '0';
            // Added Longest Wave stat
            const longestWave = getEl('longestWave') ? getEl('longestWave').textContent : '0 m';

            // Gather gear data
            const fdVal = getEl('gearFoilDrive') ? getEl('gearFoilDrive').value.trim() : '';
            const foilVal = getEl('gearFoil') ? getEl('gearFoil').value.trim() : '';
            const wingVal = getEl('gearWing') ? getEl('gearWing').value.trim() : '';

            // Persist gear
            localStorage.setItem('swellpath_pref_foildrive', fdVal);
            localStorage.setItem('swellpath_pref_foil', foilVal);
            localStorage.setItem('swellpath_pref_wing', wingVal);

            // Background & Grid
            ctx.fillStyle = '#0a0a0c'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 680); ctx.stroke(); }
            for (let y = 0; y < 680; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

            // ... [Keep your existing Map Drawing logic from your current file here] ...

            // Typography Layout
            ctx.textBaseline = 'top';
            ctx.font = 'bold 22px monospace';
            ctx.fillStyle = '#666670';
            ctx.fillText('// SWELLPATH PRECISION LABS', 80, 60);

            ctx.font = 'bold 42px sans-serif';
            ctx.fillStyle = '#FFF';
            ctx.fillText(`${data.displayName}`, 80, 95);
            
            ctx.font = '24px monospace';
            ctx.fillStyle = '#888892';
            ctx.textAlign = 'right';
            ctx.fillText(`${data.dateStr}`, canvas.width - 80, 108);
            ctx.textAlign = 'left'; 

            ctx.strokeStyle = '#1c1c24';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(80, 680); ctx.lineTo(canvas.width - 80, 680); ctx.stroke();

            // HERO PERFORMANCE RIDE (Updated)
            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#D4AF37';
            ctx.fillText('// HERO PERFORMANCE RIDE', 80, 720);

            ctx.font = 'bold 96px sans-serif';
            ctx.fillStyle = '#FFF';
            ctx.fillText(longestWave, 75, 755); // The new Hero Stat

            ctx.font = '24px monospace';
            ctx.fillStyle = '#888892';
            ctx.fillText('UNASSISTED GLIDE DISTANCE', 420, 810);

            ctx.beginPath(); ctx.moveTo(80, 890); ctx.lineTo(canvas.width - 80, 890); ctx.stroke();

            // PERFORMANCE SECONDARY ROW
            function drawSubMetric(label, value, xPos, yPos) {
                ctx.font = '16px monospace';
                ctx.fillStyle = '#666670';
                ctx.fillText(label, xPos, yPos);
                ctx.font = 'bold 38px sans-serif';
                ctx.fillStyle = '#FFF';
                ctx.fillText(value, xPos, yPos + 24);
            }

            drawSubMetric('⚡ MAX SPEED', `${data.maxSpeed} km/h`, 80, 930);
            drawSubMetric('🦅 FLIGHT TIME', `${data.flightTime} min`, 340, 930);
            drawSubMetric('🌊 RIDE COUNT', `${waveCount} Waves`, 600, 930);
            drawSubMetric('🔋 MOTOR TIME', `${data.motorTime} min`, 840, 930);

            // ... [Keep your existing Equipment Profile and Footer logic here] ...

            const imgUrl = canvas.toDataURL('image/png');
            const container = getEl('imageContainer');
            if (container) container.innerHTML = `<img src="${imgUrl}" style="max-width:100%; height:auto; border:1px solid #222; border-radius:8px;" alt="Instagram Session Badge"/>`;
            if (getEl('shareModal')) getEl('shareModal').style.display = 'flex';
        });
    }

    // --- 8. GEOSPATIAL MATH HELPERS ---
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
