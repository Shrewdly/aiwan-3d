import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 全局变量 ---
let scene, camera, renderer, controls;
let mainModel = null;
let leavesSystem, leavesActive = true;
let proxyPillarsGroup = new THREE.Group();
let overlayPillarsGroup = new THREE.Group();
// 调整初始剖切高度，确保完整显示
let sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 7); 

// ✨ 新增：第一人称模式状态标志
let isFirstPersonMode = true; // 默认开启

// ✨ 新增：用于第一人称视角的鼠标拖拽变量
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
init();
animate();

function init() {
    // 1. 场景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3e1e1e);
    scene.fog = new THREE.FogExp2(0x3e1e1e, 0.02); // 雾气稍微调淡一点

    // 2. 相机
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    
    // ✨ 修改：初始设置为第一人称视角
    setupFirstPersonCamera();

    // 3. 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.localClippingEnabled = true;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 4. 灯光
    const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x442222, 0.6);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffaa33, 1.5);
    dirLight.position.set(5, 8, 10); 
    dirLight.castShadow = true;
    // 优化阴影范围
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    scene.add(dirLight);

    // 5. 控制器 (初始化但不马上启用，由 switchStage 管理)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    // ✨ 修改：初始禁用轨道控制器，因为默认是第一人称
    controls.enabled = false;

    // --- 场景构建 ---
    createEnvironment();
    createFallingLeaves();
    createProxyPillars(); 

    // 6. 加载模型
    loadPavilion();

    // ✨ 新增：添加滚轮事件监听器用于行走
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    window.addEventListener('resize', onWindowResize);

    // ✨ 新增：鼠标拖拽监听 (用于第一人称转头)
    document.addEventListener('mousedown', (e) => {
        if (isFirstPersonMode) {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.addEventListener('mousemove', onMouseMove);
}

// --- ✨ 新增：核心第一人称逻辑 ---

// 设置第一人称相机位置 (孩童视角)
function setupFirstPersonCamera() {
    camera.position.set(0, 1.2, 25);
    
    // ✨ 新增：设置旋转顺序，确保第一人称视角操作顺滑
    camera.rotation.order = 'YXZ'; 
    camera.rotation.set(0, 0, 0); 
}

// 处理滚轮行走事件
function onMouseWheel(event) {
    if (!isFirstPersonMode) return;

    event.preventDefault();
    const walkSpeed = 0.8;

    if (event.deltaY < 0) {
        camera.position.z -= walkSpeed;
    } else {
        camera.position.z += walkSpeed;
    }

    // ✨ 修改：放宽移动限制
    // 原来是 (3.5, 28)，导致走到亭子前就停住了
    // 现在改为 (-15, 28)，允许穿过亭子(z=0)一直走到背面(-15)
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -15, 28);
}

// ✨ 新增：处理鼠标移动 (360度环视)
function onMouseMove(event) {
    // 只有在第一人称模式且正在拖拽时才生效
    if (!isFirstPersonMode || !isDragging) return;

    const deltaMove = {
        x: event.clientX - previousMousePosition.x,
        y: event.clientY - previousMousePosition.y
    };

    // 旋转灵敏度
    const sensitivity = 0.002;

    // 左右旋转 (修改 Y 轴旋转)
    camera.rotation.y -= deltaMove.x * sensitivity;

    // 上下抬头 (修改 X 轴旋转)
    camera.rotation.x -= deltaMove.y * sensitivity;

    // 限制抬头低头的角度 (避免翻跟头)，限制在 -90度 到 90度 之间
    const limit = Math.PI / 2 - 0.1;
    camera.rotation.x = Math.max(-limit, Math.min(limit, camera.rotation.x));

    // 更新上一次鼠标位置
    previousMousePosition = { x: event.clientX, y: event.clientY };
}

// --- 原有功能函数 ---

function loadPavilion() {
    const loader = new GLTFLoader();
    loader.load('aiwan_pavilion.glb', (gltf) => {
        mainModel = gltf.scene;
        // ... 尺寸与位置调整保持不变 ...
        const box = new THREE.Box3().setFromObject(mainModel);
        const maxDim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
        const scale = 5.5 / maxDim; 
        mainModel.scale.set(scale, scale, scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        mainModel.position.sub(center); 
        mainModel.position.y = -box.min.y * scale; 
        
        // 旋转对齐道路
        mainModel.rotation.y = -Math.PI / 2; 

        // 材质
        mainModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.baseMaterial = child.material.clone();
                child.material.clippingPlanes = [sectionPlane];
                child.material.clipShadows = true;
                child.material.side = THREE.DoubleSide;
            }
        });
        
        scene.add(mainModel);
        createOverlayPillars();
        document.getElementById('loading').style.display = 'none';

    }, undefined, (err) => {
        console.error(err);
        document.getElementById('loading').innerText = "加载失败，请检查 aiwan_pavilion.glb 文件位置";
    });
}

function createEnvironment() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x2b1b17, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    
    // 加长道路以适应行走
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 60), new THREE.MeshStandardMaterial({ color: 0x443333, roughness: 0.9 }));
    path.rotation.x = -Math.PI / 2; 
    // 调整道路位置使其延伸到脚下
    path.position.set(0, 0.02, 10); 
    path.receiveShadow = true; scene.add(path);

    for (let i = 0; i < 30; i++) {
        const x = (Math.random() > 0.5 ? 1 : -1) * (3.5 + Math.random() * 8);
        const z = (Math.random() * 50) - 10; // 扩大树木分布范围
        createLowPolyTree(x, 0, z);
    }
}

function createLowPolyTree(x, y, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), new THREE.MeshStandardMaterial({ color: 0x332211 }));
    trunk.position.y = 1.25; trunk.castShadow = true; group.add(trunk);
    const colors = [0xc0392b, 0xd35400, 0xe67e22];
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random()*3)], flatShading: true }));
    leaves.position.y = 3.5; leaves.castShadow = true; leaves.scale.setScalar(0.8 + Math.random() * 0.4);
    leaves.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(leaves);
    group.position.set(x, y, z); group.scale.setScalar(0.7 + Math.random() * 0.5); scene.add(group);
}

function createFallingLeaves() {
    const leafCount = 400;
    const geometry = new THREE.BufferGeometry();
    const positions = [], speeds = [], offsets = [];
    for (let i = 0; i < leafCount; i++) {
        // 扩大落叶范围
        positions.push((Math.random() - 0.5) * 50, Math.random() * 15 + 2, (Math.random() - 0.5) * 60 + 10);
        speeds.push(0.01 + Math.random() * 0.04); offsets.push(Math.random() * Math.PI * 2);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 1));
    const material = new THREE.PointsMaterial({ color: 0xff5500, size: 0.2, transparent: true, opacity: 0.9 });
    leavesSystem = new THREE.Points(geometry, material);
    scene.add(leavesSystem);
}

function animateLeaves() {
    if (!leavesSystem || !leavesActive) return;
    const positions = leavesSystem.geometry.attributes.position.array;
    const speeds = leavesSystem.geometry.attributes.speed.array;
    const offsets = leavesSystem.geometry.attributes.offset.array;
    const time = Date.now() * 0.001;
    for (let i = 0; i < positions.length / 3; i++) {
        const idx = i * 3;
        positions[idx + 1] -= speeds[i];
        positions[idx] += Math.sin(time + offsets[i]) * 0.02;
        positions[idx + 2] += Math.cos(time * 1.3 + offsets[i]) * 0.015;
        if (positions[idx + 1] < 0) { positions[idx + 1] = 15 + Math.random() * 5; positions[idx] = (Math.random() - 0.5) * 50; }
    }
    leavesSystem.geometry.attributes.position.needsUpdate = true;
}

function createProxyPillars() {
    const pillarDist = 1.4;
    const pillarPos = [[pillarDist, pillarDist], [-pillarDist, pillarDist], [pillarDist, -pillarDist], [-pillarDist, -pillarDist]];
    const pillarGeo = new THREE.CylinderGeometry(0.25, 0.28, 3.2, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.5, emissive: 0x552200 });
    pillarPos.forEach(pos => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(pos[0], 1.6, pos[1]); pillar.castShadow = true;
        pillar.userData.originPos = pillar.position.clone();
        pillar.userData.explodeDir = new THREE.Vector3(pos[0], 0, pos[1]).normalize();
        proxyPillarsGroup.add(pillar);
    });
    proxyPillarsGroup.visible = false; scene.add(proxyPillarsGroup);
}

function createOverlayPillars() {
    const pillarDist = 1.4;
    const pillarPos = [[pillarDist, pillarDist], [-pillarDist, pillarDist], [pillarDist, -pillarDist], [-pillarDist, -pillarDist]];
    
    // ✨ 修改：降低高度
    // 原来是 height: 3.5, y: 1.75
    // 现在改为 height: 2.1 (刚好到下檐), y: 1.05 (中心点)
    const geo = new THREE.CylinderGeometry(0.28, 0.28, 2.1, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.6 });
    
    pillarPos.forEach(pos => { 
        const p = new THREE.Mesh(geo, mat); 
        // y轴位置设为高度的一半，确保底部贴地
        p.position.set(pos[0], 1.05, pos[1]); 
        overlayPillarsGroup.add(p); 
    });
    
    overlayPillarsGroup.visible = false; 
    scene.add(overlayPillarsGroup);
}

// --- 暴露给 HTML 调用的函数 ---

window.updatePillarExplode = (val) => {
    const factor = parseFloat(val);
    if (factor > 0.1) {
        proxyPillarsGroup.visible = true;
        if (mainModel) mainModel.traverse(c => { if(c.isMesh) c.material.opacity = 0.3; c.material.transparent = true; });
    } else {
        proxyPillarsGroup.visible = false;
        if (mainModel) mainModel.traverse(c => { if(c.isMesh) c.material.opacity = 1.0; c.material.transparent = false; });
    }
    proxyPillarsGroup.children.forEach(pillar => {
        const offset = pillar.userData.explodeDir.clone().multiplyScalar(factor * 1.5);
        pillar.position.copy(pillar.userData.originPos).add(offset);
    });
};

window.updateClipping = (val) => { sectionPlane.constant = parseFloat(val); };
window.toggleOverlay = () => { overlayPillarsGroup.visible = !overlayPillarsGroup.visible; document.getElementById('btn-overlay').classList.toggle('active'); };
window.toggleLeaves = () => { leavesActive = !leavesActive; leavesSystem.visible = leavesActive; };

// ✨ 修改：切换场景时的核心逻辑
window.switchStage = (num) => {
    document.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + num).classList.add('active');
    document.querySelectorAll('.stage-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.stage-btn')[num-1].classList.add('active');

    if (num === 1) {
        // 切换到场景一：开启第一人称模式
        isFirstPersonMode = true;
        controls.enabled = false; // 禁用轨道控制器
        setupFirstPersonCamera(); // 重置回起点
        document.querySelector('header div:last-child').innerText = "当前模式：第一人称行走";
    } else {
        // 切换到场景二/三：开启轨道观察模式
        isFirstPersonMode = false;
        controls.enabled = true; // 启用轨道控制器
        // 设置一个适合观察的视角
        camera.position.set(8, 6, 10); 
        controls.target.set(0, 2, 0); // 设置旋转中心为亭子中部
        controls.update();
        document.querySelector('header div:last-child').innerText = "当前模式：轨道旋转观察";
    }
};

// 移除了 toggleAutoRotate，因为第一人称模式下不需要
// window.toggleAutoRotate = () => { controls.autoRotate = !controls.autoRotate; controls.autoRotateSpeed = 1.5; };

window.snapView = (view) => { 
    if(view === 'top') { 
        // 切换到俯视图时，临时禁用第一人称
        isFirstPersonMode = false;
        controls.enabled = true;
        camera.position.set(0, 15, 0); 
        controls.target.set(0,0,0);
        controls.update(); 
        document.querySelector('header div:last-child').innerText = "当前模式：俯视图观察";
    } 
};

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    animateLeaves();
    // 只有在非第一人称模式下才更新控制器
    if (!isFirstPersonMode) {
        controls.update();
    }
    renderer.render(scene, camera);
}