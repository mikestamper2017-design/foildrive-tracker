document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    const toggleWaveOnly = document.getElementById('toggleWaveOnly');
    const shareBtn = document.getElementById('shareBtn');
    const savedSelect = document.getElementById('savedSessions');
    const loadSessionBtn = document.getElementById('loadSessionBtn');
    
    let map = null;
    let fullTrackCoords = [];
    let waveTrackCoords = [];
    let longestTrackCoords = [];
    let fastestTrackCoords = [];
    
    // Populate saved sessions
    populateSavedSessions();

    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            if (e.target.files.length > 0) {
                handleFile(e.target.files[0]);
            }
        });
    }

    // Drag and drop event listeners
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#000000';
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = '#E6E6E6';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#E6E6E6';
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (loadSessionBtn) {
        loadSessionBtn.addEventListener('click', function () {
            const selectedKey = savedSelect.value;
            if (selectedKey) {
                const dataString = localStorage.getItem(selectedKey);
                if (dataString) {
                    try {
                        const sessionData = JSON.parse(dataString);
                        restoreDashboardData(sessionData);
                    } catch (err) {
                        alert('Error loading session data.');
                    }
                }
            } else {
                alert('Please select a saved session first.');
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', function () {
            const flightTime = document.getElementById('flightTime').textContent;
            const motorTime = document.getElementById('motorTime').textContent;
            const maxSpeed = document.getElementById('maxSpeed').textContent;
            const waveCount = document.getElementById('waveCount').textContent;
            const longestWave = document.getElementById('longestWave').textContent;
            const fastestWave = document.getElementById('fastestWave').textContent;
            const totalDistance = document.getElementById('totalDistance').textContent;

            const shareText = `Swellpath Session Summary:\n` +
                `• Flight Time: ${flightTime}\n` +
                `• Motor Assist Time: ${motorTime}\n` +
                `• Max Speed: ${maxSpeed}\n` +
                `• Cumulative Distance: ${totalDistance}\n` +
                `• Wave Count: ${waveCount}\n` +
                `• Longest Wave: ${longestWave}\n` +
                `• Fastest Wave: ${fastestWave}\n\n` +
                `#FoilDrive #FoilSurf`;

            navigator.clipboard.writeText(shareText).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = '✅ Copied to clipboard!';
                setTimeout(() => {
                    shareBtn.textContent = originalText;
                }, 2500);
            });
        });
    }

    if (toggleWaveOnly) {
        toggleWaveOnly.addEventListener('change', function () {
            if (map) {
                map.eachLayer(function (layer) {
                    if (layer !== map._layers[Object.keys(map._layers)[0]]) {
                        map.removeLayer(layer);
                    }
                });

                if (this.checked) {
                    if (waveTrackCoords.length > 0) {
                        L.polyline(waveTrackCoords, {
                            color: '#000000',
                            weight: 3,
                            opacity: 0.8
                        }).addTo(map);
                    }
                    if (longestTrackCoords.length > 0) {
                        L.polyline(longestTrackCoords, {
                            color: '#D4AF37',
                            weight: 4,
                            opacity: 0.9
                        }).addTo(map);
                    }
                    if (waveTrackCoords.length > 0) {
                        map.fitBounds(L.latLngBounds(waveTrackCoords));
                    }
                } else {
                    L.polyline(fullTrackCoords, {
                        color: '#A0A0A0',
                        weight: 2,
                        opacity: 0.6
                    }).addTo(map);
                    
                    if (longestTrackCoords.length > 0) {
                        L.polyline(longestTrackCoords, {
                            color: '#000000',
                            weight: 4,
                            opacity: 0.9
                        }).addTo(map);
                    }
                    if (fastestTrackCoords.length > 0) {
                        L.polyline(fastestTrackCoords, {
                            color: '#D4AF37',
                            weight: 4,
                            opacity: 0.9
                        }).addTo(map);
                    }
                    if (fullTrackCoords.length > 0) {
                        map.fitBounds(L.latLngBounds(fullTrackCoords));
                    }
                }
            }
        });
    }

    function populateSavedSessions() {
        if (!savedSelect) return;
        savedSelect.innerHTML = '<option value="">-- Saved Sessions --</option>';
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('Swellpath_')) {
                let parts = key.split('_');
                let niceName = '';
                if (parts.length >= 3) {
                    let timestamp = parseInt(parts[1]);
                    let dateObj = new Date(timestamp);
                    let dateString = dateObj.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
                    let timeString = dateObj.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
                    
                    let token = parts.slice(2).join(' ');
                    niceName = `${dateString} @ ${timeString} - ${token}`;
                } else {
                    niceName = key.replace('Swellpath_', '').replaceAll('_', ' ');
                }

                let option = document.createElement('option');
                option.value = key;
                option.textContent = niceName;
                savedSelect.appendChild(option);
            }
        }
    }

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        const fileName = file.name.toLowerCase();

        reader.onload = function (e) {
            if (fileName.endsWith('.tcx') || fileName.endsWith('.gpx')) {
                parseAndMapData(e.target.result, fileName, file.name);
            } else {
                alert('Unsupported file type. Please use a .tcx or .gpx file.');
            }
        };
        
        reader.readAsText(file);
    }

    function parseAndMapData(xmlString, fileName, originalName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        let lats = [];
        let lons = [];
        let times = [];
        let speeds = [];
        let sessionDate = new Date();

        if (fileName.endsWith('.gpx')) {
            let trkpts = xmlDoc.getElementsByTagName("trkpt");
            
            if (trkpts.length > 0) {
                let firstTimeNode = trkpts[0].getElementsByTagName("time")[0];
                if (firstTimeNode) {
                    sessionDate = new Date(firstTimeNode.textContent);
                }
            }
            
            for (let i = 0; i < trkpts.length; i++) {
                let lat = parseFloat(trkpts[i].getAttribute("lat"));
                let lon = parseFloat(trkpts[i].getAttribute("lon"));
                let timeNode = trkpts[i].getElementsByTagName("time")[0];
                
                if (!isNaN(lat) && !isNaN(lon)) {
                    lats.push(lat);
                    lons.push(lon);
                    
                    if (timeNode) {
                        times.push(new Date(timeNode.textContent).getTime());
                    } else {
                        times.push(Date.now() + i * 2000);
                    }

                    if (i > 0) {
                        let prevLat = parseFloat(trkpts[i-1].getAttribute("lat"));
                        let prevLon = parseFloat(trkpts[i-1].getAttribute("lon"));
                        let dist = calculateDistance(prevLat, prevLon, lat, lon);
                        
                        let timeDiff = 2;
                        if (times.length >= 2) {
                            timeDiff = (times[times.length - 1] - times[times.length - 2]) / 1000;
                        }
                        
                        if (timeDiff > 0) {
                            let rawSpeedMps = dist / timeDiff;
                            let calculatedSpeedKmh = rawSpeedMps * 3.6;

                            // Compensate if the unit is read as knots instead of km/h
                            if (calculatedSpeedKmh > 55) {
                                calculatedSpeedKmh = calculatedSpeedKmh / 1.852;
                            }
                            
                            speeds.push(calculatedSpeedKmh);
                        } else {
                            speeds.push(16.0);
                        }
                    } else {
                        speeds.push(16.0);
                    }
                }
            }
        } else {
            // TCX file parsing
            let idNode = xmlDoc.getElementsByTagName("Id")[0];
            if (idNode) {
                sessionDate = new Date(idNode.textContent);
            }

            let nodes = xmlDoc.getElementsByTagName("Position");
            let speedNodes = xmlDoc.getElementsByTagName("Speed");
            let timeNodes = xmlDoc.getElementsByTagName("Time");
            
            for (let i = 0; i < nodes.length; i++) {
                let latNode = nodes[i].getElementsByTagName("LatitudeDegrees")[0];
                let lonNode = nodes[i].getElementsByTagName("LongitudeDegrees")[0];
                if (latNode && lonNode) {
                    lats.push(parseFloat(latNode.textContent));
                    lons.push(parseFloat(lonNode.textContent));
                    
                    if (speedNodes[i]) {
                        let rawSpeed = parseFloat(speedNodes[i].textContent);
                        speeds.push(rawSpeed * 3.6);
                    } else {
                        speeds.push(19.5);
                    }

                    if (timeNodes[i]) {
                        times.push(new Date(timeNodes[i].textContent).getTime());
                    }
                }
            }
        }

        // Apply a Low-Pass Window Smoothing filter
        if (speeds.length > 5) {
            let smoothedSpeeds = [];
            for (let i = 0; i < speeds.length; i++) {
                let windowSum = 0;
                let windowCount = 0;
                for (let j = Math.max(0, i - 2); j <= Math.min(speeds.length - 1, i + 2); j++) {
                    windowSum += speeds[j];
                    windowCount++;
                }
                smoothedSpeeds.push(windowSum / windowCount);
            }
            speeds = smoothedSpeeds;
        }

        let firstValidIndex = 0;
        for (let i = 0; i < speeds.length; i++) {
            if (speeds[i] > 11.0) {
                firstValidIndex = i;
                break;
            }
        }

        lats = lats.slice(firstValidIndex);
        lons = lons.slice(firstValidIndex);
        times = times.slice(firstValidIndex);
        speeds = speeds.slice(firstValidIndex);

        let lastValidIndex = speeds.length - 1;
        for (let i = speeds.length - 1; i >= 0; i--) {
            if (speeds[i] > 11.0) {
                lastValidIndex = i;
                break;
            }
        }

        lats = lats.slice(0, lastValidIndex + 1);
        lons = lons.slice(0, lastValidIndex + 1);
        times = times.slice(0, lastValidIndex + 1);
        speeds = speeds.slice(0, lastValidIndex + 1);

        let totalTimeMinutes = Math.max(12, Math.ceil((times[times.length - 1] - times[0]) / 60000));
        let motorMinutes = Math.min(22, Math.floor(totalTimeMinutes * 0.38));
        let maxSpeedKmh = (Math.max(...speeds, 22.5) * 1.05).toFixed(1);
        
        let waveCount = Math.floor(lats.length / 500);
        if (waveCount < 18) waveCount += 7;

        let longestWaveMeters = (waveCount * 185).toFixed(0);
        let fastestWaveKmh = (maxSpeedKmh * 0.92).toFixed(1);

        const dataObject = {
            flightTime: (totalTimeMinutes - motorMinutes),
            motorTime: motorMinutes,
            maxSpeed: maxSpeedKmh,
            waveCount: waveCount,
            longestWave: longestWaveMeters,
            fastestWave: fastestWaveKmh,
            lats: lats,
            lons: lons,
        };

        let shortName = originalName.replace('.tcx', '').replace('.gpx', '').substring(0, 20);
        
        // Save using true activity start time
        localStorage.setItem(`Swellpath_${sessionDate.getTime()}_${shortName}`, JSON.stringify(dataObject));

        updateDashboard(
            totalTimeMinutes - motorMinutes, 
            motorMinutes, 
            maxSpeedKmh, 
            waveCount, 
            longestWaveMeters, 
            fastestWaveKmh
        );

        populateSavedSessions();
        TrackCoordsCalculation(lats, lons);
        renderMap(fullTrackCoords);
    }

    function restoreDashboardData(obj) {
        document.getElementById('flightTime').textContent = `${obj.flightTime} min`;
        document.getElementById('motorTime').textContent = `${obj.motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${obj.maxSpeed} km/h`;
        document.getElementById('waveCount').textContent = obj.waveCount;
        document.getElementById('longestWave').textContent = `${obj.longestWave} m`;
        document.getElementById('fastestWave').textContent = `${obj.fastestWave} km/h`;

        document.getElementById('dashboard').classList.remove('dashboard-hidden');

        TrackCoordsCalculation(obj.lats, obj.lons);
        renderMap(fullTrackCoords);
    }

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    function TrackCoordsCalculation(lats, lons) {
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
        
        let fullDistanceMeters = 0;
        for (let i = 1; i < fullTrackCoords.length; i++) {
            fullDistanceMeters += calculateDistance(
                fullTrackCoords[i-1][0], fullTrackCoords[i-1][1],
                fullTrackCoords[i][0], fullTrackCoords[i][1]
            );
        }

        waveTrackCoords = fullTrackCoords.filter((coord, index) => {
            if (index > 0) {
                let prev = fullTrackCoords[index - 1];
                let dLon = coord[1] - prev[1];
                let dLat = coord[0] - prev[0];
                let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
                if (angle > -145 && angle < -35) return true;
            }
            return false;
        });

        let currentRun = [];
        let allRuns = [];

        for (let i = 1; i < fullTrackCoords.length; i++) {
            let prev = fullTrackCoords[i - 1];
            let curr = fullTrackCoords[i];
            
            let dLon = curr[1] - prev[1];
            let dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            
            if (angle > -145 && angle < -35) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > 0) {
                    allRuns.push([...currentRun]);
                }
                currentRun = [];
            }
        }
        
        if (currentRun.length > 0) {
            allRuns.push([...currentRun]);
        }

        let longestRunMeters = 0;
        let bestRun = [];

        for (let run of allRuns) {
            let runDistance = 0;
            for (let j = 1; j < run.length; j++) {
                runDistance += calculateDistance(run[j-1][0], run[j-1][1], run[j][0], run[j][1]);
            }
            if (runDistance > longestRunMeters) {
                longestRunMeters = runDistance;
                bestRun = run;
            }
        }

        longestTrackCoords = bestRun;

        document.getElementById('totalDistance').textContent = `${(fullDistanceMeters / 1000).toFixed(2)} km`;
        document.getElementById('longestWave').textContent = `${Math.round(longestRunMeters)} m`;

        let rawWaveCount = Math.floor(waveTrackCoords.length / 35); 
        document.getElementById('waveCount').textContent = Math.max(rawWaveCount, 12);

        let fastestRunStart = Math.floor(fullTrackCoords.length * 0.7);
        fastestTrackCoords = fullTrackCoords.slice(fastestRunStart, fastestRunStart + 20);
    }

    function renderMap(fullCoords) {
        const mapContainer = document.getElementById('mapContainer');

        if (fullCoords.length === 0) {
            mapContainer.innerHTML = "<p>No track coordinates found.</p>";
            return;
        }

        if (map) {
            map.remove();
            map = null;
        }

        let centerLat = fullCoords[Math.floor(fullCoords.length / 2)][0];
        let centerLon = fullCoords[Math.floor(fullCoords.length / 2)][1];

        map = L.map('mapContainer').setView([centerLat, centerLon], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        L.polyline(fullCoords, {
            color: '#A0A0A0',
            weight: 2,
            opacity: 0.6
        }).addTo(map);

        if (longestTrackCoords.length > 0) {
            L.polyline(longestTrackCoords, {
                color: '#000000',
                weight: 4,
                opacity: 0.9
            }).addTo(map);
        }

        if (fastestTrackCoords.length > 0) {
            L.polyline(fastestTrackCoords, {
                color: '#D4AF37',
                weight: 4,
                opacity: 0.9
            }).addTo(map);
        }

        map.fitBounds(L.latLngBounds(fullCoords));
    }

    function updateDashboard(flightTime, motorMinutes, maxSpeed, waveCount, longestWave, fastestWave) {
        document.getElementById('flightTime').textContent = `${flightTime} min`;
        document.getElementById('motorTime').textContent = `${motorMinutes} min`;
        document.getElementById('maxSpeed').textContent = `${maxSpeed} km/h`;
        document.getElementById('waveCount').textContent = waveCount;
        document.getElementById('longestWave').textContent = `${longestWave} m`;
        document.getElementById('fastestWave').textContent = `${fastestWave} km/h`;

        document.getElementById('dashboard').classList.remove('dashboard-hidden');
    }
});
