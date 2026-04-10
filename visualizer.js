class RWHVisualizer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) { console.error('Visualizer: container not found:', containerId); return; }

        this.terrainData = [];
        for (let i = 0; i <= 120; i++) {
            this.terrainData[i] = [];
            for (let j = 0; j <= 120; j++) {
                this.terrainData[i][j] = 0;
            }
        }
        this.hasLoadedCSV = false;
        this.onDragEnd = null;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);

        this.camera = new THREE.PerspectiveCamera(45, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(40, 80, 140);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(40, 5, 40);
        this.controls.update();

        this.terrainMesh = null;
        this.houseMesh = null;
        this.houseRoof = null;
        this.exclusionMesh = null;
        this.tankMesh = null;
        this.towerMesh = null;
        this.catchMesh = null;
        this.waterLevelMesh = null;
        this.pipeGroup = new THREE.Group();
        this.scene.add(this.pipeGroup);
        this.labelGroup = new THREE.Group();
        this.scene.add(this.labelGroup);
        this.solarPanels = [];
        this.generatorMesh = null;

        this.flowSpeed = 0;
        this.pipeTexture = this.createFlowTexture();

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.draggedMesh = null;

        this.setupLighting();
        this.buildSky();
        this.buildTrueTerrain();
        this.buildExclusionZone();

        this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.renderer.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.renderer.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));

        window.addEventListener('resize', () => {
            if (!this.container) return;
            this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        });

        this.animate();
    }

    createFlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#cccccc';
        ctx.fillRect(0, 0, 32, 128);
        
        ctx.fillStyle = '#0066cc';
        ctx.fillRect(0, 0, 32, 64);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 2); 
        return tex;
    }

    setupLighting() {
        var hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        hemi.position.set(0, 100, 0);
        this.scene.add(hemi);
        this.hemiLight = hemi;

        this.dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.dirLight.position.set(80, 100, 80);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.left = -100;
        this.dirLight.shadow.camera.right = 100;
        this.dirLight.shadow.camera.top = 100;
        this.dirLight.shadow.camera.bottom = -100;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
    }

    buildSky() {
        this.skyGroup = new THREE.Group();
        this.scene.add(this.skyGroup);

        var sunGeo = new THREE.SphereGeometry(6, 32, 32);
        var sunMat = new THREE.MeshBasicMaterial({ color: 0xfff5b6 });
        this.sun = new THREE.Mesh(sunGeo, sunMat);
        this.sun.position.copy(this.dirLight.position);
        this.skyGroup.add(this.sun);

        var moonGeo = new THREE.SphereGeometry(5, 32, 32);
        var moonMat = new THREE.MeshStandardMaterial({ color: 0xddddff, emissive: 0x111122, roughness: 0.8 });
        this.moon = new THREE.Mesh(moonGeo, moonMat);
        this.moon.position.set(-80, 80, -80);
        this.moon.visible = false;
        this.skyGroup.add(this.moon);

        var starGeo = new THREE.BufferGeometry();
        var starPos = [];
        for(let i = 0; i < 400; i++) {
            let x = (Math.random() - 0.5) * 400;
            let y = Math.random() * 100 + 50;
            let z = (Math.random() - 0.5) * 400;
            starPos.push(x, y, z);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        var starMat = new THREE.PointsMaterial({color: 0xffffff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.8});
        this.stars = new THREE.Points(starGeo, starMat);
        this.stars.visible = false;
        this.skyGroup.add(this.stars);
    }

    getTerrainHeight(x, z) {
        var normX = (x + 20) / 120;
        var normY = (z + 20) / 120;
        var rawY = normX * 18 + normY * 15 - 2.5;
        var nwDepress = Math.exp(-Math.pow(normX - 0.2, 2) * 10 - Math.pow(normY - 0.8, 2) * 10) * -5;
        return rawY + Math.sin(x * 0.1) * 1.5 + Math.cos(z * 0.1) * 1.5 + nwDepress;
    }

    getZ(x, z) {
        var ix = Math.round(x + 20);
        var iy = Math.round(z + 20);
        if (this.hasLoadedCSV && ix >= 0 && ix <= 120 && iy >= 0 && iy <= 120) {
            return this.terrainData[ix][iy];
        }
        return this.getTerrainHeight(x, z);
    }

    buildTrueTerrain() {
        if (this.terrainMesh) this.scene.remove(this.terrainMesh);
        if (this.houseMesh) this.scene.remove(this.houseMesh);
        if (this.houseRoof) this.scene.remove(this.houseRoof);

        var geo = new THREE.BoxGeometry(120, 20, 120, 120, 1, 120);
        geo.translate(0, -10, 0); 
        var pos = geo.attributes.position;
        var colors = [];
        var minElev = Infinity, maxElev = -Infinity;
        var elevations = [];

        for (var i = 0; i < pos.count; i++) {
            var vy = pos.getY(i);
            if (vy > -0.1) { 
                var worldX = pos.getX(i) + 40;
                var worldZ = pos.getZ(i) + 40;
                var y = this.getZ(worldX, worldZ);
                elevations[i] = y;
                if (y < minElev) minElev = y;
                if (y > maxElev) maxElev = y;
            }
        }

        var range = maxElev - minElev || 1;

        for (var i = 0; i < pos.count; i++) {
            var vy = pos.getY(i);
            var col = new THREE.Color();
            
            if (vy > -0.1) {
                pos.setY(i, elevations[i]);
                var norm = (elevations[i] - minElev) / range;
                if (norm < 0.4) col.setRGB(0.1 + norm * 0.3, 0.3 + norm * 0.4, 0.1);
                else if (norm < 0.7) { var t = (norm - 0.4) / 0.3; col.setRGB(0.22 + t * 0.15, 0.46 + t * 0.1, 0.1 + t * 0.05); } 
                else { var t = (norm - 0.7) / 0.3; col.setRGB(0.37 + t * 0.2, 0.56 - t * 0.1, 0.15 + t * 0.15); }
            } else {
                pos.setY(i, -12); col.setRGB(0.35, 0.20, 0.12); 
            }
            colors.push(col.r, col.g, col.b);
        }

        pos.needsUpdate = true;
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
        geo.computeVertexNormals();

        var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.terrainMesh.position.set(40, 0, 40);
        this.terrainMesh.receiveShadow = true;
        this.terrainMesh.castShadow = true;
        this.scene.add(this.terrainMesh);

        this.buildHouse();
    }

    buildHouse() {
        if (this.houseMesh) this.scene.remove(this.houseMesh);
        if (this.houseRoof) this.scene.remove(this.houseRoof);

        var hY = this.getZ(0, 0);

        var wallGeo = new THREE.BoxGeometry(6, 4, 6);
        var wallMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
        this.houseMesh = new THREE.Mesh(wallGeo, wallMat);
        this.houseMesh.position.set(0, hY + 2, 0);
        this.houseMesh.castShadow = true;
        this.houseMesh.receiveShadow = true;
        this.scene.add(this.houseMesh);

        var roofGeo = new THREE.ConeGeometry(4.5, 3, 4);
        roofGeo.rotateY(Math.PI / 4);
        var roofMat = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.8 });
        this.houseRoof = new THREE.Mesh(roofGeo, roofMat);
        this.houseRoof.position.set(0, hY + 5.5, 0);
        this.houseRoof.castShadow = true;
        this.houseRoof.receiveShadow = true;
        this.scene.add(this.houseRoof);

        var dotGeo = new THREE.SphereGeometry(0.4, 16, 16);
        var dotMat = new THREE.MeshBasicMaterial({ color: 0x0099ff });
        var dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(0, hY + 0.5, 0);
        this.scene.add(dot);

        this.addLabel(0, hY + 8, 0, "House");
    }

    buildExclusionZone() {
        if (this.exclusionMesh) this.scene.remove(this.exclusionMesh);

        var geo = new THREE.PlaneGeometry(40, 40);
        geo.rotateX(-Math.PI / 2);
        var mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
        this.exclusionMesh = new THREE.Mesh(geo, mat);
        this.exclusionMesh.position.set(0, 0.2, 0); 
        this.scene.add(this.exclusionMesh);

        var pts = [
            new THREE.Vector3(-20, 0.3, -20), new THREE.Vector3(20, 0.3, -20),
            new THREE.Vector3(20, 0.3, 20), new THREE.Vector3(-20, 0.3, 20),
            new THREE.Vector3(-20, 0.3, -20)
        ];
        var lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        var lineMat = new THREE.LineBasicMaterial({ color: 0xff0000, opacity: 0.5, transparent: true });
        this.scene.add(new THREE.Line(lineGeo, lineMat));
    }

    updateSystemVisuals(params, heightFunc, results) {
        if (this.tankMesh) this.scene.remove(this.tankMesh);
        if (this.towerMesh) this.scene.remove(this.towerMesh);
        if (this.catchMesh) this.scene.remove(this.catchMesh);
        if (this.waterLevelMesh) this.scene.remove(this.waterLevelMesh);
        if (this.generatorMesh) { this.scene.remove(this.generatorMesh); this.generatorMesh = null; }
        this.solarPanels.forEach(function(p) { p.parent && p.parent.remove(p); });
        this.solarPanels = [];

        while (this.pipeGroup.children.length > 0) this.pipeGroup.remove(this.pipeGroup.children[0]);
        while (this.labelGroup.children.length > 0) this.labelGroup.remove(this.labelGroup.children[0]);

        var isFail = results && results.isFail;
        var fillPercent = (results && results.tankFillPercent) || 0.5;

        // DYNAMIC FLOW CALCULATION - using || 0 for safety
        this.flowSpeed = isFail ? 0 : (parseFloat(results.flow || 0) / 40) * 0.03;

        var tankX = params.tankX !== undefined ? params.tankX : 40;
        var tankY = params.tankY !== undefined ? params.tankY : 40; 
        var tankVol = params.tankVol || 5;
        var towerH = params.towerH || 0;
        var addCatch = params.addCatch || 0;
        var catchX = params.catchX !== undefined ? params.catchX : 60;
        var catchY = params.catchY !== undefined ? params.catchY : 60;

        var tY = this.getZ(tankX, tankY);
        var hY = this.getZ(0, 0);

        // ---- STORAGE TANK ----
        var tankRadius = Math.max(0.8, Math.sqrt(tankVol / Math.PI));
        var tankHeight = Math.max(1.5, tankVol / (Math.PI * tankRadius * tankRadius));
        if (towerH > 0) tankHeight = Math.min(tankHeight, 3);

        if (towerH > 0) {
            var towerGeo = new THREE.CylinderGeometry(tankRadius * 0.7, tankRadius * 0.85, towerH, 16);
            var towerMat = new THREE.MeshStandardMaterial({ color: 0x999999, wireframe: true, roughness: 0.3, metalness: 0.6 });
            this.towerMesh = new THREE.Mesh(towerGeo, towerMat);
            this.towerMesh.position.set(tankX, tY + towerH / 2, tankY);
            this.scene.add(this.towerMesh);
        }

        var tankColor = isFail ? 0xcc3333 : 0x336699;
        var tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 32);
        var tankMat = new THREE.MeshStandardMaterial({ color: tankColor, roughness: 0.4, metalness: 0.2 });
        this.tankMesh = new THREE.Mesh(tankGeo, tankMat);
        this.tankMesh.position.set(tankX, tY + towerH + tankHeight / 2, tankY);
        this.tankMesh.castShadow = true;
        this.tankMesh.receiveShadow = true;
        this.scene.add(this.tankMesh);

        var waterH = tankHeight * fillPercent;
        if (waterH > 0.05) {
            var waterGeo = new THREE.CylinderGeometry(tankRadius * 0.95, tankRadius * 0.95, waterH, 32);
            var waterMat = new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.5 });
            this.waterLevelMesh = new THREE.Mesh(waterGeo, waterMat);
            this.waterLevelMesh.position.set(tankX, tY + towerH + waterH / 2, tankY);
            this.scene.add(this.waterLevelMesh);
        }

        this.addLabel(tankX, tY + towerH + tankHeight + 2, tankY, "Tank " + tankVol + "m³");

        // ---- CATCHMENT & PIPES ----
        if (addCatch > 0) {
            var cY = this.getZ(catchX, catchY);
            var side = Math.sqrt(addCatch);
            var catchGeo = new THREE.PlaneGeometry(side, side);
            catchGeo.rotateX(-Math.PI / 2);
            var catchMat = new THREE.MeshStandardMaterial({ color: 0x228B22, transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.7 });
            this.catchMesh = new THREE.Mesh(catchGeo, catchMat);
            this.catchMesh.position.set(catchX, cY + 0.3, catchY);
            this.catchMesh.receiveShadow = true;
            this.scene.add(this.catchMesh);

            this.addLabel(catchX, cY + 2, catchY, "Catchment " + addCatch + "m²");
            this.drawAnimatedPipe(new THREE.Vector3(catchX, cY, catchY), new THREE.Vector3(0, hY, 0));
        }

        this.drawAnimatedPipe(new THREE.Vector3(0, hY, 0), new THREE.Vector3(tankX, tY + towerH, tankY));

        // ---- POWER SYSTEM ----
        if (params.power === 'solar' && params.panelQty > 0) {
            var qty = params.panelQty || 2;
            for (var i = 0; i < Math.min(qty, 10); i++) {
                var px = -5 - (i % 5) * 3;
                var pz = -8 - Math.floor(i / 5) * 3;
                var pY = this.getZ(px, pz);
                var panelGeo = new THREE.BoxGeometry(2, 0.1, 1.2);
                var panelMat = new THREE.MeshStandardMaterial({ color: 0x1a3366, roughness: 0.2, metalness: 0.6 });
                var panel = new THREE.Mesh(panelGeo, panelMat);
                panel.position.set(px, pY + 1.5, pz);
                panel.rotation.x = -0.5;
                panel.castShadow = true;
                panel.receiveShadow = true;
                this.scene.add(panel);
                this.solarPanels.push(panel);
            }
            if (qty > 0) this.addLabel(-8, this.getZ(-8, -10) + 4, -10, "Solar ×" + qty);
        } else if (params.power === 'diesel') {
            var gx = -6, gz = -6;
            var gY = this.getZ(gx, gz);
            var genGeo = new THREE.BoxGeometry(2, 1.5, 1.5);
            var genMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.4 });
            this.generatorMesh = new THREE.Mesh(genGeo, genMat);
            this.generatorMesh.position.set(gx, gY + 0.75, gz);
            this.generatorMesh.castShadow = true;
            this.generatorMesh.receiveShadow = true;
            this.scene.add(this.generatorMesh);
            this.addLabel(gx, gY + 3, gz, "Generator");
        }

        this.addLabel(0, hY + 8, 0, "House");
    }

    drawAnimatedPipe(start, end) {
        if (isNaN(start.x) || isNaN(start.y) || isNaN(start.z) || isNaN(end.x) || isNaN(end.y) || isNaN(end.z)) return;
        var d = start.distanceTo(end);
        if (d < 0.5) return;

        var tex = this.pipeTexture.clone();
        tex.needsUpdate = true;
        tex.repeat.set(1, d / 4);

        var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.4 });
        var geo = new THREE.CylinderGeometry(0.3, 0.3, d, 16);
        var mesh = new THREE.Mesh(geo, mat);

        mesh.position.copy(start).lerp(end, 0.5);
        var dir = new THREE.Vector3().subVectors(end, start).normalize();
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        this.pipeGroup.add(mesh);
    }

    onPointerDown(event) {
        var rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        var targets = [];
        if (this.tankMesh) targets.push(this.tankMesh);
        if (this.catchMesh) targets.push(this.catchMesh);

        var hits = this.raycaster.intersectObjects(targets);
        if (hits.length > 0) {
            this.controls.enabled = false;
            this.isDragging = true;
            this.draggedMesh = hits[0].object;
            this.draggedMesh.material.emissive = new THREE.Color(0x444444);
        }
    }

    onPointerMove(event) {
        if (!this.isDragging || !this.draggedMesh || !this.terrainMesh) return;

        var rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);

        var hits = this.raycaster.intersectObject(this.terrainMesh);
        if (hits.length > 0) {
            var pt = hits[0].point;
            var snappedX = Math.round(Math.max(-20, Math.min(100, pt.x)));
            var snappedZ = Math.round(Math.max(-20, Math.min(100, pt.z)));
            this.draggedMesh.position.x = snappedX;
            this.draggedMesh.position.z = snappedZ;

            if (this.draggedMesh === this.tankMesh && this.towerMesh) {
                this.towerMesh.position.x = snappedX;
                this.towerMesh.position.z = snappedZ;
            }
        }
    }

    onPointerUp(event) {
        if (this.isDragging && this.draggedMesh) {
            this.draggedMesh.material.emissive = new THREE.Color(0x000000);
            var isTank = (this.draggedMesh === this.tankMesh);
            var finalX = Math.round(this.draggedMesh.position.x);
            var finalZ = Math.round(this.draggedMesh.position.z);

            if (this.onDragEnd) this.onDragEnd(isTank ? 'tank' : 'catch', finalX, finalZ);
        }
        this.isDragging = false;
        this.draggedMesh = null;
        this.controls.enabled = true;
    }

    createTextCanvas(text, width, height, fillColor) {
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, width, height);

        ctx.font = 'Bold 24px Arial';
        ctx.fillStyle = fillColor || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var lines = text.split('\n');
        var lineHeight = 28;
        var startY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
        for (var i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
        }
        return canvas;
    }

    addLabel(x, y, z, text) {
        var canvas = this.createTextCanvas(text, 256, 64, '#ffffff');
        var texture = new THREE.CanvasTexture(canvas);
        var spriteMat = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: true });
        var sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(8, 2, 1);
        sprite.position.set(x, y, z);
        this.labelGroup.add(sprite);
    }

    toggleDayNight(isDark) {
        if (isDark) {
            this.scene.background.setHex(0x0a0a1a);
            if (this.hemiLight) this.hemiLight.intensity = 0.15;
            if (this.dirLight) {
                this.dirLight.intensity = 0.1;
                this.dirLight.position.set(-80, 80, -80);
            }
            if (this.sun) this.sun.visible = false;
            if (this.moon) this.moon.visible = true;
            if (this.stars) this.stars.visible = true;
        } else {
            this.scene.background.setHex(0x87CEEB);
            if (this.hemiLight) this.hemiLight.intensity = 0.6;
            if (this.dirLight) {
                this.dirLight.intensity = 0.8;
                this.dirLight.position.set(80, 100, 80);
            }
            if (this.sun) this.sun.visible = true;
            if (this.moon) this.moon.visible = false;
            if (this.stars) this.stars.visible = false;
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        if (this.pipeGroup && this.flowSpeed > 0) {
            this.pipeGroup.children.forEach(mesh => {
                if (mesh.material && mesh.material.map) {
                    mesh.material.map.offset.y -= this.flowSpeed;
                }
            });
        }

        this.renderer.render(this.scene, this.camera);
    }
}