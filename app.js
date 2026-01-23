import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

let scene, camera, renderer, controls;
let mainModel = null;
let leavesSystem, leavesActive = true;
let proxyPillarsGroup = new THREE.Group(); 
let score = 0;
let interactMode = 'game'; 
let terrainMesh = null;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isFirstPersonMode = true;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
const keyState = { w: false, a: false, s: false, d: false };
let sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 7);

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    scene.fog = new THREE.Fog(0xccaa88, 10, 80); 

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    setupFirstPersonCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 0.9; 
    renderer.localClippingEnabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    sunLight.position.set(30, 50, 20); 
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048; sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5; sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -50; sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50; sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = false;

    loadHDRBackground(); 
    createLowPolyTerrain(); 
    createStonePath();      
    createFallingLeaves();
    createProxyPillars(); 
    loadPavilion();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    document.addEventListener('keydown', (e) => { if(keyState.hasOwnProperty(e.key.toLowerCase())) keyState[e.key.toLowerCase()] = true; });
    document.addEventListener('keyup', (e) => { if(keyState.hasOwnProperty(e.key.toLowerCase())) keyState[e.key.toLowerCase()] = false; });
    document.addEventListener('mousedown', (e) => { if(isFirstPersonMode) { isDragging = true; previousMousePosition = {x: e.clientX, y: e.clientY}; } });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('mousemove', onMouseMove);

    setTimeout(() => { window.askTeacher('welcome'); }, 1500);
}

// --- 界面逻辑 ---
window.toggleChat = () => {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.toggle('hidden');
};

window.handleKeyPress = (event) => { if (event.key === 'Enter') window.sendUserMessage(); };

window.sendUserMessage = () => {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;
    document.getElementById('chat-window').classList.remove('hidden');
    addMessageToChat(text, 'user');
    input.value = ''; 
    window.askTeacher(text); 
};

// 🔥 核心：确保消息被加到 HTML 里 🔥
function addMessageToChat(text, sender) {
    const chatHistory = document.getElementById('chat-history');
    if(!chatHistory) {
        console.error("找不到聊天记录容器！");
        return;
    }
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.innerText = text; 
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; // 自动滚动到底部
}

window.askTeacher = (actionType) => {
    const video = document.getElementById('digital-human-video');
    const chatHistory = document.getElementById('chat-history');

    // 显示“Thinking...”
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.classList.add('message', 'teacher');
    loadingDiv.style.color = '#888';
    loadingDiv.innerText = "Thinking..."; 
    if(chatHistory) {
        chatHistory.appendChild(loadingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    if(video) video.src = "idle.mp4";

    console.log("正在发送请求给后端:", actionType); // 调试日志

    fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType })
    })
    .then(response => response.json())
    .then(data => {
        // 移除 Thinking
        const loadingMsg = document.getElementById(loadingId);
        if(loadingMsg) loadingMsg.remove();

        console.log("收到后端回复:", data); // 调试日志

        if(data.success) {
            // 🔥 收到回复，上屏！
            if(video) { video.src = "talking.mp4"; video.play().catch(e=>{}); }
            addMessageToChat(data.message, 'teacher');
            setTimeout(() => { if(video) video.src = "idle.mp4"; }, Math.max(2000, data.message.length * 200));
        } else {
            // 后端说失败了
            addMessageToChat(data.message || "老师没听清...", 'teacher');
        }
    })
    .catch(err => {
        const loadingMsg = document.getElementById(loadingId);
        if(loadingMsg) loadingMsg.remove();
        console.error("前端网络报错:", err);

        // 离线兜底
        if (actionType === 'welcome') {
            const fallback = "同学们好！我是艾老师。（离线模式：我已准备好，虽然连不上云端，但可以带你参观！）";
            addMessageToChat(fallback, 'teacher');
            if(video) { video.src = "talking.mp4"; video.play().catch(e=>{}); }
            setTimeout(() => { if(video) video.src = "idle.mp4"; }, 4000);
        } else {
            addMessageToChat("🔴 连接中断。请按 F12 看控制台报错。", 'teacher');
        }
    });
};

window.switchStage = (n) => {
    document.querySelectorAll('.panel-section').forEach(p=>p.classList.remove('active')); 
    document.getElementById('panel-'+n).classList.add('active');
    document.querySelectorAll('.stage-btn').forEach(b=>b.classList.remove('active')); 
    document.querySelectorAll('.stage-btn')[n-1].classList.add('active');
    
    if(n===1) { isFirstPersonMode=true; controls.enabled=false; setupFirstPersonCamera(); window.askTeacher('welcome'); }
    else if(n===2) { isFirstPersonMode=false; controls.enabled=true; camera.position.set(8,6,10); controls.target.set(0,2,0); controls.update(); window.askTeacher('stage_2'); }
    else { isFirstPersonMode=false; controls.enabled=true; camera.position.set(5,5,8); controls.target.set(0,2,0); controls.update(); window.setInteractMode('game'); window.askTeacher('stage_3'); }
};

window.setInteractMode = (m) => { 
    interactMode = m; 
};

function onMouseClick(e) {
    if (controls.enabled === false && !isFirstPersonMode) return; 
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    if (interactMode === 'game') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.isPillar || obj.userData.isProxyPillar) {
                showToast("🎉 恭喜！找到圆柱体！+10分"); 
                score += 10; document.getElementById('scoreBoard').innerText = "🏆 积分: " + score;
                obj.material.emissive = new THREE.Color(0x00FF00); setTimeout(() => obj.material.emissive.setHex(0), 500);
                
                document.getElementById('chat-window').classList.remove('hidden');
                window.askTeacher('found_pillar');
            }
        }
    } 
}

// ... 下面是 3D 构建代码，请保持原样 ...
// loadHDRBackground, createLowPolyTerrain, createStonePath, updateFirstPersonMovement, createLowPolyTree, loadPavilion, createProxyPillars, createFallingLeaves, takeSnapshot, updatePillarExplode, updateClipping, toggleLeaves, showHint, showToast, setupFirstPersonCamera, onMouseWheel, onMouseMove, onWindowResize, animate
// 确保这些函数都在！

function loadHDRBackground() {
    const loader = new RGBELoader();
    loader.load('sky.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture; scene.environment = texture; scene.fog=null;
    }, undefined, () => scene.background = new THREE.Color(0x87CEEB));
}
function createLowPolyTerrain() {
    const loader = new THREE.TextureLoader();
    const tColor = loader.load('ground_diff.jpg'); tColor.wrapS=tColor.wrapT=THREE.RepeatWrapping; tColor.repeat.set(8,8); tColor.colorSpace=THREE.SRGBColorSpace;
    const tNor = loader.load('ground_nor.jpg'); tNor.wrapS=tNor.wrapT=THREE.RepeatWrapping; tNor.repeat.set(8,8);
    const tRough = loader.load('ground_rough.jpg'); tRough.wrapS=tRough.wrapT=THREE.RepeatWrapping; tRough.repeat.set(8,8);
    const geometry = new THREE.PlaneGeometry(200, 200, 64, 64);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i); let height = Math.random() * 1.5; if (Math.abs(x) < 4.5) height = -0.1; pos.setZ(i, height); 
    }
    geometry.computeVertexNormals(); 
    const material = new THREE.MeshStandardMaterial({ map: tColor, normalMap: tNor, roughnessMap: tRough, roughness: 0.8, color: 0xdddddd });
    terrainMesh = new THREE.Mesh(geometry, material); terrainMesh.rotation.x = -Math.PI / 2; terrainMesh.receiveShadow = true; scene.add(terrainMesh);
    for (let i = 0; i < 40; i++) { const x = (Math.random()>0.5?1:-1)*(5+Math.random()*40), z=(Math.random()*80)-20; createLowPolyTree(x, 0, z); }
}
function createStonePath() {
    const group = new THREE.Group();
    const loader = new THREE.TextureLoader();
    const tDiff = loader.load('path_diff.jpg'); tDiff.colorSpace = THREE.SRGBColorSpace;
    const tNor = loader.load('path_nor.jpg'); const tRough = loader.load('path_rough.jpg');
    const stoneColors = [0xdddddd, 0xcccccc, 0xbbbbbb];
    let currentZ = 45;
    while(currentZ > -25) {
        const stonesInRow = Math.floor(Math.random() * 2) + 2; const rowWidth = 5; const segmentWidth = rowWidth / stonesInRow;
        for(let i=0; i<stonesInRow; i++) {
            const w = segmentWidth * (0.8 + Math.random()*0.2); const l = 1.2 * (0.8 + Math.random()*0.4); const h = 0.2 + Math.random() * 0.1;
            const mat = new THREE.MeshStandardMaterial({ map: tDiff, normalMap: tNor, roughnessMap: tRough, color: stoneColors[Math.floor(Math.random()*stoneColors.length)], roughness: 0.8 });
            const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
            s.position.set(-rowWidth/2 + segmentWidth*i + segmentWidth/2 + (Math.random()-0.5)*0.2, 0.1, currentZ + (Math.random()-0.5)*0.2);
            s.rotation.set((Math.random()-0.5)*0.05, (Math.random()-0.5)*0.1, 0); s.castShadow = true; s.receiveShadow = true; group.add(s);
        }
        currentZ -= 1.3;
    }
    scene.add(group);
}
function updateFirstPersonMovement() {
    if (!isFirstPersonMode) return;
    const speed = 0.25; const dir = new THREE.Vector3();
    if (keyState.w) { camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); camera.position.addScaledVector(dir, speed); }
    if (keyState.s) { camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); camera.position.addScaledVector(dir, -speed); }
    if (keyState.a || keyState.d) {
        camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); 
        const right = new THREE.Vector3(); right.crossVectors(camera.up, dir).normalize(); 
        if (keyState.a) camera.position.addScaledVector(right, speed);
        if (keyState.d) camera.position.addScaledVector(right, -speed);
    }
    if (terrainMesh) {
        const downRay = new THREE.Raycaster(); downRay.set(new THREE.Vector3(camera.position.x, 50, camera.position.z), new THREE.Vector3(0, -1, 0));
        const intersects = downRay.intersectObject(terrainMesh);
        if (intersects.length > 0) camera.position.y = intersects[0].point.y + 1.2; else camera.position.y = 1.2;
    }
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -20, 45); camera.position.x = THREE.MathUtils.clamp(camera.position.x, -20, 20);
}
function createLowPolyTree(x, y, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3c31 }));
    trunk.position.y = 1.5; trunk.castShadow = true; group.add(trunk);
    const colors = [0xd35400, 0xc0392b, 0xf39c12, 0xe67e22]; 
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 0), new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)], flatShading: true }));
    leaves.position.y = 4; leaves.castShadow = true; leaves.scale.setScalar(0.8 + Math.random() * 0.5); leaves.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(leaves); group.position.set(x, y, z); group.scale.setScalar(0.8 + Math.random() * 0.4); scene.add(group);
}
function loadPavilion() {
    const loader = new GLTFLoader();
    loader.load('aiwan_pavilion.glb', (gltf) => {
        mainModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(mainModel);
        const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        const scale = 5.5 / maxDim; mainModel.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        mainModel.position.sub(center); mainModel.position.y = -box.min.y * scale; mainModel.rotation.y = -Math.PI / 2;
        mainModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true; child.receiveShadow = true; child.userData.baseMaterial = child.material.clone();
                child.material.clippingPlanes = [sectionPlane]; child.material.clipShadows = true; child.material.side = THREE.DoubleSide;
                const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
                if(size.y > 2 && size.x < 1 && size.z < 1) child.userData.isPillar = true;
            }
        });
        scene.add(mainModel); document.getElementById('loading').style.display = 'none';
    }, undefined, (err) => console.error(err));
}
function createProxyPillars() {
    const pillarDist = 1.4; const posList = [[pillarDist, pillarDist], [-pillarDist, pillarDist], [pillarDist, -pillarDist], [-pillarDist, -pillarDist]];
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 2.5, 16); const mat = new THREE.MeshStandardMaterial({ color: 0xFF4500 });
    posList.forEach(pos => {
        const p = new THREE.Mesh(geo, mat); p.position.set(pos[0], 1.25, pos[1]);
        p.userData.originPos = p.position.clone(); p.userData.explodeDir = new THREE.Vector3(pos[0], 0, pos[1]).normalize(); p.userData.isProxyPillar = true; proxyPillarsGroup.add(p);
    });
    proxyPillarsGroup.visible = false; scene.add(proxyPillarsGroup);
}
function createFallingLeaves() {
    const leafCount = 400; const geo = new THREE.BufferGeometry(); const pos=[], spd=[];
    for(let i=0; i<400; i++) { pos.push((Math.random()-0.5)*60, Math.random()*20+2, (Math.random()-0.5)*80+10); spd.push(0.02+Math.random()*0.03); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('speed', new THREE.Float32BufferAttribute(spd,1));
    leavesSystem = new THREE.Points(geo, new THREE.PointsMaterial({color:0xFFA500, size:0.25, transparent:true})); scene.add(leavesSystem);
}
window.takeSnapshot = () => { renderer.render(scene, camera); const l = document.createElement('a'); l.download = 'screenshot.png'; l.href = renderer.domElement.toDataURL('image/png'); l.click(); showToast("📸 已截图"); };
window.updatePillarExplode = (v) => { const f=parseFloat(v); proxyPillarsGroup.visible=f>0.1||!isFirstPersonMode; proxyPillarsGroup.children.forEach(p=>p.position.copy(p.userData.originPos).add(p.userData.explodeDir.clone().multiplyScalar(f*1.5))); };
window.updateClipping = (v) => { sectionPlane.constant=parseFloat(v); };
window.toggleLeaves = () => { leavesActive=!leavesActive; leavesSystem.visible=leavesActive; };
window.showHint = () => showToast("👀 柱子是红色的圆柱形物体");
function showToast(msg) { const t=document.getElementById('toast'); t.innerText=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }
function setupFirstPersonCamera() { camera.position.set(0,1.2,40); camera.rotation.order='YXZ'; camera.rotation.set(0,0,0); }
function onMouseWheel(e) { if(!isFirstPersonMode) return; e.preventDefault(); const s=0.8; camera.position.z+=(e.deltaY<0?-s:s); camera.position.z=THREE.MathUtils.clamp(camera.position.z,-20,45); }
function onMouseMove(e) { if(!isFirstPersonMode||!isDragging) return; const s=0.002; camera.rotation.y-=(e.clientX-previousMousePosition.x)*s; camera.rotation.x-=(e.clientY-previousMousePosition.y)*s; camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x)); previousMousePosition={x:e.clientX,y:e.clientY}; }
function onWindowResize() { camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); }
function animate() {
    requestAnimationFrame(animate); updateFirstPersonMovement();
    if(leavesActive) { const p=leavesSystem.geometry.attributes.position.array; for(let i=0;i<p.length/3;i++) { p[i*3+1]-=0.05; if(p[i*3+1]<0) p[i*3+1]=15; } leavesSystem.geometry.attributes.position.needsUpdate=true; }
    if(!isFirstPersonMode) controls.update();
    renderer.render(scene, camera);
}
