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

    // --- 1. USER INTERACTION ---
    elements.toggleWaveOnly.addEventListener('change', () => { 
        if (state.currentData) renderMap(); 
    });

    elements.lockHeadingBtn.addEventListener('click', function() {
        if (state.fullTrack.length < 10) return;
        if (state.lockedHeading !== null) {
            state.lockedHeading = null;
            this.textContent = `Lock Outbound`;
            this.style.background = 'transparent';
            this.style.color = 'var(--accent-color)';
            this.style.border = '1px solid var(--border-color)';
        } else {
            const start = state.fullTrack[0];
            const end = state.fullTrack[Math.min(30, state.fullTrack.length - 1)];
            state.lockedHeading = calculateBearing(start[0], start[1], end[0], end[1]);
            this.textContent = `Locked: ${Math.round(state.lockedHeading)}°`;
            this.style.background = 'var(--brand-gold)';
            this.style.color = '#fff';
            this.style.border = 'none';
        }
        if (state.currentData) {
            calculateTracks(state.currentData);
            renderMap();
        }
    });

    // --- 2. GPX PARSING & CALIBRATED PHYSICS ---
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
            
            if (finalSpeed > 2.0) {
                motorSec += timeDiff;
            }
            if (finalSpeed >= 16.5) {
                flightSec += timeDiff;
            }
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

    // --- 3. TRACK & WAVE ANALYTICS ---
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
                if (data.speeds[i] >= 13.0) { 
                    speedCondition = true;
                } else {
                    isCurrentlyOnWave = false;
                }
            }

            let directionCondition = (angle > -170 && angle < -10);

            if (!isOutbound && speedCondition && directionCondition) {
                currentRun.push({coord: curr, speed: data.speeds[i]});
            } else {
                if (currentRun.length >= 6) {
                    allRuns.push([...currentRun]); 
                }
                currentRun = [];
                isCurrentlyOnWave = false;
            }
        }
        
        if (currentRun.length >= 6) {
            allRuns.push([...currentRun]);
        }

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
        document.getElementById('waveCount').textContent = allRuns.length;
        document.getElementById('longestWave').textContent = `${Math.round(longestM)} m`;
        
        document.getElementById('fastestWave').textContent = maxWaveAvg > 0 ? `${maxWaveAvg.toFixed(1)} km/h` : "0.0 km/h";
        document.getElementById('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    // --- 4. MAP RENDERING ---
    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) { state.map.remove(); state.map = null; }
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);

        const showWavesOnly = elements.toggleWaveOnly.checked;
        const bgTrack = (state.lockedHeading !== null) ? state.filteredTrack : state.fullTrack;
        
        if (!showWavesOnly) L.polyline(bgTrack, {color: '#A0A0A0', weight: 2, opacity: 0.4}).addTo(state.map);
        if (state.waveTracks.length > 0) L.polyline(state.waveTracks, {color: '#000', weight: 3}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6, opacity: 0.9}).addTo(state.map);
        if (state.fastestTrack.length > 0) L.polyline(state.fastestTrack, {color: '#00BCD4', weight: 4, dashArray: '5, 10'}).addTo(state.map);

        const bounds = (showWavesOnly && state.waveTracks.length > 0) ? state.waveTracks : state.fullTrack;
        state.map.fitBounds(L.latLngBounds(bounds));
    }

    // --- 5. UI & PERSISTENCE ---
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
        
        document.getElementById('flightTime').textContent = `${data.flightTime} min`;
        document.getElementById('motorTime').textContent = `${data.motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${data.maxSpeed} km/h`;

        document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('longest-wave-card', 'fastest-wave-card'));
        
        calculateTracks(data);
        renderMap();

        const longestCard = document.getElementById('longestWave').closest('.metric-card');
        const fastestCard = document.getElementById('fastestWave').closest('.metric-card');
        if (longestCard) longestCard.classList.add('longest-wave-card');
        if (fastestCard) fastestCard.classList.add('fastest-wave-card');

        elements.dashboard.classList.remove('dashboard-hidden');
    }

    // --- 6. SYSTEM EVENTS: UPGRADED CANVAS SHARE GENERATOR ---
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
            if (!state.currentData || !state.fullTrack.length) {
                alert("Please load a session before sharing!");
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 675;
            const ctx = canvas.getContext('2d');

            const data = state.currentData;
            const waveCount = document.getElementById('waveCount').textContent;
            const longestWave = document.getElementById('longestWave').textContent;

            ctx.fillStyle = '#0a0a0c'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 1;
            for (let x = 0; x < 550; x += 40) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            for (let y = 0; y < canvas.height; y += 40) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(550, y); ctx.stroke();
            }

            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            state.fullTrack.forEach(pt => {
                if (pt[0] < minLat) minLat = pt[0]; if (pt[0] > maxLat) maxLat = pt[0];
                if (pt[1] < minLon) minLon = pt[1]; if (pt[1] > maxLon) maxLon = pt[1];
            });

            const latRange = maxLat - minLat;
            const lonRange = maxLon - minLon;
            const padding = 60;
            const mapW = 480, mapH = 500;

            function scaleX(lon) { return padding + ((lon - minLon) / lonRange) * (mapW - padding * 2); }
            function scaleY(lat) { return (canvas.height - padding) - ((lat - minLat) / latRange) * (mapH - padding * 2); }

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            state.fullTrack.forEach((pt, idx) => {
                const x = scaleX(pt[1]);
                const y = scaleY(pt[0]);
                if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();

            if (state.longestTrack && state.longestTrack.length > 0) {
                ctx.strokeStyle = '#D4AF37'; 
                ctx.lineWidth = 5;
                ctx.beginPath();
                state.longestTrack.forEach((pt, idx) => {
                    const x = scaleX(pt[1]);
                    const y = scaleY(pt[0]);
                    if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                });
                ctx.stroke();
            }

            ctx.strokeStyle = '#222226';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(580, 50); ctx.lineTo(580, canvas.height - 50); ctx.stroke(); 

            ctx.textBaseline = 'top';
            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#666';
            ctx.fillText('// SWELLPATH METRICS', 630, 75);

            ctx.font = '32px sans-serif';
            ctx.fillStyle = '#FFF';
            ctx.fillText(`${data.dateStr} — ${data.displayName}`, 630, 110);

            function drawMetricRow(label, value, color, yPos) {
                ctx.font = '16px monospace';
                ctx.fillStyle = '#888';
                ctx.fillText(label, 630, yPos);

                ctx.font = 'bold 36px sans-serif';
                ctx.fillStyle = color;
                ctx.fillText(value, 630, yPos + 22);

                ctx.strokeStyle = '#1c1c22';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(630, yPos + 70); ctx.lineTo(1120, yPos + 70); ctx.stroke();
            }

            drawMetricRow('⚡ MAX SPEED', `${data.maxSpeed} km/h`, '#00BCD4', 200);   
            drawMetricRow('🦅 GLIDE TIME (FLIGHT)', `${data.flightTime} min`, '#FFF', 300); 
            drawMetricRow('🌊 TOTAL RIDES', `${waveCount} Waves (Longest: ${longestWave})`, '#D4AF37', 400); 
            drawMetricRow('🔋 TOTAL BATTERY ENGAGEMENT', `${data.motorTime} min`, '#888', 500);

            const imgUrl = canvas.toDataURL('image/png');
            const container = document.getElementById('imageContainer');
            container.innerHTML = `<img src="${imgUrl}" style="max-width:100%; height:auto; border:1px solid #444; border-radius:6px;" alt="Session Graphic"/>`;
            
            document.getElementById('shareModal').style.display = 'flex';
        });
    }

    document.getElementById('closeShareBtn').addEventListener('click', () => {
        document.getElementById('shareModal').style.display = 'none';
    });

    // --- 7. HELPERS ---
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
