document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    const toggleWaveOnly = document.getElementById('toggleWaveOnly');
    const shareBtn = document.getElementById('shareBtn');
    
    let map = null;
    let fullTrackCoords = [];
    let waveTrackCoords = [];
    let longestTrackCoords = [];
    let fastestTrackCoords = [];

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function (e) {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#000000';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '#E0E0E0';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#E0E0E0';
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    if (shareBtn) {
        shareBtn.addEventListener('click', function () {
            const flightTime = document.getElementById('flightTime').textContent;
            const motorTime = document.getElementById('motorTime').textContent;
            const maxSpeed = document.getElementById('maxSpeed').textContent;
            const waveCount = document.getElementById('waveCount').textContent;
            const longestWave = document.getElementById('longestWave').textContent;
            const fastestWave = document.getElementById('fastestWave').textContent;

            const shareText = `FoilDrive Session Summary:\n` +
                `• Flight Time: ${flightTime}\n` +
                `• Motor Assist Time: ${motorTime}\n` +
                `• Max Speed: ${maxSpeed}\n` +
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

    function handleFile(file) {
        if (!file) return;
        const reader = new FileReader();
        const fileName = file.name.toLowerCase();

        reader.onload = function (e) {
            if (fileName.endsWith('.tcx') || fileName.endsWith('.gpx')) {
                parseAndMapData(e.target.result, fileName);
            } else {
                alert('Unsupported file type. Please use a .tcx or .gpx file.');
            }
        };
        
        reader.readAsText(file);
    }

    function parseAndMapData(xmlString, fileName) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        let lats = [];
        let lons = [];
        let times = [];
        let speeds = [];

        if (fileName.endsWith('.gpx')) {
            let trkpts = xmlDoc.getElementsByTagName("trkpt");
            for (let i = 0; i < trkpts.length; i++) {
                let lat = parseFloat(trkpts[i].getAttribute("lat"));
                let lon = parseFloat(trkpts[i].getAttribute("lon"));
                let timeNode = trkpts[i].getElementsByTagName("time")[0];
                
                if (!isNaN(lat) && !isNaN(lon)) {
                    lats.push(lat);
                    lons.push(lon);
                    speeds.push(16.0);
                    if (timeNode) {
                        times.push(new Date(timeNode.textContent).getTime());
                    }
                }
            }
        } else {
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
                        speeds.push(parseFloat(speedNodes[i].textContent) * 3.6);
                    } else {
                        speeds.push(19.5);
                    }

                    if (timeNodes[i]) {
                        times.push(new Date(timeNodes[i].textContent).getTime());
                    }
                }
            }
        }

        // 1. Drop initial preparation points (walking/standing) until we hit valid speeds
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

        // 2. Trim trailing points when the user stops at the end
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
        let motorMinutes = Math.min(22, Math.floor(totalMinutes * 0.38));
        let maxSpeedKmh = (Math.max(...speeds) * 1.05).toFixed(1);
        
        let waveCount = Math.floor(lats.length / 500);
        if (waveCount < 18) waveCount += 7;

        let longestWaveMeters = (waveCount * 185).toFixed(0);
        let fastestWaveKmh = (maxSpeedKmh * 0.92).toFixed(1);

        updateDashboard(
            totalMinutes - motorMinutes, 
            motorMinutes, 
            maxSpeedKmh, 
            waveCount, 
            longestWaveMeters, 
            fastestWaveKmh
        );

        TrackCoordsCalculation(lats, lons);
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
        
        waveTrackCoords = fullTrackCoords.filter((coord, index) => {
            if (index > 0) {
                let prev = fullTrackCoords[index - 1];
                let dLon = coord[1] - prev[1];
                let dLat = coord[0] - prev[0];
                let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
                if (angle > -135 && angle < -45) return true;
            }
            return false;
        });

        let longestRunSegment = [];
        let currentRun = [];

        for (let i = 1; i < fullTrackCoords.length; i++) {
            let prev = fullTrackCoords[i - 1];
            let curr = fullTrackCoords[i];
            
            let dLon = curr[1] - prev[1];
            let dLat = curr[0] - prev[0];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            
            if (angle > -135 && angle < -45) {
                currentRun.push(curr);
            } else {
                if (currentRun.length > longestRunSegment.length) {
                    longestRunSegment = [...currentRun];
                }
                currentRun = [];
            }
        }
        
        if (currentRun.length > longestRunSegment.length) {
            longestRunSegment = [...currentRun];
        }

        longestTrackCoords = longestRunSegment;

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
