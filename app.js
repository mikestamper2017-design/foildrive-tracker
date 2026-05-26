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
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-color)'; });
        dropZone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]); });
    }

    function handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
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

    // --- GPX PARSING ---
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
            gear: gear
        };
        let key = `Swellpath_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    // --- ANALYTICS ENGINE ---
    function calculateTracks(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.longestTrack = []; state.fastestTrack = {speed: 0}; state.waveTracks = [];
        let allRuns = [], currentRun = [], totalD = 0;
        
        for (let i = 1; i < state.fullTrack.length; i++) {
            totalD += calculateDistance(state.fullTrack[i-1][0], state.fullTrack[i-1][1], state.fullTrack[i][0], state.fullTrack[i][1]);
            
            let bearing = calculateBearing(state.fullTrack[i-1][0], state.fullTrack[i-1][1], state.fullTrack[i][0], state.fullTrack[i][1]);
            let headingValid = (state.lockedHeading === null || Math.abs(bearing - state.lockedHeading) < 45);

            if (data.speeds[i] >= 16.5 && headingValid) {
                currentRun.push({coord: state.fullTrack[i], speed: data.speeds[i]});
            } else if (currentRun.length >= 6) {
                allRuns.push(currentRun); currentRun = [];
            }
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
        
        // --- FORCE UI UPDATE ---
        if(getEl('waveCount')) getEl('waveCount').textContent = allRuns.length;
        if(getEl('longestWave')) getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        if(getEl('fastestWave')) getEl('fastestWave').textContent = `${state.fastestTrack.speed.toFixed(1)} km/h`;
        if(getEl('totalDistance')) getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if(!data) return;
        state.currentData = data;
        getEl('flightTime').textContent = `${data.flightTime} min`;
        getEl('motorTime').textContent = `${data.motorTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        if(getEl('wingSizeInput')) getEl('wingSizeInput').value = data.gear.wing;
        if(getEl('mastHeightInput')) getEl('mastHeightInput').value = data.gear.mast;
        
        calculateTracks(data);
        renderMap();
        getEl('dashboard').classList.remove('dashboard-hidden');
    }

    // --- MATH HELPERS ---
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
        const y = Math.sin((lon2-lon1)*Math.PI/180) * Math.cos(lat2*Math.PI/180);
        const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) - Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos((lon2-lon1)*Math.PI/180);
        return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
    }

    function populateSavedSessions() { /*...same as before...*/ }
    function renderMap() { /*...same as before...*/ }
    // ... Add back your shareBtn, closeShareModal listeners ...
});
