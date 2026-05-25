document.addEventListener('DOMContentLoaded', function () {
    
    // --- 1. SYSTEM STATE ---
    let state = { map: null, fullTrack: [], filteredTrack: [], waveTracks: [], longestTrack: [], fastestTrack: [], currentData: null, lockedHeading: null };

    populateSavedSessions();

    function getEl(id) { return document.getElementById(id); }
    
    // --- 2. CORE LOGIC (PARSING, TRACKS, RENDERING) ---
    // (Retained: your existing parseGPX, calculateTracks, renderMap, and loadSession functions remain fully intact)
    // ... [Previous logic from Section 1-6 remains unchanged] ...

    // --- 7. CANVAS SHARE BADGE GENERATOR (FINAL) ---
    const shareBtn = getEl('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            if (!state.currentData || !state.fullTrack.length) return;

            const canvas = document.createElement('canvas');
            canvas.width = 1080; canvas.height = 1350;
            const ctx = canvas.getContext('2d');
            const data = state.currentData;
            
            const durationMs = data.times[data.times.length - 1] - data.times[0];
            const totalDurationMin = Math.round(durationMs / 60000);
            const sessionDate = new Date(data.times[0]).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
            const startTime = new Date(data.times[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            ctx.fillStyle = '#001f3f'; ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Map Drawing
            let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
            state.fullTrack.forEach(pt => {
                if (pt[0] < minLat) minLat = pt[0]; if (pt[0] > maxLat) maxLat = pt[0];
                if (pt[1] < minLon) minLon = pt[1]; if (pt[1] > maxLon) maxLon = pt[1];
            });
            const latRange = maxLat - minLat || 0.001, lonRange = maxLon - minLon || 0.001;
            const mapX = 80, mapY = 220, mapW = 920, mapH = 450;
            const scale = Math.min(mapW / lonRange, mapH / latRange);
            const xOffset = mapX + (mapW - lonRange * scale) / 2, yOffset = mapY + (mapH - latRange * scale) / 2;
            
            function scaleX(lon) { return xOffset + (lon - minLon) * scale; }
            function scaleY(lat) { return (yOffset + mapH) - (lat - minLat) * scale; }

            ctx.strokeStyle = '#7FDBFF'; ctx.lineWidth = 6;
            ctx.beginPath();
            state.fullTrack.forEach(pt => ctx.lineTo(scaleX(pt[1]), scaleY(pt[0])));
            ctx.stroke();

            // Hero Gold Highlight
            if (state.longestTrack && state.longestTrack.length > 0) {
                ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 10;
                ctx.shadowBlur = 20; ctx.shadowColor = '#D4AF37';
                ctx.beginPath();
                state.longestTrack.forEach((pt, idx) => {
                    idx === 0 ? ctx.moveTo(scaleX(pt[1]), scaleY(pt[0])) : ctx.lineTo(scaleX(pt[1]), scaleY(pt[0]));
                });
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Headers
            ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#FFF';
            ctx.fillText(`${data.displayName}`, 80, 80);
            ctx.font = '36px sans-serif'; ctx.fillStyle = '#7FDBFF';
            ctx.fillText(`SESSION REPORT • ${sessionDate} • ${startTime}`, 80, 150);

            // Hero Metric
            ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#D4AF37';
            ctx.fillText('HERO RIDE DISTANCE', 80, 750);
            ctx.font = 'bold 120px sans-serif'; ctx.fillStyle = '#FFF';
            ctx.fillText(getEl('longestWave').textContent, 80, 850);

            // Sub Metrics
            function drawSubMetric(icon, label, value, xPos, yPos) {
                ctx.font = '80px sans-serif'; ctx.fillText(icon, xPos, yPos + 55);
                ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#AAAAAA';
                ctx.fillText(label, xPos + 110, yPos + 15);
                ctx.font = 'bold 64px sans-serif'; ctx.fillStyle = '#FFF';
                ctx.fillText(value, xPos + 110, yPos + 75);
            }

            drawSubMetric('⚡', 'MAX SPEED', `${data.maxSpeed} km/h`, 80, 920);
            drawSubMetric('⏱️', 'SESSION TIME', `${totalDurationMin} min`, 580, 920);
            drawSubMetric('🌊', 'RIDE COUNT', `${getEl('waveCount').textContent}`, 80, 1120);
            drawSubMetric('🦅', 'FLIGHT TIME', `${data.flightTime} min`, 580, 1120);

            const imgUrl = canvas.toDataURL('image/png');
            const container = getEl('imageContainer');
            if (container) container.innerHTML = `<img src="${imgUrl}" style="width:100%; border-radius:8px;"/>`;
            if (getEl('shareModal')) getEl('shareModal').style.display = 'flex';
        });
    }

    // --- 8. MATH HELPERS ---
    // ... [Previous logic] ...
});
