document.addEventListener('DOMContentLoaded', () => {
    let state = {
        map: null, fullTrack: [], waveTracks: [], longestTrack: [], 
        fastestTrack: {speed: 0}, currentData: null, lockedHeading: null
    };

    function getEl(id) { return document.getElementById(id); }

    // --- INITIALIZATION ---
    populateSavedSessions();
    getEl('loadSessionBtn')?.addEventListener('click', () => {
        const key = getEl('savedSessions').value;
        if (key) loadSession(key);
    });

    getEl('toggleWaveOnly')?.addEventListener('change', () => { if (state.currentData) renderMap(); });

    getEl('lockHeadingBtn')?.addEventListener('click', () => {
        if (state.fullTrack.length > 1) {
            state.lockedHeading = calculateBearing(state.fullTrack[0][0], state.fullTrack[0][1], state.fullTrack[1][0], state.fullTrack[1][1]);
            getEl('lockHeadingBtn').textContent = `Heading Locked: ${Math.round(state.lockedHeading)}°`;
            if (state.currentData) { calculateTracks(state.currentData); renderMap(); }
        }
    });

    // --- FILE UPLOAD ---
    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--accent-color)'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--border-color)'; });
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--border-color)'; if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFileUpload(e.target.files[0]); });

    function handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const gear = {
                location: getEl('locationInput')?.value || "",
                drive: getEl('gearFoilDrive')?.value || "",
                foil: getEl('gearFoil')?.value || "",
                wing: getEl('gearWing')?.value || ""
            };
            const key = parseGPX(ev.target.result, file.name, gear);
            if (key) { populateSavedSessions(); loadSession(key); }
        };
        reader.readAsText(file);
    }

    // --- CORE LOGIC ---
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
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1), lats, lons, speeds: calibratedSpeeds, times, gear
        };
        let key = `Swellpath_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

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
        
        getEl('waveCount').textContent = allRuns.length;
        getEl('longestWave').textContent = `${Math.round(longestM)} m`;
        getEl('fastestWave').textContent = `${state.fastestTrack.speed.toFixed(1)} km/h`;
        getEl('totalDistance').textContent = `${(totalD / 1000).toFixed(2)} km`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
    }

    function loadSession(key) {
        const data = JSON.parse(localStorage.getItem(key));
        if(!data) return;
        state.currentData = data;
        getEl('flightTime').textContent = `${data.flightTime} min`;
        getEl('motorTime').textContent = `${data.motorTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        getEl('locationInput').value = data.gear.location;
        getEl('gearFoilDrive').value = data.gear.drive;
        getEl('gearFoil').value = data.gear.foil;
        getEl('gearWing').value = data.gear.wing;
        calculateTracks(data);
        renderMap();
        const d = getEl('dashboard');
        d.classList.remove('dashboard-hidden');
        d.style.display = 'grid';
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) state.map.remove();
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(state.map);
        const showOnlyWaves = getEl('toggleWaveOnly')?.checked;
        L.polyline(showOnlyWaves ? state.waveTracks : state.fullTrack, {color: '#A0A0A0', weight: 2}).addTo(state.map);
        if (state.longestTrack.length > 0) L.polyline(state.longestTrack, {color: '#D4AF37', weight: 6}).addTo(state.map);
        state.map.fitBounds(L.latLngBounds(state.fullTrack));
    }

    // --- BADGE ---
    getEl('closeShareModal')?.addEventListener('click', () => { getEl('shareModal').style.display = 'none'; });

    getEl('shareBtn')?.addEventListener('click', function() {
        if (!state.currentData) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        const data = state.currentData;
        
        // 1. Background
        ctx.fillStyle = '#0a0d14'; ctx.fillRect(0, 0, 1080, 1350);
        
        // 2. Header & Location (Top)
        ctx.fillStyle = '#FFF'; ctx.font = 'bold 72px Helvetica'; ctx.fillText("FOIL SESSION", 80, 120);
        ctx.fillStyle = '#888'; ctx.font = '36px Helvetica'; 
        // Pulls location directly from data.gear
        ctx.fillText(`${data.gear.location.toUpperCase() || 'UNKNOWN'} • ${data.dateStr}`, 80, 180);

        // 3. Map Route (Middle - Y constrained to 250-550)
        const minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
        const minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
        
        ctx.strokeStyle = '#333'; ctx.lineWidth = 4;
        ctx.beginPath();
        data.lats.forEach((lat, i) => {
            const x = ((data.lons[i] - minLon) / (maxLon - minLon || 1)) * 800 + 140;
            const y = 400 - ((lat - minLat) / (maxLat - minLat || 1)) * 250;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        if (state.longestTrack.length > 0) {
            ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 8;
            ctx.beginPath();
            state.longestTrack.forEach((coord, i) => {
                const x = ((coord[1] - minLon) / (maxLon - minLon || 1)) * 800 + 140;
                const y = 400 - ((coord[0] - minLat) / (maxLat - minLat || 1)) * 250;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // 4. Main Stats (Shifted down to start below map)
        const drawBig = (label, val, x, y) => {
            ctx.fillStyle = '#666'; ctx.font = 'bold 24px Helvetica'; ctx.fillText(label, x, y);
            ctx.fillStyle = '#FFF'; ctx.font = 'bold 48px Helvetica'; ctx.fillText(val, x, y + 50);
        };
        
        drawBig('HERO RIDE', getEl('longestWave').textContent, 80, 550);
        drawBig('FASTEST', getEl('fastestWave').textContent, 550, 550);
        drawBig('MAX SPEED', getEl('maxSpeed').textContent, 80, 700);
        drawBig('TOTAL DIST', getEl('totalDistance').textContent, 550, 700);
        drawBig('WAVES', getEl('waveCount').textContent, 80, 850);
        drawBig('FLIGHT', `${data.flightTime} min`, 550, 850);

        // 5. Gear Details (Bottom Strip)
        ctx.fillStyle = '#222'; ctx.fillRect(0, 1000, 1080, 350);
        ctx.fillStyle = '#D4AF37'; ctx.font = 'bold 28px Helvetica'; ctx.fillText("SETUP", 80, 1060);
        ctx.fillStyle = '#FFF'; ctx.font = '36px Helvetica';
        ctx.fillText(`DRIVE: ${data.gear.drive || '-'}`, 80, 1120);
        ctx.fillText(`FOIL: ${data.gear.foil || '-'}`, 80, 1180);
        ctx.fillText(`WING: ${data.gear.wing || '-'}`, 80, 1240);

        // Update Modal
        const imageContainer = getEl('imageContainer');
        imageContainer.innerHTML = '';
        const img = new Image();
        img.src = canvas.toDataURL('image/png');
        img.style.width = '100%'; img.style.borderRadius = '12px';
        imageContainer.appendChild(img);
        getEl('shareModal').style.display = 'flex';
    });

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

    function populateSavedSessions() {
        const sel = getEl('savedSessions');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(k => {
            let opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k.replace('Swellpath_', ''); 
            sel.appendChild(opt);
        });
    }
});
