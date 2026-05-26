document.addEventListener('DOMContentLoaded', function () {
    let state = {
        map: null, fullTrack: [], waveTracks: [], longestTrack: [], 
        fastestTrack: {speed: 0, run: []}, currentData: null, lockedHeading: null
    };
    function getEl(id) { return document.getElementById(id); }

    populateSavedSessions();

    // --- INTERACTION ---
    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]); });
    }

    function handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            // Include gear data from inputs when creating the session
            const gear = {
                wing: getEl('wingSizeInput')?.value || "N/A",
                mast: getEl('mastHeightInput')?.value || "N/A"
            };
            const key = parseGPX(ev.target.result, file.name, gear);
            populateSavedSessions();
            loadSession(key);
        };
        reader.readAsText(file);
    }

    // --- GPX LOGIC ---
    function parseGPX(xmlString, fileName, gear) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        let lats = [], lons = [], times = [], rawSpeeds = [], calibratedSpeeds = [];
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
            rawSpeeds.push(diff > 0 ? (d/diff)*3.6 : 0);
        }
        let motorSec = 0, flightSec = 0;
        for (let i = 0; i < rawSpeeds.length; i++) {
            let window = rawSpeeds.slice(Math.max(0, i-2), i+3);
            let median = window.sort((a,b) => a-b)[Math.floor(window.length/2)] || 0;
            let finalSpeed = median * 0.92;
            calibratedSpeeds.push(finalSpeed);
            let timeDiff = (times[i+1] - times[i]) / 1000;
            if (finalSpeed > 2.0) motorSec += timeDiff;
            if (finalSpeed >= 16.5) flightSec += timeDiff;
        }
        const data = {
            displayName: fileName.split('.')[0],
            dateStr: new Date(times[0]).toLocaleDateString('en-CA', {month:'short', day:'numeric'}),
            flightTime: Math.round(flightSec / 60), motorTime: Math.round(motorSec / 60),
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1), lats, lons, speeds: calibratedSpeeds, times,
            gear: gear // Gear saved into the session object
        };
        let key = `Swellpath_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    // --- TRACK ANALYTICS ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.longestTrack = []; state.fastestTrack = {speed: 0, run: []}; state.waveTracks = [];
        let allRuns = [], currentRun = [], totalD = 0;
        
        for (let i = 1; i < state.fullTrack.length; i++) {
            totalD += calculateDistance(state.fullTrack[i-1][0], state.fullTrack[i-1][1], state.fullTrack[i][0], state.fullTrack[i][1]);
            if (data.speeds[i] >= 16.5) currentRun.push({coord: state.fullTrack[i], speed: data.speeds[i]});
            else if (currentRun.length >= 6) { allRuns.push(currentRun); currentRun = []; }
        }
        
        let longestM = 0;
        allRuns.forEach(run => {
            let rd = 0, maxS = 0;
            for(let j=1; j<run.length; j++) {
                rd += calculateDistance(run[j-1].coord[0], run[j-1].coord[1], run[j].coord[0], run[j].coord[1]);
                maxS = Math.max(maxS, run[j].speed);
            }
            if(rd > longestM) { longestM = rd; state.longestTrack = run.map(p => p.coord); }
            if(maxS > state.fastestTrack.speed) state.fastestTrack.speed = maxS;
            state.waveTracks.push(...run.map(p => p.coord));
        });
        
        getEl('waveCount').textContent = allRuns.length;
        getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        getEl('fastestWave').textContent = `${state.fastestTrack.speed.toFixed(1)} km/h`;
        getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    // --- MAP & UI ---
    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) state.map.remove();
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        L.polyline((getEl('toggleWaveOnly')?.checked) ? state.waveTracks : state.fullTrack, {color: '#A0A0A0', weight: 2}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6}).addTo(state.map);
        state.map.fitBounds(L.latLngBounds(state.fullTrack));
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        state.currentData = data;
        getEl('flightTime').textContent = `${data.flightTime} min`;
        getEl('motorTime').textContent = `${data.motorTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        // Sync gear back to UI
        if(getEl('wingSizeInput')) getEl('wingSizeInput').value = data.gear.wing;
        if(getEl('mastHeightInput')) getEl('mastHeightInput').value = data.gear.mast;
        calculateTracks(data);
        renderMap();
        getEl('dashboard').classList.remove('dashboard-hidden');
    }

    // --- BADGE GENERATOR ---
    getEl('shareBtn')?.addEventListener('click', function() {
        if (!state.currentData) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        const data = state.currentData;
        const loc = getEl('locationInput')?.value || "SESSION";
        
        ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, 1080, 1350);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 64px Helvetica'; ctx.fillText("FOIL SESSION", 80, 120);
        ctx.fillStyle = '#888'; ctx.font = '32px Helvetica'; ctx.fillText(`${loc.toUpperCase()} • ${data.dateStr}`, 80, 180);

        // Map rendering... (simplified)
        let minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
        let minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
        const scale = Math.min(920 / (maxLon - minLon || 0.001), 400 / (maxLat - minLat || 0.001));
        const sX = (lon) => 80 + (lon - minLon) * scale;
        const sY = (lat) => 650 - (lat - minLat) * scale;

        ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
        ctx.beginPath(); data.lats.forEach((lat, i) => i === 0 ? ctx.moveTo(sX(data.lons[i]), sY(lat)) : ctx.lineTo(sX(data.lons[i]), sY(lat)));
        ctx.stroke();

        ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 6;
        ctx.beginPath(); state.longestTrack.forEach((pt, i) => i === 0 ? ctx.moveTo(sX(pt[1]), sY(pt[0])) : ctx.lineTo(sX(pt[1]), sY(pt[0])));
        ctx.stroke();

        const drawMetric = (label, val, x, y) => {
            ctx.fillStyle = '#666'; ctx.font = 'bold 24px Helvetica'; ctx.fillText(label, x, y);
            ctx.fillStyle = '#FFF'; ctx.font = 'bold 48px Helvetica'; ctx.fillText(val, x, y + 60);
        };

        drawMetric('HERO RIDE', getEl('longestWave')?.textContent || '0m', 80, 850);
        drawMetric('FASTEST', getEl('fastestWave')?.textContent || '0 km/h', 580, 850);
        drawMetric('WING/MAST', `${data.gear.wing} / ${data.gear.mast}`, 80, 1050);
        drawMetric('WAVES', getEl('waveCount')?.textContent || '0', 580, 1050);
        drawMetric('FLIGHT', `${data.flightTime} min`, 80, 1250);
        drawMetric('MAX SPD', `${data.maxSpeed} km/h`, 580, 1250);

        getEl('imageContainer').innerHTML = `<img src="${canvas.toDataURL('image/png')}" style="width:100%; border-radius:8px;"/>`;
        getEl('shareModal').style.display = 'flex';
    });

    // Helper stubs
    function calculateDistance(lat1, lon1, lat2, lon2) { /*...math...*/ return 0; } 
    function populateSavedSessions() { /*...localStorage logic...*/ }
});
