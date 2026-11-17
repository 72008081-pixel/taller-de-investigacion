// Feature-detect Popover API & respect reduced motion (modern-web-guidance)
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js").catch(() => {});
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// =====================================================================
// DATOS NORMATIVOS Y DOSIFICACIONES (NTP 399.611 / 399.604 / ASTM C140)
// =====================================================================
const DOSE_DATA = {
  0: {
    label: "0% Patrón",
    density: "~2,180 kg/m³",
    densityNote: "(Concreto patrón convencional 100% arena)",
    status: "Mezcla testigo de control (referencia ≥ 31 MPa)",
    statusClass: "status-ok",
    flakeCount: 0,
    roughness: 0.90,
  },
  5: {
    label: "5% PET",
    density: "~2,095 kg/m³",
    densityNote: "(Aligerado ~3.9% esperado vs patrón)",
    status: "Dosis conservadora esperada: cumple ≥ 31 MPa y ≤ 6% abs.",
    statusClass: "status-ok",
    flakeCount: 36,
    roughness: 0.86,
  },
  10: {
    label: "10% PET",
    density: "~2,010 kg/m³",
    densityNote: "(Aligerado ~7.8% esperado vs patrón)",
    status: "Dosis óptima esperada: cumple ≥ 31 MPa y menor absorción",
    statusClass: "status-ok",
    flakeCount: 78,
    roughness: 0.82,
  },
  15: {
    label: "15% PET",
    density: "~1,920 kg/m³",
    densityNote: "(Aligerado ~11.9% esperado vs patrón)",
    status: "Dosis límite experimental: evaluar reducción ITZ vs ≥ 31 MPa",
    statusClass: "status-warn",
    flakeCount: 125,
    roughness: 0.78,
  },
};

// =====================================================================
// ESTADO GLOBAL DE LA APLICACIÓN 3D
// =====================================================================
const state = {
  mode: "street", // "street" | "paver"
  dose: 10,
  zoomPct: 25,
  crouched: false,
  paverSpin: !prefersReducedMotion.matches,
  paverXray: false,
  paverDims: true,
  panelOpen: true,
  // Cámara primera persona en Calle (100 m: z in [-48.2, 48.2])
  player: {
    x: -4.8,
    y: 0.18 + 1.68,
    z: 36.0,
    groundY: 0.18,
    yaw: 0.08, // mirando hacia -Z (a lo largo de los 100 m)
    pitch: -0.14,
    walkBob: 0,
  },
  // Cámara orbital en Bloque PET 3D
  orbit: {
    yaw: 0.62,
    pitch: 0.36,
    dist: 4.3,
  },
  // Entradas dual joystick y teclado
  joyLeft: { x: 0, y: 0, pointerId: null },
  joyRight: { x: 0, y: 0, pointerId: null },
  keys: new Set(),
  mouseDrag: { active: false, lastX: 0, lastY: 0, pointerId: null },
  pinch: { active: false, lastDist: 0 },
};

// =====================================================================
// ELEMENTOS DEL DOM
// =====================================================================
const canvas = document.getElementById("scene-canvas");
const btnModeStreet = document.getElementById("btn-mode-street");
const btnModePaver = document.getElementById("btn-mode-paver");
const btnToggleSpecs = document.getElementById("btn-toggle-specs");
const btnClosePanel = document.getElementById("btn-close-panel");
const normPanel = document.getElementById("norm-panel");
const doseBtns = document.querySelectorAll(".dose-btn");
const specDensity = document.getElementById("spec-density");
const specDoseTag = document.getElementById("spec-dose-tag");
const specStatus = document.getElementById("spec-status");
const zoomSlider = document.getElementById("zoom-slider");
const streetActions = document.getElementById("street-actions");
const paverActions = document.getElementById("paver-actions");
const btnInspectGround = document.getElementById("btn-inspect-ground");
const btnCrossStreet = document.getElementById("btn-cross-street");
const btnCrouchMobile = document.getElementById("btn-crouch-mobile");
const btnToggleSpin = document.getElementById("btn-toggle-spin");
const btnToggleXray = document.getElementById("btn-toggle-xray");
const btnToggleDims = document.getElementById("btn-toggle-dims");
const telSurface = document.getElementById("tel-surface");
const telPos = document.getElementById("tel-pos");
const toastMsg = document.getElementById("toast-msg");
const joyLeftEl = document.getElementById("joy-left");
const joyLeftKnob = document.getElementById("joy-left-knob");
const joyRightEl = document.getElementById("joy-right");
const joyRightKnob = document.getElementById("joy-right-knob");
const joyLeftLabel = document.getElementById("joy-left-label");
const joyRightLabel = document.getElementById("joy-right-label");

let toastTimer = null;
function showToast(text) {
  toastMsg.textContent = text;
  toastMsg.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastMsg.classList.remove("is-visible"), 2600);
}

// =====================================================================
// CONFIGURACIÓN THREE.JS
// =====================================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7cc4f5);
scene.fog = new THREE.FogExp2(0x9bd2f7, 0.0052);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 420);

const streetGroup = new THREE.Group();
const studioGroup = new THREE.Group();
scene.add(streetGroup);
scene.add(studioGroup);

// =====================================================================
// GENERADORES DE TEXTURAS PROCEDURALES (CERO DEPENDENCIAS EXTERNAS)
// =====================================================================
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawPetFlakes(ctx, w, h, dosePct, scaleMult = 1, rand = Math.random) {
  if (dosePct <= 0) return;
  const count = Math.round(dosePct * 185 * scaleMult);
  const colors = [
    "rgba(186, 230, 253, 0.88)", // azul botella cristal
    "rgba(56, 189, 248, 0.78)",  // cian PET reciclado
    "rgba(241, 245, 249, 0.86)", // PET transparente brillo
    "rgba(110, 231, 183, 0.65)", // PET verde agua reciclado
  ];
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const fw = (1.6 + rand() * 3.8) * scaleMult;
    const fh = (1.1 + rand() * 2.2) * scaleMult;
    const ang = rand() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }
}

function makeSidewalkPETTexture(dosePct) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d");
  const rand = seededRandom(101 + dosePct * 7);

  // Fondo de junta oscura entre adoquines
  ctx.fillStyle = "#4b5563";
  ctx.fillRect(0, 0, 1024, 1024);

  // 2m x 2m repetición => cada adoquín 20cm x 10cm => 10 filas x 20 columnas aprox (trabado 10 x 20)
  const cols = 10; // cada uno 20 cm largo (102.4 px)
  const rows = 20; // cada uno 10 cm ancho (51.2 px)
  const bw = 1024 / cols;
  const bh = 1024 / rows;
  const gap = 3.2;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + offset;
      const y = r * bh;
      const shade = 148 + Math.floor(rand() * 28);
      // Tono cálido ligeramente gris concreto cusqueño
      ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 4})`;
      ctx.fillRect(x + gap, y + gap, bw - gap * 2, bh - gap * 2);

      // Micro bisel brillante superior izquierdo
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(x + gap, y + gap, bw - gap * 2, 3);
      ctx.fillStyle = "rgba(15,23,42,0.22)";
      ctx.fillRect(x + gap, y + bh - gap - 3, bw - gap * 2, 3);
    }
  }

  // Grano mineral arena + cemento
  for (let i = 0; i < 14000; i++) {
    const gx = rand() * 1024;
    const gy = rand() * 1024;
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.10)";
    ctx.fillRect(gx, gy, 2, 2);
  }

  // Escamas de PET reciclado incrustadas según dosificación
  drawPetFlakes(ctx, 1024, 1024, dosePct, 1.35, rand);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeSidewalkBumpTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, 512, 512);
  const cols = 10, rows = 20;
  const bw = 512 / cols, bh = 512 / rows, gap = 2;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let col = -1; col <= cols; col++) {
      ctx.fillStyle = "#dcdcdc";
      ctx.fillRect(col * bw + offset + gap, r * bh + gap, bw - gap * 2, bh - gap * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeHeroPaverTexture(dosePct) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext("2d");
  const rand = seededRandom(505 + dosePct * 13);

  ctx.fillStyle = "#7b848f";
  ctx.fillRect(0, 0, 1024, 1024);

  // Grano real de cemento y agregado fino de cantera
  for (let i = 0; i < 36000; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const s = 1.5 + rand() * 3.8;
    const v = 72 + Math.floor(rand() * 110);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},0.36)`;
    ctx.fillRect(x, y, s, s);
  }

  // Escamas visibles de PET reciclado triturado (1–4 mm representados en macro)
  drawPetFlakes(ctx, 1024, 1024, dosePct, 3.4, rand);

  // Micro porosidad natural del concreto vibrocompactado
  for (let i = 0; i < 650; i++) {
    ctx.beginPath();
    ctx.arc(rand() * 1024, rand() * 1024, 1 + rand() * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(25, 32, 42, 0.25)";
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeIncaStoneTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const rand = seededRandom(77);
  ctx.fillStyle = "#3b3a36";
  ctx.fillRect(0, 0, 512, 512);
  const rows = 5;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = 0;
    const rowOff = (r % 2) * 38;
    x -= rowOff;
    while (x < 512) {
      const w = 68 + rand() * 64;
      const tone = 82 + Math.floor(rand() * 34);
      ctx.fillStyle = `rgb(${tone + 6}, ${tone + 2}, ${tone - 3})`;
      ctx.fillRect(x + 3, r * rh + 3, w - 6, rh - 6);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x + 5, r * rh + 5, w - 10, 6);
      x += w;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeRoofTileTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const rand = seededRandom(303);
  ctx.fillStyle = "#8c3b24";
  ctx.fillRect(0, 0, 512, 512);
  const cols = 12, rows = 8;
  const cw = 512 / cols, ch = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const shade = Math.floor(rand() * 30);
      ctx.fillStyle = `rgb(${155 + shade}, ${66 + Math.floor(shade * 0.5)}, ${40 + Math.floor(shade * 0.3)})`;
      ctx.fillRect(col * cw + 2, r * ch + 2, cw - 4, ch - 4);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(col * cw, (r + 1) * ch - 4, cw, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeRoadTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const rand = seededRandom(99);
  ctx.fillStyle = "#2b303a";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12000; i++) {
    const v = 35 + Math.floor(rand() * 35);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.35)`;
    ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  // Línea central amarilla discontinua
  ctx.fillStyle = "#eab308";
  ctx.fillRect(250, 30, 12, 180);
  ctx.fillRect(250, 290, 12, 180);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createTextBillboard(lines, bgColor = "rgba(8,17,34,0.92)", borderColor = "#38bdf8") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bgColor;
  drawRoundedRect(ctx, 10, 10, 492, 156, 24);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = borderColor;
  ctx.stroke();

  ctx.textAlign = "center";
  lines.forEach((ln, idx) => {
    ctx.fillStyle = ln.color || "#f8fafc";
    ctx.font = `bold ${ln.size || 30}px Outfit, sans-serif`;
    ctx.fillText(ln.text, 256, 68 + idx * 54);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  return new THREE.Sprite(mat);
}

// =====================================================================
// CONSTRUCCIÓN DE LA CALLE DE SAN SEBASTIÁN, CUSCO (TRAMO 100 METROS)
// =====================================================================
let sidewalkMaterial = null;
let heroPaverMaterial = null;
let specimenBricksMat = null;
const streetObstacles = [];
const interactiveMeshes = [];

function buildCuscoStreet() {
  // Iluminación solar andina de San Sebastián
  const hemi = new THREE.HemisphereLight(0xdff2ff, 0x5c5346, 0.78);
  streetGroup.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.35);
  sun.position.set(28, 46, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 58;
  sun.shadow.camera.bottom = -58;
  sun.shadow.bias = -0.0005;
  streetGroup.add(sun);

  // Calzada central (pista de 100 m x 7 m)
  const roadTex = makeRoadTexture();
  roadTex.repeat.set(1, 22);
  const roadGeo = new THREE.PlaneGeometry(7.0, 102);
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, metalness: 0.04 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  streetGroup.add(road);

  // Cruces peatonales (cebras) para cruzar de vereda izquierda a derecha
  const zebraMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85 });
  [-42, 0, 42].forEach((cz) => {
    for (let sx = -2.8; sx <= 2.8; sx += 0.8) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.5), zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.006, cz);
      stripe.receiveShadow = true;
      streetGroup.add(stripe);
    }
  });

  // Veredas peatonales (Izquierda x: [-6.9, -3.5], Derecha x: [3.5, 6.9], largo 100m, altura +0.18m)
  const swTex = makeSidewalkPETTexture(state.dose);
  swTex.repeat.set(1.7, 50); // Exacto 3.4m x 100m a razón 2m x 2m por tile -> adoquines de 20x10 cm a escala real!
  const bumpTex = makeSidewalkBumpTexture();
  bumpTex.repeat.set(1.7, 50);

  sidewalkMaterial = new THREE.MeshStandardMaterial({
    map: swTex,
    bumpMap: bumpTex,
    bumpScale: 0.018,
    roughness: DOSE_DATA[state.dose].roughness,
    metalness: 0.08,
  });

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.88 });

  [-5.2, 5.2].forEach((cx, sideIdx) => {
    const swMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 100), sidewalkMaterial);
    swMesh.position.set(cx, 0.09, 0);
    swMesh.receiveShadow = true;
    streetGroup.add(swMesh);

    // Sardinel / bordillo biselado frente a la pista
    const curbX = sideIdx === 0 ? -3.55 : 3.55;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 100), curbMat);
    curb.position.set(curbX, 0.095, 0);
    curb.receiveShadow = true;
    curb.castShadow = true;
    streetGroup.add(curb);

    // Rampas peatonales accesibles en los 3 cruces
    const rampX = sideIdx === 0 ? -3.28 : 3.28;
    [-42, 0, 42].forEach((cz) => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.17, 2.5), curbMat);
      ramp.position.set(rampX, 0.04, cz);
      ramp.rotation.z = sideIdx === 0 ? -0.34 : 0.34;
      ramp.receiveShadow = true;
      streetGroup.add(ramp);
    });
  });

  // Zona de exhibición con adoquines 3D individuales reales (20 x 10 x 6 cm) sobre la vereda izquierda (z = 29..32)
  buildSidewalkDisplayPlinth();

  // Fachadas Cusqueñas de San Sebastián (ambos lados x = -9.6 y x = +9.6)
  const stoneTex = makeIncaStoneTexture();
  stoneTex.repeat.set(3, 1.2);
  const roofTex = makeRoofTileTexture();
  roofTex.repeat.set(4, 2);

  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.85 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x4b2e1b, roughness: 0.85 });
  const balconyColors = [0x1e40af, 0x155e75, 0x065f46, 0x6b3a20];
  const stuccoColors = [0xf4ede1, 0xefe3ce, 0xe8d5b7, 0xf8f5ee, 0xe6cdb2];

  const buildingRand = seededRandom(2026);
  for (let side of [-1, 1]) {
    let curZ = -50;
    let idx = 0;
    while (curZ < 48) {
      const len = 9.5 + buildingRand() * 3.5;
      if (curZ + len > 50) break;
      const cz = curZ + len / 2;
      const wallH = 6.2 + (idx % 3) * 1.4;
      const depth = 5.4;
      const cx = side * (6.9 + depth / 2);

      // Zócalo inferior de piedra andina (2.3 m)
      const base = new THREE.Mesh(new THREE.BoxGeometry(depth, 2.3, len - 0.08), stoneMat);
      base.position.set(cx, 1.15, cz);
      base.castShadow = true;
      base.receiveShadow = true;
      streetGroup.add(base);

      // Muro superior estucado cusqueño
      const stuccoCol = stuccoColors[(idx + (side > 0 ? 2 : 0)) % stuccoColors.length];
      const upperMat = new THREE.MeshStandardMaterial({ color: stuccoCol, roughness: 0.9 });
      const upper = new THREE.Mesh(new THREE.BoxGeometry(depth - 0.08, wallH - 2.3, len - 0.08), upperMat);
      upper.position.set(cx, 2.3 + (wallH - 2.3) / 2, cz);
      upper.castShadow = true;
      upper.receiveShadow = true;
      streetGroup.add(upper);

      // Techo inclinado de teja andina con alero hacia la vereda
      const roofW = depth + 1.0;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.28, len + 0.12), roofMat);
      roof.position.set(cx - side * 0.25, wallH + 0.35, cz);
      roof.rotation.z = side * 0.28;
      roof.castShadow = true;
      streetGroup.add(roof);

      // Puerta principal en planta baja
      const doorFaceX = side * 6.89;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.05, 1.3), woodDarkMat);
      door.position.set(doorFaceX, 1.18, cz - len * 0.22);
      streetGroup.add(door);

      // Balcón colonial cusqueño en 2do nivel (intercalado)
      if (idx % 2 === 0) {
        const bCol = balconyColors[idx % balconyColors.length];
        const balMat = new THREE.MeshStandardMaterial({ color: bCol, roughness: 0.78 });
        const balX = side * (6.9 - 0.42);
        const balFloor = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.14, 3.2), woodDarkMat);
        balFloor.position.set(balX, 3.3, cz + len * 0.14);
        balFloor.castShadow = true;
        streetGroup.add(balFloor);

        const balFront = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 3.2), balMat);
        balFront.position.set(side * (6.9 - 0.8), 3.82, cz + len * 0.14);
        balFront.castShadow = true;
        streetGroup.add(balFront);

        const balRoof = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 3.4), roofMat);
        balRoof.position.set(balX, 5.15, cz + len * 0.14);
        balRoof.rotation.z = side * 0.22;
        streetGroup.add(balRoof);
      } else {
        // Ventanas con marco de madera
        for (let wz of [-len * 0.22, len * 0.22]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, 1.0), woodDarkMat);
          win.position.set(doorFaceX, 4.1, cz + wz);
          streetGroup.add(win);
        }
      }

      curZ += len;
      idx++;
    }
  }

  // Portales / fachadas transversales cerrando ambos extremos de los 100 metros (z = ±50.5)
  const portalWallMat = new THREE.MeshStandardMaterial({ color: 0xe9dbc6, roughness: 0.9 });
  [-50.8, 50.8].forEach((ez) => {
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(19.5, 8.2, 1.4), portalWallMat);
    endWall.position.set(0, 4.1, ez);
    endWall.receiveShadow = true;
    streetGroup.add(endWall);

    const endBase = new THREE.Mesh(new THREE.BoxGeometry(19.5, 2.3, 1.5), stoneMat);
    endBase.position.set(0, 1.15, ez);
    streetGroup.add(endBase);

    const archSign = createTextBillboard([
      { text: "FIN DEL TRAMO 100 m", size: 32, color: "#facc15" },
      { text: "Veredas PET • San Sebastián, Cusco", size: 22, color: "#f8fafc" },
    ]);
    archSign.scale.set(4.5, 1.55, 1);
    archSign.position.set(0, 4.4, ez + (ez < 0 ? 1.1 : -1.1));
    streetGroup.add(archSign);
  });

  // Faroles coloniales, árboles andinos y contenedores PET a lo largo de los 100 m
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.45, metalness: 0.75 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.85 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45 });

  for (let lz = -38; lz <= 38; lz += 19) {
    for (let side of [-1, 1]) {
      // Farol en borde de vereda
      const lx = side * 3.85;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.8, 8), poleMat);
      pole.position.set(lx, 0.18 + 1.9, lz);
      pole.castShadow = true;
      streetGroup.add(pole);

      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.38, 0.28), glowMat);
      lantern.position.set(lx, 0.18 + 3.9, lz);
      streetGroup.add(lantern);
      streetObstacles.push({ x: lx, z: lz, r: 0.35 });
    }
  }

  // Árboles nativos + tachos PET reciclado en puntos selectos
  [-28, -9, 12, 28].forEach((tz, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const tx = side * 6.0;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.2, 8), trunkMat);
    trunk.position.set(tx, 0.18 + 1.1, tz);
    trunk.castShadow = true;
    streetGroup.add(trunk);

    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 1), leafMat);
    crown.position.set(tx, 0.18 + 2.8, tz);
    crown.castShadow = true;
    streetGroup.add(crown);
    streetObstacles.push({ x: tx, z: tz, r: 0.55 });

    // Tacho azul reciclaje PET
    const bx = -side * 6.1;
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.88, 12), binMat);
    bin.position.set(bx, 0.18 + 0.44, tz + 3);
    bin.castShadow = true;
    streetGroup.add(bin);
    streetObstacles.push({ x: bx, z: tz + 3, r: 0.45 });
  });

  // Cordón de cerros andinos rodeando Cusco (vista panorámica 360°)
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5d6e4e, roughness: 0.96, flatShading: true });
  const hillFarMat = new THREE.MeshStandardMaterial({ color: 0x4b5c6b, roughness: 0.96, flatShading: true });
  for (let a = 0; a < 28; a++) {
    const ang = (a / 28) * Math.PI * 2;
    const dist = 120 + (a % 3) * 35;
    const h = 34 + (a % 5) * 14;
    const w = 36 + (a % 4) * 12;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), a % 2 === 0 ? hillMat : hillFarMat);
    cone.position.set(Math.cos(ang) * dist, h * 0.4 - 4, Math.sin(ang) * dist);
    cone.rotation.y = a * 0.7;
    streetGroup.add(cone);
  }
}

function buildSidewalkDisplayPlinth() {
  // Estación interactiva de demostración en vereda izquierda (x = -5.7, z = 28)
  // Muestra una muestra de adoquines físicos reales 20x10x6 cm sobresaliendo del pavimento + letrero
  const grp = new THREE.Group();
  grp.position.set(-5.7, 0.18, 28.5);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.3 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 1.1), standMat);
  plinth.position.y = 0.325;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  grp.add(plinth);

  specimenBricksMat = new THREE.MeshStandardMaterial({
    map: makeHeroPaverTexture(state.dose),
    roughness: DOSE_DATA[state.dose].roughness,
    metalness: 0.08,
  });

  // 4 adoquines reales 20 x 10 x 6 cm sobre la mesa (escala 1:1 en metros => 0.20 x 0.06 x 0.10 m)
  const positions = [
    [-0.12, 0.68, -0.06, 0],
    [0.12, 0.68, -0.06, 0],
    [-0.06, 0.68, 0.09, Math.PI / 2],
    [0.08, 0.74, 0.04, 0.35],
  ];
  positions.forEach(([bx, by, bz, ry]) => {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.06, 0.10), specimenBricksMat);
    brick.position.set(bx, by, bz);
    brick.rotation.y = ry;
    brick.castShadow = true;
    grp.add(brick);
    interactiveMeshes.push(brick);
  });

  const sign = createTextBillboard([
    { text: "MUESTRA REAL 20×10×6 cm", size: 28, color: "#38bdf8" },
    { text: "Toca aquí o usa 'Bloque PET 3D'", size: 22, color: "#facc15" },
  ]);
  sign.scale.set(1.75, 0.62, 1);
  sign.position.set(0, 1.24, 0);
  grp.add(sign);

  streetGroup.add(grp);
  streetObstacles.push({ x: -5.7, z: 28.5, r: 0.85 });
}

// =====================================================================
// CONSTRUCCIÓN DEL MODO 2: BLOQUE ÚNICO DE PET LEVITANDO (20 × 10 × 6 cm)
// =====================================================================
const heroGroup = new THREE.Group();
const paverCoreGroup = new THREE.Group();
let heroMesh = null;
let heroFlakesGroup = new THREE.Group();
let dimsGroup = new THREE.Group();

function buildHeroPaverStudio() {
  studioGroup.add(new THREE.HemisphereLight(0xcbe4f9, 0x0b1220, 0.68));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.10);
  keyLight.position.set(4, 6, 5);
  studioGroup.add(keyLight);

  const rimCyan = new THREE.PointLight(0x38bdf8, 1.2, 14);
  rimCyan.position.set(-4, 2, -3);
  studioGroup.add(rimCyan);

  const rimWarm = new THREE.PointLight(0xfacc15, 0.85, 14);
  rimWarm.position.set(4, -2, -3);
  studioGroup.add(rimWarm);

  // Plataforma holográfica sutil debajo del adoquín levitando
  const ringGeo = new THREE.RingGeometry(1.35, 1.52, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.25;
  studioGroup.add(ring);

  const grid = new THREE.GridHelper(6, 12, 0x38bdf8, 0x1e293b);
  grid.position.y = -1.26;
  studioGroup.add(grid);

  // Adoquín a escala visual cómoda: 1 unidad = 10 cm => 2.0 (largo) x 0.6 (espesor) x 1.0 (ancho)
  heroPaverMaterial = new THREE.MeshStandardMaterial({
    map: makeHeroPaverTexture(state.dose),
    roughness: DOSE_DATA[state.dose].roughness,
    metalness: 0.08,
    transparent: false,
    opacity: 1.0,
  });

  const mainGeo = new THREE.BoxGeometry(2.0, 0.6, 1.0);
  heroMesh = new THREE.Mesh(mainGeo, heroPaverMaterial);
  paverCoreGroup.add(heroMesh);

  // Bisel superior visual e indicadores laterales (pestañas separadoras de adoquín real NTP)
  const chamferGeo = new THREE.BoxGeometry(1.92, 0.06, 0.92);
  const chamfer = new THREE.Mesh(chamferGeo, heroPaverMaterial);
  chamfer.position.y = 0.31;
  paverCoreGroup.add(chamfer);

  [-0.55, 0.55].forEach((nx) => {
    const nib = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.05), heroPaverMaterial);
    nib.position.set(nx, -0.02, 0.51);
    paverCoreGroup.add(nib);
  });

  paverCoreGroup.add(heroFlakesGroup);
  rebuildInternalPetFlakes(state.dose);

  // Líneas de cota 3D exactas (20.0 cm x 10.0 cm x 6.0 cm)
  buildDimensionOverlay();
  paverCoreGroup.add(dimsGroup);

  heroGroup.add(paverCoreGroup);
  studioGroup.add(heroGroup);
  studioGroup.visible = false;
}

function rebuildInternalPetFlakes(dosePct) {
  while (heroFlakesGroup.children.length > 0) {
    const ch = heroFlakesGroup.children[0];
    heroFlakesGroup.remove(ch);
    ch.geometry.dispose();
  }
  const n = DOSE_DATA[dosePct].flakeCount;
  if (n <= 0) return;

  const rand = seededRandom(888 + dosePct);
  const flakeMatA = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.2,
  });
  const flakeMatB = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe, emissive: 0x7dd3fc, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.15,
  });

  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(0.05 + rand() * 0.06, 0.015, 0.03 + rand() * 0.04);
    const m = new THREE.Mesh(g, i % 2 === 0 ? flakeMatA : flakeMatB);
    m.position.set((rand() - 0.5) * 1.85, (rand() - 0.5) * 0.50, (rand() - 0.5) * 0.88);
    m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    heroFlakesGroup.add(m);
  }
}

function buildDimensionOverlay() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
  const addDim = (p1, p2, labelText, subText, posLabel, col = "#38bdf8") => {
    const pts = [new THREE.Vector3(...p1), new THREE.Vector3(...p2)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    dimsGroup.add(new THREE.Line(geo, lineMat));

    const sp = createTextBillboard([
      { text: labelText, size: 38, color: col },
      { text: subText, size: 25, color: "#f8fafc" },
    ], "rgba(7,14,28,0.90)", col);
    sp.scale.set(0.96, 0.33, 1);
    sp.position.set(...posLabel);
    dimsGroup.add(sp);
  };

  // Largo: 20.0 cm
  addDim([-1.0, -0.48, 0.68], [1.0, -0.48, 0.68], "20.0 cm", "Largo nominal (200 mm)", [0, -0.68, 0.68], "#facc15");
  // Ancho: 10.0 cm
  addDim([1.22, -0.48, -0.5], [1.22, -0.48, 0.5], "10.0 cm", "Ancho (100 mm)", [1.52, -0.48, 0], "#38bdf8");
  // Espesor: 6.0 cm
  addDim([-1.22, -0.30, 0.5], [-1.22, 0.34, 0.5], "6.0 cm", "Espesor Tipo I (60 mm)", [-1.58, 0.04, 0.5], "#34d399");
}

// =====================================================================
// ACTUALIZAR DOSIFICACIÓN DE PET EN VIVO (AMBOS MODOS)
// =====================================================================
function setDosage(dose) {
  state.dose = Number(dose);
  const d = DOSE_DATA[state.dose];

  doseBtns.forEach((b) => b.classList.toggle("is-selected", Number(b.dataset.dose) === state.dose));
  specDensity.innerHTML = `${d.density} <small>${d.densityNote}</small>`;
  specDoseTag.textContent = d.label;
  specStatus.textContent = d.status;
  specStatus.className = d.statusClass;

  // Actualizar textura de vereda (100m), muestra física y bloque 3D levitando
  if (sidewalkMaterial) {
    const newSwTex = makeSidewalkPETTexture(state.dose);
    newSwTex.repeat.set(1.7, 50);
    if (sidewalkMaterial.map) sidewalkMaterial.map.dispose();
    sidewalkMaterial.map = newSwTex;
    sidewalkMaterial.roughness = d.roughness;
    sidewalkMaterial.needsUpdate = true;
  }

  const newHeroTex = makeHeroPaverTexture(state.dose);
  if (heroPaverMaterial) {
    if (heroPaverMaterial.map) heroPaverMaterial.map.dispose();
    heroPaverMaterial.map = newHeroTex;
    heroPaverMaterial.roughness = d.roughness;
    heroPaverMaterial.needsUpdate = true;
  }
  if (specimenBricksMat) {
    specimenBricksMat.map = newHeroTex;
    specimenBricksMat.roughness = d.roughness;
    specimenBricksMat.needsUpdate = true;
  }

  rebuildInternalPetFlakes(state.dose);
  showToast(`Dosificación activa: ${d.label} en adoquines`);
}

doseBtns.forEach((btn) => btn.addEventListener("click", () => setDosage(btn.dataset.dose)));

// =====================================================================
// CAMBIO DE MODO: CALLE CUSCO <-> BLOQUE PET 3D LEVITANDO
// =====================================================================
function switchMode(newMode) {
  state.mode = newMode;
  const isStreet = newMode === "street";

  btnModeStreet.classList.toggle("is-active", isStreet);
  btnModeStreet.setAttribute("aria-pressed", String(isStreet));
  btnModePaver.classList.toggle("is-active", !isStreet);
  btnModePaver.setAttribute("aria-pressed", String(!isStreet));

  streetGroup.visible = isStreet;
  studioGroup.visible = !isStreet;

  if (isStreet) {
    scene.background = new THREE.Color(0x7cc4f5);
    scene.fog = new THREE.FogExp2(0x9bd2f7, 0.0052);
    streetActions.classList.remove("is-hidden");
    paverActions.classList.add("is-hidden");
    btnCrouchMobile.style.display = "inline-flex";
    joyLeftLabel.textContent = "CAMINAR";
    joyRightLabel.textContent = "VISTA 360°";
    updateStreetZoom(state.crouched ? 85 : 25);
    showToast("Modo Calle Cusco (100 m): camina sobre las veredas con PET");
  } else {
    scene.background = new THREE.Color(0x060c18);
    scene.fog = null;
    streetActions.classList.add("is-hidden");
    paverActions.classList.remove("is-hidden");
    btnCrouchMobile.style.display = "none";
    joyLeftLabel.textContent = "INCLINAR / ZOOM";
    joyRightLabel.textContent = "ROTAR BLOQUE";
    state.zoomPct = window.innerWidth <= 820 ? 18 : 42;
    zoomSlider.value = String(state.zoomPct);
    state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.15;
    camera.fov = 52;
    camera.updateProjectionMatrix();
    telSurface.textContent = "Estudio 3D: Adoquín NTP 399.611";
    telPos.textContent = "20 × 10 × 6 cm (Tipo I)";
    showToast("Modo Bloque PET 3D: gira y acércate para ver detalles");
  }
}

btnModeStreet.addEventListener("click", () => switchMode("street"));
btnModePaver.addEventListener("click", () => switchMode("paver"));

// =====================================================================
// CONTROLES DE INSPECCIÓN, ZOOM, PANEL Y CRUCE DE VEREDA
// =====================================================================
function updateStreetZoom(pct) {
  state.zoomPct = Math.max(0, Math.min(100, pct));
  zoomSlider.value = String(Math.round(state.zoomPct));
  state.crouched = state.zoomPct > 55;
  btnCrouchMobile.classList.toggle("is-crouched", state.crouched);
  btnInspectGround.classList.toggle("is-on", state.crouched);
  // Estrechar FOV al hacer zoom en el suelo (68° -> 28°)
  camera.fov = 68 - (state.zoomPct / 100) * 40;
  camera.updateProjectionMatrix();
}

zoomSlider.addEventListener("input", () => {
  const val = Number(zoomSlider.value);
  if (state.mode === "street") {
    updateStreetZoom(val);
  } else {
    state.zoomPct = val;
    state.orbit.dist = 6.2 - (val / 100) * 4.15; // 6.2 -> 2.05 unidades
  }
});

function toggleGroundInspect() {
  if (state.mode !== "street") return;
  if (!state.crouched) {
    updateStreetZoom(88);
    state.player.pitch = -0.88; // mirar directo a los adoquines bajo los pies
    showToast("Zoom al suelo: inspecciona los adoquines PET de cerca");
  } else {
    updateStreetZoom(20);
    state.player.pitch = -0.14;
    showToast("Vista normal de caminata");
  }
}

btnInspectGround.addEventListener("click", toggleGroundInspect);
btnCrouchMobile.addEventListener("click", toggleGroundInspect);

btnCrossStreet.addEventListener("click", () => {
  if (state.mode !== "street") switchMode("street");
  const targetX = state.player.x < 0 ? 4.8 : -4.8;
  state.player.x = targetX;
  state.player.z = Math.max(-40, Math.min(40, state.player.z));
  showToast(targetX > 0 ? "Cruzaste a la vereda derecha (PET)" : "Volviste a la vereda izquierda (PET)");
});

btnToggleSpecs.addEventListener("click", () => {
  state.panelOpen = !state.panelOpen;
  normPanel.classList.toggle("is-collapsed", !state.panelOpen);
  btnToggleSpecs.setAttribute("aria-expanded", String(state.panelOpen));
});

btnClosePanel.addEventListener("click", () => {
  state.panelOpen = false;
  normPanel.classList.add("is-collapsed");
  btnToggleSpecs.setAttribute("aria-expanded", "false");
});

btnToggleSpin.addEventListener("click", () => {
  state.paverSpin = !state.paverSpin;
  btnToggleSpin.textContent = state.paverSpin ? "⏸ Pausar Giro" : "▶ Reanudar Giro";
});

btnToggleXray.addEventListener("click", () => {
  state.paverXray = !state.paverXray;
  btnToggleXray.classList.toggle("is-on", state.paverXray);
  heroPaverMaterial.transparent = state.paverXray;
  heroPaverMaterial.opacity = state.paverXray ? 0.36 : 1.0;
  heroPaverMaterial.depthWrite = !state.paverXray;
  heroPaverMaterial.needsUpdate = true;
  showToast(state.paverXray ? "Vista interna: distribución de escamas PET" : "Vista sólida del concreto PET");
});

btnToggleDims.addEventListener("click", () => {
  state.paverDims = !state.paverDims;
  btnToggleDims.classList.toggle("is-on", state.paverDims);
  dimsGroup.visible = state.paverDims;
});

// =====================================================================
// JOYSTICKS MULTITÁCTILES SIMULTÁNEOS (POINTER CAPTURE + DRAG GUIDE)
// =====================================================================
function attachJoystick(baseEl, knobEl, joyState) {
  const maxR = () => (baseEl.clientWidth * 0.34);

  const updateStick = (clientX, clientY) => {
    const rect = baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const r = maxR();
    const dist = Math.hypot(dx, dy);
    if (dist > r) {
      dx = (dx / dist) * r;
      dy = (dy / dist) * r;
    }
    knobEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    joyState.x = dx / r;
    joyState.y = dy / r;
  };

  const resetStick = () => {
    joyState.pointerId = null;
    joyState.x = 0;
    joyState.y = 0;
    knobEl.style.transform = "translate3d(0px, 0px, 0)";
    baseEl.classList.remove("is-active");
  };

  baseEl.addEventListener("pointerdown", (e) => {
    if (joyState.pointerId !== null) return;
    e.stopPropagation();
    joyState.pointerId = e.pointerId;
    baseEl.setPointerCapture(e.pointerId);
    baseEl.classList.add("is-active");
    updateStick(e.clientX, e.clientY);
  });

  baseEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joyState.pointerId) return;
    e.stopPropagation();
    updateStick(e.clientX, e.clientY);
  });

  baseEl.addEventListener("lostpointercapture", (e) => {
    if (e.pointerId === joyState.pointerId) resetStick();
  });

  baseEl.addEventListener("pointercancel", (e) => {
    if (e.pointerId === joyState.pointerId) resetStick();
  });
}

attachJoystick(joyLeftEl, joyLeftKnob, state.joyLeft);
attachJoystick(joyRightEl, joyRightKnob, state.joyRight);

// =====================================================================
// MOUSE / TOUCH DIRECTO EN CANVAS (CAMINAR + GIRAR + RAYCASTING)
// =====================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let activeTouches = new Map();

canvas.addEventListener("pointerdown", (e) => {
  activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activeTouches.size === 2) {
    const pts = Array.from(activeTouches.values());
    state.pinch.active = true;
    state.pinch.lastDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    state.mouseDrag.active = false;
    return;
  }
  state.mouseDrag.active = true;
  state.mouseDrag.pointerId = e.pointerId;
  state.mouseDrag.lastX = e.clientX;
  state.mouseDrag.lastY = e.clientY;
  state.mouseDrag.downX = e.clientX;
  state.mouseDrag.downY = e.clientY;
});

canvas.addEventListener("pointermove", (e) => {
  if (activeTouches.has(e.pointerId)) {
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (state.pinch.active && activeTouches.size === 2) {
    const pts = Array.from(activeTouches.values());
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const delta = (d - state.pinch.lastDist) * 0.25;
    state.pinch.lastDist = d;
    if (state.mode === "street") updateStreetZoom(state.zoomPct + delta);
    else {
      state.zoomPct = Math.max(0, Math.min(100, state.zoomPct + delta));
      zoomSlider.value = String(Math.round(state.zoomPct));
      state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.15;
    }
    return;
  }

  if (!state.mouseDrag.active || e.pointerId !== state.mouseDrag.pointerId) return;
  const dx = e.clientX - state.mouseDrag.lastX;
  const dy = e.clientY - state.mouseDrag.lastY;
  state.mouseDrag.lastX = e.clientX;
  state.mouseDrag.lastY = e.clientY;

  if (state.mode === "street") {
    state.player.yaw -= dx * 0.0042;
    state.player.pitch = Math.max(-1.42, Math.min(0.95, state.player.pitch - dy * 0.0042));
  } else {
    state.orbit.yaw -= dx * 0.007;
    state.orbit.pitch = Math.max(-1.35, Math.min(1.35, state.orbit.pitch + dy * 0.007));
  }
});

function endCanvasPointer(e) {
  activeTouches.delete(e.pointerId);
  if (activeTouches.size < 2) state.pinch.active = false;
  if (e.pointerId === state.mouseDrag.pointerId) {
    const moved = Math.hypot(e.clientX - state.mouseDrag.downX, e.clientY - state.mouseDrag.downY);
    state.mouseDrag.active = false;
    // Tap rápido sobre la mesa muestra en la calle abre el Bloque PET 3D
    if (moved < 8 && state.mode === "street") {
      pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes);
      if (hits.length > 0) switchMode("paver");
    }
  }
}

canvas.addEventListener("pointerup", endCanvasPointer);
canvas.addEventListener("pointercancel", endCanvasPointer);

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 7 : -7;
  if (state.mode === "street") {
    updateStreetZoom(state.zoomPct + step);
  } else {
    state.zoomPct = Math.max(0, Math.min(100, state.zoomPct + step));
    zoomSlider.value = String(Math.round(state.zoomPct));
    state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.15;
  }
}, { passive: false });

window.addEventListener("keydown", (e) => {
  state.keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  state.keys.delete(e.code);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =====================================================================
// BUCLE DE SIMULACIÓN Y RENDERIZADO (60 FPS)
// =====================================================================
function getSurfaceHeight(x) {
  // Veredas en [-6.9, -3.5] y [+3.5, +6.9] a +0.18 m; pista en medio a 0.00 m
  return Math.abs(x) >= 3.45 ? 0.18 : 0.0;
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.mode === "street") {
    // 1. Rotación con Joystick Derecho
    if (Math.abs(state.joyRight.x) > 0.05 || Math.abs(state.joyRight.y) > 0.05) {
      state.player.yaw -= state.joyRight.x * 2.15 * dt;
      state.player.pitch = Math.max(-1.42, Math.min(0.95, state.player.pitch - state.joyRight.y * 1.65 * dt));
    }

    // 2. Movimiento con Joystick Izquierdo + Teclado WASD/Flechas
    let moveFwd = -state.joyLeft.y;
    let moveSide = state.joyLeft.x;

    if (state.keys.has("KeyW") || state.keys.has("ArrowUp")) moveFwd += 1;
    if (state.keys.has("KeyS") || state.keys.has("ArrowDown")) moveFwd -= 1;
    if (state.keys.has("KeyD") || state.keys.has("ArrowRight")) moveSide += 1;
    if (state.keys.has("KeyA") || state.keys.has("ArrowLeft")) moveSide -= 1;

    const mag = Math.hypot(moveFwd, moveSide);
    if (mag > 0.04) {
      const normF = moveFwd / Math.max(1, mag);
      const normS = moveSide / Math.max(1, mag);
      const speed = (state.crouched ? 1.85 : 4.35) * dt;
      const sinY = Math.sin(state.player.yaw);
      const cosY = Math.cos(state.player.yaw);

      // Dirección hacia adelante en Three.js = (-sinY, -cosY)
      let nx = state.player.x + (-sinY * normF + cosY * normS) * speed;
      let nz = state.player.z + (-cosY * normF - sinY * normS) * speed;

      // Límites físicos cerrados del tramo de 100 metros (fachadas y portales extremos)
      nx = Math.max(-6.45, Math.min(6.45, nx));
      nz = Math.max(-47.8, Math.min(47.8, nz));

      // Colisión suave contra árboles, faroles y tachos
      for (const ob of streetObstacles) {
        const dx = nx - ob.x;
        const dz = nz - ob.z;
        const d = Math.hypot(dx, dz);
        if (d < ob.r && d > 0.001) {
          nx = ob.x + (dx / d) * ob.r;
          nz = ob.z + (dz / d) * ob.r;
        }
      }

      state.player.x = nx;
      state.player.z = nz;
      state.player.walkBob += dt * (state.crouched ? 5 : 9.5);
    } else {
      state.player.walkBob = 0;
    }

    // 3. Altura suave (subir/bajar vereda <-> pista + altura de inspección suelo)
    const targetGround = getSurfaceHeight(state.player.x);
    state.player.groundY += (targetGround - state.player.groundY) * Math.min(1, dt * 12);
    const eyeH = 1.68 - (state.zoomPct / 100) * 1.30; // 1.68 m de pie -> 0.38 m pegado a los adoquines
    const bobOffset = !prefersReducedMotion.matches && mag > 0.08 ? Math.sin(state.player.walkBob) * 0.032 : 0;
    const targetY = state.player.groundY + eyeH + bobOffset;
    state.player.y += (targetY - state.player.y) * Math.min(1, dt * 10);

    camera.position.set(state.player.x, state.player.y, state.player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = state.player.yaw;
    camera.rotation.x = state.player.pitch;

    // 4. Telemetría en tiempo real (superficie + avance en los 100 metros)
    const metersProgress = Math.max(0, Math.min(100, (50 - state.player.z) * (100 / 95.6)));
    telPos.textContent = `Tramo: ${metersProgress.toFixed(1)} m / 100 m`;
    if (state.player.x <= -3.45) {
      telSurface.textContent = `Vereda Izquierda • Adoquín ${state.dose}% PET (+18 cm)`;
    } else if (state.player.x >= 3.45) {
      telSurface.textContent = `Vereda Derecha • Adoquín ${state.dose}% PET (+18 cm)`;
    } else {
      telSurface.textContent = "Calzada Vehicular (0 cm) — Sube a la vereda";
    }
  } else {
    // MODO 2: BLOQUE ÚNICO PET LEVITANDO (20 x 10 x 6 cm)
    if (Math.abs(state.joyRight.x) > 0.04 || Math.abs(state.joyRight.y) > 0.04) {
      state.orbit.yaw -= state.joyRight.x * 2.4 * dt;
      state.orbit.pitch = Math.max(-1.35, Math.min(1.35, state.orbit.pitch + state.joyRight.y * 1.8 * dt));
    }
    if (Math.abs(state.joyLeft.y) > 0.05) {
      state.zoomPct = Math.max(0, Math.min(100, state.zoomPct - state.joyLeft.y * 55 * dt));
      zoomSlider.value = String(Math.round(state.zoomPct));
      state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.15;
    }
    if (Math.abs(state.joyLeft.x) > 0.05) {
      state.orbit.yaw += state.joyLeft.x * 1.5 * dt;
    }

    if (state.paverSpin) {
      paverCoreGroup.rotation.y += 0.55 * dt;
    }
    if (!prefersReducedMotion.matches) {
      heroGroup.position.y = Math.sin(clock.elapsedTime * 1.8) * 0.09;
    } else {
      heroGroup.position.y = 0;
    }

    const r = state.orbit.dist;
    const cp = Math.cos(state.orbit.pitch);
    // Desplazar centro visual hacia la derecha en escritorio (cuando panel izquierdo esta abierto) o arriba en movil con panel
    const offsetLookX = (window.innerWidth > 820 && state.panelOpen) ? -0.55 : 0.0;
    const offsetLookY = (window.innerWidth <= 820 && state.panelOpen) ? -0.38 : 0.05;
    camera.position.set(
      Math.sin(state.orbit.yaw) * cp * r + offsetLookX,
      Math.sin(state.orbit.pitch) * r + 0.12 + offsetLookY,
      Math.cos(state.orbit.yaw) * cp * r
    );
    camera.lookAt(offsetLookX, offsetLookY, 0);
  }

  renderer.render(scene, camera);
}

// =====================================================================
// INICIALIZACIÓN
// =====================================================================
buildCuscoStreet();
buildHeroPaverStudio();
setDosage(10);
updateStreetZoom(25);
if (window.innerWidth <= 680) {
  // En celulares muy estrechos, empezar con el panel minimizado para ver la calle completa en 1er pantallazo
  state.panelOpen = false;
  normPanel.classList.add("is-collapsed");
  btnToggleSpecs.setAttribute("aria-expanded", "false");
}
animate();
