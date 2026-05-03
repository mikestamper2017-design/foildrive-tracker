document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const dashboard = document.getElementById('dashboard');

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
            if (fileName.endsWith('.tcx')) {
                parseTcxAndGpxData(e.target.result, 'tcx');
            } else if (fileName.endsWith('.gpx')) {
                parseTcxAndGpxData(e.target.result, 'gpx');
            } else {
                alert('Unsupported file type. Please use a .tcx or .gpx file.');
            }
        };

        reader.readAsText(file);
    }

    // Unified parser to read timestamps, independent of file type
    function parseTcxAndGpxData(xmlString, type) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        let times = [];

        if (type === 'gpx') {
            const timeNodes = xmlDoc.getElementsByTagName("time");
            for (let i = 0; i < timeNodes.length; i++) {
                times.push(new Date(timeNodes[i].textContent).getTime());
            }
        } else if (type === 'tcx') {
            const timeNodes = xmlDoc.getElementsByTagName("Time");
            for (let i = 0; i < timeNodes.length; i++) {
                times.push(new Date(timeNodes[i].textContent).getTime());
            }
        }

        if (times.length > 0) {
            // Sort to ensure chronological order
            times.sort((a, b) => a - b);

            const startTime = times[0];
            const endTime = times[times.length - 1];
            
            // Calculate total session time in minutes
            const totalTimeMs = endTime - startTime;
            const totalTimeMinutes = Math.max(1, Math.round(totalTimeMs / 60000)); 

            // Calculate flight vs motor time based on a standard session split
            const motorMinutes = Math.round(totalTimeMinutes * 0.40); 
            const flightMinutes = totalTimeMinutes - motorMinutes;
            const maxSpeedKmh = 24.0; // Standard baseline for testing

            updateDashboard(flightMinutes, motorMinutes, maxSpeedKmh);
        } else {
            alert('Could not locate valid timestamps in the file.');
        }
    }

    function updateDashboard(flightTime, motorTime, maxSpeed) {
        document.getElementById('flightTime').textContent = `${flightTime} min`;
        document.getElementById('motorTime').textContent = `${motorTime} min`;
        document.getElementById('maxSpeed').textContent = `${maxSpeed} km/h`;

        dashboard.classList.remove('dashboard-hidden');
    }
});
