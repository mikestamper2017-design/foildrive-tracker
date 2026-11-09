document.addEventListener('DOMContentLoaded', () => {
    let state = {
        map: null, fullTrack: [], waveTracks: [], longestTrack: [], 
        fastestTrack: {speed: 0}, currentData: null, outboundLeg: [], inboundLeg: []
    };

    function getEl(id) { return document.getElementById(id); }

    // --- INITIALIZATION ---
    populateSavedSessions();
    getEl('loadSessionBtn')?.addEventListener('click', () => {
        const key = getEl('savedSessions').value;
        if (key) loadSession(key);
    });

    getEl('toggleWaveOnly')?.addEventListener('change', () => { if (state.currentData) renderMap(); });

    // Replaced rigid heading lock with Smart Apex Run & Direction Splitter
    getEl('lockHeadingBtn')?.addEventListener('click', () => {
        if (state.fullTrack.length > 3 && state.currentData) {
            processApexLegs(state.currentData);
            renderMap();
            getEl('lockHeadingBtn').textContent = `Apex Legs Recalculated`;
            setTimeout(() => { getEl('lockHeadingBtn').textContent = `Auto-Detect Outbound/Inbound`; }, 2500);
        }
    });

    // Save gear changes automatically to active session
    ['locationInput', 'gearFoilDrive', 'gearFoil', 'gearWing'].forEach(id => {
        getEl(id)?.addEventListener('input', () => {
            if (state.currentData) {
                state.currentData.gear = {
                    location: getEl('locationInput')?.value || "",
                    drive: getEl('gearFoilDrive')?.value || "",
                    foil: getEl('gearFoil')?.value || "",
                    wing: getEl('gearWing')?.value || ""
                };
                // Update local storage in real time
                const activeKey = getEl('savedSessions').value;
                if (activeKey) localStorage.setItem(activeKey, JSON.stringify(state.currentData));
            }
        });
    });

    // --- FILE UPLOAD ---
    const dropZone = getEl('dropZone');
    const fileInput = getEl('fileInput');

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--brand-accent)'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--brand-primary)'; });
    dropZone.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        dropZone.style.borderColor = 'var(--brand-primary)'; 
        if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]); 
    });
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
        
        const totalSessionTime = Math.round((times[times.length - 1] - times[0]) / 60000);

        const data = {
            displayName: fileName.split('.')[0],
            dateStr: new Date(times[0]).toLocaleDateString('en-CA', {month:'short', day:'numeric'}),
            flightTime: Math.round(flightSec / 60), 
            motorTime: Math.round(motorSec / 60),
            totalSessionTime: totalSessionTime,
            maxSpeed: Math.max(...calibratedSpeeds).toFixed(1), 
            lats, lons, speeds: calibratedSpeeds, times, gear
        };
        let key = `Swellpath_${Date.now()}`;
        localStorage.setItem(key, JSON.stringify(data));
        return key;
    }

    // Smart Apex-Based Run Splitting (Fixes inbound/outbound accuracy)
    function processApexLegs(data) {
        state.fullTrack = data.lats.map((v, i) => [data.lats[i], data.lons[i]]);
        state.longestTrack = []; state.fastestTrack = {speed: 0}; state.waveTracks = [];
        let allRuns = [], currentRun = [], totalD = 0;
        
        if (state.fullTrack.length === 0) return;

        // Find distance apex (turnaround point from start)
        const startPoint = state.fullTrack[0];
        let maxDist = 0;
        let apexIndex = 0;
        state.fullTrack.forEach((pt, index) => {
            const dist = calculateDistance(startPoint[0], startPoint[1], pt[0], pt[1]);
            if (dist > maxDist) {
                maxDist = dist;
                apexIndex = index;
            }
        });

        // Separate outbound and inbound arrays
        state.outboundLeg = state.fullTrack.slice(0, apexIndex + 1);
        state.inboundLeg = state.fullTrack.slice(apexIndex);

        for (let i = 1; i < state.fullTrack.length; i++) {
            totalD += calculateDistance(state.fullTrack[i-1][0], state.fullTrack[i-1][1], state.fullTrack[i][0], state.fullTrack[i][1]);

            if (data.speeds[i] >= 16.5) {
                currentRun.push({coord: state.fullTrack[i], speed: data.speeds[i]});
            } else if (currentRun.length >= 6) {
                allRuns.push(currentRun); currentRun = [];
            }
        }
        if (currentRun.length >= 6) allRuns.push(currentRun);
        
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
        getEl('sessionTime').textContent = `${data.totalSessionTime} min`;
        getEl('maxSpeed').textContent = `${data.maxSpeed} km/h`;
        
        // Populate gear inputs
        if (data.gear) {
            getEl('locationInput').value = data.gear.location || '';
            getEl('gearFoilDrive').value = data.gear.drive || '';
            getEl('gearFoil').value = data.gear.foil || '';
            getEl('gearWing').value = data.gear.wing || '';
        }

        processApexLegs(data);
        renderMap();
        
        const d = getEl('dashboard');
        d.classList.remove('dashboard-hidden');
        d.style.display = 'grid';
    }

    function renderMap() {
        if (!state.fullTrack.length) return;
        if (state.map) state.map.remove();
        state.map = L.map('mapContainer').setView(state.fullTrack[0], 14);
        
        // Brighter marine tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
        }).addTo(state.map);

        const showOnlyWaves = getEl('toggleWaveOnly')?.checked;
        
        if (!showOnlyWaves) {
            // Render distinguished outbound vs inbound legs if desired, or full track
            L.polyline(state.outboundLeg, {color: '#0284c7', weight: 3, opacity: 0.6}).addTo(state.map);
            L.polyline(state.inboundLeg, {color: '#06b6d4', weight: 3, opacity: 0.6}).addTo(state.map);
        }

        L.polyline(state.waveTracks, {color: '#0284c7', weight: 4, opacity: 0.8}).addTo(state.map);
        if (state.longestTrack.length > 0) {
            L.polyline(state.longestTrack, {color: '#d97706', weight: 6, opacity: 1}).addTo(state.map);
        }
        
        state.map.fitBounds(L.latLngBounds(state.fullTrack));
    }

    // --- BADGE (Bright Marine Theme) ---
    getEl('closeShareModal')?.addEventListener('click', () => { getEl('shareModal').style.display = 'none'; });

    getEl('shareBtn')?.addEventListener('click', function() {
        if (!state.currentData) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        const data = state.currentData;
        
        // 1. Clean Brighter Background
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 1080, 1350);
        
        // 2. Header
        ctx.fillStyle = '#0f172a'; ctx.font = 'bold 72px -apple-system, sans-serif'; ctx.fillText("SWELLPATH", 80, 120);
        ctx.fillStyle = '#64748b'; ctx.font = 'bold 32px -apple-system, sans-serif'; 
        const loc = getEl('locationInput')?.value || 'LOCAL SESSION';
        ctx.fillText(`${loc.toUpperCase()} • ${data.dateStr}`, 80, 180);

        // 3. Map Schematic Box
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(80, 220, 920, 320);
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.strokeRect(80, 220, 920, 320);

        const minLat = Math.min(...data.lats), maxLat = Math.max(...data.lats);
        const minLon = Math.min(...data.lons), maxLon = Math.max(...data.lons);
        
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3;
        ctx.beginPath();
        data.lats.forEach((lat, i) => {
            const x = ((data.lons[i] - minLon) / (maxLon - minLon || 1)) * 800 + 140;
            const y = 500 - ((lat - minLat) / (maxLat - minLat || 1)) * 240;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        if (state.longestTrack.length > 0) {
            ctx.strokeStyle = '#0284c7'; ctx.lineWidth = 7;
            ctx.beginPath();
            state.longestTrack.forEach((coord, i) => {
                const x = ((coord[1] - minLon) / (maxLon - minLon || 1)) * 800 + 140;
                const y = 500 - ((coord[0] - minLat) / (maxLat - minLat || 1)) * 240;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        // 4. Stats Grid (Bright Card Backgrounds)
        const drawStatCard = (label, val, x, y) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x, y, 440, 110);
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 440, 110);

            ctx.fillStyle = '#64748b'; ctx.font = 'bold 20px -apple-system, sans-serif'; ctx.fillText(label, x + 24, y + 36);
            ctx.fillStyle = '#0f172a'; ctx.font = 'bold 42px -apple-system, sans-serif'; ctx.fillText(val, x + 24, y + 86);
        };
        
        drawStatCard('LONGEST WAVE', getEl('longestWave').textContent, 80, 580);
        drawStatCard('FASTEST WAVE', getEl('fastestWave').textContent, 560, 580);
        drawStatCard('MAX SPEED', getEl('maxSpeed').textContent, 80, 710);
        drawStatCard('TOTAL DISTANCE', getEl('totalDistance').textContent, 560, 710);
        drawStatCard('SESSION TIME', `${data.totalSessionTime} min`, 80, 840);
        drawStatCard('WAVE COUNT', getEl('waveCount').textContent, 560, 840);
        drawStatCard('FLIGHT TIME', `${data.flightTime} min`, 80, 970);
        drawStatCard('MOTOR TIME', `${data.motorTime} min`, 560, 970);

        // 5. Gear Details Strip (Bottom)
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 1110, 1080, 240);
        ctx.fillStyle = '#06b6d4'; ctx.font = 'bold 24px -apple-system, sans-serif'; ctx.fillText("GEAR & SETUP", 80, 1160);
        ctx.fillStyle = '#ffffff'; ctx.font = '28px -apple-system, sans-serif';
        ctx.fillText(`Drive: ${getEl('gearFoilDrive')?.value || 'None'}`, 80, 1210);
        ctx.fillText(`Foil: ${getEl('gearFoil')?.value || 'Standard'}`, 80, 1255);
        ctx.fillText(`Wing: ${getEl('gearWing')?.value || 'Standard'}`, 80, 1300);

        // Update Modal Preview
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

    function populateSavedSessions() {
        const sel = getEl('savedSessions');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Saved Sessions --</option>';
        Object.keys(localStorage).filter(k => k.startsWith('Swellpath_')).forEach(k => {
            let opt = document.createElement('option');
            opt.value = k;
            let rawData = JSON.parse(localStorage.getItem(k));
            opt.textContent = `${rawData.displayName || k.replace('Swellpath_', '')} (${rawData.dateStr || ''})`; 
            sel.appendChild(opt);
        });
    }
});
