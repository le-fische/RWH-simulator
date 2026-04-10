document.addEventListener('DOMContentLoaded', () => {
    const sim = new RWHSimulation();
    const viz = new RWHVisualizer('viewport');

    let radarChartInstance = null;
    let comprehensiveChartInstance = null;

    const satisfactionAttributes = [
        { key: 'consumption', label: 'Consumption' },
        { key: 'cost', label: 'Cost' },
        { key: 'risk', label: 'Risk' },
        { key: 'ghg', label: 'GHG' },
        { key: 'maintenance', label: 'Maintenance' },
        { key: 'nonPotable', label: 'Non-Potable' },
        { key: 'flowRate', label: 'Flow Rate' },
        { key: 'reliability', label: 'Reliability' }
    ];

    const welcomeModal = document.getElementById('welcomeModal');
    const closeWelcomeIcon = document.getElementById('closeWelcomeIcon');
    const startSimBtn = document.getElementById('startSimBtn');

    function closeWelcome() {
        if (welcomeModal) welcomeModal.classList.add('hidden');
    }

    if (closeWelcomeIcon) closeWelcomeIcon.addEventListener('click', closeWelcome);
    if (startSimBtn) startSimBtn.addEventListener('click', closeWelcome);
    if (welcomeModal) {
        welcomeModal.addEventListener('click', (e) => {
            if (e.target.id === 'welcomeModal') closeWelcome();
        });
    }

    document.getElementById('themeToggle').addEventListener('click', () => {
        const html = document.documentElement;
        const isDark = html.getAttribute('data-theme') === 'dark';
        html.setAttribute('data-theme', isDark ? 'light' : 'dark');
        if (viz && viz.toggleDayNight) {
            viz.toggleDayNight(!isDark);
        }
        if (lastResults) updateSystem(); 
    });

    function updateControlVisibility() {
        const power = document.getElementById('power').value;
        const npws = document.getElementById('npws').checked;
        const rainMode = document.getElementById('rainMode').value;

        document.getElementById('solarControls').style.display = power === 'solar' ? 'block' : 'none';
        document.getElementById('npControls').classList.toggle('hidden', !npws);
        document.getElementById('baseYearContainer').style.display = rainMode === 'repeat' ? 'block' : 'none';
    }

    document.getElementById('power').addEventListener('change', () => {
        updateControlVisibility();
        updateSystem();
    });

    document.getElementById('npws').addEventListener('change', () => {
        updateControlVisibility();
        updateSystem();
    });

    let currentRainFiles = [];
    let dataLoadedFromServer = false;

    function processRainData() {
        if (currentRainFiles.length === 0) return;
        const mode = document.getElementById('rainMode').value;
        const baseYear = document.getElementById('baseYear').value;
        sim.parseWeatherData(currentRainFiles, mode, baseYear);
        updateSystem();
    }

    // --- Auto-load CSV data files (works on GitHub Pages / any static host) ---
    async function loadDataFromStaticFiles() {
        try {
            document.getElementById('systemStatus').textContent = 'Loading data...';

            const rainFiles = ['2013.csv', '2014.csv', '2015_1.csv', '2015_2.csv'];

            // Fetch all 5 CSVs in parallel
            const [terrainRes, ...rainResponses] = await Promise.all([
                fetch('data/terrain.csv'),
                ...rainFiles.map(f => fetch(`data/${f}`))
            ]);

            // Check all responses
            if (!terrainRes.ok) throw new Error('terrain.csv not found');
            for (let i = 0; i < rainResponses.length; i++) {
                if (!rainResponses[i].ok) throw new Error(`${rainFiles[i]} not found`);
            }

            const terrainText = await terrainRes.text();
            const rainTexts = await Promise.all(rainResponses.map(r => r.text()));

            // Feed rain data into simulation
            currentRainFiles = rainFiles.map((name, i) => ({ name, text: rainTexts[i] }));

            // Feed terrain data into simulation
            sim.parseTerrainCSV(terrainText);
            if (viz && viz.terrainData !== undefined) {
                viz.hasLoadedCSV = true;
                viz.terrainData = sim.terrainData;
                if (viz.buildTrueTerrain) viz.buildTrueTerrain();
            }

            // Process rain and run simulation
            processRainData();
            dataLoadedFromServer = true;

            // Update UI to reflect loaded state
            const terrainFileEl = document.getElementById('terrainFileList');
            const rainFileEl = document.getElementById('rainFileList');
            if (terrainFileEl) {
                terrainFileEl.textContent = 'terrain.csv (auto-loaded)';
                terrainFileEl.style.color = 'var(--accent)';
                terrainFileEl.style.fontStyle = 'normal';
            }
            if (rainFileEl) {
                rainFileEl.textContent = '2013, 2014, 2015_1, 2015_2 (auto-loaded)';
                rainFileEl.style.color = 'var(--accent)';
                rainFileEl.style.fontStyle = 'normal';
            }

            console.log('Data loaded successfully');
        } catch (err) {
            console.log('Auto-load not available, falling back to manual upload:', err.message);
            // Update UI for manual upload fallback
            const terrainFileEl = document.getElementById('terrainFileList');
            const rainFileEl = document.getElementById('rainFileList');
            if (terrainFileEl) { terrainFileEl.textContent = 'No file selected'; terrainFileEl.style.fontStyle = 'italic'; }
            if (rainFileEl) { rainFileEl.textContent = 'No files selected'; rainFileEl.style.fontStyle = 'italic'; }
            document.getElementById('systemStatus').textContent = 'Awaiting Data...';
        }
    }

    // Auto-load on startup
    loadDataFromStaticFiles();

    // --- Manual file upload still works as fallback/override ---
    document.getElementById('rainUpload').addEventListener('change', async (e) => {
        const fileListEl = document.getElementById('rainFileList');
        if (e.target.files.length > 0) {
            currentRainFiles = [];
            let fileNames = [];
            for (let file of e.target.files) {
                const text = await file.text();
                currentRainFiles.push({ name: file.name, text: text });
                fileNames.push(file.name);
            }
            fileListEl.textContent = fileNames.join(', ');
            fileListEl.style.color = 'var(--accent)';
            fileListEl.style.fontStyle = 'normal';
            processRainData();
        } else {
            fileListEl.textContent = 'No files selected';
            fileListEl.style.color = 'var(--text-muted)';
            fileListEl.style.fontStyle = 'italic';
        }
    });

    document.getElementById('rainMode').addEventListener('change', () => {
        updateControlVisibility();
        processRainData();
    });

    document.getElementById('baseYear').addEventListener('change', () => {
        processRainData();
    });

    document.getElementById('simDuration').addEventListener('change', () => {
        updateSystem();
    });

    document.getElementById('terrainUpload').addEventListener('change', (e) => {
        const fileListEl = document.getElementById('terrainFileList');
        if (e.target.files[0]) {
            const file = e.target.files[0];
            fileListEl.textContent = file.name;
            fileListEl.style.color = 'var(--accent)';
            fileListEl.style.fontStyle = 'normal';

            const reader = new FileReader();
            reader.onload = (evt) => {
                sim.parseTerrainCSV(evt.target.result);
                if (viz && viz.terrainData !== undefined) {
                    viz.hasLoadedCSV = true;
                    viz.terrainData = sim.terrainData;
                    if (viz.buildTrueTerrain) {
                        viz.buildTrueTerrain();
                    }
                }
                updateSystem();
            };
            reader.readAsText(file);
        } else {
            fileListEl.textContent = 'No file selected';
            fileListEl.style.color = 'var(--text-muted)';
            fileListEl.style.fontStyle = 'italic';
        }
    });

    const weightKeys = ['consumption', 'cost', 'risk', 'ghg', 'maintenance', 'reliability', 'nonPotable', 'flowRate'];
    
    const currentWeights = {
        consumption: 20, cost: 20, risk: 12, ghg: 12,
        maintenance: 12, reliability: 10, nonPotable: 7, flowRate: 7
    };

    function initWeights() {
        weightKeys.forEach(k => {
            const el = document.getElementById('w_' + k);
            const input = document.getElementById('w_' + k + 'Input');
            if (el) el.value = currentWeights[k];
            if (input) input.value = currentWeights[k];
        });
    }

    function handleWeightInput(changedKey, newTargetValue) {
        let oldVal = currentWeights[changedKey];
        let delta = newTargetValue - oldVal;
        if (delta === 0) return;

        let otherKeys = weightKeys.filter(k => k !== changedKey);
        let sumOthers = otherKeys.reduce((sum, k) => sum + currentWeights[k], 0);

        if (delta > sumOthers) {
            delta = sumOthers;
            newTargetValue = oldVal + delta;
        }

        currentWeights[changedKey] = newTargetValue;
        
        if (delta !== 0) {
            let totalFloor = 0;
            let floorVals = {};
            let remainders = [];
            let targetSumOthers = 100 - newTargetValue;

            otherKeys.forEach(k => {
                let oldK = currentWeights[k];
                let exact = sumOthers === 0 ? (targetSumOthers / otherKeys.length) : (oldK - delta * (oldK / sumOthers));
                exact = Math.max(0, exact);
                let floor = Math.floor(exact);
                floorVals[k] = floor;
                totalFloor += floor;
                remainders.push({ key: k, rem: exact - floor });
            });

            remainders.sort((a, b) => b.rem - a.rem);
            for (let i = 0; i < (targetSumOthers - totalFloor); i++) {
                floorVals[remainders[i].key] += 1;
            }

            otherKeys.forEach(k => currentWeights[k] = floorVals[k]);
        }

        weightKeys.forEach(k => syncInputs('w_' + k, currentWeights[k]));
    }

    function syncInputs(id, value) {
        const slider = document.getElementById(id);
        const input = document.getElementById(id + 'Input');
        if (slider) slider.value = value;
        if (input) input.value = value;
    }

    function setupHybridInput(id, isWeight = false) {
        const slider = document.getElementById(id);
        const input = document.getElementById(id + 'Input');

        const update = (val) => {
            let num = isWeight ? parseInt(val, 10) : parseFloat(val);
            if (isNaN(num)) return;
            
            num = Math.max(slider.min, Math.min(slider.max, num));

            if (isWeight) {
                handleWeightInput(id.replace('w_', ''), Math.round(num));
            } else {
                syncInputs(id, num);
            }
            updateSystem();
        };

        if (slider) slider.addEventListener('input', (e) => update(e.target.value));
        if (input) input.addEventListener('change', (e) => update(e.target.value));
    }

    const hardwareControls = ['consumption', 'addCatch', 'catchX', 'catchY', 'tankX', 'tankY', 'panelQty', 'battQty', 'npFraction'];
    hardwareControls.forEach(id => setupHybridInput(id));
    weightKeys.forEach(k => setupHybridInput('w_' + k, true));

    ['roofCatchment', 'catchTank', 'tankVol', 'towerH', 'pump', 'filterLocation', 'uv', 'chem', 'power', 'solarModel']
        .forEach(id => document.getElementById(id)?.addEventListener('change', updateSystem));
    
    ['filter5um', 'filter200um', 'npws']
        .forEach(id => document.getElementById(id)?.addEventListener('change', () => {
            if (id === 'npws') document.getElementById('npControls').classList.toggle('hidden', !document.getElementById('npws').checked);
            updateSystem();
        }));

    if (viz) {
        viz.onDragEnd = (type, x, y) => {
            if (type === 'tank') {
                syncInputs('tankX', x);
                syncInputs('tankY', y);
            } else if (type === 'catch') {
                syncInputs('catchX', x);
                syncInputs('catchY', y);
            }
            updateSystem();
        };
    }

    function getSafeVal(id, def) {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) : def;
    }

    let lastParams = null;
    let lastResults = null;

    function getUIParams() {
        return {
            roof: getSafeVal('roofCatchment', 100),
            addCatch: getSafeVal('addCatch', 0),
            catchX: getSafeVal('catchX', 60),
            catchY: getSafeVal('catchY', 60),
            catchTank: getSafeVal('catchTank', 1500),
            tankVol: getSafeVal('tankVol', 5),
            tankX: getSafeVal('tankX', 40),
            tankY: getSafeVal('tankY', 40),
            towerH: getSafeVal('towerH', 5),
            pump: document.getElementById('pump') ? document.getElementById('pump').value : "B",
            f5um: document.getElementById('filter5um') ? document.getElementById('filter5um').checked : false,
            f200um: document.getElementById('filter200um') ? document.getElementById('filter200um').checked : false,
            filterLocation: document.getElementById('filterLocation') ? document.getElementById('filterLocation').value : "storage",
            npws: document.getElementById('npws') ? document.getElementById('npws').checked : false,
            npFraction: getSafeVal('npFraction', 0.15),
            npThreshold: getSafeVal('npThreshold', 500),
            uv: getSafeVal('uv', 40),
            chem: document.getElementById('chem') ? document.getElementById('chem').value : "chlorine",
            power: document.getElementById('power') ? document.getElementById('power').value : "solar",
            solarModel: document.getElementById('solarModel') ? document.getElementById('solarModel').value : "HES-305P",
            panelQty: getSafeVal('panelQty', 4),
            battQty: getSafeVal('battQty', 2),
            consumption: getSafeVal('consumption', 450),
            simDuration: getSafeVal('simDuration', 5),
            rainMode: document.getElementById('rainMode') ? document.getElementById('rainMode').value : 'repeat',
            baseYear: document.getElementById('baseYear') ? document.getElementById('baseYear').value : '2015',
            weights: { ...currentWeights }
        };
    }

    // Plugin to force white background on Chart.js exports
    const customCanvasBackgroundColor = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart, args, options) => {
            const {ctx} = chart;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    function updateSystem() {
        const isDataLoaded = sim.hasLoadedCSV && currentRainFiles.length > 0;
        const emptyState = document.getElementById('emptyState');
        const resultsContent = document.getElementById('resultsContent');
        const viewMatrixBtn = document.getElementById('viewMatrixBtn');
        const exportDataBtn = document.getElementById('exportDataBtn');

        const params = getUIParams();
        const results = sim.runSimulation(params);
        
        lastParams = params;
        lastResults = results;

        if (viz && viz.updateSystemVisuals) {
            viz.updateSystemVisuals(params, sim.getGroundHeight.bind(sim), results);
        }

        if (isDataLoaded) {
            emptyState.classList.add('hidden');
            resultsContent.classList.remove('hidden');
            if(viewMatrixBtn) viewMatrixBtn.style.display = 'block';
            if(exportDataBtn) exportDataBtn.style.display = 'block';
            
            const scoreValue = document.getElementById('scoreValue');
            if (results.isFail) {
                scoreValue.textContent = 'FAIL';
                scoreValue.style.color = 'var(--status-error)';
            } else {
                scoreValue.textContent = Math.round(results.score) + '%';
                scoreValue.style.color = 'var(--accent)';
            }

            updateRadarChart(results);
            updateSatisfactionBars(results);
            renderComprehensiveChart(results.dailyTelemetry, params);
            updateMetrics(results);

            document.getElementById('systemStatus').textContent = results.isFail ? 'SYSTEM FAILED' : 'Ready';
        } else {
            emptyState.classList.remove('hidden');
            resultsContent.classList.add('hidden');
            if(viewMatrixBtn) viewMatrixBtn.style.display = 'none';
            if(exportDataBtn) exportDataBtn.style.display = 'none';
            document.getElementById('systemStatus').textContent = 'Awaiting Data...';
        }
    }

    function updateRadarChart(results) {
        const canvas = document.getElementById('radarChart');
        if (!canvas) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f5f5f7' : '#1d1d1f';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        const labels = satisfactionAttributes.map(attr => attr.label);
        const dataPoints = satisfactionAttributes.map(attr => Math.round((results[attr.key + 'Score'] || 0) * 100));

        if (radarChartInstance) {
            radarChartInstance.data.datasets[0].data = dataPoints;
            radarChartInstance.options.scales.r.grid.color = gridColor;
            radarChartInstance.options.scales.r.angleLines.color = gridColor;
            radarChartInstance.options.scales.r.pointLabels.color = textColor;
            radarChartInstance.update();
        } else {
            const ctx = canvas.getContext('2d');
            radarChartInstance = new Chart(ctx, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'System Score',
                        data: dataPoints,
                        backgroundColor: 'rgba(0, 102, 204, 0.2)',
                        borderColor: '#0066cc',
                        pointBackgroundColor: '#0066cc',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: '#0066cc'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        r: {
                            angleLines: { color: gridColor },
                            grid: { color: gridColor },
                            pointLabels: { color: textColor, font: { size: 10, weight: 'bold' } },
                            ticks: { display: false, min: 0, max: 100 }
                        }
                    }
                },
                plugins: [customCanvasBackgroundColor]
            });
        }
    }

    function renderComprehensiveChart(telemetry, params) {
        if (!telemetry || telemetry.length === 0) return;
        const canvas = document.getElementById('comprehensiveChart');
        if (!canvas) return;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
        const textColor = isDark ? '#86868b' : '#86868b';
        const maxVol = params.tankVol * 1000;
        const maxBatt = params.battQty * 2000;

        const labels = [];
        const waterData = [];
        const battData = [];
        const rainData = [];

        const step = Math.max(1, Math.floor(telemetry.length / 365)); 
        for (let i = 0; i < telemetry.length; i += step) {
            labels.push(`Day ${telemetry[i].day}`);
            waterData.push(telemetry[i].storedWater);
            battData.push(telemetry[i].batteryWh);
            rainData.push(telemetry[i].rainCollected);
        }

        if (comprehensiveChartInstance) {
            comprehensiveChartInstance.data.labels = labels;
            comprehensiveChartInstance.data.datasets[0].data = waterData;
            comprehensiveChartInstance.data.datasets[1].data = battData;
            comprehensiveChartInstance.data.datasets[2].data = rainData;
            comprehensiveChartInstance.options.scales.y.max = maxVol;
            comprehensiveChartInstance.options.scales.y1.max = maxBatt;
            comprehensiveChartInstance.options.scales.x.grid.color = gridColor;
            comprehensiveChartInstance.options.scales.x.ticks.color = textColor;
            comprehensiveChartInstance.options.scales.y.grid.color = gridColor;
            comprehensiveChartInstance.options.scales.y.ticks.color = textColor;
            comprehensiveChartInstance.options.scales.y1.ticks.color = textColor;
            comprehensiveChartInstance.update();
        } else {
            const ctx = canvas.getContext('2d');
            comprehensiveChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Storage Vol (L)',
                            data: waterData,
                            borderColor: '#0066cc',
                            backgroundColor: 'rgba(0, 102, 204, 0.1)',
                            fill: true,
                            yAxisID: 'y',
                            pointRadius: 0,
                            borderWidth: 2,
                            tension: 0.1
                        },
                        {
                            label: 'Battery (Wh)',
                            data: battData,
                            borderColor: '#ff9500',
                            backgroundColor: 'transparent',
                            fill: false,
                            yAxisID: 'y1',
                            pointRadius: 0,
                            borderWidth: 1.5,
                            tension: 0.1
                        },
                        {
                            label: 'Rainfall Runoff (L)',
                            type: 'bar',
                            data: rainData,
                            backgroundColor: 'rgba(52, 199, 89, 0.3)',
                            yAxisID: 'y',
                            barThickness: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'top', labels: { color: textColor } }
                    },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 12 } },
                        y: {
                            type: 'linear', display: true, position: 'left',
                            title: { display: true, text: 'Volume (L)', color: textColor },
                            grid: { color: gridColor }, ticks: { color: textColor },
                            min: 0, max: maxVol
                        },
                        y1: {
                            type: 'linear', display: true, position: 'right',
                            title: { display: true, text: 'Energy (Wh)', color: textColor },
                            grid: { drawOnChartArea: false }, ticks: { color: textColor },
                            min: 0, max: maxBatt
                        }
                    }
                },
                plugins: [customCanvasBackgroundColor]
            });
        }
    }

    function updateSatisfactionBars(results) {
        const container = document.getElementById('scoreBars');
        if(!container) return;
        container.innerHTML = '';
        satisfactionAttributes.forEach(attr => {
            const value = results[attr.key + 'Score'] || 0;
            const percentage = Math.round(value * 100);
            const weightValue = (results.weights && results.weights[attr.key]) ? results.weights[attr.key] : 0;
            const displayWeightPct = (weightValue * 100).toFixed(0);

            const bar = document.createElement('div');
            bar.className = 'score-bar';
            bar.innerHTML = `
                <div class="score-bar-label">${attr.label} <span style="color:var(--text-muted); font-size: 0.85em;">(${displayWeightPct}%)</span></div>
                <div class="score-bar-container"><div class="score-bar-fill" style="width: ${percentage}%"></div></div>
                <div class="score-bar-value">${percentage}%</div>
            `;
            container.appendChild(bar);
        });
    }

    function updateMetrics(results) {
        document.getElementById('metricCost').textContent = '$' + (results.cost && results.cost !== Infinity ? results.cost.toLocaleString() : '--');
        document.getElementById('metricGHG').textContent = (results.ghg || '--') + ' kg';
        document.getElementById('metricRisk').textContent = results.risk || '--';
        document.getElementById('metricConsumption').textContent = (results.avgCons || '--') + ' L/d';
        document.getElementById('metricFlow').textContent = (results.flow || '--') + ' L/m';
        document.getElementById('metricReliability').textContent = (results.reliability || '--') + ' d';
    }

    document.getElementById('viewMatrixBtn')?.addEventListener('click', () => {
        document.getElementById('matrixBody').innerHTML = sim.lastMatrixData || '<p>No data available.</p>';
        document.getElementById('matrixModal').classList.remove('hidden');
    });
    
    document.getElementById('closeMatrixBtn')?.addEventListener('click', () => {
        document.getElementById('matrixModal').classList.add('hidden');
    });
    
    document.getElementById('matrixModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'matrixModal') document.getElementById('matrixModal').classList.add('hidden');
    });

    function generate2DBlueprint(params) {
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 800;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 800, 800);
        
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for(let i=0; i<=800; i+=40) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 800); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(800, i); ctx.stroke();
        }

        const mapCoord = (val) => 100 + ((val + 20) / 120) * 600;
        
        ctx.fillStyle = 'rgba(255, 0, 0, 0.05)';
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        let bX = mapCoord(-20), bY = mapCoord(-20), bSize = mapCoord(20) - mapCoord(-20);
        ctx.fillRect(bX, bY, bSize, bSize);
        ctx.strokeRect(bX, bY, bSize, bSize);

        if (params.addCatch > 0) {
            ctx.fillStyle = 'rgba(34, 139, 34, 0.6)';
            let size = Math.max(20, Math.sqrt(params.addCatch) * 4);
            ctx.fillRect(mapCoord(params.catchX) - size/2, mapCoord(params.catchY) - size/2, size, size);
            
            ctx.strokeStyle = '#22aa22'; ctx.lineWidth = 4; ctx.setLineDash([10, 5]);
            ctx.beginPath(); ctx.moveTo(mapCoord(params.catchX), mapCoord(params.catchY)); ctx.lineTo(mapCoord(0), mapCoord(0)); ctx.stroke();
        }

        ctx.strokeStyle = '#4488cc'; ctx.lineWidth = 4; ctx.setLineDash([10, 5]);
        ctx.beginPath(); ctx.moveTo(mapCoord(0), mapCoord(0)); ctx.lineTo(mapCoord(params.tankX), mapCoord(params.tankY)); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#8b4513';
        ctx.fillRect(mapCoord(0) - 20, mapCoord(0) - 20, 40, 40);
        
        ctx.fillStyle = '#336699';
        ctx.beginPath(); ctx.arc(mapCoord(params.tankX), mapCoord(params.tankY), 25, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = '#333333'; 
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('House (0, 0)', mapCoord(0) + 25, mapCoord(0) + 5);
        ctx.fillText(`Storage Tank (${params.tankX}, ${params.tankY})`, mapCoord(params.tankX) + 30, mapCoord(params.tankY) + 5);
        if (params.addCatch > 0) ctx.fillText(`Catchment (${params.catchX}, ${params.catchY})`, mapCoord(params.catchX) + 30, mapCoord(params.catchY) + 5);
        
        return canvas.toDataURL('image/png');
    }

    document.getElementById('exportDataBtn')?.addEventListener('click', () => {
        if (!lastParams || !lastResults || !window.jspdf) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        const addPageDecorations = (pageNumber) => {
            // Dark blue corporate header
            doc.setFillColor(0, 102, 204);
            doc.rect(0, 0, pageWidth, 22, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text('Technical Design Report: RWH Pilot System', 15, 14);

            // Clean footer with page numbers
            doc.setDrawColor(200, 200, 200);
            doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);
            doc.setTextColor(150, 150, 150);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 15, pageHeight - 8);
            doc.text(`Page ${pageNumber}`, pageWidth - 25, pageHeight - 8);
        };

        // --- PAGE 1: Configuration & Blueprint ---
        addPageDecorations(1);

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(11);
        doc.text(`Simulation Duration: ${lastParams.simDuration} Years`, 15, 32);
        doc.text(`Rainfall Data Mode: ${lastParams.rainMode.charAt(0).toUpperCase() + lastParams.rainMode.slice(1)}`, 15, 38);

        doc.autoTable({
            startY: 45,
            head: [['Component', 'Design Specification']],
            body: [
                ['Roof Catchment', `${lastParams.roof} m²`],
                ['Additional Catchment', `${lastParams.addCatch} m² at (${lastParams.catchX}, ${lastParams.catchY})`],
                ['Catchment Tank Vol', `${lastParams.catchTank} L`],
                ['Storage Tank Vol', `${lastParams.tankVol} m³ at (${lastParams.tankX}, ${lastParams.tankY})`],
                ['Tower Height', `${lastParams.towerH} m`],
                ['Pump Model', `Pump ${lastParams.pump}`],
                ['Filtration', `5um: ${lastParams.f5um ? 'Yes' : 'No'} | 200um: ${lastParams.f200um ? 'Yes' : 'No'}`],
                ['Treatment Line', lastParams.filterLocation === 'storage' ? 'Storage Line' : 'House Line'],
                ['Disinfection', `${lastParams.uv}W UV + ${lastParams.chem.toUpperCase()}`],
                ['Power Core', lastParams.power === 'solar' ? `Solar (${lastParams.panelQty}x ${lastParams.solarModel})` : 'Diesel Generator'],
                ['Battery Bank', `${lastParams.battQty} Deep Cycle Units`],
                ['Non-Potable Supply', lastParams.npws ? `Enabled (Threshold: ${lastParams.npThreshold}L)` : 'Disabled']
            ],
            theme: 'striped',
            headStyles: { fillColor: [0, 102, 204], fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 3 },
            margin: { left: 15, right: 15 }
        });

        let finalY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 102, 204);
        doc.text('Top-Down System Blueprint', 15, finalY);
        
        const blueprintImg = generate2DBlueprint(lastParams);
        doc.addImage(blueprintImg, 'PNG', 25, finalY + 5, 160, 160);

        // --- PAGE 2: Performance & Telemetry ---
        doc.addPage();
        addPageDecorations(2);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 102, 204);
        doc.text('Performance Results & Stakeholder Satisfaction', 15, 32);

        // Results table aligned to the left side
        doc.autoTable({
            startY: 38,
            head: [['Metric', 'Value', 'Score']],
            body: [
                ['Total Cost', `$${lastResults.cost.toLocaleString()}`, `${(lastResults.costScore * 100).toFixed(1)}%`],
                ['GHG Emissions', `${lastResults.ghg} kg`, `${(lastResults.ghgScore * 100).toFixed(1)}%`],
                ['Risk Exposure', `${lastResults.risk}`, `${(lastResults.riskScore * 100).toFixed(1)}%`],
                ['Avg Consumption', `${lastResults.avgCons} L/d`, `${(lastResults.consumptionScore * 100).toFixed(1)}%`],
                ['Flow Rate', `${lastResults.flow} L/m`, `${(lastResults.flowRateScore * 100).toFixed(1)}%`],
                ['Reliability', `${lastResults.reliability} Days`, `${(lastResults.reliabilityScore * 100).toFixed(1)}%`],
                [{ content: 'Overall Weighted Satisfaction', colSpan: 2, styles: { fontStyle: 'bold' } }, { content: `${lastResults.exactScore.toFixed(2)}%`, styles: { fontStyle: 'bold', textColor: [0, 102, 204] } }]
            ],
            theme: 'striped',
            headStyles: { fillColor: [40, 167, 69], fontStyle: 'bold' },
            styles: { fontSize: 10, cellPadding: 4 },
            margin: { left: 15, right: 105 } 
        });

        // Insert Radar Chart to the right of the table
        const radarCanvas = document.getElementById('radarChart');
        if (radarCanvas) {
            const radarImg = radarCanvas.toDataURL('image/png');
            doc.addImage(radarImg, 'PNG', 115, 38, 80, 80);
        }

        let chartStartY = Math.max(doc.lastAutoTable.finalY, 120) + 20;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 102, 204);
        doc.text('5-Year Operational Telemetry', 15, chartStartY);

        if (comprehensiveChartInstance) {
            const chartCanvas = document.getElementById('comprehensiveChart');
            const chartImg = chartCanvas.toDataURL('image/png');
            doc.addImage(chartImg, 'PNG', 15, chartStartY + 5, 180, 90);
        }

        doc.save('RWH_Technical_Design_Report.pdf');
    });

    initWeights();
    updateControlVisibility();
    updateSystem();
});