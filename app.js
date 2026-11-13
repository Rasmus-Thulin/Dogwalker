import * as THREE from './node_modules/three/build/three.module.js';

// Home charging status dashboard
class ChargingDashboard {
    constructor() {
        localStorage.removeItem('teslaApiToken');
        this.refreshInterval = Math.min(3600, Math.max(60, Number.parseInt(localStorage.getItem('refreshInterval'), 10) || 60));
        this.apiBase = '';
        this.autoRefreshTimer = null;
        this.fetchInProgress = false;
        this.nextDeviceFetchAt = 0;
        this.vehicles = [];
        this.activeVehicleIndex = 0;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.sceneRig = null;
        this.vehicleModels = [];
        this.dragState = null;
        this.sceneFrame = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        document.getElementById('connectTibber').href = `${this.apiBase}/auth/login`;
        this.checkConnection();
        this.startAutoRefresh();
    }

    setupGarageScene() {
        const canvas = document.getElementById('garageCanvas');
        const stage = canvas.parentElement;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x090f0d, 15, 42);
        this.sceneRig = new THREE.Group();
        this.scene.add(this.sceneRig);

        this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        this.camera.position.set(0, 4.4, 12.5);
        this.camera.lookAt(0, 0.85, 0);

        this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;

        this.scene.add(new THREE.HemisphereLight(0xb9d8ca, 0x121814, 2.1));
        const keyLight = new THREE.DirectionalLight(0xf3fff8, 3.2);
        keyLight.position.set(-5, 9, 7);
        this.scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(0x69edbc, 2.3);
        rimLight.position.set(5, 4, -7);
        this.scene.add(rimLight);
        const fillLight = new THREE.DirectionalLight(0xe2fff0, 1.65);
        fillLight.position.set(1, 3.5, 10);
        this.scene.add(fillLight);
        const topLight = new THREE.PointLight(0xb9ffd9, 24, 18, 2);
        topLight.position.set(0, 7, 0);
        this.scene.add(topLight);

        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 80),
            new THREE.MeshStandardMaterial({ color: 0x0b1210, metalness: 0.28, roughness: 0.42 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.035;
        this.scene.add(floor);

        const grid = new THREE.GridHelper(40, 40, 0x244238, 0x15251f);
        grid.position.y = -0.02;
        grid.material.transparent = true;
        grid.material.opacity = 0.25;
        this.scene.add(grid);

        const resize = () => {
            const width = Math.max(1, stage.clientWidth);
            const height = Math.max(1, stage.clientHeight);
            const narrow = width < 680;
            this.camera.aspect = width / height;
            this.camera.position.set(0, narrow ? 4.2 : 4.35, narrow ? 11.6 : 12.5);
            this.camera.lookAt(0, narrow ? 1.05 : 1.12, 0);
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height, false);
            this.positionVehicleModels(narrow);
        };
        this.sceneResizeObserver = new ResizeObserver(resize);
        this.sceneResizeObserver.observe(stage);
        resize();

        canvas.addEventListener('pointerdown', event => {
            this.dragState = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
            canvas.setPointerCapture(event.pointerId);
            canvas.classList.add('is-dragging');
        });
        canvas.addEventListener('pointermove', event => {
            if (!this.dragState) return;
            const deltaX = event.clientX - this.dragState.x;
            const deltaY = event.clientY - this.dragState.y;
            this.sceneRig.rotation.y += deltaX * 0.006;
            this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y - deltaY * 0.012, 2.7, 7.2);
            this.camera.lookAt(0, 0.72, 0);
            this.dragState = { ...this.dragState, x: event.clientX, y: event.clientY };
        });
        const endDrag = () => {
            this.dragState = null;
            canvas.classList.remove('is-dragging');
        };
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);
        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z + event.deltaY * 0.008, 8.5, 20);
        }, { passive: false });

        this.animateGarageScene();
    }

    createVehicleModel(device) {
        const isModelY = /model\s*y/i.test(device.model);
        const group = new THREE.Group();
        group.userData.baseY = 0;
        group.userData.phase = this.vehicleModels.length * 1.8;
        group.userData.baseScale = 0.92;
        group.userData.targetScale = 0.92;

        const paintColor = isModelY ? 0x080808 : 0xe7e9e6;
        const bodyMaterial = new THREE.MeshPhysicalMaterial({
            color: paintColor,
            metalness: isModelY ? 0.58 : 0.3,
            roughness: isModelY ? 0.23 : 0.19,
            clearcoat: 1,
            clearcoatRoughness: 0.16
        });
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x13231f,
            metalness: 0.48,
            roughness: 0.12,
            clearcoat: 1,
            transparent: true,
            opacity: 0.92
        });
        const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x101514, metalness: 0.62, roughness: 0.28 });
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x080a0a, metalness: 0.16, roughness: 0.38 });
        const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xaab5af, metalness: 0.86, roughness: 0.2 });

        const profile = new THREE.Shape();
        if (isModelY) {
            profile.moveTo(-2.2, 0.48);
            profile.lineTo(-2.27, 0.76);
            profile.quadraticCurveTo(-2.25, 0.95, -1.92, 1.01);
            profile.lineTo(-1.35, 1.13);
            profile.quadraticCurveTo(-0.88, 1.82, -0.2, 1.89);
            profile.quadraticCurveTo(0.7, 1.95, 1.15, 1.26);
            profile.quadraticCurveTo(1.38, 1.04, 2.02, 0.98);
            profile.quadraticCurveTo(2.28, 0.94, 2.32, 0.69);
            profile.lineTo(2.22, 0.48);
        } else {
            profile.moveTo(-2.22, 0.48);
            profile.lineTo(-2.3, 0.75);
            profile.quadraticCurveTo(-2.26, 0.94, -1.9, 1.01);
            profile.lineTo(-1.34, 1.1);
            profile.quadraticCurveTo(-0.82, 1.69, -0.16, 1.72);
            profile.quadraticCurveTo(0.67, 1.78, 1.1, 1.17);
            profile.quadraticCurveTo(1.38, 1.0, 2.04, 0.96);
            profile.quadraticCurveTo(2.29, 0.93, 2.32, 0.69);
            profile.lineTo(2.22, 0.48);
        }
        profile.lineTo(-2.22, 0.48);
        const bodyGeometry = new THREE.ExtrudeGeometry(profile, {
            depth: 1.74,
            bevelEnabled: true,
            bevelSegments: 6,
            steps: 1,
            bevelSize: 0.085,
            bevelThickness: 0.07,
            curveSegments: 24
        });
        bodyGeometry.translate(0, 0, -0.87);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const sideGlass = new THREE.Shape();
        sideGlass.moveTo(-1.27, 1.17);
        sideGlass.lineTo(-0.79, isModelY ? 1.72 : 1.57);
        sideGlass.quadraticCurveTo(-0.68, isModelY ? 1.81 : 1.66, -0.42, isModelY ? 1.82 : 1.68);
        sideGlass.lineTo(0.13, isModelY ? 1.82 : 1.66);
        sideGlass.lineTo(0.74, 1.22);
        sideGlass.quadraticCurveTo(0.77, 1.16, 0.66, 1.15);
        sideGlass.lineTo(-1.13, 1.15);
        sideGlass.closePath();
        const glassGeometry = new THREE.ShapeGeometry(sideGlass, 12);
        [-0.955, 0.955].forEach(side => {
            const windowMesh = new THREE.Mesh(glassGeometry, glassMaterial);
            windowMesh.position.z = side;
            windowMesh.material = glassMaterial.clone();
            windowMesh.material.side = THREE.DoubleSide;
            group.add(windowMesh);
        });

        const windshieldGeometry = new THREE.BufferGeometry();
        windshieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
            1.0, 1.04, -0.69, 1.0, 1.04, 0.69,
            -0.48, isModelY ? 1.82 : 1.66, 0.67, -0.48, isModelY ? 1.82 : 1.66, -0.67,
            -1.45, 1.11, -0.67, -1.45, 1.11, 0.67,
            -0.96, isModelY ? 1.77 : 1.62, 0.66, -0.96, isModelY ? 1.77 : 1.62, -0.66
        ], 3));
        windshieldGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
        windshieldGeometry.computeVertexNormals();
        const windshield = new THREE.Mesh(windshieldGeometry, glassMaterial.clone());
        windshield.material.side = THREE.DoubleSide;
        group.add(windshield);

        const roofLine = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.035, 1.62), trimMaterial);
        roofLine.position.set(-0.02, isModelY ? 1.91 : 1.75, 0);
        group.add(roofLine);

        [-1.34, 1.28].forEach(wheelX => {
            [-0.91, 0.91].forEach(side => {
                const wheel = new THREE.Group();
                wheel.position.set(wheelX, 0.45, side);
                const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.19, 40), wheelMaterial);
                tire.rotation.x = Math.PI / 2;
                tire.castShadow = true;
                wheel.add(tire);
                const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.202, 32), rimMaterial);
                rim.rotation.x = Math.PI / 2;
                wheel.add(rim);
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.21, 20), trimMaterial);
                hub.rotation.x = Math.PI / 2;
                wheel.add(hub);
                for (let spokeIndex = 0; spokeIndex < 5; spokeIndex++) {
                    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.31, 0.035), rimMaterial);
                    spoke.rotation.z = (Math.PI * 2 * spokeIndex) / 5;
                    spoke.position.z = side > 0 ? 0.108 : -0.108;
                    wheel.add(spoke);
                }
                group.add(wheel);
            });
        });

        const frontLight = new THREE.MeshStandardMaterial({ color: 0xe4f6ed, emissive: 0x90d9bb, emissiveIntensity: 1.2 });
        [-0.57, 0.57].forEach(side => {
            const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.42), frontLight);
            lamp.position.set(2.3, 0.76, side);
            group.add(lamp);
        });
        const rearLight = new THREE.MeshStandardMaterial({ color: 0x6d2927, emissive: 0xb83431, emissiveIntensity: 0.85 });
        [-0.58, 0.58].forEach(side => {
            const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.38), rearLight);
            lamp.position.set(-2.27, 0.73, side);
            group.add(lamp);
        });

        const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(2.6, 48),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.48, depthWrite: false })
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.015;
        shadow.scale.set(1, 0.48, 1);
        group.add(shadow);

        return group;
    }

    positionVehicleModels(narrow = window.innerWidth < 680) {
        this.vehicleModels.forEach((model, index) => {
            if (narrow) {
                model.position.set(index === 0 ? -1.08 : 1.08, 0, 0);
                model.rotation.y = -1.05;
                model.userData.baseScale = 0.88;
            } else {
                model.position.set(index === 0 ? -2.72 : 2.72, 0, 0);
                model.rotation.y = -0.38;
                model.userData.baseScale = 0.92;
            }
            model.userData.targetScale = model.userData.baseScale;
            model.scale.setScalar(model.userData.baseScale);
        });
    }

    updateGarageScene(devices) {
        this.vehicleModels.forEach(model => this.sceneRig.remove(model));
        this.vehicleModels = devices.map(device => {
            const model = this.createVehicleModel(device);
            this.sceneRig.add(model);
            return model;
        });
        this.positionVehicleModels();
        const [first, second] = devices;
        if (first) {
            document.getElementById('sceneNameOne').textContent = first.name;
            document.getElementById('sceneModelOne').textContent = `${first.model} · ${first.paint}`.toUpperCase();
        }
        if (second) {
            document.getElementById('sceneNameTwo').textContent = second.name;
            document.getElementById('sceneModelTwo').textContent = `${second.model} · ${second.paint}`.toUpperCase();
        }
        document.querySelector('.scene-caption-right').hidden = devices.length < 2;
        document.querySelector('.scene-caption-left').hidden = devices.length === 0;
    }

    animateGarageScene() {
        const tick = time => {
            this.sceneFrame = requestAnimationFrame(tick);
            const seconds = time * 0.001;
            this.vehicleModels.forEach(model => {
                model.position.y = Math.sin(seconds * 0.8 + model.userData.phase) * 0.025;
                const targetScale = model.userData.targetScale || model.userData.baseScale;
                model.scale.setScalar(THREE.MathUtils.lerp(model.scale.x, targetScale, 0.08));
            });
            this.renderer.render(this.scene, this.camera);
        };
        this.sceneFrame = requestAnimationFrame(tick);
    }

    setupEventListeners() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.checkConnection();
        });
        window.addEventListener('online', () => this.checkConnection());

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });

        // Modal close
        document.querySelector('.close').addEventListener('click', () => {
            this.hideSettings();
        });

        // Save settings
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('saveTibberConfig').addEventListener('click', () => {
            this.saveTibberConfig();
        });

        // Close modal on outside click
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('settingsModal');
            if (e.target === modal) {
                this.hideSettings();
            }
        });
    }

    showSettings() {
        document.getElementById('settingsModal').style.display = 'block';
        document.getElementById('refreshInterval').value = this.refreshInterval;
        this.checkConnection();
    }

    hideSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    saveSettings() {
        const interval = Number.parseInt(document.getElementById('refreshInterval').value, 10);
        this.refreshInterval = Math.min(3600, Math.max(60, interval || 60));
        localStorage.setItem('refreshInterval', String(this.refreshInterval));

        this.hideSettings();
        this.startAutoRefresh();
        this.fetchData();
    }

    async saveTibberConfig() {
        const clientId = document.getElementById('tibberClientId').value.trim();
        const clientSecret = document.getElementById('tibberClientSecret').value.trim();
        if (!clientId || !clientSecret) {
            this.showError('Enter both the Tibber Client ID and Client Secret.');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/auth/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save Tibber credentials.');
            document.getElementById('tibberClientSecret').value = '';
            this.hideError();
            await this.checkConnection();
        } catch (error) {
            this.showError(error.message);
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
        }
        this.autoRefreshTimer = setInterval(() => {
            if (!document.hidden) this.fetchData();
        }, this.refreshInterval * 1000);
    }

    async fetchData() {
        if (this.fetchInProgress || Date.now() < this.nextDeviceFetchAt) return;
        this.fetchInProgress = true;
        if (this.vehicles.length === 0) this.showLoading();
        this.hideError();

        try {
            await this.fetchTibberDevices();
        } catch (error) {
            const delay = Math.max(30, Number(error.retryAfter) || 0);
            this.nextDeviceFetchAt = Date.now() + delay * 1000;
            if (this.vehicles.length === 0) this.displayDevices([]);
            this.showError(error.status === 429 ? this.pausedUpdateMessage(this.nextDeviceFetchAt) : error.message);
        } finally {
            this.fetchInProgress = false;
            this.hideLoading();
        }
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.apiBase}/api/auth/status`);
            const status = await response.json();
            const clientIdInput = document.getElementById('tibberClientId');
            document.getElementById('tibberCredentials').hidden = Boolean(status.managed);
            if (status.clientId && !clientIdInput.value) clientIdInput.value = status.clientId;
            const configurationPrompt = status.managed
                ? 'Configure TIBBER_CLIENT_ID and TIBBER_CLIENT_SECRET on the server.'
                : 'Enter your Tibber Client ID and Client Secret below.';
            document.getElementById('connectionStatus').textContent = status.connected
                ? 'Your Tibber account is connected.'
                : status.configured
                    ? 'Connect your Tibber account to view live data.'
                    : configurationPrompt;
            if (status.connected) {
                await this.fetchData();
            } else {
                this.displayDevices([]);
                this.showError(status.configured
                    ? 'Connect your Tibber account via Login below to view live data.'
                    : configurationPrompt);
            }
        } catch (error) {
            document.getElementById('connectionStatus').textContent = 'Cannot reach the server.';
            if (this.vehicles.length === 0) this.displayDevices([]);
            this.showError('Start the server with npm start and open http://localhost:5175.');
        }
    }

    async fetchTibberDevices() {
        const response = await fetch(`${this.apiBase}/api/devices`);
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || `Could not fetch Tibber devices (${response.status}).`);
            error.status = response.status;
            error.retryAfter = Number(result.retryAfter) || (response.status === 429 ? 300 : 30);
            throw error;
        }

        const devices = Array.isArray(result.devices) ? result.devices : [];
        const vehicles = devices
            .map(device => this.formatTibberDevice(device))
            .filter(device => device.category === 'Bil');
        if (vehicles.length === 0) {
            throw new Error('No vehicles found. Check your Tibber connections and OAuth vehicle access.');
        }
        this.displayDevices(vehicles);
        this.lastDataUpdatedAt = Number(result.updatedAt) || Date.now();
        this.updateLastUpdatedTime(this.lastDataUpdatedAt);
        this.nextDeviceFetchAt = Date.now() + Math.max(this.refreshInterval, Number(result.retryAfter) || 0) * 1000;
        if (result.stale) this.showError(this.pausedUpdateMessage(this.nextDeviceFetchAt));
    }

    pausedUpdateMessage(retryAt) {
        const format = timestamp => new Date(timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        const lastUpdate = this.lastDataUpdatedAt ? ` Showing values from ${format(this.lastDataUpdatedAt)}.` : '';
        return `Tibber updates paused. Retrying after ${format(retryAt)}.${lastUpdate}`;
    }

    formatTibberDevice(device) {
        const info = device.info || {};
        const capabilities = Array.isArray(device.capabilities) ? device.capabilities : [];
        const metrics = capabilities
            .filter(capability => capability.value !== null && capability.value !== undefined)
            .map(capability => {
                const label = capability.description || capability.id || 'Metric';
                let value = capability.value;
                let unit = capability.unit || '';
                if (/range/i.test(label) && unit.toLowerCase() === 'm') {
                    value = Number(value) / 1000;
                    unit = 'km';
                } else if (/power flow/i.test(label) && unit.toLowerCase() === 'w') {
                    value = Number(value) / 1000;
                    unit = 'kW';
                }
                return { label, value, unit };
            });
        const hasVehicleMetrics = metrics.some(metric =>
            /state of charge|estimated remaining driving range|vehicle plug status|vehicle charging status/i.test(metric.label)
        );
        const hasChargerMetrics = metrics.some(metric =>
            /charger connector status|charger charging status|number of phases|charge current/i.test(metric.label)
        );
        const category = device.category || device.type ||
            (hasVehicleMetrics ? 'Bil' : hasChargerMetrics ? 'Laddare' : 'Tibber-enhet');
        const name = info.name || device.name || 'Connected device';
        const presentation = {
            gullan: {
                model: 'Tesla Model Y',
                paint: 'Deep black',
                sketchfabModelId: 'e0f703b823e74746b40634d1876f6a13',
                modelAuthor: 'SQUIR3D',
                license: 'Editorial',
                paintClass: 'paint-graphite',
                paintFinish: 'gloss',
                lighting: { exposure: 0.65, lightIntensity: 1 },
                paintColor: [0.004, 0.004, 0.004],
                paintMaterials: ['body'],
                batteryCapacityKwh: 75
            },
            tessan: {
                model: 'Tesla Model Y',
                paint: 'White',
                sketchfabModelId: 'e0f703b823e74746b40634d1876f6a13',
                modelAuthor: 'SQUIR3D',
                license: 'Editorial',
                paintClass: 'paint-white',
                paintFinish: 'high-gloss',
                lighting: { exposure: 0.38, lightIntensity: 0.65 },
                paintColor: [0.8, 0.8, 0.8],
                // Bloom spills the bright white paint beyond the car silhouette.
                postProcessing: { bloomEnable: false },
                paintMaterials: ['body'],
                batteryCapacityKwh: 75
            }
        }[name.toLowerCase()];
        const model = presentation?.model || [info.brand, info.model].filter(Boolean).join(' ').replace(/Model(?=[0-9YXS])/i, 'Model ');

        return {
            id: device.id || name,
            name,
            model,
            category,
            paint: presentation?.paint || '',
            sketchfabModelId: presentation?.sketchfabModelId || '',
            modelAuthor: presentation?.modelAuthor || '',
            modelLicense: presentation?.license || '',
            paintClass: presentation?.paintClass || '',
            cameraHeading: presentation?.cameraHeading || 0,
            animationPose: presentation?.animationPose || null,
            hiddenObjects: presentation?.hiddenObjects || [],
            paintColor: presentation?.paintColor || null,
            paintFinish: presentation?.paintFinish || '',
            lighting: presentation?.lighting || null,
            postProcessing: presentation?.postProcessing || null,
            paintMaterials: presentation?.paintMaterials || [],
            batteryCapacityKwh: presentation?.batteryCapacityKwh || null,
            currentEnergyPrice: device.currentEnergyPrice || null,
            homeName: device.homeName || '',
            metrics,
            lastSeen: device.status?.lastSeen || null
        };
    }

    displayDevices(devices) {
        this.vehicles = devices;
        const container = document.getElementById('carsContainer');
        if (devices.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'No vehicles available';
            container.replaceChildren(empty);
            return;
        }

        container.querySelector('.empty-state')?.remove();
        const existingPanels = new Map([...container.querySelectorAll('.vehicle-panel')]
            .map(panel => [panel.dataset.vehicleId, panel]));
        devices.forEach(vehicle => {
            const existing = existingPanels.get(String(vehicle.id));
            existingPanels.delete(String(vehicle.id));
            if (existing && existing.dataset.modelId === vehicle.sketchfabModelId) {
                existing.setAttribute('aria-label', vehicle.name);
                existing.querySelector('h2').textContent = vehicle.name;
                this.renderVehicleStats(vehicle, existing.querySelector('.vehicle-panel-stats'));
                return;
            }
            existing?.remove();
            const panel = this.createVehiclePanel(vehicle);
            container.appendChild(panel);
            this.initializeVehicleViewer(panel.querySelector('iframe'), vehicle);
        });
        existingPanels.forEach(panel => panel.remove());
    }

    createVehiclePanel(vehicle) {
        const panel = document.createElement('article');
        panel.className = `vehicle-panel ${vehicle.paintClass}`;
        panel.dataset.vehicleId = String(vehicle.id);
        panel.dataset.modelId = vehicle.sketchfabModelId;
        panel.setAttribute('aria-label', vehicle.name);
        const heading = document.createElement('header');
        heading.className = 'vehicle-panel-heading';
        const identity = document.createElement('div');
        const name = document.createElement('h2');
        name.textContent = vehicle.name;
        identity.appendChild(name);
        heading.appendChild(identity);

        const surface = document.createElement('div');
        surface.className = 'vehicle-panel-surface';
        const viewer = document.createElement('iframe');
        viewer.className = `model-frame ${vehicle.paintClass}`;
        viewer.title = `${vehicle.model} 3D view`;
        viewer.allow = 'autoplay; fullscreen; xr-spatial-tracking';
        viewer.referrerPolicy = 'strict-origin-when-cross-origin';
        surface.appendChild(viewer);
        const stats = document.createElement('div');
        stats.className = 'console-stats vehicle-panel-stats';
        this.renderVehicleStats(vehicle, stats);
        panel.append(heading, surface, stats);
        return panel;
    }

    initializeVehicleViewer(viewer, vehicle, attempt = 0) {
        if (window.Sketchfab) {
            viewer.dataset.viewerState = 'loading';
            let settled = false;
            let timeout;
            const retry = () => {
                if (settled || !viewer.isConnected) return;
                settled = true;
                clearTimeout(timeout);
                if (attempt < 2) {
                    this.initializeVehicleViewer(viewer, vehicle, attempt + 1);
                } else {
                    viewer.dataset.viewerState = 'fallback';
                    viewer.src = this.getSketchfabEmbedUrl(vehicle.sketchfabModelId);
                }
            };
            timeout = setTimeout(retry, 20000);
            const client = new window.Sketchfab('1.12.1', viewer);
            client.init(vehicle.sketchfabModelId, {
                success: api => {
                    if (settled || !viewer.isConnected) return;
                    settled = true;
                    clearTimeout(timeout);
                    viewer.dataset.viewerState = 'ready';
                    api.addEventListener('viewerready', () => {
                        if (!viewer.isConnected) return;
                        this.applyVehiclePaint(api, vehicle);
                        if (vehicle.lighting) api.setEnvironment(vehicle.lighting);
                        if (vehicle.postProcessing) api.setPostProcessing(vehicle.postProcessing);
                        api.setUserInteraction(true);
                        this.applyVehiclePose(api, vehicle, () => {
                            this.hideVehicleObjects(api, vehicle, () => {
                                if (viewer.isConnected) this.frameVehicle(api, viewer, vehicle);
                            });
                        });
                    });
                    api.start();
                },
                error: retry,
                autostart: 1,
                animation_autoplay: 0,
                transparent: 1,
                ui_stop: 1,
                ui_theme: 'dark',
                ui_controls: 1,
                ui_infos: 1,
                ui_watermark: 1,
                ui_settings: 1,
                ui_fullscreen: 1,
                ui_inspector: 1
            });
        } else {
            viewer.dataset.viewerState = 'fallback';
            viewer.src = this.getSketchfabEmbedUrl(vehicle.sketchfabModelId);
        }
    }

    getSketchfabEmbedUrl(modelId) {
        return `https://sketchfab.com/models/${modelId}/embed?autostart=1&animation_autoplay=0&transparent=1&ui_stop=1&ui_theme=dark&ui_controls=1&ui_infos=1&ui_watermark=1&ui_settings=1&ui_fullscreen=1&ui_inspector=1`;
    }

    applyVehiclePose(api, vehicle, onReady) {
        const pose = vehicle.animationPose;
        if (!pose) return onReady();
        api.setCurrentAnimationByUID(pose.uid, animationError => {
            if (animationError) return onReady();
            api.pause(pauseError => {
                if (pauseError) return onReady();
                api.seekTo(pose.time, () => onReady());
            });
        });
    }

    hideVehicleObjects(api, vehicle, onReady) {
        if (!vehicle.hiddenObjects?.length) return onReady();
        api.getNodeMap((error, nodeMap) => {
            if (error) return onReady();
            const objects = Object.values(nodeMap).filter(node =>
                node.type === 'MatrixTransform' && vehicle.hiddenObjects.includes(node.name));
            if (!objects.length) return onReady();
            let remaining = objects.length;
            objects.forEach(node => api.hide(node.instanceID, () => {
                if (--remaining === 0) onReady();
            }));
        });
    }

    frameVehicle(api, viewer, vehicle) {
        api.setEnableCameraConstraints(false);
        const centerCamera = vehicle.hiddenObjects?.length
            ? api.focusOnVisibleGeometries.bind(api) : api.recenterCamera.bind(api);
        api.setFov(35, () => {
            centerCamera(error => {
                if (error) return;
                api.getCameraLookAt((cameraError, camera) => {
                    if (cameraError) return;
                    const distance = Math.hypot(...camera.position.map((coordinate, axis) => coordinate - camera.target[axis])) * 0.82;
                    const azimuth = (55 + vehicle.cameraHeading) * Math.PI / 180;
                    const elevation = 14 * Math.PI / 180;
                    const direction = [
                        Math.sin(azimuth) * Math.cos(elevation),
                        -Math.cos(azimuth) * Math.cos(elevation),
                        Math.sin(elevation)
                    ];
                    const position = camera.target.map((coordinate, axis) => coordinate + direction[axis] * distance);
                    const groundHeight = Math.max(0, camera.target[2]);
                    const groundDepth = distance + groundHeight * Math.sin(elevation);
                    const groundOffset = groundHeight * Math.cos(elevation) / (2 * groundDepth * Math.tan(35 * Math.PI / 360));
                    if (viewer.isConnected) {
                        const surface = viewer.parentElement;
                        surface.style.setProperty('--contact-shadow-x', '50%');
                        surface.style.setProperty('--contact-shadow-y', `${Math.max(52, Math.min(82, 50 + groundOffset * 100))}%`);
                    }
                    api.setCameraLookAt(position, camera.target, 0, () => {
                        api.setUserInteraction(true);
                    });
                });
            });
        });
    }

    applyVehiclePaint(api, vehicle) {
        if (!vehicle.paintColor || vehicle.paintMaterials.length === 0) return;
        const reflective = vehicle.paintFinish === 'high-gloss';
        const glossy = reflective || vehicle.paintFinish === 'gloss';
        if (glossy) api.setShadingStyle('pbr', { type: 'lit' });
        api.getMaterialList((error, materials) => {
            if (error) return;
            materials
                .filter(material => vehicle.paintMaterials.includes(material.name))
                .forEach(material => {
                    let changed = false;
                    ['AlbedoPBR', 'DiffusePBR', 'DiffuseColor'].forEach(channelName => {
                        const channel = material.channels[channelName];
                        if (!channel || channel.texture) return;
                        channel.enable = true;
                        channel.color = [...vehicle.paintColor];
                        changed = true;
                    });
                    if (glossy) {
                        material.shadeless = false;
                        material.reflection = reflective ? 0.8 : 0.45;
                        const finish = {
                            Matcap: { enable: false },
                            RoughnessPBR: { enable: true, factor: reflective ? 0.12 : 0.22 },
                            GlossinessPBR: { enable: true, factor: reflective ? 0.88 : 0.78 },
                            MetalnessPBR: { enable: true, factor: 0.05 },
                            ClearCoat: { enable: true, factor: reflective ? 0.8 : 0.3, reflectivity: reflective ? 0.3 : 0.15, tint: [1, 1, 1], thickness: 0 },
                            ClearCoatRoughness: { enable: true, factor: reflective ? 0.035 : 0.08 },
                            SpecularHardness: { enable: true, factor: 0.75 },
                            SpecularF0: { enable: true, factor: 0.04 },
                            SpecularColor: { enable: true, factor: 1, color: [0.12, 0.12, 0.12] }
                        };
                        Object.entries(finish).forEach(([channelName, settings]) => {
                            if (material.channels[channelName]) Object.assign(material.channels[channelName], settings);
                        });
                        changed = true;
                    }
                    if (changed) api.setMaterial(material);
                });
        });
    }

    renderVehicleStats(vehicle, stats) {
        stats.replaceChildren();
        const battery = vehicle.metrics.find(metric => /state of charge|battery level/i.test(metric.label));
        const range = vehicle.metrics.find(metric => /estimated remaining driving range|range/i.test(metric.label));
        const target = vehicle.metrics.find(metric => /target state of charge|charge limit/i.test(metric.label));
        const power = vehicle.metrics.find(metric => /power flow to vehicle battery/i.test(metric.label));
        const statusMetric = vehicle.metrics.find(metric => /vehicle charging status|charging status|charging state/i.test(metric.label));
        const rawStatus = String(statusMetric?.value || '').toLowerCase();
        const costEstimate = this.estimateChargeCost(vehicle, battery, target);

        const mainStats = document.createElement('div');
        mainStats.className = 'console-main-stats';
        mainStats.append(
            this.createConsoleStat('Battery', battery ? `${Math.round(Number(battery.value))}%` : '–', 'console-battery'),
            this.createConsoleStat('Range', range ? `${Math.round(Number(range.value))} km` : '–', 'console-range')
        );

        const details = document.createElement('div');
        details.className = 'console-details';
        details.append(
            this.createConsoleStat(target ? 'Charge limit' : 'Charge power', target ? `${target.value}%` : power ? `${power.value} ${power.unit}` : '–', ''),
            this.createConsoleStat('Est. cost to limit', costEstimate || '–', 'console-charge-cost')
        );

        const batteryTrack = document.createElement('div');
        batteryTrack.className = 'console-battery-track';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(0, Math.min(100, Number(battery?.value) || 0))}%`;
        fill.className = rawStatus === 'charging' ? 'is-charging' : '';
        batteryTrack.setAttribute('role', 'meter');
        batteryTrack.setAttribute('aria-label', 'Battery level');
        batteryTrack.setAttribute('aria-valuemin', '0');
        batteryTrack.setAttribute('aria-valuemax', '100');
        const level = Number(battery?.value);
        if (battery && Number.isFinite(level)) {
            batteryTrack.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, level))));
            batteryTrack.setAttribute('aria-valuetext', `${Math.round(level)} percent${rawStatus === 'charging' ? ', charging' : ''}`);
        } else {
            batteryTrack.setAttribute('aria-valuetext', 'Battery level unavailable');
            batteryTrack.classList.add('is-unknown');
        }
        batteryTrack.appendChild(fill);
        stats.append(mainStats, batteryTrack, details);
    }

    estimateChargeCost(vehicle, battery, target) {
        const current = Number(battery?.value);
        const limit = Number(target?.value);
        const capacity = Number(vehicle.batteryCapacityKwh);
        const price = Number(vehicle.currentEnergyPrice?.perKwh);
        if (![current, limit, capacity, price].every(Number.isFinite) || limit <= current || price < 0) return '';
        const gridEnergy = capacity * ((limit - current) / 100) / 0.9;
        const cost = gridEnergy * price;
        const currency = vehicle.currentEnergyPrice.currency === 'SEK' ? 'kr' : vehicle.currentEnergyPrice.currency;
        return `≈ ${cost.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} ${currency}`;
    }

    createConsoleStat(labelText, valueText, className = '') {
        const stat = document.createElement('div');
        stat.className = `console-stat ${className}`.trim();
        const label = document.createElement('span');
        label.textContent = labelText;
        const value = document.createElement('strong');
        value.textContent = valueText;
        stat.append(label, value);
        return stat;
    }

    createVehicleSummary(device, index) {
        const row = document.createElement('article');
        row.className = 'sketchfab-vehicle';
        row.dataset.vehicleIndex = String(index);

        const surface = document.createElement('div');
        surface.className = 'sketchfab-surface';
        const viewer = document.createElement('iframe');
        viewer.title = `${device.model} 3D-modell`;
        viewer.src = `https://sketchfab.com/models/${device.sketchfabModelId}/embed?autostart=1&transparent=1&ui_controls=0&ui_infos=0&ui_hint=0&ui_watermark=0&ui_settings=0&ui_fullscreen=0&ui_inspector=0`;
        viewer.allow = 'autoplay; fullscreen; xr-spatial-tracking';
        viewer.loading = index === 0 ? 'eager' : 'lazy';
        viewer.referrerPolicy = 'strict-origin-when-cross-origin';
        surface.appendChild(viewer);
        row.appendChild(surface);

        const identity = document.createElement('div');
        identity.className = 'live-identity';
        const indexLabel = document.createElement('span');
        indexLabel.className = 'live-index';
        indexLabel.textContent = String(index + 1).padStart(2, '0');
        const identityText = document.createElement('div');
        const name = document.createElement('h2');
        name.textContent = device.name;
        const model = document.createElement('span');
        model.textContent = `${device.model} · ${device.paint}`;
        identityText.append(name, model);
        identity.append(indexLabel, identityText);

        const battery = device.metrics.find(metric => /state of charge|battery level/i.test(metric.label));
        const range = device.metrics.find(metric => /estimated remaining driving range|range/i.test(metric.label));
        const target = device.metrics.find(metric => /target state of charge|charge limit/i.test(metric.label));
        const power = device.metrics.find(metric => /power flow to vehicle battery/i.test(metric.label));
        const statusMetric = device.metrics.find(metric => /vehicle charging status|charging status|charging state/i.test(metric.label));
        const rawStatus = String(statusMetric?.value || '').toLowerCase();
        const statusLabels = { charging: 'Laddar', idle: 'Parkerad', connected: 'Ansluten', disconnected: 'Frånkopplad', complete: 'Klar' };

        const batteryStat = this.createLiveStat('BATTERI', battery ? `${Math.round(Number(battery.value))}%` : '–', 'stat-battery');
        const rangeStat = this.createLiveStat('RÄCKVIDD', range ? `${Math.round(Number(range.value))} km` : '–', 'stat-range');
        const statusStat = this.createLiveStat('STATUS', statusLabels[rawStatus] || 'Okänd', rawStatus === 'charging' ? 'stat-charging' : '');
        const extraMetric = target || (rawStatus === 'charging' ? power : null);
        const extraStat = this.createLiveStat(target ? 'LADDMÅL' : 'EFFEKT', extraMetric ? `${extraMetric.value} ${extraMetric.unit}`.trim() : '–', 'stat-extra');

        const stats = document.createElement('div');
        stats.className = 'live-stats';
        stats.append(batteryStat, rangeStat, extraStat, statusStat);

        const progress = document.createElement('div');
        progress.className = 'live-battery-track';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(0, Math.min(100, Number(battery?.value) || 0))}%`;
        fill.className = rawStatus === 'charging' ? 'is-charging' : '';
        progress.appendChild(fill);

        const data = document.createElement('div');
        data.className = 'sketchfab-telemetry';
        data.append(identity, stats, progress);
        const credit = document.createElement('a');
        credit.className = 'sketchfab-credit';
        credit.href = `https://sketchfab.com/${device.modelAuthor}`;
        credit.target = '_blank';
        credit.rel = 'noreferrer';
        credit.textContent = `3D-modell av ${device.modelAuthor} · Sketchfab`;
        data.appendChild(credit);
        row.appendChild(data);
        return row;
    }

    createLiveStat(labelText, valueText, className = '') {
        const stat = document.createElement('div');
        stat.className = `live-stat ${className}`.trim();
        const label = document.createElement('span');
        label.textContent = labelText;
        const value = document.createElement('strong');
        value.textContent = valueText;
        stat.append(label, value);
        return stat;
    }

    highlightVehicle(index) {
        this.vehicleModels.forEach((model, modelIndex) => {
            model.userData.targetScale = index === -1 || index === modelIndex ? model.userData.baseScale : model.userData.baseScale * 0.9;
        });
    }

    createVehicleCard(device, index) {
        const card = document.createElement('article');
        card.className = 'vehicle-card';

        const visual = document.createElement('div');
        visual.className = `vehicle-visual vehicle-visual-${index + 1}`;
        if (device.image) {
            const image = document.createElement('img');
            image.src = device.image;
            image.alt = `${device.paint} ${device.model}`;
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => visual.classList.add('image-unavailable'));
            visual.appendChild(image);
        }

        const visualTop = document.createElement('div');
        visualTop.className = 'visual-topline';
        const modelLabel = document.createElement('span');
        modelLabel.textContent = `${device.model} · ${device.paint}`;
        visualTop.appendChild(modelLabel);

        const statusMetric = device.metrics.find(metric => /vehicle charging status|charging status|charging state/i.test(metric.label));
        const rawStatus = String(statusMetric?.value || '').toLowerCase();
        const statusLabels = { charging: 'Laddar', idle: 'Parkerad', connected: 'Ansluten', disconnected: 'Frånkopplad', complete: 'Klar' };
        const status = document.createElement('span');
        status.className = `vehicle-status ${rawStatus === 'charging' ? 'is-charging' : ''}`;
        status.innerHTML = '<span class="status-pip"></span>';
        status.append(document.createTextNode(statusLabels[rawStatus] || 'Status okänd'));
        visualTop.appendChild(status);
        visual.appendChild(visualTop);

        if (device.attribution && device.source) {
            const credit = document.createElement('a');
            credit.className = 'image-credit';
            credit.href = device.source;
            credit.target = '_blank';
            credit.rel = 'noreferrer';
            credit.textContent = device.attribution;
            visual.appendChild(credit);
        }
        card.appendChild(visual);

        const body = document.createElement('div');
        body.className = 'vehicle-body';
        const heading = document.createElement('div');
        heading.className = 'vehicle-heading';
        const name = document.createElement('h2');
        name.textContent = device.name;
        const paint = document.createElement('span');
        paint.className = 'paint-label';
        paint.textContent = device.paint;
        heading.append(name, paint);
        body.appendChild(heading);

        const battery = device.metrics.find(metric => /state of charge|battery level/i.test(metric.label));
        const range = device.metrics.find(metric => /estimated remaining driving range|range/i.test(metric.label));
        const target = device.metrics.find(metric => /target state of charge|charge limit/i.test(metric.label));
        const power = device.metrics.find(metric => /power flow to vehicle battery/i.test(metric.label));
        const batteryValue = Number(battery?.value);
        const batteryPercent = Number.isFinite(batteryValue) ? Math.max(0, Math.min(100, batteryValue)) : 0;

        const measures = document.createElement('div');
        measures.className = 'vehicle-measures';
        const batteryMeasure = document.createElement('div');
        batteryMeasure.className = 'measure measure-battery';
        const batteryLabel = document.createElement('span');
        batteryLabel.className = 'measure-label';
        batteryLabel.textContent = 'BATTERI';
        const batteryValueText = document.createElement('strong');
        batteryValueText.className = 'measure-value';
        batteryValueText.textContent = Number.isFinite(batteryValue)
            ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(batteryValue)
            : '–';
        const batteryUnit = document.createElement('span');
        batteryUnit.className = 'measure-unit';
        batteryUnit.textContent = '%';
        batteryMeasure.append(batteryLabel, batteryValueText, batteryUnit);

        const rangeMeasure = document.createElement('div');
        rangeMeasure.className = 'measure measure-range';
        const rangeLabel = document.createElement('span');
        rangeLabel.className = 'measure-label';
        rangeLabel.textContent = 'RÄCKVIDD';
        const rangeValue = document.createElement('strong');
        rangeValue.className = 'measure-value';
        rangeValue.textContent = range && Number.isFinite(Number(range.value))
            ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(range.value))
            : '–';
        const rangeUnit = document.createElement('span');
        rangeUnit.className = 'measure-unit';
        rangeUnit.textContent = 'km';
        rangeMeasure.append(rangeLabel, rangeValue, rangeUnit);
        measures.append(batteryMeasure, rangeMeasure);
        body.appendChild(measures);

        const batteryTrack = document.createElement('div');
        batteryTrack.className = 'battery-track';
        batteryTrack.setAttribute('role', 'progressbar');
        batteryTrack.setAttribute('aria-label', `Batterinivå ${batteryPercent}%`);
        batteryTrack.setAttribute('aria-valuenow', String(batteryPercent));
        batteryTrack.setAttribute('aria-valuemin', '0');
        batteryTrack.setAttribute('aria-valuemax', '100');
        const batteryFill = document.createElement('span');
        batteryFill.className = `battery-fill ${rawStatus === 'charging' ? 'is-charging' : ''}`;
        batteryFill.style.width = `${batteryPercent}%`;
        batteryTrack.appendChild(batteryFill);
        body.appendChild(batteryTrack);

        const footer = document.createElement('div');
        footer.className = 'vehicle-footer';
        const chargeState = document.createElement('div');
        chargeState.className = 'footer-stat';
        const chargeStateLabel = document.createElement('span');
        chargeStateLabel.className = 'footer-label';
        chargeStateLabel.textContent = 'LADDSTATUS';
        const chargeStateValue = document.createElement('strong');
        chargeStateValue.textContent = statusLabels[rawStatus] || 'Okänd';
        chargeState.append(chargeStateLabel, chargeStateValue);
        footer.appendChild(chargeState);

        if (target || (rawStatus === 'charging' && power)) {
            const secondary = document.createElement('div');
            secondary.className = 'footer-stat footer-secondary';
            const secondaryLabel = document.createElement('span');
            secondaryLabel.className = 'footer-label';
            secondaryLabel.textContent = target ? 'LADDMÅL' : 'EFFEKT';
            const secondaryValue = document.createElement('strong');
            const secondaryMetric = target || power;
            const value = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Number(secondaryMetric.value));
            secondaryValue.textContent = `${value} ${secondaryMetric.unit || ''}`.trim();
            secondary.append(secondaryLabel, secondaryValue);
            footer.appendChild(secondary);
        }
        body.appendChild(footer);
        card.appendChild(body);
        return card;
    }

    getBatteryColor(percentage) {
        if (percentage >= 80) {
            return 'linear-gradient(90deg, #4caf50, #8bc34a)';
        } else if (percentage >= 50) {
            return 'linear-gradient(90deg, #ff9800, #ffc107)';
        } else {
            return 'linear-gradient(90deg, #f44336, #ff5722)';
        }
    }

    formatTime(hours) {
        if (hours === 0) return '-';
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    updateLastUpdatedTime(updatedAt = Date.now()) {
        const now = new Date(updatedAt);
        const timeString = now.toLocaleTimeString('sv-SE', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        document.getElementById('lastUpdated').textContent = timeString;
    }

    showLoading() {
        document.getElementById('loadingIndicator').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loadingIndicator').style.display = 'none';
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        document.getElementById('errorText').textContent = message;
        errorElement.style.display = 'block';
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }
}

// Initiera dashboard när sidan laddas
document.addEventListener('DOMContentLoaded', () => {
    new ChargingDashboard();
});
