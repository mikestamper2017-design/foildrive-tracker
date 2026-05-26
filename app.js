document.addEventListener('DOMContentLoaded', function () {
    let state = {
        map: null,
        fullTrack: [],
        waveTracks: [],
        longestTrack: [],
        currentData: null,
        lockedHeading: null
    };

    function getEl(id) { return document.getElementById(id); }

    // --- INITIALIZATION ---
    populateSavedSessions();

    // --- INTERACTION ---
    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
        });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-color)'; });
        dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = 'var(--border-color)');
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
        });
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

    // --- GPX PARSING & CALCULATIONS ---
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
            flightTime: Math.round(flightSec / 60),
            motorTime: Math.round(motorSec / 60),
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1),
            lats, lons, speeds: calibratedSpeeds, times
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
        state.longestTrack = state.fullTrack; // Simplified logic for demo
        if (getEl('waveCount')) getEl('waveCount').textContent = "---";
        if (getEl('longestWave')) getEl('longestWave').textContent = "---";
        if (getEl('totalDistance')) getEl('totalDistance').textContent = "---";
    }

    function populateSavedSessions() {
        const savedSelect = getEl('savedSessions');
        if (!savedSelect) return;
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(key => {
            let opt = document.createElement('option'); opt.value = key; opt.textContent = key;
            savedSelect.appendChild(opt);
        });
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if (!data) return;
        state.currentData = data;
        getEl('flightTime').textContent = `${data.flightTime} min`;
        getEl('motorTime').textContent = `${data.motorTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        calculateTracks(data);
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
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 64px Helvetica, sans-serif'; ctx.fillText("FOIL SESSION", 80, 120);
        ctx.fillStyle = '#888'; ctx.font = '32px Helvetica, sans-serif'; ctx.fillText(`${loc.toUpperCase()} • ${data.dateStr}`, 80, 180);

        // Simple render of the track
        let minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
        let minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
        const scale = Math.min(920 / (maxLon - minLon || 0.001), 400 / (maxLat - minLat || 0.001));
        const sX = (lon) => 80 + (lon - minLon) * scale;
        const sY = (lat) => 650 - (lat - minLat) * scale;

        ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 6;
        ctx.beginPath();
        data.lats.forEach((lat, i) => i === 0 ? ctx.moveTo(sX(data.lons[i]), sY(lat)) : ctx.lineTo(sX(data.lons[i]), sY(lat)));
        ctx.stroke();

        ctx.fillStyle = '#FFF'; ctx.font = 'bold 48px Helvetica, sans-serif';
        ctx.fillText("HERO RIDE", 80, 850); ctx.fillText(`${data.maxSpeed} km/h`, 80, 910);

        getEl('imageContainer').innerHTML = `<img src="${canvas.toDataURL('image/png')}" style="width:100%; border-radius:8px;"/>`;
        getEl('shareModal').style.display = 'flex';
    });

    getEl('closeShareModal')?.addEventListener('click', () => getEl('shareModal').style.display = 'none');
});
