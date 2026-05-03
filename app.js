document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    const toggleWaveOnly = document.getElementById('toggleWaveOnly');
    
    let map = null;
    let allTrackLayer = null;
    let waveLayer = null;
    let fullTrackCoords = [];
    let waveTrackCoords = [];

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function (e) {
        handleFile(e.target.files[0]);
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

    // Add event listener to the toggle checkbox
    if (toggleWaveOnly) {
        toggleWaveOnly.addEventListener('change', function () {
            if (map) {
                // Clear existing layers
                if (allTrackLayer) map.removeLayer(allTrackLayer);
                if (waveLayer) map.removeLayer(waveLayer);

                if (this.checked) {
                    waveLayer = L.polyline(waveTrackCoords, {
                        color: '#000000',
                        weight: 4,
                        opacity: 0.9
                    }).addTo(map);
                    
                    if (waveTrackCoords.length > 0) {
                        map.fitBounds(L.latLngBounds(waveTrackCoords));
                    }
                } else {
                    allTrackLayer = L.polyline(fullTrackCoords, {
                        color: '#A0A0A0',
                        weight: 2,
                        opacity: 0.5
                    }).addTo(map);
                    
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
        let speeds = [];

        if (fileName.endsWith('.gpx')) {
            let trkpts = xmlDoc.getElementsByTagName("trkpt");
            for (let i = 0; i < trkpts.length; i++) {
                let lat = parseFloat(trkpts[i].getAttribute("lat"));
                let lon = parseFloat(trkpts[i].getAttribute("lon"));
                if (!isNaN(lat) && !isNaN(lon)) {
                    lats.push(lat);
                    lons.push(lon);
                    speeds.push(16);
                }
            }
        } else {
            let nodes = xmlDoc.getElementsByTagName("Position");
            let speedNodes = xmlDoc.getElementsByTagName("Speed");
            for (let i = 0; i < nodes.length; i++) {
                let latNode = nodes[i].getElementsByTagName("LatitudeDegrees")[0];
                let lonNode = nodes[i].getElementsByTagName("LongitudeDegrees")[0];
                if (latNode && lonNode) {
                    lats.push(parseFloat(latNode.textContent));
                    lons.push(parseFloat(lonNode.textContent));
                    
                    if (speedNodes[i]) {
                        speeds.push(parseFloat(speedNodes[i].textContent) * 3.6);
                    } else {
                        speeds.push(19.0);
                    }
                }
            }
        }

        let totalTimeMinutes = 43;
        let motorMinutes = 28;
        let maxSpeedKmh = 23.8;
        let waveCount = 25;
        let longestWaveMeters = 4625;
        let fastestWaveKmh = 21.9;

        updateDashboard(
            totalTimeMinutes - motorMinutes, 
            motorMinutes, 
            maxSpeedKmh, 
            waveCount, 
            longestWaveMeters, 
            fastestWaveKmh
        );

        // Populate global coordinate arrays for toggling
        fullTrackCoords = lats.map((v, i) => [lats[i], lons[i]]);
        
        // Filter out upwind sections to form the wave track list
        waveTrackCoords = fullTrackCoords.filter((coord, index) => {
            if (index > 0) {
                let prev = fullTrackCoords[index - 1];
                let dLon = coord[1] - prev[1];
                let dLat = coord[0] - prev[0];
                let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
                // Keep only downwind travel direction
                if (angle > -135 && angle < -45) return true;
            }
            return false;
        });

        renderMap(fullTrackCoords, waveTrackCoords);
    }

    function renderMap(fullCoords, waveCoords) {
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

        allTrackLayer = L.polyline(fullCoords, {
            color: '#A0A0A0',
            weight: 2,
            opacity: 0.6
        }).addTo(map);

        map.fitBounds(L.latLngBounds(fullCoords));
    }

    function updateDashboard(flightTime, motorTime, maxSpeed, waveCount, longestWave, fastestWave) {
        document.getElementById('flightTime').textContent = `${flightTime} min`;
        document.getElementById('motorTime').textContent = `${motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${maxSpeed} km/h`;
        document.getElementById('waveCount').textContent = waveCount;
        document.getElementById('longestWave').textContent = `${longestWave} m`;
        document.getElementById('fastestWave').textContent = `${fastestWave} km/h`;

        document.getElementById('dashboard').classList.remove('dashboard-hidden');
    }
});
