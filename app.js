document.addEventListener('DOMContentLoaded', function () {
    let state = {
        map: null, fullTrack: [], waveTracks: [], longestTrack: [], 
        fastestTrack: [], currentData: null, lockedHeading: null
    };
    function getEl(id) { return document.getElementById(id); }

    populateSavedSessions();

    // --- INTERACTION ---
    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-color)'; });
        dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = 'var(--border-color)');
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]); });
    }

    function handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const key = parseGPX(ev.target.result, file.name);
            populateSavedSessions();
            loadSession(key);
        };
        reader.readAsText(file);
    }

    // --- GPX LOGIC ---
    function parseGPX(xmlString, fileName) {
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
            let s = diff > 0 ? (d/diff)*3.6 : 0;
            rawSpeeds.push(s > 65 ? 0 : s);
        }
        let motorSec = 0, flightSec = 0;
        for (let i = 0; i < rawSpeeds.length; i++) {
            let window = rawSpeeds.slice(Math.max(0, i-2), i+3);
            let median = window.sort((a,b) => a-b)[Math.floor(window.length/2)] || 0;
            calibratedSpeeds.push(median * 0.92);
            let timeDiff = (times[i+1] - times[i]) / 1000;
            if (median * 0.92 > 2.0) motorSec += timeDiff;
            if (median * 0.92 >= 16.5) flightSec += timeDiff;
        }
        const data = {
            displayName: fileName.split('.')[0],
            dateStr: new Date(times[0]).toLocaleDateString('en-CA', {month:'short', day:'numeric'}),
            flightTime: Math.round(flightSec / 60), motorTime: Math.round(motorSec / 60),
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1), lats, lons, speeds: calibratedSpeeds, times
        };
        let key = `Swellpath_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.waveTracks = []; state.longestTrack = [];
        let allRuns = [], currentRun = [], totalD = 0;
        for (let i = 1; i < state.fullTrack.length; i++) {
            totalD += calculateDistance(state.fullTrack[i-1][0], state.fullTrack[i-1][1], state.fullTrack[i][0], state.fullTrack[i][1]);
            if (data.speeds[i] >= 16.5) currentRun.push(state.fullTrack[i]);
            else if (currentRun.length >= 6) { allRuns.push(currentRun); currentRun = []; }
        }
        let longestM = 0;
        allRuns.forEach(run => {
            let rd = 0;
            for(let j=1; j<run.length; j++) rd += calculateDistance(run[j-1][0], run[j-1][1], run[j][0], run[j][1]);
            if(rd > longestM) { longestM = rd; state.longestTrack = run; }
        });
        getEl('waveCount').textContent = allRuns.length;
        getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) { state.map.remove(); }
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        L.polyline(state.fullTrack, {color: '#A0A0A0', weight: 2}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6}).addTo(state.map);
        state.map.fitBounds(L.latLngBounds(state.fullTrack));
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        state.currentData = data;
        getEl('flightTime').textContent = `${data.flightTime} min`;
        getEl('motorTime').textContent = `${data.motorTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        calculateTracks(data);
        renderMap();
        getEl('dashboard').classList.remove('dashboard-hidden');
    }

    function populateSavedSessions() {
        const sel = getEl('savedSessions');
        sel.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(k => {
            let opt = document.createElement('option'); opt.value = k; opt.textContent = k; sel.appendChild(opt);
        });
    }

    // --- UPDATED BADGE GENERATOR ---
getEl('shareBtn')?.addEventListener('click', function() {
    if (!state.currentData) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const data = state.currentData;
    const loc = getEl('locationInput')?.value || "SESSION";
    
    // Background
    ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, 1080, 1350);

    // Text Header
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 64px Helvetica, sans-serif'; ctx.fillText("FOIL SESSION", 80, 120);
    ctx.fillStyle = '#888'; ctx.font = '32px Helvetica, sans-serif'; ctx.fillText(`${loc.toUpperCase()} • ${data.dateStr}`, 80, 180);

    // Map Drawing Logic
    let minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
    let minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
    const scale = Math.min(920 / (maxLon - minLon || 0.001), 400 / (maxLat - minLat || 0.001));
    const sX = (lon) => 80 + (lon - minLon) * scale;
    const sY = (lat) => 650 - (lat - minLat) * scale;

    ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
    ctx.beginPath();
    data.lats.forEach((lat, i) => i === 0 ? ctx.moveTo(sX(data.lons[i]), sY(lat)) : ctx.lineTo(sX(data.lons[i]), sY(lat)));
    ctx.stroke();

    // Gold Highlight for longest ride
    ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 6;
    ctx.beginPath();
    state.longestTrack.forEach((pt, i) => i === 0 ? ctx.moveTo(sX(pt[1]), sY(pt[0])) : ctx.lineTo(sX(pt[1]), sY(pt[0])));
    ctx.stroke();

    // Stats Grid
    const drawMetric = (label, val, x, y) => {
        ctx.fillStyle = '#666'; ctx.font = 'bold 24px Helvetica, sans-serif'; ctx.fillText(label, x, y);
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 48px Helvetica, sans-serif'; ctx.fillText(val, x, y + 60);
    };

    drawMetric('HERO RIDE', getEl('longestWave')?.textContent || '0m', 80, 850);
    drawMetric('MAX SPEED', `${data.maxSpeed} km/h`, 580, 850);
    drawMetric('WAVES', getEl('waveCount')?.textContent || '0', 80, 1050);
    drawMetric('FLIGHT', `${data.flightTime} min`, 580, 1050);
    drawMetric('MOTOR', `${data.motorTime} min`, 80, 1250);

    // Finalize
    const imgUrl = canvas.toDataURL('image/png');
    getEl('imageContainer').innerHTML = `<img src="${imgUrl}" style="width:100%; border-radius:8px;"/>`;
    getEl('shareModal').style.display = 'flex';
});
