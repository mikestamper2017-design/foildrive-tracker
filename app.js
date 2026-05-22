document.addEventListener('DOMContentLoaded', function () {
    let state = {
        map: null, fullTrack: [], filteredTrack: [], waveTracks: [],
        longestTrack: [], fastestTrack: [], currentData: null, lockedHeading: null
    };

    function getEl(id) { return document.getElementById(id); }

    // --- 1. PERSISTENCE: Restore User Gear Preferences ---
    if (getEl('gearFoilDrive')) getEl('gearFoilDrive').value = localStorage.getItem('swellpath_pref_foildrive') || '';
    if (getEl('gearFoil')) getEl('gearFoil').value = localStorage.getItem('swellpath_pref_foil') || '';
    if (getEl('gearWing')) getEl('gearWing').value = localStorage.getItem('swellpath_pref_wing') || '';

    // --- 2. MATH & PHYSICS ENGINE ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
        const y = Math.sin(lon2 - lon1) * Math.cos(lat2 * Math.PI/180);
        const x = Math.cos(lat1 * Math.PI/180) * Math.sin(lat2 * Math.PI/180) - Math.sin(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.cos((lon2-lon1) * Math.PI/180);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    // --- 3. GPX PARSING ---
    function parseGPX(xmlString, fileName) {
        const xmlDoc = new DOMParser().parseFromString(xmlString, "text/xml");
        let lats=[], lons=[], times=[], rawSpeeds=[];
        xmlDoc.querySelectorAll('trkpt, Trackpoint, wpt').forEach(node => {
            let lat = node.getAttribute('lat') || node.querySelector('lat')?.textContent;
            let lon = node.getAttribute('lon') || node.querySelector('lon')?.textContent;
            let timeNode = node.querySelector('time') || node.querySelector('Time');
            if (lat && lon) {
                lats.push(parseFloat(lat)); lons.push(parseFloat(lon));
                times.push(timeNode ? new Date(timeNode.textContent).getTime() : 0);
            }
        });
        
        for (let i = 1; i < lats.length; i++) {
            let dist = calculateDistance(lats[i-1], lons[i-1], lats[i], lons[i]);
            let t = (times[i] - times[i-1]) / 1000;
            rawSpeeds.push(t > 0 ? (dist / t) * 3.6 : 0);
        }

        let motorSec=0, flightSec=0, calibratedSpeeds = [];
        rawSpeeds.forEach((s, i) => {
            let win = rawSpeeds.slice(Math.max(0, i-2), i+3).sort((a,b)=>a-b);
            let finalSpeed = (win[Math.floor(win.length/2)] || 0) * 0.92;
            calibratedSpeeds.push(finalSpeed);
            let t = (times[i+1] - times[i]) / 1000 || 1;
            if (finalSpeed > 2.0) motorSec += t;
            if (finalSpeed >= 16.5) flightSec += t;
        });

        const data = { displayName: fileName.replace('.gpx', ''), dateStr: new Date(times[0]).toLocaleDateString('en-CA'), flightTime: Math.round(flightSec/60), motorTime: Math.round(motorSec/60), maxSpeed: Math.max(0, ...calibratedSpeeds).toFixed(1), lats, lons, speeds: calibratedSpeeds, times };
        const key = `Swellpath_${times[0] || Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    // --- 4. ANALYTICS & RENDERING ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.waveTracks = []; state.filteredTrack = [];
        let currentRun = [], allRuns = [];
        
        for (let i = 1; i < state.fullTrack.length; i++) {
            let p1 = state.fullTrack[i-1], p2 = state.fullTrack[i];
            let brng = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            let isOutbound = (state.lockedHeading !== null && Math.abs(brng - state.lockedHeading) % 180 < 50);
            if (!isOutbound) state.filteredTrack.push(p2);
            
            if (!isOutbound && data.speeds[i] >= 16.5) currentRun.push(p2);
            else if (currentRun.length >= 6) { allRuns.push([...currentRun]); currentRun = []; }
        }
        state.waveTracks = allRuns.flat();
        renderMap();
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) state.map.remove();
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        const showWavesOnly = getEl('toggleWaveOnly').checked;
        const polyline = L.polyline(showWavesOnly ? state.waveTracks : state.fullTrack, {color: '#D4AF37', weight: 3}).addTo(state.map);
        state.map.fitBounds(polyline.getBounds());
    }

    // --- 5. SHARE BADGE GENERATOR ---
    function generateBadge() {
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#16161a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // ... (Include your specific text drawing and logo drawing commands here)
        getEl('imageContainer').innerHTML = '';
        getEl('imageContainer').appendChild(canvas);
        getEl('shareModal').style.display = 'flex';
    }

    // --- 6. EVENT LISTENERS ---
    getEl('fileInput').addEventListener('change', (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const key = parseGPX(ev.target.result, e.target.files[0].name);
            loadSession(key);
        };
        reader.readAsText(e.target.files[0]);
    });

    getEl('shareBtn').addEventListener('click', generateBadge);
    
    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        state.currentData = data;
        getEl('dashboard').classList.remove('dashboard-hidden');
        getEl('flightTime').textContent = data.flightTime + " min";
        getEl('motorTime').textContent = data.motorTime + " min";
        getEl('maxSpeed').textContent = data.maxSpeed + " km/h";
        calculateTracks(data);
    }

    function populateSavedSessions() {
        const sel = getEl('savedSessions');
        sel.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(k => {
            let opt = document.createElement('option');
            opt.value = k; opt.textContent = k.replace('Swellpath_', '');
            sel.appendChild(opt);
        });
    }
    populateSavedSessions();
});
