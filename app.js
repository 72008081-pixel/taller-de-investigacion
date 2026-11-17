// Feature-detect Popover API & respect reduced motion (modern-web-guidance)
if (!Object.hasOwn(HTMLElement.prototype, "popover")) {
  import("https://unpkg.com/@oddbird/popover-polyfill@latest/dist/popover.min.js").catch(() => {});
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// =====================================================================
// PARÁMETROS FÍSICO-MECÁNICOS Y NORMATIVOS (NTP 399.611 / 399.604 / ASTM C140)
// =====================================================================
const DOSE_DATA = {
  0: {
    label: "0% Patrón",
    fc: "~35.8 MPa (365 kg/cm²)",
    fcSub: "Referencia 100% arena natural • Cumple NTP Tipo I (≥ 31 MPa)",
    abs: "~5.4% prom. (24 h)",
    absSub: "Porosidad capilar normal • Cumple NTP (≤ 6.0% prom.)",
    density: "~2,180 kg/m³ (2.62 kg/u.)",
    densitySub: "Masa referencial para adoquín 20×10×6 cm (1,200 cm³)",
    status: "Mezcla testigo sin reciclaje (0 botellas PET en 100 m)",
    statusClass: "status-ok",
    flakeCount: 0,
    sidewalkFlakeRatio: 0.0,
    roughness: 0.88,
  },
  5: {
    label: "5% PET",
    fc: "~34.6 MPa (353 kg/cm²)",
    fcSub: "Supera exigencia NTP 399.611 Tipo I (≥ 31 MPa prom. | ≥ 28 MPa ind.)",
    abs: "~4.8% prom. (24 h)",
    absSub: "Hidrofobicidad PET reduce capilaridad • Cumple ≤ 6.0%",
    density: "~2,095 kg/m³ (2.51 kg/u.)",
    densitySub: "Aligerado ~3.9% vs. patrón • Menor carga muerta peatonal",
    status: "~9,600 botellas PET recicladas en 100 m de veredas • ITZ estable",
    statusClass: "status-ok",
    flakeCount: 55,
    sidewalkFlakeRatio: 0.35,
    roughness: 0.82,
  },
  10: {
    label: "10% PET",
    fc: "~33.4 MPa (340 kg/cm²)",
    fcSub: "Dosis óptima esperada: cumple ≥ 31 MPa prom. (NTP 399.611 Tipo I)",
    abs: "~4.4% prom. (24 h)",
    absSub: "Barrera polimérica impermeable • Holgura amplia bajo ≤ 6.0%",
    density: "~2,010 kg/m³ (2.41 kg/u.)",
    densitySub: "Aligerado ~7.8% vs. patrón (~210 g menos por adoquín)",
    status: "ÓPTIMO: ~19,200 botellas PET valorizadas en 100 m (Haquira)",
    statusClass: "status-ok",
    flakeCount: 115,
    sidewalkFlakeRatio: 0.70,
    roughness: 0.76,
  },
  15: {
    label: "15% PET",
    fc: "~29.4 MPa (300 kg/cm²)",
    fcSub: "Zona límite experimental: evaluar debilitamiento ITZ frente a 31 MPa",
    abs: "~4.9% prom. (24 h)",
    absSub: "Cumple ≤ 6.0%, pero con mayor micro-vacío interfacial pasta-PET",
    density: "~1,920 kg/m³ (2.30 kg/u.)",
    densitySub: "Aligerado ~11.9% vs. patrón (máxima reducción de peso)",
    status: "~28,800 botellas PET en 100 m • Dosificación frontera de estudio",
    statusClass: "status-warn",
    flakeCount: 175,
    sidewalkFlakeRatio: 1.0,
    roughness: 0.72,
  },
};

const WEATHER_PRESETS = [
  { id: "sun", label: "☀️ Sol Andino", skyTop: 0x1e5799, skyBot: 0x9bc8eb, fogCol: 0x9dc7e8, sunInt: 1.55, hemiInt: 0.75, wet: 0.0 },
  { id: "rain", label: "🌧️ Lluvia Cusco", skyTop: 0x263547, skyBot: 0x64748b, fogCol: 0x5b6b7c, sunInt: 0.65, hemiInt: 0.55, wet: 1.0 },
  { id: "sunset", label: "🌅 Atardecer", skyTop: 0x1e1b4b, skyBot: 0xf97316, fogCol: 0xc2785c, sunInt: 1.35, hemiInt: 0.62, wet: 0.15 },
];

// =====================================================================
// ESTADO GLOBAL
// =====================================================================
const state = {
  mode: "street",
  dose: 10,
  weatherIdx: 0,
  ultraQuality: true,
  zoomPct: 22,
  crouched: false,
  paverSpin: !prefersReducedMotion.matches,
  paverXray: false,
  paverDims: true,
  panelOpen: true,
  scanWave: { active: false, z: 50 },
  player: {
    x: -4.85,
    y: 0.18 + 1.68,
    z: 36.0,
    groundY: 0.18,
    yaw: 0.06,
    pitch: -0.15,
    walkBob: 0,
  },
  orbit: {
    yaw: 0.58,
    pitch: 0.32,
    dist: 4.1,
  },
  joyLeft: { x: 0, y: 0, pointerId: null },
  joyRight: { x: 0, y: 0, pointerId: null },
  keys: new Set(),
  mouseDrag: { active: false, lastX: 0, lastY: 0, downX: 0, downY: 0, pointerId: null },
  pinch: { active: false, lastDist: 0 },
};

// =====================================================================
// REFERENCIAS DOM
// =====================================================================
const canvas = document.getElementById("scene-canvas");
const btnModeStreet = document.getElementById("btn-mode-street");
const btnModePaver = document.getElementById("btn-mode-paver");
const btnWeather = document.getElementById("btn-weather");
const btnQuality = document.getElementById("btn-quality");
const btnToggleSpecs = document.getElementById("btn-toggle-specs");
const btnClosePanel = document.getElementById("btn-close-panel");
const normPanel = document.getElementById("norm-panel");
const doseBtns = document.querySelectorAll(".dose-btn");
const specFc = document.getElementById("spec-fc");
const specAbs = document.getElementById("spec-abs");
const specDensity = document.getElementById("spec-density");
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
  toastTimer = setTimeout(() => toastMsg.classList.remove("is-visible"), 2800);
}

// =====================================================================
// MOTOR GRÁFICO WEBGL PBR + SUPERSAMPLING GPU DEL USUARIO
// =====================================================================
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  precision: "highp",
});

function applyGPUQuality() {
  const baseDpr = window.devicePixelRatio || 1;
  // En modo Ultra GPU usa super-sampling hasta 2.25x para máxima nitidez tipo DLSS/SSAA
  const targetRatio = state.ultraQuality ? Math.min(Math.max(baseDpr * 1.35, 1.75), 2.25) : Math.min(baseDpr, 1.25);
  renderer.setPixelRatio(targetRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

applyGPUQuality();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec5ed);
scene.fog = new THREE.FogExp2(0x9dc7e8, 0.0042);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.04, 460);

const streetGroup = new THREE.Group();
const studioGroup = new THREE.Group();
scene.add(streetGroup);
scene.add(studioGroup);

// =====================================================================
// GENERADOR DE ENVIRONMENT MAP (IBL) + MAPAS NORMALES TANGENCIALES PBR
// =====================================================================
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildIBL(topHex = 0x1e5799, botHex = 0x9bc8eb) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  const topCol = new THREE.Color(topHex);
  const botCol = new THREE.Color(botHex);
  const grd = ctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.0, `#${topCol.getHexString()}`);
  grd.addColorStop(0.52, `#${botCol.getHexString()}`);
  grd.addColorStop(0.55, "#57534e");
  grd.addColorStop(1.0, "#292524");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 256);
  // Punto solar especular para reflejos realistas en las escamas de PET y charcos
  const sunGrd = ctx.createRadialGradient(360, 68, 2, 360, 68, 48);
  sunGrd.addColorStop(0, "rgba(255,252,235,1)");
  sunGrd.addColorStop(1, "rgba(255,252,235,0)");
  ctx.fillStyle = sunGrd;
  ctx.fillRect(300, 12, 120, 120);

  const eqTex = new THREE.CanvasTexture(c);
  eqTex.mapping = THREE.EquirectangularReflectionMapping;
  eqTex.encoding = THREE.sRGBEncoding;
  const envRT = pmrem.fromEquirectangular(eqTex);
  scene.environment = envRT.texture;
  eqTex.dispose();
  pmrem.dispose();
}

// Convierte un mapa de alturas (Float32Array) en un Normal Map Tangencial RGB por operador Sobel en CPU
function heightFieldToNormalCanvas(heightBuf, w, h, strength = 4.5) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  const idx = (x, y) => ((y + h) % h) * w + ((x + w) % w);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = heightBuf[idx(x - 1, y - 1)];
      const t = heightBuf[idx(x, y - 1)];
      const tr = heightBuf[idx(x + 1, y - 1)];
      const l = heightBuf[idx(x - 1, y)];
      const r = heightBuf[idx(x + 1, y)];
      const bl = heightBuf[idx(x - 1, y + 1)];
      const b = heightBuf[idx(x, y + 1)];
      const br = heightBuf[idx(x + 1, y + 1)];

      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dX * strength;
      let ny = -dY * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const p = (y * w + x) * 4;
      data[p] = Math.round((nx * 0.5 + 0.5) * 255);
      data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[p + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

// =====================================================================
// SÍNTESIS PBR DE ADOQUINADO CON PET (ALBEDO + NORMAL MAP + ROUGHNESS MAP)
// =====================================================================
function makeSidewalkPBRSet(dosePct) {
  const W = 1024, H = 1024;
  const albCanvas = document.createElement("canvas");
  albCanvas.width = W;
  albCanvas.height = H;
  const ctxA = albCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = W;
  roughCanvas.height = H;
  const ctxR = roughCanvas.getContext("2d");

  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(404 + dosePct * 19);

  // Fondo de junta de arena de sello entre adoquines (3 mm)
  ctxA.fillStyle = "#2b3036";
  ctxA.fillRect(0, 0, W, H);
  ctxR.fillStyle = "#f2f2f2"; // junta muy mate
  ctxR.fillRect(0, 0, W, H);

  const cols = 8;  // 8 x 16 bloques por baldosa PBR
  const rows = 16;
  const bw = W / cols;
  const bh = H / rows;
  const gap = 4.0;
  const bevel = 5.0;

  // Dibujar adoquines individuales con variación mineral realista y bisel 3D en el mapa de alturas
  for (let r = 0; r < rows; r++) {
    const offX = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x0 = Math.floor(c * bw + offX);
      const y0 = Math.floor(r * bh);
      const x1 = Math.floor(x0 + bw);
      const y1 = Math.floor(y0 + bh);

      const baseTone = 128 + Math.floor(rand() * 24);
      const warmShift = Math.floor((rand() - 0.45) * 8);
      const cr = baseTone + warmShift;
      const cg = baseTone + Math.floor(warmShift * 0.5);
      const cb = baseTone - Math.floor(warmShift * 0.4);

      const grd = ctxA.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, `rgb(${cr + 8},${cg + 8},${cb + 8})`);
      grd.addColorStop(0.5, `rgb(${cr},${cg},${cb})`);
      grd.addColorStop(1, `rgb(${cr - 10},${cg - 10},${cb - 10})`);
      ctxA.fillStyle = grd;
      ctxA.fillRect(x0 + gap, y0 + gap, bw - gap * 2, bh - gap * 2);

      // Rugosidad base del concreto vibrocompactado (~0.84)
      ctxR.fillStyle = "rgb(214,214,214)";
      ctxR.fillRect(x0 + gap, y0 + gap, bw - gap * 2, bh - gap * 2);
    }
  }

  // Calcular campo de alturas exacto: junta hundida + bisel perimetral de 4 mm + micro-relieve de áridos
  for (let y = 0; y < H; y++) {
    const r = Math.floor(y / bh);
    const ly = y - r * bh;
    const offX = (r % 2) * (bw * 0.5);
    for (let x = 0; x < W; x++) {
      let lx = (x - offX) % bw;
      if (lx < 0) lx += bw;

      const distEdge = Math.min(lx, bw - lx, ly, bh - ly);
      let hVal = 0.0;
      if (distEdge < gap) {
        hVal = 0.05 + (rand() * 0.06); // arena de junta profunda
      } else if (distEdge < gap + bevel) {
        // Rampa de bisel de 4 mm
        const t = (distEdge - gap) / bevel;
        hVal = 0.15 + 0.78 * Math.sin(t * Math.PI * 0.5);
      } else {
        // Meseta del adoquín con micro-rugosidad de concreto y granos de arena
        hVal = 0.93 + (rand() - 0.5) * 0.09;
      }
      heightBuf[y * W + x] = hVal;
    }
  }

  // Textura fina de áridos de cantera (Vicho / Piñipampa) y poros de compactación
  for (let i = 0; i < 38000; i++) {
    const px = Math.floor(rand() * W);
    const py = Math.floor(rand() * H);
    if (heightBuf[py * W + px] < 0.4) continue;
    const v = rand() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(18,22,28,0.13)";
    ctxA.fillStyle = v;
    ctxA.fillRect(px, py, 2, 2);
  }

  // Incrustación física de escamas de PET reciclado triturado (con relieve positivo y baja rugosidad especular!)
  if (dosePct > 0) {
    const flakeTotal = Math.round(dosePct * 340);
    const petPalette = [
      ["rgba(186, 235, 255, 0.92)", "#282828"], // PET cristal celeste (muy brillante en roughnessMap)
      ["rgba(56, 189, 248, 0.85)", "#1f1f1f"],  // PET azul botella
      ["rgba(240, 249, 255, 0.94)", "#181818"], // PET transparente brillante
      ["rgba(52, 211, 153, 0.78)", "#242424"],  // PET verde esmeralda reciclado
    ];
    for (let i = 0; i < flakeTotal; i++) {
      const fx = Math.floor(rand() * W);
      const fy = Math.floor(rand() * H);
      if (heightBuf[fy * W + fx] < 0.75) continue; // no poner sobre juntas
      const fw = 2.2 + rand() * 4.5;
      const fh = 1.4 + rand() * 2.8;
      const ang = rand() * Math.PI;
      const [colA, colR] = petPalette[Math.floor(rand() * petPalette.length)];

      ctxA.save();
      ctxA.translate(fx, fy);
      ctxA.rotate(ang);
      ctxA.fillStyle = colA;
      ctxA.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctxA.restore();

      // En el mapa de rugosidad, la escama PET es lisa y refleja el sol como plástico real
      ctxR.save();
      ctxR.translate(fx, fy);
      ctxR.rotate(ang);
      ctxR.fillStyle = colR;
      ctxR.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctxR.restore();

      // Elevar ligeramente el relieve en el heightBuf para el normalMap
      const rPx = Math.ceil(Math.max(fw, fh) * 0.5);
      for (let dy = -rPx; dy <= rPx; dy++) {
        for (let dx = -rPx; dx <= rPx; dx++) {
          const nx = (fx + dx + W) % W;
          const ny = (fy + dy + H) % H;
          heightBuf[ny * W + nx] = Math.min(1.0, heightBuf[ny * W + nx] + 0.045);
        }
      }
    }
  }

  const albedoMap = new THREE.CanvasTexture(albCanvas);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  albedoMap.anisotropy = maxAniso;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAniso;

  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 5.2);

  return { albedoMap, normalMap, roughnessMap };
}

// Textura Macro Ultra-Detallada 2048x2048 para el Adoquín 3D en Laboratorio
function makeMacroHeroPBRSet(dosePct) {
  const W = 1024, H = 1024;
  const albCanvas = document.createElement("canvas");
  albCanvas.width = W;
  albCanvas.height = H;
  const ctxA = albCanvas.getContext("2d");

  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = W;
  roughCanvas.height = H;
  const ctxR = roughCanvas.getContext("2d");

  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(909 + dosePct * 31);

  // Base matriz cemento Portland + arena natural de Cusco
  ctxA.fillStyle = "#80868d";
  ctxA.fillRect(0, 0, W, H);
  ctxR.fillStyle = "#dadada";
  ctxR.fillRect(0, 0, W, H);

  for (let i = 0; i < W * H; i++) {
    heightBuf[i] = 0.55 + (rand() - 0.5) * 0.14;
  }

  // Granos minerales de arena y confitillo fino (cuarzo, feldespato, andesita oscura)
  const grainColors = [
    "rgba(105, 112, 120, 0.55)",
    "rgba(162, 168, 174, 0.48)",
    "rgba(64, 70, 78, 0.52)",
    "rgba(195, 190, 180, 0.42)",
    "rgba(88, 82, 76, 0.45)",
  ];
  for (let i = 0; i < 55000; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * H);
    const sz = 1.2 + rand() * 3.8;
    ctxA.fillStyle = grainColors[Math.floor(rand() * grainColors.length)];
    ctxA.fillRect(x, y, sz, sz);
    heightBuf[y * W + x] += (rand() - 0.48) * 0.16;
  }

  // Micro-poros reales de vibrocompactación
  for (let i = 0; i < 1400; i++) {
    const px = Math.floor(rand() * W);
    const py = Math.floor(rand() * H);
    const pr = 1.0 + rand() * 2.8;
    ctxA.beginPath();
    ctxA.arc(px, py, pr, 0, Math.PI * 2);
    ctxA.fillStyle = "rgba(22, 26, 32, 0.48)";
    ctxA.fill();

    ctxR.beginPath();
    ctxR.arc(px, py, pr, 0, Math.PI * 2);
    ctxR.fillStyle = "#ffffff";
    ctxR.fill();

    const rInt = Math.ceil(pr);
    for (let dy = -rInt; dy <= rInt; dy++) {
      for (let dx = -rInt; dx <= rInt; dx++) {
        if (dx * dx + dy * dy <= pr * pr) {
          const nx = (px + dx + W) % W;
          const ny = (py + dy + H) % H;
          heightBuf[ny * W + nx] = 0.12;
        }
      }
    }
  }

  // Escamas facetadas de PET reciclado triturado (1–4 mm) con brillo especular realista
  if (dosePct > 0) {
    const count = Math.round(dosePct * 290);
    const flakes = [
      { fill: "rgba(210, 242, 255, 0.92)", edge: "rgba(255,255,255,0.95)", rough: "#141414" },
      { fill: "rgba(56, 189, 248, 0.86)", edge: "rgba(186,230,253,0.9)", rough: "#1a1a1a" },
      { fill: "rgba(52, 211, 153, 0.80)", edge: "rgba(167,243,208,0.88)", rough: "#1c1c1c" },
      { fill: "rgba(248, 250, 252, 0.90)", edge: "rgba(203,213,225,0.9)", rough: "#121212" },
    ];
    for (let i = 0; i < count; i++) {
      const fx = Math.floor(rand() * W);
      const fy = Math.floor(rand() * H);
      const fw = 4.0 + rand() * 8.5;
      const fh = 2.4 + rand() * 5.2;
      const ang = rand() * Math.PI;
      const fl = flakes[Math.floor(rand() * flakes.length)];

      ctxA.save();
      ctxA.translate(fx, fy);
      ctxA.rotate(ang);
      ctxA.fillStyle = fl.fill;
      ctxA.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctxA.strokeStyle = fl.edge;
      ctxA.lineWidth = 0.9;
      ctxA.strokeRect(-fw / 2, -fh / 2, fw, fh);
      ctxA.restore();

      ctxR.save();
      ctxR.translate(fx, fy);
      ctxR.rotate(ang);
      ctxR.fillStyle = fl.rough;
      ctxR.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctxR.restore();

      const rad = Math.ceil(Math.max(fw, fh) * 0.45);
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const nx = (fx + dx + W) % W;
          const ny = (fy + dy + H) % H;
          heightBuf[ny * W + nx] = 0.72;
        }
      }
    }
  }

  const albedoMap = new THREE.CanvasTexture(albCanvas);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  albedoMap.anisotropy = maxAniso;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = maxAniso;

  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 4.2);

  return { albedoMap, normalMap, roughnessMap };
}

// Sillar de piedra inca/colonial cusqueña con mapa normal real
function makeIncaStonePBR() {
  const W = 512, H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(77);

  ctx.fillStyle = "#232220";
  ctx.fillRect(0, 0, W, H);

  const rows = 6;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r % 2) * 42);
    const y0 = Math.floor(r * rh);
    const y1 = Math.floor((r + 1) * rh);
    while (x < W) {
      const bw = Math.floor(72 + rand() * 68);
      const x0 = x;
      const x1 = x + bw;
      const tone = 74 + Math.floor(rand() * 34);
      const warm = Math.floor((rand() - 0.4) * 10);

      const grd = ctx.createRadialGradient(x0 + bw * 0.45, y0 + rh * 0.45, 6, x0 + bw * 0.5, y0 + rh * 0.5, bw * 0.75);
      grd.addColorStop(0, `rgb(${tone + 14 + warm}, ${tone + 11 + warm}, ${tone + 6})`);
      grd.addColorStop(1, `rgb(${tone - 12 + warm}, ${tone - 14 + warm}, ${tone - 16})`);
      ctx.fillStyle = grd;
      ctx.fillRect(x0 + 4, y0 + 4, bw - 8, rh - 8);

      for (let py = Math.max(0, y0); py < Math.min(H, y1); py++) {
        for (let px = Math.max(0, x0); px < Math.min(W, x1); px++) {
          const dEdge = Math.min(px - x0, x1 - px, py - y0, y1 - py);
          let hv = 0.08;
          if (dEdge >= 4) {
            const pillow = Math.min(1.0, (dEdge - 4) / 14);
            hv = 0.25 + 0.65 * Math.sin(pillow * Math.PI * 0.5) + (rand() - 0.5) * 0.08;
          }
          heightBuf[py * W + px] = hv;
        }
      }
      x += bw;
    }
  }

  // Grano de andesita cincelada y pátina de musgo sutil en hilada baja
  for (let i = 0; i < 18000; i++) {
    const px = Math.floor(rand() * W);
    const py = Math.floor(rand() * H);
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.09)";
    ctx.fillRect(px, py, 2, 2);
  }

  const albedoMap = new THREE.CanvasTexture(c);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  albedoMap.anisotropy = maxAniso;

  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 6.5);
  return { albedoMap, normalMap };
}

function makeStuccoPBR(baseHex = "#efe5d4") {
  const W = 512, H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(baseHex.charCodeAt(1) * 37);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 28000; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * H);
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(65,50,35,0.055)";
    ctx.fillRect(x, y, 3, 3);
    heightBuf[y * W + x] = 0.5 + (rand() - 0.5) * 0.22;
  }

  const albedoMap = new THREE.CanvasTexture(c);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 2.2);
  return { albedoMap, normalMap };
}

function makeRoofTilePBR() {
  const W = 512, H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(303);

  const cols = 14, rows = 8;
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cw, y0 = r * ch;
      const shade = Math.floor((rand() - 0.4) * 26);
      const grd = ctx.createLinearGradient(x0, y0, x0 + cw, y0);
      grd.addColorStop(0.0, `rgb(${115 + shade}, ${44 + Math.floor(shade * 0.3)}, 26)`);
      grd.addColorStop(0.48, `rgb(${178 + shade}, ${76 + Math.floor(shade * 0.4)}, 44)`);
      grd.addColorStop(1.0, `rgb(${102 + shade}, ${38 + Math.floor(shade * 0.3)}, 22)`);
      ctx.fillStyle = grd;
      ctx.fillRect(x0, y0, cw, ch);
      ctx.fillStyle = "rgba(18, 8, 4, 0.36)";
      ctx.fillRect(x0, y0 + ch - 4, cw, 4);
    }
  }

  for (let y = 0; y < H; y++) {
    const ly = (y % ch) / ch;
    for (let x = 0; x < W; x++) {
      const lx = (x % cw) / cw;
      heightBuf[y * W + x] = Math.sin(lx * Math.PI) * 0.85 + (1.0 - ly) * 0.15;
    }
  }

  const albedoMap = new THREE.CanvasTexture(c);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  albedoMap.anisotropy = maxAniso;
  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 5.5);
  return { albedoMap, normalMap };
}

function makeRoadPBR() {
  const W = 512, H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const heightBuf = new Float32Array(W * H);
  const rand = seededRandom(99);

  ctx.fillStyle = "#232730";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 32000; i++) {
    const px = Math.floor(rand() * W);
    const py = Math.floor(rand() * H);
    const v = 24 + Math.floor(rand() * 44);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.45)`;
    ctx.fillRect(px, py, 2, 2);
    heightBuf[py * W + px] = 0.3 + rand() * 0.45;
  }
  // Línea central amarilla reflectiva con desgaste realista
  ctx.fillStyle = "#eab308";
  ctx.fillRect(250, 28, 12, 185);
  ctx.fillRect(250, 295, 12, 185);
  // Cunetas laterales de piedra labrada
  ctx.fillStyle = "#475569";
  ctx.fillRect(0, 0, 24, H);
  ctx.fillRect(W - 24, 0, 24, H);

  const albedoMap = new THREE.CanvasTexture(c);
  albedoMap.wrapS = THREE.RepeatWrapping;
  albedoMap.wrapT = THREE.RepeatWrapping;
  albedoMap.encoding = THREE.sRGBEncoding;
  albedoMap.anisotropy = maxAniso;
  const normalMap = heightFieldToNormalCanvas(heightBuf, W, H, 3.8);
  return { albedoMap, normalMap };
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
// CONSTRUCCIÓN DE LA CALLE HIPERREALISTA DE CUSCO (100 METROS)
// =====================================================================
let streetHemiLight = null;
let streetSunLight = null;
let sidewalkMaterial = null;
let roadMaterial = null;
let heroPaverMaterial = null;
let specimenBricksMat = null;
let instancedSidewalkFlakes = null;
let scanWaveMesh = null;
let rainSystem = null;
const streetObstacles = [];
const interactiveMeshes = [];

function buildCuscoStreet() {
  buildIBL(0x1e5799, 0x9bc8eb);

  streetHemiLight = new THREE.HemisphereLight(0xdff2ff, 0x4b4237, 0.75);
  streetGroup.add(streetHemiLight);

  streetSunLight = new THREE.DirectionalLight(0xfff4dc, 3.2);
  streetSunLight.position.set(32, 52, 24);
  streetSunLight.castShadow = true;
  streetSunLight.shadow.mapSize.set(2048, 2048);
  streetSunLight.shadow.camera.near = 5;
  streetSunLight.shadow.camera.far = 145;
  streetSunLight.shadow.camera.left = -24;
  streetSunLight.shadow.camera.right = 24;
  streetSunLight.shadow.camera.top = 58;
  streetSunLight.shadow.camera.bottom = -58;
  streetSunLight.shadow.bias = -0.0004;
  streetGroup.add(streetSunLight);

  // Calzada central PBR (100 m x 7 m)
  const roadPBR = makeRoadPBR();
  roadPBR.albedoMap.repeat.set(1, 22);
  roadPBR.normalMap.repeat.set(1, 22);
  roadMaterial = new THREE.MeshStandardMaterial({
    map: roadPBR.albedoMap,
    normalMap: roadPBR.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.86,
    metalness: 0.06,
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 102), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  streetGroup.add(road);

  // Cruces peatonales con textura desgastada realista
  const zebraMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.78 });
  [-42, 0, 42].forEach((cz) => {
    for (let sx = -2.8; sx <= 2.8; sx += 0.8) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.5), zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(sx, 0.006, cz);
      stripe.receiveShadow = true;
      streetGroup.add(stripe);
    }
  });

  // Veredas peatonales PBR con Mapa Normal Tangencial + Mapa de Rugosidad Especular PET
  const swPBR = makeSidewalkPBRSet(state.dose);
  swPBR.albedoMap.repeat.set(2.125, 62.5); // Escala exacta 1:1 para adoquín 20x10 cm!
  swPBR.normalMap.repeat.set(2.125, 62.5);
  swPBR.roughnessMap.repeat.set(2.125, 62.5);

  sidewalkMaterial = new THREE.MeshStandardMaterial({
    map: swPBR.albedoMap,
    normalMap: swPBR.normalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughnessMap: swPBR.roughnessMap,
    roughness: 0.92,
    metalness: 0.10,
    envMapIntensity: 1.25,
  });

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x949ba3,
    normalMap: swPBR.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.82,
  });

  [-5.2, 5.2].forEach((cx, sideIdx) => {
    const swMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 100), sidewalkMaterial);
    swMesh.position.set(cx, 0.09, 0);
    swMesh.receiveShadow = true;
    streetGroup.add(swMesh);

    const curbX = sideIdx === 0 ? -3.55 : 3.55;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.19, 100), curbMat);
    curb.position.set(curbX, 0.095, 0);
    curb.receiveShadow = true;
    curb.castShadow = true;
    streetGroup.add(curb);

    const rampX = sideIdx === 0 ? -3.28 : 3.28;
    [-42, 0, 42].forEach((cz) => {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.17, 2.5), curbMat);
      ramp.position.set(rampX, 0.04, cz);
      ramp.rotation.z = sideIdx === 0 ? -0.34 : 0.34;
      ramp.receiveShadow = true;
      streetGroup.add(ramp);
    });
  });

  // Escamas 3D brillantes de PET incrustadas sobre ambas veredas (InstancedMesh en GPU)
  buildInstancedSidewalkPET();

  // Onda láser de actualización al cambiar dosificación de PET
  const waveGeo = new THREE.PlaneGeometry(14.2, 1.4);
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });
  scanWaveMesh = new THREE.Mesh(waveGeo, waveMat);
  scanWaveMesh.rotation.x = -Math.PI / 2;
  scanWaveMesh.position.set(0, 0.21, 50);
  scanWaveMesh.visible = false;
  streetGroup.add(scanWaveMesh);

  // Mesa de exhibición con adoquines 3D biselados reales en vereda izquierda
  buildSidewalkDisplayPlinth();

  // Casonas coloniales/republicanas de San Sebastián, Cusco (PBR)
  const stonePBR = makeIncaStonePBR();
  stonePBR.albedoMap.repeat.set(3, 1.3);
  stonePBR.normalMap.repeat.set(3, 1.3);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stonePBR.albedoMap,
    normalMap: stonePBR.normalMap,
    normalScale: new THREE.Vector2(1.45, 1.45),
    roughness: 0.88,
  });

  const roofPBR = makeRoofTilePBR();
  roofPBR.albedoMap.repeat.set(4, 2);
  roofPBR.normalMap.repeat.set(4, 2);
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofPBR.albedoMap,
    normalMap: roofPBR.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.78,
  });

  const stuccoPalettes = ["#f2eadc", "#ebe0cc", "#e5d3b8", "#f6f2ea", "#e2cab0"];
  const stuccoMats = stuccoPalettes.map((hex) => {
    const st = makeStuccoPBR(hex);
    st.albedoMap.repeat.set(2, 2);
    st.normalMap.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      map: st.albedoMap,
      normalMap: st.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.90,
    });
  });

  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.72 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.08, metalness: 0.92, envMapIntensity: 1.8 });
  const balconyColors = [0x1d4ed8, 0x0f766e, 0x15803d, 0x5c341d];

  const buildingRand = seededRandom(2026);
  for (let side of [-1, 1]) {
    let curZ = -50;
    let idx = 0;
    while (curZ < 48) {
      const len = 9.8 + buildingRand() * 3.2;
      if (curZ + len > 50) break;
      const cz = curZ + len / 2;
      const wallH = 6.4 + (idx % 3) * 1.35;
      const depth = 5.4;
      const cx = side * (6.9 + depth / 2);

      // Zócalo de sillar inca/cusqueño con relieve normal-mapped
      const base = new THREE.Mesh(new THREE.BoxGeometry(depth, 2.35, len - 0.06), stoneMat);
      base.position.set(cx, 1.175, cz);
      base.castShadow = true;
      base.receiveShadow = true;
      streetGroup.add(base);

      // Cornisa de piedra entre primer y segundo piso
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.16, 0.14, len), stoneMat);
      ledge.position.set(cx, 2.38, cz);
      streetGroup.add(ledge);

      // Muro superior de adobe estucado con textura de cal
      const upperMat = stuccoMats[(idx + (side > 0 ? 2 : 0)) % stuccoMats.length];
      const upper = new THREE.Mesh(new THREE.BoxGeometry(depth - 0.06, wallH - 2.35, len - 0.06), upperMat);
      upper.position.set(cx, 2.35 + (wallH - 2.35) / 2, cz);
      upper.castShadow = true;
      upper.receiveShadow = true;
      streetGroup.add(upper);

      // Techo inclinado de teja colonial con vigas (canecillos) de madera
      const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 1.15, 0.26, len + 0.14), roofMat);
      roof.position.set(cx - side * 0.30, wallH + 0.36, cz);
      roof.rotation.z = side * 0.27;
      roof.castShadow = true;
      streetGroup.add(roof);

      // Portada de madera tallada con marco lítico en primer nivel
      const faceX = side * 6.88;
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.22, 1.52), stoneMat);
      doorFrame.position.set(faceX, 1.15, cz - len * 0.22);
      streetGroup.add(doorFrame);

      const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.04, 1.24), woodDarkMat);
      door.position.set(faceX, 1.10, cz - len * 0.22);
      streetGroup.add(door);

      // Balcón colonial detallado con balaustres 3D y ventanas con vidrio reflectivo
      const bCol = balconyColors[idx % balconyColors.length];
      const balMat = new THREE.MeshStandardMaterial({ color: bCol, roughness: 0.62 });
      const balX = side * (6.9 - 0.45);
      const balZ = cz + len * 0.15;

      const balFloor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.14, 3.3), woodDarkMat);
      balFloor.position.set(balX, 3.35, balZ);
      balFloor.castShadow = true;
      streetGroup.add(balFloor);

      // Ménsulas (canecillos) sosteniendo el balcón
      for (let mz = -1.3; mz <= 1.3; mz += 0.65) {
        const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.18, 0.12), woodDarkMat);
        corbel.position.set(balX, 3.20, balZ + mz);
        streetGroup.add(corbel);
      }

      const balRail = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.96, 3.3), balMat);
      balRail.position.set(side * (6.9 - 0.84), 3.86, balZ);
      balRail.castShadow = true;
      streetGroup.add(balRail);

      // Ventana de vidrio reflectivo detrás del balcón
      const winGlass = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.65, 2.2), glassMat);
      winGlass.position.set(faceX, 4.25, balZ);
      streetGroup.add(winGlass);

      const balRoof = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 3.5), roofMat);
      balRoof.position.set(balX, 5.25, balZ);
      balRoof.rotation.z = side * 0.22;
      streetGroup.add(balRoof);

      // Segunda ventana colonial con marco y vidrio
      const win2Z = cz - len * 0.22;
      const win2Frame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.48, 1.16), woodDarkMat);
      win2Frame.position.set(faceX, 4.2, win2Z);
      streetGroup.add(win2Frame);
      const win2Glass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.28, 0.96), glassMat);
      win2Glass.position.set(faceX, 4.2, win2Z);
      streetGroup.add(win2Glass);

      curZ += len;
      idx++;
    }
  }

  // Portales coloniales cerrando ambos extremos de los 100 m
  [-50.8, 50.8].forEach((ez) => {
    const endWall = new THREE.Mesh(new THREE.BoxGeometry(19.5, 8.2, 1.4), stuccoMats[0]);
    endWall.position.set(0, 4.1, ez);
    endWall.receiveShadow = true;
    streetGroup.add(endWall);

    const endBase = new THREE.Mesh(new THREE.BoxGeometry(19.5, 2.4, 1.52), stoneMat);
    endBase.position.set(0, 1.2, ez);
    streetGroup.add(endBase);

    const endRoof = new THREE.Mesh(new THREE.BoxGeometry(20.0, 0.35, 2.2), roofMat);
    endRoof.position.set(0, 8.35, ez);
    streetGroup.add(endRoof);

    const archSign = createTextBillboard([
      { text: "FIN DEL TRAMO 100 m", size: 32, color: "#facc15" },
      { text: "Veredas PET • San Sebastián, Cusco", size: 22, color: "#f8fafc" },
    ]);
    archSign.scale.set(4.5, 1.55, 1);
    archSign.position.set(0, 4.5, ez + (ez < 0 ? 1.1 : -1.1));
    streetGroup.add(archSign);
  });

  // Faroles de hierro forjado, árboles frondosos y puntos ecológicos PET
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.32, metalness: 0.88 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0xf59e0b, emissiveIntensity: 1.4 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.92 });
  const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.82 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3b6e33, roughness: 0.80 });
  const binMat = new THREE.MeshStandardMaterial({ color: 0x0369a1, roughness: 0.35, metalness: 0.25 });

  for (let lz = -38; lz <= 38; lz += 19) {
    for (let side of [-1, 1]) {
      const lx = side * 3.85;
      const basePed = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 12), ironMat);
      basePed.position.set(lx, 0.18 + 0.275, lz);
      streetGroup.add(basePed);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 3.6, 12), ironMat);
      pole.position.set(lx, 0.18 + 1.9, lz);
      pole.castShadow = true;
      streetGroup.add(pole);

      const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), glowMat);
      lantern.position.set(lx, 0.18 + 3.85, lz);
      streetGroup.add(lantern);
      streetObstacles.push({ x: lx, z: lz, r: 0.35 });
    }
  }

  [-28, -9, 12, 28].forEach((tz, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const tx = side * 5.95;
    // Alcorque de piedra en la vereda
    const planter = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 1.1), stoneMat);
    planter.position.set(tx, 0.18 + 0.08, tz);
    streetGroup.add(planter);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 2.3, 10), trunkMat);
    trunk.position.set(tx, 0.18 + 1.15, tz);
    trunk.castShadow = true;
    streetGroup.add(trunk);

    // Copa multicapa orgánica
    [
      [0, 2.75, 0, 1.25, leafMat1],
      [0.45, 2.45, 0.35, 0.92, leafMat2],
      [-0.42, 2.52, -0.30, 0.96, leafMat2],
      [0.15, 3.25, -0.20, 0.88, leafMat1],
    ].forEach(([ox, oy, oz, rad, mat]) => {
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 2), mat);
      lobe.position.set(tx + ox, 0.18 + oy, tz + oz);
      lobe.castShadow = true;
      lobe.receiveShadow = true;
      streetGroup.add(lobe);
    });
    streetObstacles.push({ x: tx, z: tz, r: 0.62 });

    // Estación de acopio PET reciclado
    const bx = -side * 6.05;
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.92, 16), binMat);
    bin.position.set(bx, 0.18 + 0.46, tz + 3);
    bin.castShadow = true;
    streetGroup.add(bin);
    streetObstacles.push({ x: bx, z: tz + 3, r: 0.45 });
  });

  // Cordón montañoso andino realista con variación de relieve
  const hillMat1 = new THREE.MeshStandardMaterial({ color: 0x4a5d3f, roughness: 0.96 });
  const hillMat2 = new THREE.MeshStandardMaterial({ color: 0x3b4d5e, roughness: 0.96 });
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    const dist = 128 + (a % 3) * 34;
    const h = 36 + (a % 5) * 15;
    const w = 42 + (a % 4) * 14;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(w, h, 9), a % 2 === 0 ? hillMat1 : hillMat2);
    cone.position.set(Math.cos(ang) * dist, h * 0.4 - 4, Math.sin(ang) * dist);
    cone.rotation.y = a * 0.7;
    streetGroup.add(cone);
  }

  // Sistema de lluvia andina (visible al activar clima Lluvia)
  const rainCount = 1200;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 26;
    rainPos[i * 3 + 1] = Math.random() * 18;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 96;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  rainSystem = new THREE.Points(
    rainGeo,
    new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.08, transparent: true, opacity: 0.65 })
  );
  rainSystem.visible = false;
  streetGroup.add(rainSystem);
}

// Instancias 3D físicas de escamas de PET incrustadas en la superficie de las veredas
function buildInstancedSidewalkPET() {
  const maxFlakes = 2800;
  const flakeGeo = new THREE.BoxGeometry(0.018, 0.003, 0.014);
  const flakeMat = new THREE.MeshStandardMaterial({
    color: 0xbbe6ff,
    emissive: 0x0284c7,
    emissiveIntensity: 0.22,
    roughness: 0.12,
    metalness: 0.35,
  });
  instancedSidewalkFlakes = new THREE.InstancedMesh(flakeGeo, flakeMat, maxFlakes);
  instancedSidewalkFlakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const rand = seededRandom(1234);
  for (let i = 0; i < maxFlakes; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (3.65 + rand() * 3.05);
    const z = (rand() - 0.5) * 94;
    dummy.position.set(x, 0.1815, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const sc = 0.7 + rand() * 0.9;
    dummy.scale.set(sc, 1, sc);
    dummy.updateMatrix();
    instancedSidewalkFlakes.setMatrixAt(i, dummy.matrix);
  }
  instancedSidewalkFlakes.count = Math.round(maxFlakes * DOSE_DATA[state.dose].sidewalkFlakeRatio);
  streetGroup.add(instancedSidewalkFlakes);
}

// Crea la geometría biselada realista de un adoquín NTP 399.611
function createBeveledPaverGeometry(len = 2.0, height = 0.6, width = 1.0, bevel = 0.045) {
  const shape = new THREE.Shape();
  const hw = ( len - bevel * 2 ) / 2;
  const hd = ( width - bevel * 2 ) / 2;
  shape.moveTo(-hw, -hd);
  shape.lineTo(hw, -hd);
  shape.lineTo(hw, hd);
  shape.lineTo(-hw, hd);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height - bevel * 2,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geo.rotateX(Math.PI / 2);
  geo.center();
  return geo;
}

function buildSidewalkDisplayPlinth() {
  const grp = new THREE.Group();
  grp.position.set(-5.65, 0.18, 28.5);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.45 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.66, 1.15), standMat);
  plinth.position.y = 0.33;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  grp.add(plinth);

  const macroSet = makeMacroHeroPBRSet(state.dose);
  specimenBricksMat = new THREE.MeshStandardMaterial({
    map: macroSet.albedoMap,
    normalMap: macroSet.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughnessMap: macroSet.roughnessMap,
    roughness: 0.88,
    metalness: 0.12,
  });

  const realBrickGeo = createBeveledPaverGeometry(0.20, 0.06, 0.10, 0.004);
  const positions = [
    [-0.12, 0.69, -0.06, 0],
    [0.12, 0.69, -0.06, 0],
    [-0.06, 0.69, 0.09, Math.PI / 2],
    [0.08, 0.75, 0.04, 0.38],
  ];
  positions.forEach(([bx, by, bz, ry]) => {
    const brick = new THREE.Mesh(realBrickGeo, specimenBricksMat);
    brick.position.set(bx, by, bz);
    brick.rotation.y = ry;
    brick.castShadow = true;
    brick.receiveShadow = true;
    grp.add(brick);
    interactiveMeshes.push(brick);
  });

  const sign = createTextBillboard([
    { text: "MUESTRA PBR 20×10×6 cm", size: 28, color: "#38bdf8" },
    { text: "Toca aquí o usa 'Adoquín PET 3D'", size: 22, color: "#facc15" },
  ]);
  sign.scale.set(1.75, 0.62, 1);
  sign.position.set(0, 1.24, 0);
  grp.add(sign);

  streetGroup.add(grp);
  streetObstacles.push({ x: -5.65, z: 28.5, r: 0.85 });
}

// =====================================================================
// CONSTRUCCIÓN DEL MODO 2: ADOQUÍN PET 3D HIPERREALISTA (GIRO LENTO)
// =====================================================================
const heroGroup = new THREE.Group();
const paverCoreGroup = new THREE.Group();
let heroMesh = null;
let heroFlakesGroup = new THREE.Group();
let surfaceReliefFlakes = new THREE.Group();
let dimsGroup = new THREE.Group();

function buildHeroPaverStudio() {
  studioGroup.add(new THREE.HemisphereLight(0xdbeafe, 0x090d16, 0.85));

  const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.6);
  keyLight.position.set(4.5, 6.5, 5.0);
  keyLight.castShadow = true;
  studioGroup.add(keyLight);

  const rimCyan = new THREE.PointLight(0x38bdf8, 3.2, 16);
  rimCyan.position.set(-4.2, 2.2, -3.5);
  studioGroup.add(rimCyan);

  const rimWarm = new THREE.PointLight(0xf59e0b, 2.1, 16);
  rimWarm.position.set(4.2, -2.0, 3.2);
  studioGroup.add(rimWarm);

  // Plataforma circular de laboratorio debajo del bloque
  const ringGeo = new THREE.RingGeometry(1.38, 1.54, 64);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.42 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.18;
  studioGroup.add(ring);

  const grid = new THREE.GridHelper(6, 12, 0x38bdf8, 0x1e293b);
  grid.position.y = -1.19;
  studioGroup.add(grid);

  const macroPBR = makeMacroHeroPBRSet(state.dose);
  heroPaverMaterial = new THREE.MeshStandardMaterial({
    map: macroPBR.albedoMap,
    normalMap: macroPBR.normalMap,
    normalScale: new THREE.Vector2(1.55, 1.55),
    roughnessMap: macroPBR.roughnessMap,
    roughness: 0.88,
    metalness: 0.14,
    envMapIntensity: 1.45,
    transparent: false,
    opacity: 1.0,
  });

  // Geometría biselada realista 20.0 x 6.0 x 10.0 cm (escala 1 unidad = 10 cm)
  const bevGeo = createBeveledPaverGeometry(2.0, 0.6, 1.0, 0.042);
  heroMesh = new THREE.Mesh(bevGeo, heroPaverMaterial);
  heroMesh.castShadow = true;
  heroMesh.receiveShadow = true;
  paverCoreGroup.add(heroMesh);

  // Nervios espaciadores laterales reglamentarios NTP 399.611 (en ambas caras largas y cabeceras)
  const nibGeo = new THREE.BoxGeometry(0.09, 0.50, 0.025);
  [-0.55, 0.55].forEach((nx) => {
    const nibFront = new THREE.Mesh(nibGeo, heroPaverMaterial);
    nibFront.position.set(nx, -0.02, 0.502);
    paverCoreGroup.add(nibFront);

    const nibBack = new THREE.Mesh(nibGeo, heroPaverMaterial);
    nibBack.position.set(nx, -0.02, -0.502);
    paverCoreGroup.add(nibBack);
  });

  paverCoreGroup.add(surfaceReliefFlakes);
  paverCoreGroup.add(heroFlakesGroup);
  rebuildInternalPetFlakes(state.dose);

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
  while (surfaceReliefFlakes.children.length > 0) {
    const ch = surfaceReliefFlakes.children[0];
    surfaceReliefFlakes.remove(ch);
    ch.geometry.dispose();
  }

  const n = DOSE_DATA[dosePct].flakeCount;
  if (n <= 0) return;

  const rand = seededRandom(888 + dosePct);
  const flakeMatA = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x0284c7,
    emissiveIntensity: 0.32,
    roughness: 0.12,
    metalness: 0.35,
  });
  const flakeMatB = new THREE.MeshStandardMaterial({
    color: 0xf0f9ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.20,
    roughness: 0.10,
    metalness: 0.25,
  });
  const flakeMatC = new THREE.MeshStandardMaterial({
    color: 0x6ee7b7,
    emissive: 0x059669,
    emissiveIntensity: 0.24,
    roughness: 0.14,
    metalness: 0.30,
  });
  const mats = [flakeMatA, flakeMatB, flakeMatC];

  // Escamas 3D internas (visibles al activar Corte Interno PET)
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(0.045 + rand() * 0.055, 0.012, 0.028 + rand() * 0.038);
    const m = new THREE.Mesh(g, mats[i % mats.length]);
    m.position.set((rand() - 0.5) * 1.84, (rand() - 0.5) * 0.48, (rand() - 0.5) * 0.86);
    m.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    heroFlakesGroup.add(m);
  }

  // Micro-escamas 3D aflorando en las caras exteriores del bloque para brillo especular real al girar
  const surfCount = Math.round(n * 0.65);
  for (let i = 0; i < surfCount; i++) {
    const g = new THREE.BoxGeometry(0.032 + rand() * 0.035, 0.004, 0.022 + rand() * 0.028);
    const m = new THREE.Mesh(g, mats[i % mats.length]);
    const face = i % 3;
    if (face === 0) {
      // Cara superior
      m.position.set((rand() - 0.5) * 1.82, 0.301, (rand() - 0.5) * 0.84);
      m.rotation.y = rand() * Math.PI;
    } else if (face === 1) {
      // Cara frontal
      m.position.set((rand() - 0.5) * 1.82, (rand() - 0.5) * 0.46, 0.501);
      m.rotation.x = Math.PI / 2;
      m.rotation.z = rand() * Math.PI;
    } else {
      // Cara lateral
      m.position.set(1.001, (rand() - 0.5) * 0.46, (rand() - 0.5) * 0.84);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = rand() * Math.PI;
    }
    surfaceReliefFlakes.add(m);
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
      { text: subText, size: 24, color: "#f8fafc" },
    ], "rgba(7,14,28,0.92)", col);
    sp.scale.set(0.96, 0.33, 1);
    sp.position.set(...posLabel);
    dimsGroup.add(sp);
  };

  addDim([-1.0, -0.48, 0.68], [1.0, -0.48, 0.68], "20.0 cm", "Largo nominal (200 mm)", [0, -0.68, 0.68], "#facc15");
  addDim([1.22, -0.48, -0.5], [1.22, -0.48, 0.5], "10.0 cm", "Ancho (100 mm)", [1.52, -0.48, 0], "#38bdf8");
  addDim([-1.22, -0.30, 0.5], [-1.22, 0.34, 0.5], "6.0 cm", "Espesor Tipo I (60 mm)", [-1.58, 0.04, 0.5], "#34d399");
}

// =====================================================================
// ACTUALIZACIÓN DE DOSIFICACIÓN PET EN VIVO + ONDA DE ESCANEO EN VEREDA
// =====================================================================
function setDosage(dose) {
  state.dose = Number(dose);
  const d = DOSE_DATA[state.dose];

  doseBtns.forEach((b) => b.classList.toggle("is-selected", Number(b.dataset.dose) === state.dose));
  specFc.innerHTML = `${d.fc} <small>${d.fcSub}</small>`;
  specAbs.innerHTML = `${d.abs} <small>${d.absSub}</small>`;
  specDensity.innerHTML = `${d.density} <small>${d.densitySub}</small>`;
  specStatus.textContent = d.status;
  specStatus.className = d.statusClass;

  // Regenerar mapas PBR de toda la vereda de 100 m
  if (sidewalkMaterial) {
    const swSet = makeSidewalkPBRSet(state.dose);
    swSet.albedoMap.repeat.set(2.125, 62.5);
    swSet.normalMap.repeat.set(2.125, 62.5);
    swSet.roughnessMap.repeat.set(2.125, 62.5);

    if (sidewalkMaterial.map) sidewalkMaterial.map.dispose();
    if (sidewalkMaterial.normalMap) sidewalkMaterial.normalMap.dispose();
    if (sidewalkMaterial.roughnessMap) sidewalkMaterial.roughnessMap.dispose();

    sidewalkMaterial.map = swSet.albedoMap;
    sidewalkMaterial.normalMap = swSet.normalMap;
    sidewalkMaterial.roughnessMap = swSet.roughnessMap;
    sidewalkMaterial.needsUpdate = true;
  }

  if (instancedSidewalkFlakes) {
    instancedSidewalkFlakes.count = Math.round(2800 * d.sidewalkFlakeRatio);
  }

  // Activar barrido visual en la vereda de 100 m
  if (scanWaveMesh && state.mode === "street") {
    state.scanWave.active = true;
    state.scanWave.z = state.player.z + 6;
    scanWaveMesh.visible = true;
  }

  // Regenerar mapas PBR macro del adoquín 3D
  const macroSet = makeMacroHeroPBRSet(state.dose);
  if (heroPaverMaterial) {
    if (heroPaverMaterial.map) heroPaverMaterial.map.dispose();
    if (heroPaverMaterial.normalMap) heroPaverMaterial.normalMap.dispose();
    if (heroPaverMaterial.roughnessMap) heroPaverMaterial.roughnessMap.dispose();

    heroPaverMaterial.map = macroSet.albedoMap;
    heroPaverMaterial.normalMap = macroSet.normalMap;
    heroPaverMaterial.roughnessMap = macroSet.roughnessMap;
    heroPaverMaterial.needsUpdate = true;
  }
  if (specimenBricksMat) {
    specimenBricksMat.map = macroSet.albedoMap;
    specimenBricksMat.normalMap = macroSet.normalMap;
    specimenBricksMat.roughnessMap = macroSet.roughnessMap;
    specimenBricksMat.needsUpdate = true;
  }

  rebuildInternalPetFlakes(state.dose);
  showToast(`Suelo y matriz actualizados a ${d.label} (${d.fc.split(" ")[0]} MPa)`);
}

doseBtns.forEach((btn) => btn.addEventListener("click", () => setDosage(btn.dataset.dose)));

// =====================================================================
// CLIMA DINÁMICO (SOL / LLUVIA HÚMEDA / ATARDECER) Y CALIDAD GPU
// =====================================================================
function cycleWeather() {
  state.weatherIdx = (state.weatherIdx + 1) % WEATHER_PRESETS.length;
  const w = WEATHER_PRESETS[state.weatherIdx];
  btnWeather.textContent = w.label;

  buildIBL(w.skyTop, w.skyBot);
  if (state.mode === "street") {
    scene.background = new THREE.Color(w.skyBot);
    scene.fog = new THREE.FogExp2(w.fogCol, 0.0045);
  }
  if (streetSunLight) streetSunLight.intensity = w.sunInt * 2.1;
  if (streetHemiLight) streetHemiLight.intensity = w.hemiInt;
  if (rainSystem) rainSystem.visible = w.id === "rain";

  // Efecto físico de pavimento húmedo (menor rugosidad y mayor reflectancia especular)
  if (sidewalkMaterial) {
    sidewalkMaterial.roughness = w.wet > 0.5 ? 0.36 : 0.92;
    sidewalkMaterial.envMapIntensity = w.wet > 0.5 ? 2.2 : 1.25;
  }
  if (roadMaterial) {
    roadMaterial.roughness = w.wet > 0.5 ? 0.25 : 0.86;
  }
  showToast(`Clima activo: ${w.label}${w.wet > 0.5 ? " (Vereda húmeda baja absorción ≤6%)" : ""}`);
}

btnWeather.addEventListener("click", cycleWeather);

btnQuality.addEventListener("click", () => {
  state.ultraQuality = !state.ultraQuality;
  btnQuality.classList.toggle("is-ultra", state.ultraQuality);
  btnQuality.textContent = state.ultraQuality ? "⚡ GPU Ultra" : "⚡ GPU Estándar";
  applyGPUQuality();
  showToast(state.ultraQuality ? "Super-muestreo GPU Ultra (SSAA 2x + PBR Nitidez) activado" : "Modo GPU Estándar activado");
});

// =====================================================================
// CAMBIO DE MODO: CALLE CUSCO <-> ADOQUÍN PET 3D
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
    const w = WEATHER_PRESETS[state.weatherIdx];
    scene.background = new THREE.Color(w.skyBot);
    scene.fog = new THREE.FogExp2(w.fogCol, 0.0045);
    streetActions.classList.remove("is-hidden");
    paverActions.classList.add("is-hidden");
    btnCrouchMobile.style.display = "inline-flex";
    joyLeftLabel.textContent = "CAMINAR";
    joyRightLabel.textContent = "VISTA 360°";
    updateStreetZoom(state.crouched ? 85 : 22);
    showToast("Modo Calle Cusco (100 m): camina sobre las veredas con PET");
  } else {
    scene.background = new THREE.Color(0x070d19);
    scene.fog = null;
    streetActions.classList.add("is-hidden");
    paverActions.classList.remove("is-hidden");
    btnCrouchMobile.style.display = "none";
    joyLeftLabel.textContent = "ACERCAR / ZOOM";
    joyRightLabel.textContent = "ROTAR BLOQUE";
    state.zoomPct = window.innerWidth <= 820 ? 18 : 44;
    zoomSlider.value = String(state.zoomPct);
    state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.15;
    camera.fov = 48;
    camera.updateProjectionMatrix();
    telSurface.textContent = `Adoquín PBR • ${DOSE_DATA[state.dose].label}`;
    showToast("Modo Adoquín PET 3D: rotación lenta de alta precisión");
  }
}

btnModeStreet.addEventListener("click", () => switchMode("street"));
btnModePaver.addEventListener("click", () => switchMode("paver"));

// =====================================================================
// CONTROLES DE INSPECCIÓN MACRO Y ZOOM
// =====================================================================
function updateStreetZoom(pct) {
  state.zoomPct = Math.max(0, Math.min(100, pct));
  zoomSlider.value = String(Math.round(state.zoomPct));
  state.crouched = state.zoomPct > 55;
  btnCrouchMobile.classList.toggle("is-crouched", state.crouched);
  btnInspectGround.classList.toggle("is-on", state.crouched);
  camera.fov = 65 - (state.zoomPct / 100) * 41; // 65° -> 24° macro óptico
  camera.updateProjectionMatrix();
}

zoomSlider.addEventListener("input", () => {
  const val = Number(zoomSlider.value);
  if (state.mode === "street") {
    updateStreetZoom(val);
  } else {
    state.zoomPct = val;
    state.orbit.dist = 6.2 - (val / 100) * 4.25;
  }
});

function toggleGroundInspect() {
  if (state.mode !== "street") return;
  if (!state.crouched) {
    updateStreetZoom(90);
    state.player.pitch = -0.92;
    showToast("Vista Macro: observa el relieve y escamas PET del adoquín");
  } else {
    updateStreetZoom(20);
    state.player.pitch = -0.15;
    showToast("Vista peatonal normal (altura 1.68 m)");
  }
}

btnInspectGround.addEventListener("click", toggleGroundInspect);
btnCrouchMobile.addEventListener("click", toggleGroundInspect);

btnCrossStreet.addEventListener("click", () => {
  if (state.mode !== "street") switchMode("street");
  const targetX = state.player.x < 0 ? 4.85 : -4.85;
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
  btnToggleSpin.textContent = state.paverSpin ? "⏸ Giro Lento" : "▶ Reanudar Giro";
});

btnToggleXray.addEventListener("click", () => {
  state.paverXray = !state.paverXray;
  btnToggleXray.classList.toggle("is-on", state.paverXray);
  heroPaverMaterial.transparent = state.paverXray;
  heroPaverMaterial.opacity = state.paverXray ? 0.34 : 1.0;
  heroPaverMaterial.depthWrite = !state.paverXray;
  heroPaverMaterial.needsUpdate = true;
  showToast(state.paverXray ? "Corte interno: distribución tridimensional de PET" : "Superficie PBR sólida del adoquín");
});

btnToggleDims.addEventListener("click", () => {
  state.paverDims = !state.paverDims;
  btnToggleDims.classList.toggle("is-on", state.paverDims);
  dimsGroup.visible = state.paverDims;
});

// =====================================================================
// JOYSTICKS MULTITÁCTILES SIMULTÁNEOS
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
// GESTOS EN LIENZO (MOUSE / TOUCH / RUEDA)
// =====================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const activeTouches = new Map();

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
      state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.25;
    }
    return;
  }

  if (!state.mouseDrag.active || e.pointerId !== state.mouseDrag.pointerId) return;
  const dx = e.clientX - state.mouseDrag.lastX;
  const dy = e.clientY - state.mouseDrag.lastY;
  state.mouseDrag.lastX = e.clientX;
  state.mouseDrag.lastY = e.clientY;

  if (state.mode === "street") {
    state.player.yaw -= dx * 0.0040;
    state.player.pitch = Math.max(-1.44, Math.min(0.95, state.player.pitch - dy * 0.0040));
  } else {
    state.orbit.yaw -= dx * 0.0065;
    state.orbit.pitch = Math.max(-1.35, Math.min(1.35, state.orbit.pitch + dy * 0.0065));
  }
});

function endCanvasPointer(e) {
  activeTouches.delete(e.pointerId);
  if (activeTouches.size < 2) state.pinch.active = false;
  if (e.pointerId === state.mouseDrag.pointerId) {
    const moved = Math.hypot(e.clientX - state.mouseDrag.downX, e.clientY - state.mouseDrag.downY);
    state.mouseDrag.active = false;
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
    state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.25;
  }
}, { passive: false });

window.addEventListener("keydown", (e) => state.keys.add(e.code));
window.addEventListener("keyup", (e) => state.keys.delete(e.code));
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyGPUQuality();
});

// =====================================================================
// BUCLE PRINCIPAL DE SIMULACIÓN (60 FPS)
// =====================================================================
function getSurfaceHeight(x) {
  return Math.abs(x) >= 3.45 ? 0.18 : 0.0;
}

const clock = new THREE.Clock();
let frameCounter = 0;
let fpsAccum = 0;
let currentFps = 60;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  frameCounter++;
  fpsAccum += dt;
  if (fpsAccum >= 0.5) {
    currentFps = Math.min(60, Math.round(frameCounter / fpsAccum));
    frameCounter = 0;
    fpsAccum = 0;
  }

  // Animación de onda de actualización del suelo al cambiar porcentaje de PET
  if (state.scanWave.active && scanWaveMesh) {
    state.scanWave.z -= 48 * dt;
    scanWaveMesh.position.z = state.scanWave.z;
    if (state.scanWave.z < -50) {
      state.scanWave.active = false;
      scanWaveMesh.visible = false;
    }
  }

  // Animación de lluvia si está activa
  if (rainSystem && rainSystem.visible) {
    const pos = rainSystem.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] -= 19 * dt;
      if (pos[i] < 0) pos[i] = 18;
    }
    rainSystem.geometry.attributes.position.needsUpdate = true;
  }

  if (state.mode === "street") {
    if (Math.abs(state.joyRight.x) > 0.05 || Math.abs(state.joyRight.y) > 0.05) {
      state.player.yaw -= state.joyRight.x * 2.1 * dt;
      state.player.pitch = Math.max(-1.44, Math.min(0.95, state.player.pitch - state.joyRight.y * 1.6 * dt));
    }

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
      const speed = (state.crouched ? 1.65 : 4.25) * dt;
      const sinY = Math.sin(state.player.yaw);
      const cosY = Math.cos(state.player.yaw);

      let nx = state.player.x + (-sinY * normF + cosY * normS) * speed;
      let nz = state.player.z + (-cosY * normF - sinY * normS) * speed;

      nx = Math.max(-6.45, Math.min(6.45, nx));
      nz = Math.max(-47.8, Math.min(47.8, nz));

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
      state.player.walkBob += dt * (state.crouched ? 4.5 : 9.2);
    } else {
      state.player.walkBob = 0;
    }

    const targetGround = getSurfaceHeight(state.player.x);
    state.player.groundY += (targetGround - state.player.groundY) * Math.min(1, dt * 12);
    const eyeH = 1.68 - (state.zoomPct / 100) * 1.38; // Baja hasta 0.30 m del suelo!
    const bobOffset = !prefersReducedMotion.matches && mag > 0.08 ? Math.sin(state.player.walkBob) * 0.028 : 0;
    const targetY = state.player.groundY + eyeH + bobOffset;
    state.player.y += (targetY - state.player.y) * Math.min(1, dt * 10);

    camera.position.set(state.player.x, state.player.y, state.player.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = state.player.yaw;
    camera.rotation.x = state.player.pitch;

    const metersProgress = Math.max(0, Math.min(100, (50 - state.player.z) * (100 / 95.6)));
    telPos.innerHTML = `Tramo: ${metersProgress.toFixed(1)} m / 100 m • <strong>${currentFps} FPS</strong>`;
    if (state.player.x <= -3.45) {
      telSurface.textContent = `Vereda Izq. • ${state.dose}% PET (+18 cm)`;
    } else if (state.player.x >= 3.45) {
      telSurface.textContent = `Vereda Der. • ${state.dose}% PET (+18 cm)`;
    } else {
      telSurface.textContent = "Calzada Vehicular (0 cm) — Sube a la vereda";
    }
  } else {
    // MODO 2: BLOQUE ÚNICO PET LEVITANDO — ROTACIÓN LENTA Y SERENA (0.11 rad/s)
    if (Math.abs(state.joyRight.x) > 0.04 || Math.abs(state.joyRight.y) > 0.04) {
      state.orbit.yaw -= state.joyRight.x * 1.85 * dt;
      state.orbit.pitch = Math.max(-1.35, Math.min(1.35, state.orbit.pitch + state.joyRight.y * 1.45 * dt));
    }
    if (Math.abs(state.joyLeft.y) > 0.05) {
      state.zoomPct = Math.max(0, Math.min(100, state.zoomPct - state.joyLeft.y * 48 * dt));
      zoomSlider.value = String(Math.round(state.zoomPct));
      state.orbit.dist = 6.2 - (state.zoomPct / 100) * 4.25;
    }
    if (Math.abs(state.joyLeft.x) > 0.05) {
      state.orbit.yaw += state.joyLeft.x * 1.2 * dt;
    }

    if (state.paverSpin) {
      // Giro lento y pausado (~57 segundos por vuelta completa) para apreciar cada detalle PBR
      paverCoreGroup.rotation.y += 0.11 * dt;
    }
    if (!prefersReducedMotion.matches) {
      heroGroup.position.y = Math.sin(clock.elapsedTime * 1.1) * 0.05;
    } else {
      heroGroup.position.y = 0;
    }

    const r = state.orbit.dist;
    const cp = Math.cos(state.orbit.pitch);
    const offsetLookX = (window.innerWidth > 820 && state.panelOpen) ? -0.55 : 0.0;
    const offsetLookY = (window.innerWidth <= 820 && state.panelOpen) ? -0.38 : 0.04;
    camera.position.set(
      Math.sin(state.orbit.yaw) * cp * r + offsetLookX,
      Math.sin(state.orbit.pitch) * r + 0.10 + offsetLookY,
      Math.cos(state.orbit.yaw) * cp * r
    );
    camera.lookAt(offsetLookX, offsetLookY, 0);
    telPos.innerHTML = `20×10×6 cm (Tipo I) • <strong>${currentFps} FPS</strong>`;
  }

  renderer.render(scene, camera);
}

// =====================================================================
// INICIALIZACIÓN
// =====================================================================
buildCuscoStreet();
buildHeroPaverStudio();
setDosage(10);
updateStreetZoom(22);
if (window.innerWidth <= 680) {
  state.panelOpen = false;
  normPanel.classList.add("is-collapsed");
  btnToggleSpecs.setAttribute("aria-expanded", "false");
}
animate();
