import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 变量池 ---
let scene, camera, renderer, controls;
let mainModel = null;
let leavesSystem, leavesActive = true;
let proxyPillarsGroup = new THREE.Group(); 
let score = 0;
let interactMode = 'game'; 

// 地形相关 (用于防止穿模)
let terrainMesh = null; // ✨ 全局变量：存储地形，用于高度检测

// 交互相关
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isFirstPersonMode = true;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
const keyState = { w: false, a: false, s: false, d: false };

// 测量工具
let measureMarkers = []; let measureLine = null;
let sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 7);

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 默认背景
    // 雾气稍微调淡，配合全景图
    scene.fog = new THREE.Fog(0xccaa88, 10, 80); 

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 300);
    setupFirstPersonCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 1.0;
    renderer.localClippingEnabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffaa55, 1.5); 
    sunLight.position.set(30, 50, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = false;

    // --- 构建场景 ---
    loadAutumnBackground(); // ✨ 改为本地加载
    createLowPolyTerrain(); 
    createStonePath();      
    createFallingLeaves();
    createProxyPillars(); 
    loadPavilion();

    // 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    
    document.addEventListener('keydown', (e) => { if(keyState.hasOwnProperty(e.key.toLowerCase())) keyState[e.key.toLowerCase()] = true; });
    document.addEventListener('keyup', (e) => { if(keyState.hasOwnProperty(e.key.toLowerCase())) keyState[e.key.toLowerCase()] = false; });
    document.addEventListener('mousedown', (e) => { if(isFirstPersonMode) { isDragging = true; previousMousePosition = {x: e.clientX, y: e.clientY}; } });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('mousemove', onMouseMove);
}

// 🍂 修复：改为加载本地文件
function loadAutumnBackground() {
    const loader = new THREE.TextureLoader();
    
    // ⚠️ 请确保 web 文件夹里有这个图片文件！
    const bgUrl = 'forest_cave.jpg'; 
    
    loader.load(bgUrl, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        scene.background = texture;
        scene.environment = texture; 
        scene.fog = null; // 图片加载成功后移除雾气
    }, undefined, (err) => {
        console.error("背景加载失败，请检查 web 文件夹下是否有 park_panorama.jpg", err);
    });
}

// ⛰️ 地形 (保存到全局变量 terrainMesh 以便检测高度)
function createLowPolyTerrain() {
    const geometry = new THREE.PlaneGeometry(200, 200, 64, 64);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        let height = Math.random() * 1.5; 
        if (Math.abs(x) < 4.5) height = -0.2; 
        pos.setZ(i, height); 
    }
    geometry.computeVertexNormals(); 
    const material = new THREE.MeshStandardMaterial({ color: 0x556B2F, roughness: 1, flatShading: true });
    
    // ✨ 赋值给全局变量
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.rotation.x = -Math.PI / 2; 
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 种树
    for (let i = 0; i < 40; i++) {
        const x = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 40);
        const z = (Math.random() * 80) - 20;
        createLowPolyTree(x, 0, z);
    }
}

// 🏃 修复：加入地形贴合逻辑 (防止穿模)
function updateFirstPersonMovement() {
    if (!isFirstPersonMode) return;
    const speed = 0.25; 
    const dir = new THREE.Vector3();
    
    // WASD 移动 (X/Z平面)
    if (keyState.w) { camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); camera.position.addScaledVector(dir, speed); }
    if (keyState.s) { camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); camera.position.addScaledVector(dir, -speed); }
    if (keyState.a || keyState.d) {
        camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); 
        const right = new THREE.Vector3(); right.crossVectors(camera.up, dir).normalize(); 
        if (keyState.a) camera.position.addScaledVector(right, speed);
        if (keyState.d) camera.position.addScaledVector(right, -speed);
    }

    // ✨ 核心升级：地形高度检测 (Raycast Down)
    // 只有当地形存在时才检测
    if (terrainMesh) {
        // 创建一个向下的射线检测器
        const downRay = new THREE.Raycaster();
        // 从头顶上方很高的地方向下发射
        downRay.set(new THREE.Vector3(camera.position.x, 50, camera.position.z), new THREE.Vector3(0, -1, 0));
        
        const intersects = downRay.intersectObject(terrainMesh);
        
        if (intersects.length > 0) {
            // 地面高度
            const groundHeight = intersects[0].point.y;
            // 人的高度设定为 1.2 米
            const eyeHeight = 1.2;
            
            // 平滑过渡 (可选，这里直接赋值更灵敏)
            camera.position.y = groundHeight + eyeHeight;
        } else {
            // 如果走出了地形范围，保持默认高度
            camera.position.y = 1.2;
        }
    } else {
        camera.position.y = 1.2;
    }

    // 边界限制
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -20, 45); 
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -20, 20); // 稍微放宽左右限制
}

// ... 保持其他函数不变 (createStonePath, createLowPolyTree, loadPavilion 等) ...
// 请务必保留以下所有函数，不要删除！

function createStonePath() {
    const group = new THREE.Group();
    const stoneColors = [0x999999, 0xaaaaaa, 0x888888, 0x777777];
    let currentZ = 45;
    while(currentZ > -25) {
        const stonesInRow = Math.floor(Math.random() * 2) + 2; 
        const rowWidth = 5;
        const segmentWidth = rowWidth / stonesInRow;
        for(let i=0; i<stonesInRow; i++) {
            const width = segmentWidth * (0.8 + Math.random()*0.2);
            const length = 1.2 * (0.8 + Math.random()*0.4);
            const height = 0.2 + Math.random() * 0.1;
            const geo = new THREE.BoxGeometry(width, height, length);
            const mat = new THREE.MeshStandardMaterial({color: stoneColors[Math.floor(Math.random()*stoneColors.length)], roughness: 0.9});
            const stone = new THREE.Mesh(geo, mat);
            const x = -rowWidth/2 + segmentWidth*i + segmentWidth/2 + (Math.random()-0.5)*0.2;
            stone.position.set(x, 0.1, currentZ + (Math.random()-0.5)*0.2);
            stone.rotation.y = (Math.random()-0.5) * 0.1;
            stone.rotation.x = (Math.random()-0.5) * 0.05;
            stone.castShadow = true; stone.receiveShadow = true;
            group.add(stone);
        }
        currentZ -= 1.3;
    }
    scene.add(group);
}

function createLowPolyTree(x, y, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3c31 }));
    trunk.position.y = 1.5; trunk.castShadow = true; group.add(trunk);
    const colors = [0xd35400, 0xc0392b, 0xf39c12, 0xe67e22]; 
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5, 0), new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*colors.length)], flatShading: true }));
    leaves.position.y = 4; leaves.castShadow = true; 
    leaves.scale.setScalar(0.8 + Math.random() * 0.5); leaves.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(leaves);
    group.position.set(x, y, z); group.scale.setScalar(0.8 + Math.random() * 0.4);
    scene.add(group);
}

function loadPavilion() {
    const loader = new GLTFLoader();
    loader.load('aiwan_pavilion.glb', (gltf) => {
        mainModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(mainModel);
        const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        const scale = 5.5 / maxDim; mainModel.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        mainModel.position.sub(center); mainModel.position.y = -box.min.y * scale; 
        mainModel.rotation.y = -Math.PI / 2;
        mainModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true; child.receiveShadow = true;
                child.userData.baseMaterial = child.material.clone();
                child.material.clippingPlanes = [sectionPlane];
                child.material.clipShadows = true; child.material.side = THREE.DoubleSide;
                const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
                if(size.y > 2 && size.x < 1 && size.z < 1) child.userData.isPillar = true;
            }
        });
        scene.add(mainModel); document.getElementById('loading').style.display = 'none';
    }, undefined, (err) => console.error(err));
}

function createProxyPillars() {
    const pillarDist = 1.4;
    const posList = [[pillarDist, pillarDist], [-pillarDist, pillarDist], [pillarDist, -pillarDist], [-pillarDist, -pillarDist]];
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 2.5, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xFF4500 });
    posList.forEach(pos => {
        const p = new THREE.Mesh(geo, mat); p.position.set(pos[0], 1.25, pos[1]);
        p.userData.originPos = p.position.clone();
        p.userData.explodeDir = new THREE.Vector3(pos[0], 0, pos[1]).normalize();
        p.userData.isProxyPillar = true; proxyPillarsGroup.add(p);
    });
    proxyPillarsGroup.visible = false; scene.add(proxyPillarsGroup);
}

function createFallingLeaves() {
    const leafCount = 400; const geo = new THREE.BufferGeometry(); const pos=[], spd=[];
    for(let i=0; i<400; i++) { pos.push((Math.random()-0.5)*60, Math.random()*20+2, (Math.random()-0.5)*80+10); spd.push(0.02+Math.random()*0.03); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('speed', new THREE.Float32BufferAttribute(spd,1));
    leavesSystem = new THREE.Points(geo, new THREE.PointsMaterial({color:0xFFA500, size:0.25, transparent:true})); scene.add(leavesSystem);
}

function onMouseClick(e) {
    if (controls.enabled === false && !isFirstPersonMode) return; 
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (interactMode === 'game') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const obj = intersects[0].object;
            if (obj.userData.isPillar || obj.userData.isProxyPillar) {
                showToast("🎉 恭喜！找到圆柱体！+10分"); score += 10; document.getElementById('scoreBoard').innerText = "🏆 积分: " + score;
                obj.material.emissive = new THREE.Color(0x00FF00); setTimeout(() => obj.material.emissive.setHex(0), 500);
            } else showToast("❌ 这个不是圆柱体哦");
        }
    } else if (interactMode === 'measure') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) addMeasureMarker(intersects[0].point);
    }
}

function addMeasureMarker(pt) {
    if (measureMarkers.length >= 2) { measureMarkers.forEach(m=>scene.remove(m)); measureMarkers=[]; if(measureLine){scene.remove(measureLine); measureLine=null;} document.getElementById('measure-result').style.display='none'; }
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({color:0x1E90FF, depthTest:false}));
    m.position.copy(pt); m.renderOrder=999; scene.add(m); measureMarkers.push(m);
    if (measureMarkers.length === 2) {
        const p1=measureMarkers[0].position, p2=measureMarkers[1].position;
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1,p2]), new THREE.LineBasicMaterial({color:0x1E90FF, linewidth:3}));
        scene.add(line); measureLine=line;
        const dist = p1.distanceTo(p2).toFixed(2);
        document.getElementById('measure-result').style.display='block'; document.getElementById('distance-value').innerText=dist;
    }
}

window.takeSnapshot = () => { renderer.render(scene, camera); const l = document.createElement('a'); l.download = 'screenshot.png'; l.href = renderer.domElement.toDataURL('image/png'); l.click(); showToast("📸 已截图"); };
window.switchStage = (n) => {
    document.querySelectorAll('.panel-section').forEach(p=>p.classList.remove('active')); document.getElementById('panel-'+n).classList.add('active');
    document.querySelectorAll('.stage-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.stage-btn')[n-1].classList.add('active');
    if(n===1) { isFirstPersonMode=true; controls.enabled=false; setupFirstPersonCamera(); }
    else { isFirstPersonMode=false; controls.enabled=true; camera.position.set(8,6,10); controls.target.set(0,2,0); controls.update(); }
    if(n===3) window.setInteractMode('game');
};
window.setInteractMode = (m) => { interactMode=m; measureMarkers=[]; document.getElementById('btn-mode-game').classList.toggle('active', m==='game'); document.getElementById('btn-mode-measure').classList.toggle('active', m==='measure'); };
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
