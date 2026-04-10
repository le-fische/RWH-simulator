class RWHSimulation {
    constructor() {
        this.referenceCost = 110000;
        this.shippedWaterCost = 90;
        this.simYears = 5;
        this.dailyRainfall = [];
        this.terrainData = Array(121).fill().map(() => Array(121).fill(0));
        this.hasLoadedCSV = false;
        this.lastMatrixData = "";
        
        // Rich telemetry array for the Chart
        this.dailyTelemetry = []; 

        // Data arrays for routing
        this.data2013 = [];
        this.data2014 = [];
        this.data2015_1 = [];
        this.data2015_2 = [];
        this.data2015_avg = [];
        this.masterAvg = [];

        this.weights = {
            consumption: 0.20, cost: 0.20, risk: 0.12, ghg: 0.12,
            maintenance: 0.12, reliability: 0.10, nonPotable: 0.07, flowRate: 0.07
        };
    }

    // Helper to parse the CSV string
    _parseRawCSVString(csvText) {
        if (!csvText) return [];
        const rows = csvText.split('\n');
        let data = [];
        let rainColIndex = -1;
        
        for (let i = 0; i < rows.length; i++) {
            const cols = rows[i].split(',').map(c => c.trim().replace(/"/g, ''));
            
            if (rainColIndex === -1) {
                rainColIndex = cols.findIndex(c => {
                    const lc = c.toLowerCase();
                    return lc.includes('rain') || lc.includes('average') ||
                           lc.includes('precip') || lc.includes('mm') ||
                           lc.includes('daily');
                });
                if (rainColIndex === -1 && cols.length === 2) rainColIndex = 1;
                continue;
            }
            
            if (rainColIndex !== -1 && cols[rainColIndex] !== "") {
                const rain = parseFloat(cols[rainColIndex]);
                if (!isNaN(rain) && rain >= 0) data.push(rain);
            }
        }
        return data;
    }

    parseWeatherData(files, mode, baseYear) {
        this.data2013 = [];
        this.data2014 = [];
        this.data2015_1 = [];
        this.data2015_2 = [];

        for (let f of files) {
            const parsed = this._parseRawCSVString(f.text);
            const fname = f.name.toLowerCase();
            
            if (fname.includes('2013')) this.data2013 = parsed;
            else if (fname.includes('2014')) this.data2014 = parsed;
            else if (fname.includes('2015_1') || fname.includes('2015 (1)') || fname.includes('2015-1')) this.data2015_1 = parsed;
            else if (fname.includes('2015_2') || fname.includes('2015 (2)') || fname.includes('2015-2')) this.data2015_2 = parsed;
        }

        if (this.data2013.length === 0) this.data2013 = Array(365).fill(0);
        else this.data2013 = this.data2013.slice(0, 365);
        
        if (this.data2014.length === 0) this.data2014 = Array(365).fill(0);
        else this.data2014 = this.data2014.slice(0, 365);
        
        if (this.data2015_1.length === 0) this.data2015_1 = Array(365).fill(0);
        else this.data2015_1 = this.data2015_1.slice(0, 365);
        
        if (this.data2015_2.length === 0) this.data2015_2 = Array(365).fill(0);
        else this.data2015_2 = this.data2015_2.slice(0, 365);

        this.data2015_avg = [];
        for (let i = 0; i < 365; i++) {
            let sum = 0, count = 0;
            if (i < this.data2015_1.length) { sum += this.data2015_1[i]; count++; }
            if (i < this.data2015_2.length) { sum += this.data2015_2[i]; count++; }
            this.data2015_avg.push(count > 0 ? sum / count : 0);
        }

        this.masterAvg = [];
        for(let i = 0; i < 365; i++) {
            let sum = 0, count = 0;
            if (i < this.data2013.length) { sum += this.data2013[i]; count++; }
            if (i < this.data2014.length) { sum += this.data2014[i]; count++; }
            if (i < this.data2015_avg.length) { sum += this.data2015_avg[i]; count++; }
            this.masterAvg.push(count > 0 ? sum / count : 0);
        }

        this.applyRainMode(mode, baseYear);
    }

    applyRainMode(mode, baseYear) {
        if (mode === 'repeat') {
            if (baseYear === '2013') this.dailyRainfall = this.data2013;
            else if (baseYear === '2014') this.dailyRainfall = this.data2014;
            else this.dailyRainfall = this.data2015_avg;
        } else if (mode === 'sequential') {
            this.dailyRainfall = [].concat(this.data2013, this.data2014, this.data2015_1, this.data2015_2);
        } else if (mode === 'average') {
            this.dailyRainfall = this.masterAvg;
        }
        if (this.dailyRainfall.length === 0) this.dailyRainfall = Array(365).fill(0);
    }

    parseTerrainCSV(csvText) {
        const rows = csvText.split('\n');
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            const cols = rows[i].split(',');
            const realX = parseFloat(cols[0]);
            const realY = parseFloat(cols[1]);
            const el = parseFloat(cols[2]);
            if (!isNaN(realX) && !isNaN(realY) && !isNaN(el)) {
                const ix = Math.round(realX + 20);
                const iy = Math.round(realY + 20);
                if (ix >= 0 && ix <= 120 && iy >= 0 && iy <= 120) {
                    this.terrainData[ix][iy] = el;
                }
            }
        }
        this.hasLoadedCSV = true;
    }

    getGroundHeight(realX, realY) {
        let ix = Math.round(realX + 20);
        let iy = Math.round(realY + 20);
        if(ix >= 0 && ix <= 120 && iy >= 0 && iy <= 120) {
            if(this.hasLoadedCSV) return this.terrainData[ix][iy];
            let normX = (realX + 20) / 120;
            let normY = (realY + 20) / 120;
            let rawY = (normX * 18) + (normY * 15) - 2.5;
            let nwDepress = Math.exp(-Math.pow(normX - 0.2, 2)*10 - Math.pow(normY - 0.8, 2)*10) * -5;
            return rawY + Math.sin(realX*0.1)*1.5 + Math.cos(realY*0.1)*1.5 + nwDepress;
        }
        return 0;
    }

    calcSatisfaction(val, min, max, isHighGood) {
        if (isNaN(val)) return 0;
        let clamped = Math.max(min, Math.min(max, val));
        if (isHighGood) {
            if (val <= min) return 0;
            if (val >= max) return 1;
        } else {
            if (val >= max) return 0;
            if (val <= min) return 1;
        }
        const ratio = (clamped - min) / (max - min);
        return isHighGood ? 0.5 * (1 - Math.cos(ratio * Math.PI)) : 0.5 * (1 + Math.cos(ratio * Math.PI));
    }

    generateFailLog(reason) {
        this.lastMatrixData = `<div class="fail-text" style="color:red; padding:20px; border:1px solid red; border-radius:8px;"><h3>SYSTEM FAILURE</h3><p>${reason}</p></div>`;
        return { 
            score: "0.0", exactScore: 0, cost: Infinity, ghg: 0, reliability: "0", 
            maint: "0", risk: 0, avgCons: "0", flow: "0", nonPotableDelivered: "0", 
            isFail: true, dailyTelemetry: [], weights: this.weights 
        };
    }

    parseNum(val, def) { 
        return (val !== undefined && val !== "" && !isNaN(Number(val))) ? Number(val) : def; 
    }

    getMonthlyDaylightHours(dayOfYear) {
        const monthlyHours = [8.5, 10, 11.8, 13.6, 15.3, 16, 15.75, 14.2, 12.5, 10.75, 9, 8.25];
        const dayOfMonth = dayOfYear % 365;
        let monthIndex = 0;
        let daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        let cumDays = 0;
        for (let i = 0; i < 12; i++) {
            cumDays += daysInMonths[i];
            if (dayOfMonth < cumDays) {
                monthIndex = i;
                break;
            }
        }
        return monthlyHours[monthIndex];
    }

    runSimulation(rawParams) {
        if (rawParams.weights) {
            let w = rawParams.weights;
            let totalWeight = w.consumption + w.cost + w.risk + w.ghg + w.maintenance + w.reliability + w.nonPotable + w.flowRate;
            if (totalWeight <= 0) totalWeight = 1; 
            
            this.weights = {
                consumption: w.consumption / totalWeight, cost: w.cost / totalWeight,
                risk: w.risk / totalWeight, ghg: w.ghg / totalWeight,
                maintenance: w.maintenance / totalWeight, reliability: w.reliability / totalWeight,
                nonPotable: w.nonPotable / totalWeight, flowRate: w.flowRate / totalWeight
            };
        }

        this.applyRainMode(rawParams.rainMode || 'repeat', rawParams.baseYear || '2015');

        const params = {
            roof: this.parseNum(rawParams.roof, 100),
            addCatch: this.parseNum(rawParams.addCatch, 0),
            catchX: this.parseNum(rawParams.catchX, 30),
            catchY: this.parseNum(rawParams.catchY, 30),
            catchTank: this.parseNum(rawParams.catchTank, 5000),
            tankVol: this.parseNum(rawParams.tankVol, 10),
            tankX: this.parseNum(rawParams.tankX, 40),
            tankY: this.parseNum(rawParams.tankY, 40),
            towerH: this.parseNum(rawParams.towerH, 6),
            pump: rawParams.pump || "B",
            f5um: !!rawParams.f5um,
            f200um: !!rawParams.f200um,
            filterLocation: rawParams.filterLocation || "storage",
            npws: !!rawParams.npws,
            uv: this.parseNum(rawParams.uv, 40),
            chem: rawParams.chem || "chlorine",
            power: rawParams.power || "solar",
            solarModel: rawParams.solarModel || "HES-260",
            panelQty: this.parseNum(rawParams.panelQty, 2),
            battQty: this.parseNum(rawParams.battQty, 4),
            consumption: Math.max(125, this.parseNum(rawParams.consumption, 450)), 
            npFraction: this.parseNum(rawParams.npFraction, 0.3),
            npThreshold: this.parseNum(rawParams.npThreshold, 500)
        };

        this.simYears = this.parseNum(rawParams.simDuration, 5);
        const totalSimDays = 365 * this.simYears;

        const isTankInZone = (params.tankX >= -20 && params.tankX <= 20 && params.tankY >= -20 && params.tankY <= 20);
        const isCatchInZone = params.addCatch > 0 && (params.catchX >= -20 && params.catchX <= 20 && params.catchY >= -20 && params.catchY <= 20);
        const isOverlapping = params.addCatch > 0 && (params.tankX === params.catchX && params.tankY === params.catchY);

        let E_house = this.getGroundHeight(0, 0);
        let E_catch = this.getGroundHeight(params.catchX, params.catchY);
        let E_tank = this.getGroundHeight(params.tankX, params.tankY);

        if (isTankInZone || isCatchInZone) return this.generateFailLog("Component placed inside the 40x40m Exclusion Zone.");
        if (isOverlapping) return this.generateFailLog("Storage Tank and Catchment are overlapping at the same coordinate.");
        if (params.addCatch > 0 && E_catch <= 2.5) return this.generateFailLog(`Additional Catchment must be at elevation > 2.5m.`);

        let h_grav = (E_tank + params.towerH) - E_house;
        if (h_grav <= 0) return this.generateFailLog(`Storage Tank elevation is lower than the House. No gravity pressure.`);

        let catchDist = params.addCatch > 0 ? Math.sqrt(Math.pow(params.catchX - 0, 2) + Math.pow(params.catchY - 0, 2) + Math.pow(E_catch - E_house, 2)) : 0;
        let tankDist = Math.sqrt(Math.pow(params.tankX, 2) + Math.pow(params.tankY, 2) + Math.pow((E_tank + params.towerH) - E_house, 2));
        let h_pump_lift = (E_tank + params.towerH) - E_house;
        
        const base_Cf = 81124;
        let Cf_base = 0.167 * base_Cf;
        let Cf_filters = (params.f5um ? 0.0833 * base_Cf : 0) + (params.f200um ? 0.00417 * base_Cf : 0);
        
        let Cf_pump = (params.filterLocation === "storage") ? (Cf_base + Cf_filters) : 0;
        let Cf_grav = (params.filterLocation === "house") ? (Cf_base + Cf_filters) : 0;

        let pumpParams = {
            "A": { a: -0.0172, b: -0.3605, c: 150.9, A_eta: 0.70, B_eta: 0.39, Qmax: 83.7, mtbf: 900 },
            "B": { a: -0.0039, b: -0.096,  c: 237.86, A_eta: 0.94, B_eta: 0.85, Qmax: 245.7, mtbf: 1650 },
            "C": { a: -0.0151, b: -0.5516, c: 356.8, A_eta: 0.72, B_eta: 0.55, Qmax: 136.5, mtbf: 1800 }
        }[params.pump];

        let A_req = 1.4072 * ((2.5 * tankDist) + 8);
        let B_req = 0.0530516 * Cf_pump; 
        let C_req = 9810 * (h_pump_lift + 1.5);

        let max_pump_pa = pumpParams.c * 1000;
        if (C_req >= max_pump_pa) return this.generateFailLog(`Pump ${params.pump} lacks pressure to lift water.`);

        let A_tot = (1000 * pumpParams.a) - A_req;
        let B_tot = (1000 * pumpParams.b) - B_req;
        let C_tot = (1000 * pumpParams.c) - C_req;

        let discriminant = (B_tot * B_tot) - (4 * A_tot * C_tot);
        if (discriminant < 0) return this.generateFailLog(`Pump ${params.pump} stalls. Increase pipe diameter or choose larger pump.`);

        let Q_op = (-B_tot - Math.sqrt(discriminant)) / (2 * A_tot);
        if (Q_op <= 0 || Q_op > pumpParams.Qmax) return this.generateFailLog(`Pump ${params.pump} stalls due to dynamic friction.`);

        let ratio = Q_op / pumpParams.Qmax;
        let inner = Math.exp(ratio) - 1 - 1.72 * Math.pow(ratio, 4);
        let eta_pump = 1.2 * pumpParams.A_eta * Math.pow(Math.max(0.0001, inner), pumpParams.B_eta);
        let P_pump_Pa = 1000 * (pumpParams.a * Q_op * Q_op + pumpParams.b * Q_op + pumpParams.c);

        let A_g = 500 * ((2.5 * tankDist) + 12);
        let C_eq = 9810 * h_grav; 
        
        let v_grav = (-Cf_grav + Math.sqrt(Cf_grav * Cf_grav + 4 * A_g * C_eq)) / (2 * A_g); 
        let raw_flowRate_Ls = v_grav * 0.314159;

        let max_uv_flow_Lpm = params.uv === 36 ? 25 : (params.uv === 40 ? 35 : 40);
        let treatment_limit_Ls = max_uv_flow_Lpm / 60;
        let flowRate_Ls = Math.min(raw_flowRate_Ls, treatment_limit_Ls);
        let flowRate_Lpm = flowRate_Ls * 60;

        if (flowRate_Lpm < 18) return this.generateFailLog(`Flow to house (${flowRate_Lpm.toFixed(1)} L/min) fails 18 L/min minimum.`);

        const batt_Wh_max = params.battQty * 2000;
        const uv_Wh_daily = params.uv * 24;
        
        if (batt_Wh_max < uv_Wh_daily) {
            return this.generateFailLog(`Battery bank (${batt_Wh_max} Wh) is insufficient to sustain the continuous 24-hour UV load (${uv_Wh_daily} Wh).`);
        }

        // --- EXPLICIT CAPEX BREAKDOWN ---
        let capCost = 0;
        let roofCost = params.roof === 100 ? 350 : (params.roof === 50 ? 150 : 0);
        capCost += roofCost;

        let addCatchCost = params.addCatch > 0 ? (500 + (10 * params.addCatch) + (40 * catchDist)) : 0;
        capCost += addCatchCost;

        let levelSensorCost = params.npws ? 250 : 0;
        capCost += levelSensorCost;

        const catchTankCosts = {400: 200, 1500: 500, 2500: 900, 5000: 1500, 10000: 2000};
        let cTankCost = catchTankCosts[params.catchTank] || 1500; 
        capCost += cTankCost;

        let sTankCost = params.tankVol * 300; 
        capCost += sTankCost;
        
        let towerCost = params.towerH > 0 ? (25 * Math.pow(params.tankVol, 1.6)) + (150 * Math.pow(params.towerH, 1.8)) : 0; 
        capCost += towerCost;

        let pipeCost = (40 * tankDist * 2); 
        capCost += pipeCost; 
        
        let pumpCost = params.pump === "A" ? 640 : (params.pump === "B" ? 1250 : 3250); 
        capCost += pumpCost;
        
        let baseFilterCost = 125; 
        let preFilterCost = (params.f5um ? 110 : 0) + (params.f200um ? 100 : 0);
        let filterCost = baseFilterCost + preFilterCost;
        capCost += filterCost;
        
        let uvCost = params.uv === 36 ? 500 : (params.uv === 40 ? 600 : 850); 
        capCost += uvCost;
        
        let chemCost = params.chem === "ozone" ? 4000 : 700; 
        capCost += chemCost;

        let baseGhg = 2408;
        let powerCost = 0, powerElectronicsCost = 0, panelTotalCost = 0, battCost = 0;
        let solarGhg = 0, battGhg = 0, genGhg = 0;
        const panelCosts = {"HES-260": 550, "SW-80": 205, "HES-305P": 450};
        const panelGhg = {"HES-260": 496, "SW-80": 192, "HES-305P": 620};
        const panelActualWatts = {"HES-260": 74.8, "SW-80": 25.575, "HES-305P": 88.0};

        battCost = 390 * params.battQty;
        battGhg = 240 * params.battQty;

        if (params.power === "solar") {
            powerElectronicsCost = 2369; 
            panelTotalCost = panelCosts[params.solarModel] * params.panelQty;
            powerCost = powerElectronicsCost + panelTotalCost + battCost;
            solarGhg = panelGhg[params.solarModel] * params.panelQty;
            baseGhg += 100 + solarGhg + battGhg;
        } else {
            powerElectronicsCost = 3250; 
            powerCost = powerElectronicsCost + battCost; 
            genGhg = 1250;
            baseGhg += genGhg + battGhg; 
        }
        capCost += powerCost;

        // --- SIMULATION RUN ---
        let storedWater = 0;
        let totalShippedCost = 0, daysFailed = 0, totalWaterProcessed = 0, powerOutageDays = 0;
        
        let targetConsumption = params.consumption; 
        let nonPotableTargetConsumption = targetConsumption * params.npFraction; 
        let actualConsumptionDelivered = 0;
        let actualNonPotableDelivered = 0;

        let storedEnergy_Wh = (params.power === "solar") ? batt_Wh_max : 0;
        let lowestBatteryLevel = batt_Wh_max, dieselUsed_L = 0;
        const totalArea = params.roof + params.addCatch;

        let maint = 0, pumpRunningHours = 0, pumpReplaces = 0;
        let f1_replaces = 0, f5_replaces = 0, f200_replaces = 0;
        let f1_water_tracked = 0, f5_water_tracked = 0, f200_water_tracked = 0;

        let f1_life = 5000;
        if (params.f5um) f1_life = 20000;
        else if (params.f200um) f1_life = 15000;

        let currentCatchTankVolume = 0;
        let chlorineCumulativeKg = 0;
        let dieselCumulativeL = 0;
        let dieselOilTrack = 0;

        this.dailyTelemetry = [];

        // Pre-calculate energy required per Liter
        let J_per_L = Q_op > 0 ? P_pump_Pa / (1000 * Math.max(0.01, eta_pump)) : 0;
        let pump_Wh_per_L = J_per_L / 3600;
        let ozone_Wh_per_L = (params.chem === "ozone") ? 2.777 : 0;
        let AC_Wh_per_L = pump_Wh_per_L + ozone_Wh_per_L;
        let required_AC_draw_per_L = (AC_Wh_per_L / 0.92) / 0.96;

        for (let day = 0; day < totalSimDays; day++) {
            let rain = this.dailyRainfall.length > 0 ? (this.dailyRainfall[day % 365] || 0) : 0;
            
            let runoff = rain * totalArea; 
            currentCatchTankVolume = Math.min(currentCatchTankVolume + runoff, params.catchTank);
            let collected = currentCatchTankVolume;

            let DC_load_Wh = (day >= 31) ? uv_Wh_daily : 0; 
            let required_DC_draw = DC_load_Wh / 0.96;

            let powerFailed = false;
            let actual_pumped_L = 0; 

            if (params.power === "solar") {
                let daylightHours = this.getMonthlyDaylightHours(day);
                let charge_Wh = (panelActualWatts[params.solarModel] * params.panelQty * daylightHours) * 0.96;
                
                storedEnergy_Wh = Math.min(storedEnergy_Wh + charge_Wh, batt_Wh_max);
                
                // Prioritize UV Purification
                if (storedEnergy_Wh >= required_DC_draw) {
                    storedEnergy_Wh -= required_DC_draw; // UV is powered
                    
                    // Use remaining battery to pump as much as possible
                    if (required_AC_draw_per_L > 0) {
                        let max_pumpable_L = storedEnergy_Wh / required_AC_draw_per_L;
                        actual_pumped_L = Math.min(collected, max_pumpable_L);
                        storedEnergy_Wh -= (actual_pumped_L * required_AC_draw_per_L);
                    } else {
                        actual_pumped_L = collected; // Gravity fed
                    }
                    
                    if (storedEnergy_Wh < lowestBatteryLevel) lowestBatteryLevel = storedEnergy_Wh;
                } else {
                    powerFailed = true; 
                    powerOutageDays++; 
                    storedEnergy_Wh = Math.max(0, storedEnergy_Wh - required_DC_draw); 
                    if (storedEnergy_Wh < lowestBatteryLevel) lowestBatteryLevel = storedEnergy_Wh;
                }
            } else {
                actual_pumped_L = collected;
                let total_AC_load_Wh = actual_pumped_L * AC_Wh_per_L;
                let gen_Wh_needed = total_AC_load_Wh + (DC_load_Wh / (0.96 * 0.96));
                let fuelUsedToday = gen_Wh_needed * 0.00025714;
                dieselUsed_L += fuelUsedToday;
                dieselCumulativeL += fuelUsedToday;
                dieselOilTrack += fuelUsedToday;
            }

            let pumpFailedToday = false;
            
            if (!powerFailed) {
                totalWaterProcessed += actual_pumped_L; 

                if (params.chem === "chlorine") {
                    chlorineCumulativeKg += (actual_pumped_L * 0.000125);
                }

                if (params.filterLocation === "storage") {
                    f1_water_tracked += actual_pumped_L;
                    f5_water_tracked += actual_pumped_L;
                    f200_water_tracked += actual_pumped_L;
                }

                let daily_pump_hours = Q_op > 0 ? (actual_pumped_L / Q_op) / 60 : 0;
                pumpRunningHours += daily_pump_hours;
                if (pumpRunningHours >= pumpParams.mtbf) {
                    pumpReplaces++; 
                    pumpRunningHours -= pumpParams.mtbf; 
                    pumpFailedToday = true;
                }
                
                storedWater = Math.min(storedWater + actual_pumped_L, params.tankVol * 1000);
                currentCatchTankVolume -= actual_pumped_L; // Leave remaining water for tomorrow
            }

            if (day >= 31) {
                let nonPotableNeeded = params.npws ? nonPotableTargetConsumption : 0;
                let potableNeeded = targetConsumption - nonPotableNeeded;
                
                let actualPotableGiven = 0;
                let actualNonPotableGiven = 0;

                if (!powerFailed) {
                    actualPotableGiven = Math.min(storedWater, potableNeeded);
                    storedWater -= actualPotableGiven;
                    
                    if (params.npws && storedWater > params.npThreshold) {
                        actualNonPotableGiven = Math.max(0, Math.min(storedWater - params.npThreshold, nonPotableNeeded));
                        storedWater -= actualNonPotableGiven;
                    }
                }

                if (actualPotableGiven < potableNeeded) {
                    totalShippedCost += this.shippedWaterCost; 
                    daysFailed++;
                    baseGhg += (50 / 1000) * 6.5; 
                }
                
                actualConsumptionDelivered += (actualPotableGiven + actualNonPotableGiven);
                if (params.npws) actualNonPotableDelivered += actualNonPotableGiven;
                
                if (params.filterLocation === "house" && !powerFailed) {
                    f1_water_tracked += actualPotableGiven;
                    f5_water_tracked += actualPotableGiven;
                    f200_water_tracked += actualPotableGiven;
                }
            }

            let filterMaintToday = false;
            while (f1_water_tracked >= f1_life) { f1_replaces++; f1_water_tracked -= f1_life; filterMaintToday = true; }
            while (params.f5um && f5_water_tracked >= (params.f200um ? 20000 : 10000)) { f5_replaces++; f5_water_tracked -= (params.f200um ? 20000 : 10000); filterMaintToday = true; }
            while (params.f200um && f200_water_tracked >= 25000) { f200_replaces++; f200_water_tracked -= 25000; filterMaintToday = true; }
            
            if (filterMaintToday) maint++;
            if (pumpFailedToday) maint++;
            if (day > 0 && day % 365 === 0) maint++; 
            if (params.power === "solar" && day > 0 && day % 91 === 0) maint++; 
            
            while (chlorineCumulativeKg >= 4.4) { chlorineCumulativeKg -= 4.4; maint++; }
            while (dieselCumulativeL >= 100) { dieselCumulativeL -= 100; maint++; }
            while (dieselOilTrack >= 250) { dieselOilTrack -= 250; maint++; }

            // Push rich object to array
            this.dailyTelemetry.push({
                day: day,
                storedWater: storedWater,
                rainCollected: runoff,
                batteryWh: storedEnergy_Wh
            });
        }

        let opCost = totalShippedCost;
        let uvMaint = Math.floor((totalSimDays - 31) / 365); 
        let uvOpCost = (params.uv === 36 ? 60 : params.uv === 40 ? 80 : 110);

        opCost += uvOpCost * uvMaint;
        opCost += f1_replaces * 75;
        if(params.f5um) opCost += f5_replaces * 60;
        if(params.f200um) opCost += f200_replaces * 50;
        opCost += pumpReplaces * pumpCost;

        let riskSum = 0;
        let chemOpCost = 0, dieselOpCost = 0, dieselShipmentCost = 0, chlorineShipments = 0;

        if(params.chem === "chlorine") {
            let kgChlorine = totalWaterProcessed * 0.000125;
            chlorineShipments = Math.ceil(kgChlorine / 4.4);
            opCost += (chlorineShipments * 100);
            if (chlorineShipments > 0) {
                let chemLikelihood = Math.min(4, Math.max(1, 4 - 0.5 * Math.log(totalSimDays / Math.max(1, chlorineShipments))));
                riskSum += (chemLikelihood * 7);
            }
        }

        if(params.power === "diesel" && dieselUsed_L > 0) {
            let dieselShipments = Math.ceil(dieselUsed_L / 100);
            opCost += (dieselShipments * 325);
            baseGhg += (dieselUsed_L * 3.25);
            if (dieselShipments > 0) {
                let dieselLikelihood = Math.min(4, Math.max(1, 4 - 0.5 * Math.log(totalSimDays / Math.max(1, dieselShipments))));
                riskSum += (dieselLikelihood * 5);
            }
            let oilChanges = Math.floor(dieselUsed_L / 250);
            dieselOpCost = (dieselShipments * 325) + (oilChanges * 50);
            opCost += (oilChanges * 50);
        }

        let riskExp = Math.max(1, riskSum);
        let totalCost = capCost + opCost;
        
        let denomForAverages = Math.max(1, totalSimDays - 31);
        let avgConsumption = actualConsumptionDelivered / denomForAverages;
        let avgMaint = maint / this.simYears;
        let reliability = 365 - ((daysFailed / denomForAverages) * 365);

        let baselineTotalLiters = targetConsumption * denomForAverages;
        let baselineGHG = (baselineTotalLiters * (6.5 / 1000)) + 2408;

        if (avgConsumption < 125) return this.generateFailLog(`Avg consumption (${avgConsumption.toFixed(0)} L) failed minimum 125 L/day.`);
        if ((totalCost / this.referenceCost) * 100 > 115) return this.generateFailLog(`Cost exceeded 115% threshold.`);
        if (riskExp > 24) return this.generateFailLog(`Risk exposure exceeded 24.`);
        if ((baseGhg / baselineGHG) * 100 > 110) return this.generateFailLog(`GHG Emissions exceeded 110% threshold.`);
        if (avgMaint > 60) return this.generateFailLog(`Maintenance events exceeded 60/year.`);
        if (reliability < 200) return this.generateFailLog(`Reliability (${reliability.toFixed(0)} days) failed minimum 200 days.`);

        let s_C = this.calcSatisfaction(avgConsumption, 125, 745, true);
        let s_Cost = this.calcSatisfaction((totalCost / this.referenceCost) * 100, 30, 115, false);
        let s_Risk = this.calcSatisfaction(riskExp, 1, 24, false); 
        let s_Ghg = this.calcSatisfaction((baseGhg / baselineGHG) * 100, 15, 110, false);
        let s_Maint = this.calcSatisfaction(avgMaint, 10, 60, false);
        let s_Rel = this.calcSatisfaction(reliability, 200, 365, true);
        let s_Flow = this.calcSatisfaction(flowRate_Lpm, 18, 40, true);
        let s_NonPotable = params.npws ? this.calcSatisfaction(actualNonPotableDelivered / denomForAverages, 0, targetConsumption * 0.3, true) : 0;

        let finalScore = ((s_C * this.weights.consumption) + (s_Cost * this.weights.cost) + (s_Risk * this.weights.risk) +
                          (s_Ghg * this.weights.ghg) + (s_Maint * this.weights.maintenance) + (s_Rel * this.weights.reliability) +
                          (s_Flow * this.weights.flowRate) + (s_NonPotable * this.weights.nonPotable)) * 100;

        const tableStyle = `width:100%; border-collapse:collapse; margin-bottom: 24px; font-size: 13px; text-align: left;`;
        const thStyle = `padding: 8px; border-bottom: 2px solid var(--accent); font-weight: bold; color: var(--text-main);`;
        const tdStyle = `padding: 8px; border-bottom: 1px solid var(--border); color: var(--text-main);`;

        this.lastMatrixData = `
            <div style="max-height: 50vh; overflow-y: auto; padding-right: 10px;">
                <h3 style="color:var(--accent); margin-bottom:8px; font-size:15px;">1. Hardware & Capital Expenditures (CapEx)</h3>
                <table style="${tableStyle}">
                    <tr><th style="${thStyle}">Component</th><th style="${thStyle}">Specification</th><th style="${thStyle}">Cost</th></tr>
                    <tr><td style="${tdStyle}">Roof Catchment</td><td style="${tdStyle}">${params.roof} m²</td><td style="${tdStyle}">$${roofCost}</td></tr>
                    ${params.addCatch > 0 ? `<tr><td style="${tdStyle}">Additional Catchment</td><td style="${tdStyle}">${params.addCatch} m² at Elev ${E_catch.toFixed(1)}m</td><td style="${tdStyle}">$${Math.round(addCatchCost)}</td></tr>` : ''}
                    <tr><td style="${tdStyle}">Catchment Tank</td><td style="${tdStyle}">${params.catchTank} L</td><td style="${tdStyle}">$${cTankCost}</td></tr>
                    <tr><td style="${tdStyle}">Storage Tank</td><td style="${tdStyle}">${params.tankVol} m³ at Elev ${E_tank.toFixed(1)}m</td><td style="${tdStyle}">$${sTankCost}</td></tr>
                    ${params.towerH > 0 ? `<tr><td style="${tdStyle}">Tower</td><td style="${tdStyle}">${params.towerH} m height</td><td style="${tdStyle}">$${Math.round(towerCost)}</td></tr>` : ''}
                    <tr><td style="${tdStyle}">Piping Setup</td><td style="${tdStyle}">${tankDist.toFixed(1)}m distance × 2 directions</td><td style="${tdStyle}">$${Math.round(pipeCost)}</td></tr>
                    <tr><td style="${tdStyle}">Water Pump</td><td style="${tdStyle}">Pump ${params.pump}</td><td style="${tdStyle}">$${pumpCost}</td></tr>
                    <tr><td style="${tdStyle}">Base 1μm Filter</td><td style="${tdStyle}">Included System Baseline</td><td style="${tdStyle}">$${baseFilterCost}</td></tr>
                    ${preFilterCost > 0 ? `<tr><td style="${tdStyle}">Pre-Filters</td><td style="${tdStyle}">${[params.f5um ? '5μm' : null, params.f200um ? '200μm' : null].filter(Boolean).join(' + ')}</td><td style="${tdStyle}">$${preFilterCost}</td></tr>` : ''}
                    <tr><td style="${tdStyle}">UV System</td><td style="${tdStyle}">${params.uv}W Unit</td><td style="${tdStyle}">$${uvCost}</td></tr>
                    <tr><td style="${tdStyle}">Chemical Module</td><td style="${tdStyle}">${params.chem === "ozone" ? "Ozone" : "Chlorine"}</td><td style="${tdStyle}">$${chemCost}</td></tr>
                    <tr><td style="${tdStyle}">Power Core Unit</td><td style="${tdStyle}">${params.power === 'solar' ? 'Solar Inverter & Charge Controller' : 'Diesel Generator Unit'}</td><td style="${tdStyle}">$${powerElectronicsCost}</td></tr>
                    ${params.power === 'solar' ? `<tr><td style="${tdStyle}">Solar Panels</td><td style="${tdStyle}">${params.panelQty} × ${params.solarModel}</td><td style="${tdStyle}">$${panelTotalCost}</td></tr>` : ''}
                    <tr><td style="${tdStyle}">Battery Bank</td><td style="${tdStyle}">${params.battQty} × Deep Cycle Lead-Acid</td><td style="${tdStyle}">$${battCost}</td></tr>
                    ${params.npws ? `<tr><td style="${tdStyle}">NPWS Level Sensor</td><td style="${tdStyle}">Required for NPWS functionality</td><td style="${tdStyle}">$${levelSensorCost}</td></tr>` : ''}
                    <tr style="background: rgba(0,0,0,0.02);"><td style="${tdStyle}; font-weight:bold;">Total CapEx</td><td style="${tdStyle}"></td><td style="${tdStyle}; font-weight:bold; color:var(--accent);">$${capCost.toLocaleString()}</td></tr>
                </table>

                <h3 style="color:var(--accent); margin-bottom:8px; font-size:15px;">2. Hydraulics & System Physics</h3>
                <table style="${tableStyle}">
                    <tr><th style="${thStyle}">Parameter</th><th style="${thStyle}">Calculated Value</th></tr>
                    <tr><td style="${tdStyle}">Pump Static Lift Requirement</td><td style="${tdStyle}">${h_pump_lift.toFixed(2)} m</td></tr>
                    <tr><td style="${tdStyle}">System Static Head (C_req)</td><td style="${tdStyle}">${C_req.toFixed(0)} Pa</td></tr>
                    <tr><td style="${tdStyle}">Dynamic Pump Intersection (Q_op)</td><td style="${tdStyle}">${Q_op.toFixed(1)} L/min</td></tr>
                    <tr><td style="${tdStyle}">Calculated Pump Efficiency (η)</td><td style="${tdStyle}">${(eta_pump * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">House Delivery Bottleneck</td><td style="${tdStyle}">${flowRate_Lpm.toFixed(1)} L/min</td></tr>
                </table>

                <h3 style="color:var(--accent); margin-bottom:8px; font-size:15px;">3. Operations & Maintenance (OpEx)</h3>
                <table style="${tableStyle}">
                    <tr><th style="${thStyle}">Category</th><th style="${thStyle}">Events/Usage</th><th style="${thStyle}">Cost</th></tr>
                    <tr><td style="${tdStyle}">1μm Filter Replacements</td><td style="${tdStyle}">${f1_replaces} units</td><td style="${tdStyle}">$${f1_replaces * 75}</td></tr>
                    ${params.f5um ? `<tr><td style="${tdStyle}">5μm Filter Replacements</td><td style="${tdStyle}">${f5_replaces} units</td><td style="${tdStyle}">$${f5_replaces * 60}</td></tr>` : ''}
                    ${params.f200um ? `<tr><td style="${tdStyle}">200μm Filter Replacements</td><td style="${tdStyle}">${f200_replaces} units</td><td style="${tdStyle}">$${f200_replaces * 50}</td></tr>` : ''}
                    <tr><td style="${tdStyle}">Pump Replacements</td><td style="${tdStyle}">${pumpReplaces} units</td><td style="${tdStyle}">$${pumpReplaces * pumpCost}</td></tr>
                    <tr><td style="${tdStyle}">UV Bulb Maintenance</td><td style="${tdStyle}">${uvMaint} cycles</td><td style="${tdStyle}">$${uvOpCost * uvMaint}</td></tr>
                    ${params.power === "solar" ? `<tr><td style="${tdStyle}">Power Outage Days</td><td style="${tdStyle}">${powerOutageDays} days</td><td style="${tdStyle}">$0</td></tr>` : `<tr><td style="${tdStyle}">Diesel Fuel & Servicing</td><td style="${tdStyle}">${dieselUsed_L.toFixed(0)} L used</td><td style="${tdStyle}">$${dieselOpCost}</td></tr>`}
                    <tr><td style="${tdStyle}">Chemical Supply Shipments</td><td style="${tdStyle}">${chlorineShipments} shipments</td><td style="${tdStyle}">$${chlorineShipments * 100}</td></tr>
                    <tr><td style="${tdStyle}">Emergency Shipped Water</td><td style="${tdStyle}">${daysFailed} days failed</td><td style="${tdStyle}">$${totalShippedCost.toLocaleString()}</td></tr>
                    <tr style="background: rgba(0,0,0,0.02);"><td style="${tdStyle}; font-weight:bold;">Total OpEx</td><td style="${tdStyle}"></td><td style="${tdStyle}; font-weight:bold; color:var(--accent);">$${opCost.toLocaleString()}</td></tr>
                </table>

                <h3 style="color:var(--accent); margin-bottom:8px; font-size:15px;">4. Environmental & Risk Profile</h3>
                <table style="${tableStyle}">
                    <tr><th style="${thStyle}">Metric</th><th style="${thStyle}">Value</th></tr>
                    <tr><td style="${tdStyle}">Dynamic Baseline GHG</td><td style="${tdStyle}">${baselineGHG.toLocaleString()} kgCO2e</td></tr>
                   <tr><td style="${tdStyle}">Hardware Manufacturing GHG</td><td style="${tdStyle}">${(2408 + (params.power === 'solar' ? 100 : 0) + solarGhg + battGhg + genGhg).toLocaleString()} kgCO2e</td></tr>
                    <tr><td style="${tdStyle}">System Operational GHG</td><td style="${tdStyle}">${(params.power === "diesel" ? (dieselUsed_L * 3.25) : (daysFailed * 0.325)).toFixed(1)} kgCO2e</td></tr>
                    <tr style="background: rgba(0,0,0,0.02);"><td style="${tdStyle}; font-weight:bold;">Total GHG Footprint</td><td style="${tdStyle}; font-weight:bold;">${baseGhg.toLocaleString()} kgCO2e (${((baseGhg / baselineGHG) * 100).toFixed(1)}%)</td></tr>
                    <tr style="background: rgba(0,0,0,0.02);"><td style="${tdStyle}; font-weight:bold;">Health & Environmental Risk</td><td style="${tdStyle}; font-weight:bold;">${riskExp.toFixed(1)} / 24 Max Limit</td></tr>
                </table>

                <h3 style="color:var(--accent); margin-bottom:8px; font-size:15px;">5. Performance & Satisfaction Scores</h3>
                <table style="${tableStyle}">
                    <tr><th style="${thStyle}">Metric</th><th style="${thStyle}">Sub-Score</th><th style="${thStyle}">Weight</th></tr>
                    <tr><td style="${tdStyle}">Consumption</td><td style="${tdStyle}">${(s_C * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.consumption * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">Relative Cost</td><td style="${tdStyle}">${(s_Cost * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.cost * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">Risk Likelihood</td><td style="${tdStyle}">${(s_Risk * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.risk * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">GHG Footprint</td><td style="${tdStyle}">${(s_Ghg * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.ghg * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">Maintenance Effort</td><td style="${tdStyle}">${(s_Maint * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.maintenance * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">Reliability (Uptime)</td><td style="${tdStyle}">${(s_Rel * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.reliability * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">On-Demand Flow Rate</td><td style="${tdStyle}">${(s_Flow * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.flowRate * 100).toFixed(1)}%</td></tr>
                    <tr><td style="${tdStyle}">Non-Potable Supply</td><td style="${tdStyle}">${(s_NonPotable * 100).toFixed(1)}%</td><td style="${tdStyle}">${(this.weights.nonPotable * 100).toFixed(1)}%</td></tr>
                    <tr style="background: rgba(0,102,204,0.1);"><td style="${tdStyle}; font-weight:bold; font-size:14px; color:var(--accent);">Final Weighted Score</td><td colspan="2" style="${tdStyle}; font-weight:bold; font-size:14px; color:var(--accent); text-align:right;">${finalScore.toFixed(2)}%</td></tr>
                </table>
            </div>`;
            
        let avgTankLevel = this.dailyTelemetry.length > 0 ? this.dailyTelemetry.reduce((a,b)=>a+b.storedWater,0) / this.dailyTelemetry.length : storedWater;
        let tankFillPercent = avgTankLevel / (params.tankVol * 1000);

        return {
            score: parseFloat(finalScore.toFixed(1)), exactScore: finalScore, cost: totalCost, ghg: baseGhg.toFixed(0),
            reliability: reliability.toFixed(0), maint: avgMaint.toFixed(1), risk: riskExp.toFixed(1),
            avgCons: avgConsumption.toFixed(0), flow: flowRate_Lpm.toFixed(1),
            nonPotableDelivered: actualNonPotableDelivered.toFixed(0),
            isFail: false, 
            dailyTelemetry: this.dailyTelemetry, 
            avgTankLevel: avgTankLevel,
            tankFillPercent: tankFillPercent,
            weights: this.weights, 
            consumptionScore: s_C, costScore: s_Cost, riskScore: s_Risk, ghgScore: s_Ghg,
            maintenanceScore: s_Maint, nonPotableScore: s_NonPotable, flowRateScore: s_Flow, reliabilityScore: s_Rel
        };
    }
}