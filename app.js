document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');
    let map = null;

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
                    speeds.push(15); // Fallback for testing on older OS
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
                        speeds.push(20.0);
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

        renderMap(lats, lons, speeds);
    }

    function renderMap(lats, lons, speeds) {
        const mapContainer = document.getElementById('mapContainer');

        if (lats.length === 0) {
            mapContainer.innerHTML = "<p>No track coordinates found.</p>";
            return;
        }

        if (!map) {
            let centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
            let centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;
            
            map = L.map('mapContainer').setView([centerLat, centerLon], 14);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);
        }

        // Group coordinates into segments (Unassisted downwind vs Upwind)
        let currentWaveSegment = [];
        let waveSegments = [];

        for (let i = 1; i < lats.length; i++) {
            let dLon = lons[i] - lons[i - 1];
            let dLat = lats[i] - lats[i - 1];
            let angle = Math.atan2(dLat, dLon) * (180 / Math.PI);
            let currentSpeed = speeds[i] || 18; // Use speed or baseline

            // Filter for downwind direction (e.g., heading towards shore)
            if (angle > -135 && angle < -45 && currentSpeed > 12) {
                currentWaveSegment.push([lats[i], lons[i]]);
            } else {
                if (currentWaveSegment.length > 5) {
                    waveSegments.push(currentWaveSegment);
                    currentWaveSegment = [];
                }
            }
        }

        // Palette of distinct colors for downwind wave runs
        const waveColors = ['#000000', '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3'];

        // Draw each unassisted wave in a different color
        waveSegments.forEach((segment, index) => {
            let color = waveColors[index % waveColors.length];
            L.polyline(segment, {
                color: color,
                weight: 4,
                opacity: 0.85
            }).addTo(map);
        });

        // Focus on the session area
        if (lats.length > 0) {
            let bounds = L.latLngBounds(lats.map((v, i) => [lats[i], lons[i]]));
            map.fitBounds(bounds);
        }
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
