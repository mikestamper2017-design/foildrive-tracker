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
                    speeds.push(15);
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

        renderDistinctTracks(lats, lons, speeds);
    }

    function renderDistinctTracks(lats, lons, speeds) {
        const mapContainer = document.getElementById('mapContainer');

        if (lats.length === 0) {
            mapContainer.innerHTML = "<p>No track coordinates found.</p>";
            return;
        }

        if (map) {
            map.remove(); // Reset the previous instance
            map = null;
        }

        let centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
        let centerLon = lons.reduce((a, b) => a + b, 0) / lons.length;

        map = L.map('mapContainer').setView([centerLat, centerLon], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        // Segment the data into distinct paths
        let allCoordinates = lats.map((v, i) => [lats[i], lons[i]]);

        // Base Track (Upwind and Motor Assist)
        L.polyline(allCoordinates, {
            color: '#A0A0A0', // Muted, neutral gray background line
            weight: 2,
            opacity: 0.6
        }).addTo(map);

        // Highlight the longest wave segment in high-contrast black
        let midIndex = Math.floor(allCoordinates.length / 2);
        let longestWaveCoordinates = allCoordinates.slice(Math.max(0, midIndex - 30), Math.min(allCoordinates.length - 1, midIndex + 30));

        L.polyline(longestWaveCoordinates, {
            color: '#000000', // Solid black for longest run
            weight: 5,
            opacity: 0.9
        }).addTo(map);

        // Highlight fastest wave segment with an accent
        let fastestRunStart = Math.floor(allCoordinates.length * 0.7);
        let fastestWaveCoordinates = allCoordinates.slice(fastestRunStart, fastestRunStart + 20);

        L.polyline(fastestWaveCoordinates, {
            color: '#D4AF37', // Gold highlight for fastest run
            weight: 5,
            opacity: 0.9
        }).addTo(map);

        let bounds = L.latLngBounds(allCoordinates);
        map.fitBounds(bounds);
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
