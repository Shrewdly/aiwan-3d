import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 变量池 ---
let scene, camera, renderer, controls;
let mainModel = null;
let leavesSystem, leavesActive = true;
let proxyPillarsGroup = new THREE.Group(); 
let score = 0;

// 交互模式
let interactMode = 'game'; 

// 鼠标交互 (视角旋转)
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let isFirstPersonMode = true;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// ✨ 新增：键盘运动状态记录
const keyState = {
    w: false,
    a: false,
    s: false,
    d: false
};

// 剖切平面
let sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 7);

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    setupFirstPersonCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffffee, 1.3);
    sunLight.position.set(15, 20, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);
    createSunVisual();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = false;

    // 构建场景
    createEnvironment();
    createFallingLeaves();
    createProxyPillars(); 
    loadPavilion();

    // 事件监听
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onMouseClick);
    
    // ✨ 新增：键盘按下监听
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (keyState.hasOwnProperty(key)) keyState[key] = true;
    });

    // ✨ 新增：键盘抬起监听
    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (keyState.hasOwnProperty(key)) keyState[key] = false;
    });
    
    // 鼠标拖拽视角
    document.addEventListener('mousedown', (e) => {
        if(isFirstPersonMode) { isDragging = true; previousMousePosition = {x: e.clientX, y: e.clientY}; }
    });
    document.addEventListener('mouseup', () => { isDragging = false; });
    document.addEventListener('mousemove', onMouseMove);
    
    // ✏️ 移除了原来的 wheel 事件监听
}

// 🏃 核心逻辑：第一人称移动处理 (每一帧调用)
function updateFirstPersonMovement() {
    if (!isFirstPersonMode) return;

    const speed = 0.25; // 移动速度
    const direction = new THREE.Vector3();

    // 前后移动 (W/S)
    if (keyState.w) {
        camera.getWorldDirection(direction); // 获取相机看向的方向
        direction.y = 0; // 锁定Y轴，防止飞向天空
        direction.normalize();
        camera.position.addScaledVector(direction, speed);
    }
    if (keyState.s) {
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();
        camera.position.addScaledVector(direction, -speed);
    }

    // 左右横移 (A/D)
    if (keyState.a || keyState.d) {
        camera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();
        
        // 计算右侧方向向量 (利用叉乘: 上方向 x 前方向 = 右方向)
        const right = new THREE.Vector3();
        right.crossVectors(camera.up, direction).normalize();

        if (keyState.a) camera.position.addScaledVector(right, speed); // 向左 (其实是加负的右向量，或者直接用cross顺序调整，这里简单处理)
        if (keyState.d) camera.position.addScaledVector(right, -speed); // 向右
    }

    // 🔒 边界限制 & 高度锁定
    // 强制把高度锁定在 1.2米 (孩童身高)
    camera.position.y = 1.2;
    // 限制活动范围 (防止跑太远)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -15, 35);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -10, 10);
}

function loadPavilion() {
    const loader = new GLTFLoader();
    loader.load('aiwan_pavilion.glb', (gltf) => {
        mainModel = gltf.scene;
        const box = new THREE.Box3().setFromObject(mainModel);
        const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        const scale = 5.5 / maxDim; 
        mainModel.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        mainModel.position.sub(center); 
        mainModel.position.y = -box.min.y * scale; 
        mainModel.rotation.y = -Math.PI / 2;

        mainModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.baseMaterial = child.material.clone();
                if(child.material.color) child.material.color.multiplyScalar(1.2);
                child.material.clippingPlanes = [sectionPlane];
                child.material.clipShadows = true;
                child.material.side = THREE.DoubleSide;
                const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
                if(size.y > 2 && size.x < 1 && size.z < 1) child.userData.isPillar = true;
            }
        });
        scene.add(mainModel);
        document.getElementById('loading').style.display = 'none';
    }, undefined, (err) => console.error(err));
}

function onMouseClick(event) {
    if (controls.enabled === false && !isFirstPersonMode) return; 
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    if (interactMode === 'game') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const object = intersects[0].object;
            if (object.userData.isPillar || object.userData.isProxyPillar) {
                showToast("🎉 恭喜！找到一个圆柱体！积分+10");
                score += 10;
                document.getElementById('scoreBoard').innerText = "🏆 积分: " + score;
                const oldColor = object.material.color.getHex();
                object.material.color.setHex(0x00FF00);
                setTimeout(() => { object.material.color.setHex(oldColor); }, 500);
            } else {
                showToast("❌ 这个不是圆柱体哦，再找找！");
            }
        }
    } 
    else if (interactMode === 'measure') {
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            addMeasureMarker(intersects[0].point);
        }
    }
}

let measureMarkers = []; let measureLine = null;
function addMeasureMarker(point) {
    if (measureMarkers.length >= 2) clearMeasurement();
    const markerGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x1E90FF, depthTest: false });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.copy(point); marker.renderOrder = 999;
    scene.add(marker); measureMarkers.push(marker);

    if (measureMarkers.length === 2) {
        const p1 = measureMarkers[0].position; const p2 = measureMarkers[1].position;
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const material = new THREE.LineBasicMaterial({ color: 0x1E90FF, linewidth: 3 });
        measureLine = new THREE.Line(geometry, material); scene.add(measureLine);
        const distance = p1.distanceTo(p2).toFixed(2);
        document.getElementById('measure-result').style.display = 'block';
        document.getElementById('distance-value').innerText = distance;
        showToast(`📏 测量结果：${distance} 米`);
    }
}
function clearMeasurement() {
    measureMarkers.forEach(m => scene.remove(m)); measureMarkers = [];
    if (measureLine) { scene.remove(measureLine); measureLine = null; }
    document.getElementById('measure-result').style.display = 'none';
}

function createProxyPillars() {
    const pillarDist = 1.4;
    const posList = [[pillarDist, pillarDist], [-pillarDist, pillarDist], [pillarDist, -pillarDist], [-pillarDist, -pillarDist]];
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 2.5, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xFF4500 });
    posList.forEach(pos => {
        const p = new THREE.Mesh(geo, mat);
        p.position.set(pos[0], 1.25, pos[1]);
        p.userData.originPos = p.position.clone();
        p.userData.explodeDir = new THREE.Vector3(pos[0], 0, pos[1]).normalize();
        p.userData.isProxyPillar = true; 
        proxyPillarsGroup.add(p);
    });
    proxyPillarsGroup.visible = false; scene.add(proxyPillarsGroup);
}

window.takeSnapshot = () => {
    renderer.render(scene, camera);
    const canvas = renderer.domElement;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)"; ctx.fillRect(20, canvas.height - 100, 400, 80);
    ctx.strokeStyle = "#1E90FF"; ctx.lineWidth = 4; ctx.strokeRect(20, canvas.height - 100, 400, 80);
    ctx.font = "bold 24px 'Microsoft YaHei'"; ctx.fillStyle = "#1E90FF"; ctx.fillText("☀️ 小小建筑师：探索者", 40, canvas.height - 60);
    ctx.font = "16px 'Microsoft YaHei'"; ctx.fillStyle = "#555";
    const date = new Date().toLocaleDateString(); ctx.fillText(`打卡时间：${date} | 智绘几何`, 40, canvas.height - 35);
    const link = document.createElement('a'); link.download = `爱晚亭探索海报_${Date.now()}.png`;
    link.href = tempCanvas.toDataURL('image/png'); link.click();
    showToast("📸 海报已生成并下载！");
};

function createSunVisual() {
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3,32,32), new THREE.MeshBasicMaterial({color:0xFFFF00}));
    sun.position.set(15,20,10);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(4.5,32,32), new THREE.MeshBasicMaterial({color:0xFFD700, transparent:true, opacity:0.3}));
    sun.add(glow); scene.add(sun);
}
// 🌳 创建明亮环境 (升级版：3D石板路)
function createEnvironment() {
    // 1. 草地 (保持不变)
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100), 
        new THREE.MeshStandardMaterial({ color: 0x7CFC00 })
    );
    ground.rotation.x = -Math.PI / 2; 
    ground.receiveShadow = true; 
    scene.add(ground);
    
    // 2. ✨ 升级：程序化生成的 3D 石板路
    // 移除原来的 new PlaneGeometry...
    
    const stoneGroup = new THREE.Group();
    scene.add(stoneGroup);

    // 道路参数
    const pathWidth = 4.0;
    const pathLength = 60; // 对应之前的长度
    const startZ = -20;    // 起始位置
    const endZ = 40;       // 结束位置 (延伸到相机后面)
    const stepSize = 1.2;  // 每一步的跨度

    // 石头颜色库 (不同的灰色和米色，营造真实感)
    const stoneColors = [0x808080, 0x909090, 0xA9A9A9, 0xD3D3D3, 0x8B8378];

    for (let z = startZ; z < endZ; z += stepSize) {
        // 每一行铺 2-3 块石头，而不是整块大板，增加破碎感
        const stonesInRow = Math.floor(Math.random() * 2) + 2; // 2 或 3 块
        let currentX = -pathWidth / 2;

        for (let i = 0; i < stonesInRow; i++) {
            // 随机宽度
            const width = (pathWidth / stonesInRow) * (0.8 + Math.random() * 0.4);
            // 随机长度 (进深)
            const length = stepSize * (0.8 + Math.random() * 0.3);
            // 随机厚度 (让路面有微微起伏)
            const height = 0.1 + Math.random() * 0.05; 

            const geometry = new THREE.BoxGeometry(width, height, length);
            const material = new THREE.MeshStandardMaterial({ 
                color: stoneColors[Math.floor(Math.random() * stoneColors.length)],
                roughness: 0.9, // 粗糙质感
            });
            
            const stone = new THREE.Mesh(geometry, material);
            
            // 计算位置 (加一点随机偏移，不要太整齐)
            const xOffset = (pathWidth / stonesInRow) * i;
            const randomX = (Math.random() - 0.5) * 0.2;
            const randomZ = (Math.random() - 0.5) * 0.3;
            const randomRot = (Math.random() - 0.5) * 0.05; // 微微旋转

            stone.position.set(
                currentX + (pathWidth/stonesInRow)/2 + randomX, 
                0.05, // 稍微浮出草地
                z + randomZ
            );
            
            stone.rotation.y = randomRot;
            stone.receiveShadow = true;
            stone.castShadow = true; // 石头之间会有微弱阴影，更有立体感
            
            stoneGroup.add(stone);
            
            currentX += (pathWidth / stonesInRow);
        }
    }

    // 3. 树木 (保持不变)
    for (let i = 0; i < 30; i++) {
        const x = (Math.random() > 0.5 ? 1 : -1) * (3.5 + Math.random() * 8);
        const z = (Math.random() * 50) - 10;
        createLowPolyTree(x, 0, z);
    }
}
function createLowPolyTree(x,y,z) {
    const g=new THREE.Group(), t=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,2.5,6), new THREE.MeshStandardMaterial({color:0x8B4513}));
    t.position.y=1.25; t.castShadow=true; g.add(t);
    const c=[0x32CD32,0xFFD700,0xFFA500], l=new THREE.Mesh(new THREE.IcosahedronGeometry(2,1), new THREE.MeshStandardMaterial({color:c[Math.floor(Math.random()*3)],flatShading:true}));
    l.position.y=3.5; l.castShadow=true; l.scale.setScalar(0.8+Math.random()*0.4); g.add(l);
    g.position.set(x,y,z); g.scale.setScalar(0.7+Math.random()*0.5); scene.add(g);
}
function createFallingLeaves() {
    const geo=new THREE.BufferGeometry(), pos=[], spd=[];
    for(let i=0;i<300;i++) { pos.push((Math.random()-0.5)*50, Math.random()*15+2, (Math.random()-0.5)*60+10); spd.push(0.02+Math.random()*0.03); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('speed', new THREE.Float32BufferAttribute(spd,1));
    leavesSystem = new THREE.Points(geo, new THREE.PointsMaterial({color:0xFFA500, size:0.25, transparent:true})); scene.add(leavesSystem);
}
function showToast(msg) { const t=document.getElementById('toast'); t.innerText=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }
function setupFirstPersonCamera() { camera.position.set(0,1.2,25); camera.rotation.order='YXZ'; camera.rotation.set(0,0,0); }
function onMouseMove(e) { if(!isFirstPersonMode||!isDragging) return; const s=0.002; camera.rotation.y-=(e.clientX-previousMousePosition.x)*s; camera.rotation.x-=(e.clientY-previousMousePosition.y)*s; camera.rotation.x=Math.max(-1.5,Math.min(1.5,camera.rotation.x)); previousMousePosition={x:e.clientX,y:e.clientY}; }
function onWindowResize() { camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); }

function animate() {
    requestAnimationFrame(animate);
    
    // ✨ 每一帧都更新移动逻辑 (WASD)
    updateFirstPersonMovement();

    if(leavesActive) { const p=leavesSystem.geometry.attributes.position.array; for(let i=0;i<p.length/3;i++) { p[i*3+1]-=0.05; if(p[i*3+1]<0) p[i*3+1]=15; } leavesSystem.geometry.attributes.position.needsUpdate=true; }
    if(!isFirstPersonMode) controls.update();
    renderer.render(scene, camera);
}

// 暴露函数
window.switchStage = (num) => {
    document.querySelectorAll('.panel-section').forEach(p=>p.classList.remove('active')); document.getElementById('panel-'+num).classList.add('active');
    document.querySelectorAll('.stage-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.stage-btn')[num-1].classList.add('active');
    if(num===1) { isFirstPersonMode=true; controls.enabled=false; setupFirstPersonCamera(); }
    else if(num===2) { isFirstPersonMode=false; controls.enabled=true; camera.position.set(8,6,10); controls.target.set(0,2,0); controls.update(); }
    else { isFirstPersonMode=false; controls.enabled=true; camera.position.set(5,5,8); controls.target.set(0,2,0); controls.update(); window.setInteractMode('game'); }
};
window.setInteractMode = (mode) => {
    interactMode = mode;
    clearMeasurement();
    document.getElementById('btn-mode-game').classList.toggle('active', mode==='game');
    document.getElementById('btn-mode-measure').classList.toggle('active', mode==='measure');
    document.getElementById('game-instruction').style.display = mode==='game'?'block':'none';
    proxyPillarsGroup.visible = true; 
    showToast(mode==='game' ? "🔍 模式切换：寻找几何体" : "📏 模式切换：点击两点测量");
};
window.updatePillarExplode = (val) => { 
    const f=parseFloat(val); proxyPillarsGroup.visible=f>0.1||!isFirstPersonMode; 
    if(mainModel) mainModel.traverse(c=>{if(c.isMesh)c.material.opacity=f>0.1?0.3:1;c.material.transparent=true;});
    proxyPillarsGroup.children.forEach(p=>p.position.copy(p.userData.originPos).add(p.userData.explodeDir.clone().multiplyScalar(f*1.5)));
};
window.updateClipping = (val) => { sectionPlane.constant=parseFloat(val); };
window.toggleLeaves = () => { leavesActive=!leavesActive; leavesSystem.visible=leavesActive; };
window.showHint = () => showToast("👀 提示：柱子是支撑屋顶的红色圆柱形物体");
