document.addEventListener('DOMContentLoaded', function () {
    let state = {
        map: null, fullTrack: [], filteredTrack: [], waveTracks: [],
        longestTrack: [], fastestTrack: [], currentData: null, lockedHeading: null
    };

    function getEl(id) { return document.getElementById(id); }

    // --- 1. PERSISTENCE ---
    if (getEl('gearFoilDrive')) getEl('gearFoilDrive').value = localStorage.getItem('swellpath_pref_foildrive') || '';
    if (getEl('gearFoil')) getEl('gearFoil').value = localStorage.getItem('swellpath_pref_foil') || '';
    if (getEl('gearWing')) getEl('gearWing').value = localStorage.getItem('swellpath_pref_wing') || '';

    // --- 2. PHYSICS ENGINE ---
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

    // --- 3. PARSER ---
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

    // --- 4. ANALYTICS ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.waveTracks = []; state.filteredTrack = []; let currentRun = [], allRuns = [], totalD = 0;
        
        for (let i = 1; i < state.fullTrack.length; i++) {
            let p1 = state.fullTrack[i-1], p2 = state.fullTrack[i];
            totalD += calculateDistance(p1[0], p1[1], p2[0], p2[1]);
            let brng = calculateBearing(p1[0], p1[1], p2[0], p2[1]);
            let isOutbound = (state.lockedHeading !== null && Math.abs(brng - state.lockedHeading) % 180 < 50);
            if (!isOutbound) state.filteredTrack.push(p2);
            if (!isOutbound && data.speeds[i] >= 16.5) currentRun.push({coord: p2, speed: data.speeds[i]});
            else if (currentRun.length >= 6) { allRuns.push([...currentRun]); currentRun = []; }
        }

        let longestM = 0, maxWaveAvg = 0;
        allRuns.forEach(run => {
            let rd = 0;
            for (let j=1; j<run.length; j++) rd += calculateDistance(run[j-1].coord[0], run[j-1].coord[1], run[j].coord[0], run[j].coord[1]);
            if (rd > longestM) { longestM = rd; state.longestTrack = run.map(r => r.coord); }
            let avgS = run.reduce((s, p) => s + p.speed, 0) / run.length;
            if (avgS > maxWaveAvg) { maxWaveAvg = avgS; state.fastestTrack = run.map(r => r.coord); }
        });

        getEl('waveCount').textContent = allRuns.length;
        getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
        getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        getEl('fastestWave').textContent = `${maxWaveAvg.toFixed(1)} km/h`;
        renderMap();
    }

    function renderMap() {
        if (!state.fullTrack.length || !getEl('mapContainer')) return;
        if (state.map) state.map.remove();
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        const polyline = L.polyline(getEl('toggleWaveOnly').checked ? state.waveTracks : state.fullTrack, {color: '#D4AF37', weight: 3}).addTo(state.map);
        state.map.fitBounds(polyline.getBounds());
    }

    // --- 5. SHARE BADGE ---
    function generateBadge() {
        const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 80px sans-serif'; ctx.fillText('SWELLPATH', 80, 150);
        ctx.fillStyle = '#D4AF37'; ctx.font = '30px sans-serif'; ctx.fillText('SESSION ANALYTICS', 80, 200);
        ctx.fillStyle = '#FFF'; ctx.font = '60px sans-serif';
        ctx.fillText(`Flight Time: ${state.currentData.flightTime} min`, 80, 400);
        ctx.fillText(`Max Speed: ${state.currentData.maxSpeed} km/h`, 80, 500);
        ctx.fillText(`Waves: ${getEl('waveCount').textContent}`, 80, 600);
        ctx.fillStyle = '#888'; ctx.font = '40px sans-serif';
        ctx.fillText(`Foil: ${getEl('gearFoil').value}`, 80, 850);
        ctx.fillText(`Drive: ${getEl('gearFoilDrive').value}`, 80, 920);
        getEl('imageContainer').innerHTML = '';
        const img = document.createElement('img'); img.src = canvas.toDataURL('image/png');
        getEl('imageContainer').appendChild(img);
        getEl('shareModal').style.display = 'flex';
    }

    // --- 6. INITIALIZATION & LISTENERS ---
    getEl('fileInput').addEventListener('change', (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => { const key = parseGPX(ev.target.result, e.target.files[0].name); loadSession(key); };
        reader.readAsText(e.target.files[0]);
    });

    getEl('shareBtn').addEventListener('click', generateBadge);
    
    function loadSession(key) {
        state.currentData = JSON.parse(localStorage.getItem(key));
        getEl('dashboard').classList.remove('dashboard-hidden');
        getEl('flightTime').textContent = state.currentData.flightTime + " min";
        getEl('motorTime').textContent = state.currentData.motorTime + " min";
        getEl('maxSpeed').textContent = state.currentData.maxSpeed + " km/h";
        calculateTracks(state.currentData);
    }
    function populateSavedSessions() {
        const sel = getEl('savedSessions');
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(k => {
            let opt = document.createElement('option'); opt.value = k; opt.textContent = k; sel.appendChild(opt);
        });
    }
    populateSavedSessions();
});
