document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');

    // Make the drop zone clickable
    dropZone.addEventListener('click', () => fileInput.click());

    // Handle file selection via input
    fileInput.addEventListener('change', function (e) {
        handleFile(e.target.files[0]);
    });

    // Handle drag and drop events
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

        // Check file extension
        if (file.name.endsWith('.gpx')) {
            reader.onload = function (e) {
                parseGpx(e.target.result);
            };
            reader.readAsText(file);
        } else if (file.name.endsWith('.tcx')) {
            reader.onload = function (e) {
                parseTcx(e.target.result);
            };
            reader.readAsText(file);
        } else {
            alert('Please select a valid GPX or TCX file.');
        }
    }

    function parseGpx(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const trkpts = xmlDoc.getElementsByTagName("trkpt");

        let totalTimeMinutes = 0;
        let motorMinutes = 0;
        let maxSpeedKmh = 0;

        if (trkpts.length > 0) {
            // Simulated calculation logic for initial testing on High Sierra
            totalTimeMinutes = Math.round(trkpts.length / 12); 
            motorMinutes = Math.round(totalTimeMinutes * 0.35); 
            maxSpeedKmh = 24.5; // Placeholder metric for testing
            
            updateDashboard(totalTimeMinutes, motorMinutes, maxSpeedKmh);
        } else {
            alert('No track points found in this GPX file.');
        }
    }

    function parseTcx(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const tracks = xmlDoc.getElementsByTagName("Trackpoint");

        let totalTimeMinutes = 0;
        let motorMinutes = 0;
        let maxSpeedKmh = 0;

        if (tracks.length > 0) {
            totalTimeMinutes = Math.round(tracks.length / 15);
            motorMinutes = Math.round(totalTimeMinutes * 0.4);
            maxSpeedKmh = 22.1; // Placeholder metric for testing

            updateDashboard(totalTimeMinutes, motorMinutes, maxSpeedKmh);
        } else {
            alert('No track points found in this TCX file.');
        }
    }

    function updateDashboard(flightTime, motorTime, maxSpeed) {
        // Update text elements on the page
        document.getElementById('flightTime').textContent = `${flightTime} min`;
        document.getElementById('motorTime').textContent = `${motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${maxSpeed} km/h`;

        // Reveal the dashboard and hide upload section
        dashboard.classList.remove('dashboard-hidden');
    }
});
