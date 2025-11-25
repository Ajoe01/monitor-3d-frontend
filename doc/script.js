const socket = io("https://monitor-3d-backend.onrender.com");

// Referencias a elementos del DOM
const wsStatus = document.getElementById('ws-status');
const wsStatusDot = document.getElementById('ws-status-dot');
const lastUpdate = document.getElementById('last-update');
const extrusorValue = document.getElementById('extrusor-value');
const extrusorFill = document.getElementById('extrusor-fill');
const extrusorTarget = document.getElementById('extrusor-target');
const baseValue = document.getElementById('base-value');
const baseFill = document.getElementById('base-fill');
const baseTarget = document.getElementById('base-target');
const feedrateFill = document.getElementById('feedrate-fill');
const feedrateMax = document.getElementById('feedrate-max');
const posX = document.getElementById('pos-x');
const posY = document.getElementById('pos-y');
const posZ = document.getElementById('pos-z');
const logList = document.getElementById('log-list');

// Elementos de estadísticas de la gráfica
const chartCurrent = document.getElementById('chart-current');
const chartAvg = document.getElementById('chart-avg');
const chartMax = document.getElementById('chart-max');
const chartMin = document.getElementById('chart-min');

// Configuración de la gráfica de feedrate
const chartCanvas = document.getElementById('feedrate-chart');
const chartCtx = chartCanvas.getContext('2d');

const MAX_DATA_POINTS = 50;
let feedrateData = [];
let timeLabels = [];

// Variables para el modelo 3D
let scene, camera, renderer, printer, extruderHead, buildPlate;
let maxX = 200, maxY = 200, maxZ = 200;
let currentPos = { x: 0, y: 0, z: 0 };

// Inicializar Three.js
function init3DPrinter() {
  const container = document.getElementById('printer-3d-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Crear escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1f2937);

  // Crear cámara
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(250, 200, 250);
  camera.lookAt(0, 0, 0);

  // Crear renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  // Iluminación
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(100, 200, 100);
  scene.add(directionalLight);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  directionalLight2.position.set(-100, 100, -100);
  scene.add(directionalLight2);

  // Crear grupo para la impresora
  printer = new THREE.Group();

  // Base de la impresora
  const baseGeometry = new THREE.BoxGeometry(220, 10, 220);
  const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x2c3e50 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = -5;
  printer.add(base);

  // Plataforma de impresión (cama caliente)
  const buildPlateGeometry = new THREE.BoxGeometry(200, 3, 200);
  const buildPlateMaterial = new THREE.MeshPhongMaterial({ color: 0x667eea });
  buildPlate = new THREE.Mesh(buildPlateGeometry, buildPlateMaterial);
  buildPlate.position.y = 2;
  printer.add(buildPlate);

  // Torres verticales (4 esquinas)
  const towerGeometry = new THREE.BoxGeometry(8, 220, 8);
  const towerMaterial = new THREE.MeshPhongMaterial({ color: 0x34495e });
  
  const positions = [
    [-100, 110, -100],
    [100, 110, -100],
    [-100, 110, 100],
    [100, 110, 100]
  ];

  positions.forEach(pos => {
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.set(pos[0], pos[1], pos[2]);
    printer.add(tower);
  });

  // Rieles horizontales superiores
  const railGeometry = new THREE.BoxGeometry(220, 6, 6);
  const railMaterial = new THREE.MeshPhongMaterial({ color: 0x95a5a6 });
  
  const rail1 = new THREE.Mesh(railGeometry, railMaterial);
  rail1.position.set(0, 220, -100);
  printer.add(rail1);
  
  const rail2 = new THREE.Mesh(railGeometry, railMaterial);
  rail2.position.set(0, 220, 100);
  printer.add(rail2);

  const railGeometryZ = new THREE.BoxGeometry(6, 6, 220);
  const rail3 = new THREE.Mesh(railGeometryZ, railMaterial);
  rail3.position.set(-100, 220, 0);
  printer.add(rail3);
  
  const rail4 = new THREE.Mesh(railGeometryZ, railMaterial);
  rail4.position.set(100, 220, 0);
  printer.add(rail4);

  // Crear el cabezal extrusor
  const extruderGroup = new THREE.Group();
  
  // Cuerpo del extrusor
  const extruderBodyGeometry = new THREE.BoxGeometry(20, 30, 20);
  const extruderBodyMaterial = new THREE.MeshPhongMaterial({ color: 0xe74c3c });
  const extruderBody = new THREE.Mesh(extruderBodyGeometry, extruderBodyMaterial);
  extruderBody.position.y = 15;
  extruderGroup.add(extruderBody);

  // Boquilla
  const nozzleGeometry = new THREE.CylinderGeometry(2, 4, 15, 8);
  const nozzleMaterial = new THREE.MeshPhongMaterial({ color: 0xc0392b });
  const nozzle = new THREE.Mesh(nozzleGeometry, nozzleMaterial);
  nozzle.position.y = -7;
  extruderGroup.add(nozzle);

  // Ventilador (decorativo)
  const fanGeometry = new THREE.CylinderGeometry(8, 8, 3, 16);
  const fanMaterial = new THREE.MeshPhongMaterial({ color: 0x3498db });
  const fan = new THREE.Mesh(fanGeometry, fanMaterial);
  fan.position.set(12, 15, 0);
  fan.rotation.z = Math.PI / 2;
  extruderGroup.add(fan);

  extruderHead = extruderGroup;
  extruderHead.position.set(0, 100, 0);
  printer.add(extruderHead);

  // Grid de referencia
  const gridHelper = new THREE.GridHelper(200, 20, 0x667eea, 0x444444);
  gridHelper.position.y = 3.5;
  printer.add(gridHelper);

  // Ejes de coordenadas
  const axesHelper = new THREE.AxesHelper(120);
  axesHelper.position.y = 4;
  printer.add(axesHelper);

  scene.add(printer);

  // Controles de mouse para rotar la cámara
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let cameraRotation = { x: 0, y: 0 };

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      cameraRotation.y += deltaX * 0.005;
      cameraRotation.x += deltaY * 0.005;

      // Limitar rotación vertical
      cameraRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, cameraRotation.x));

      updateCameraPosition();

      previousMousePosition = { x: e.clientX, y: e.clientY };
    }
  });

  container.addEventListener('mouseup', () => {
    isDragging = false;
  });

  container.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  // Zoom con rueda del mouse
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomSpeed = 10;
    const distance = camera.position.length();
    const newDistance = distance + (e.deltaY > 0 ? zoomSpeed : -zoomSpeed);
    
    if (newDistance > 150 && newDistance < 500) {
      camera.position.multiplyScalar(newDistance / distance);
    }
  });

  function updateCameraPosition() {
    const radius = 300;
    camera.position.x = radius * Math.sin(cameraRotation.y) * Math.cos(cameraRotation.x);
    camera.position.y = radius * Math.sin(cameraRotation.x) + 100;
    camera.position.z = radius * Math.cos(cameraRotation.y) * Math.cos(cameraRotation.x);
    camera.lookAt(0, 100, 0);
  }

  // Animación
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // Redimensionar
  window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });
}

// Actualizar posición del extrusor en el modelo 3D (MEJORADO)
function update3DPrinterPosition(x, y, z) {
  if (extruderHead) {
    // Mapear las coordenadas reales a la escala del modelo
    // Asumiendo espacio de trabajo de 200x200x200mm
    const scale = 1;
    
    // Centrar en el origen (0,0 está en el centro de la plataforma)
    // x e y van de 0 a maxX/maxY, los centramos restando la mitad
    const centeredX = (x - maxX / 2) * scale;
    const centeredZ = (y - maxY / 2) * scale;
    const height = z * scale;
    
    // Posición Y: desde la plataforma (3.5) + altura del cabezal (15) + posición Z
    extruderHead.position.x = centeredX;
    extruderHead.position.z = centeredZ;
    extruderHead.position.y = 3.5 + 15 + height; // Base del grid + altura mínima del extrusor + Z
    
    console.log(`Extrusor en 3D: X=${centeredX.toFixed(1)}, Y=${height.toFixed(1)}, Z=${centeredZ.toFixed(1)}`);
  }
}

// Estado de conexión
socket.on('connect', () => {
  console.log('Conectado al servidor WebSocket');
  wsStatus.textContent = 'Conectado';
  wsStatusDot.classList.add('connected');
});

socket.on('disconnect', () => {
  console.log('Desconectado del servidor WebSocket');
  wsStatus.textContent = 'Desconectado';
  wsStatusDot.classList.remove('connected');
});

// Recibir datos de la impresora
socket.on('mqttMessage', (dataArray) => {
  console.log('Datos recibidos (array):', dataArray);
  
  if (!Array.isArray(dataArray) || dataArray.length < 6) {
    console.error('Formato de datos inválido. Se esperaba un array de 6 elementos.');
    return;
  }
  
  const tempExtrusor = parseFloat(dataArray[0]) || 0;
  const tempBase = parseFloat(dataArray[1]) || 0;
  const posXValue = parseFloat(dataArray[2]) || 0;
  const posYValue = parseFloat(dataArray[3]) || 0;
  const posZValue = parseFloat(dataArray[4]) || 0;
  const feedrate = parseFloat(dataArray[5]) || 0;
  
  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString();
  
  // Temperatura del extrusor
  extrusorValue.textContent = `${tempExtrusor.toFixed(1)}°C`;
  const percentageExtrusor = Math.min((tempExtrusor / 300) * 100, 100);
  extrusorFill.style.height = `${percentageExtrusor}%`;
  
  // Temperatura de la base
  baseValue.textContent = `${tempBase.toFixed(1)}°C`;
  const percentageBase = Math.min((tempBase / 100) * 100, 100);
  baseFill.style.height = `${percentageBase}%`;
  
  // Feedrate
  const maxFeed = 300;
  feedrateMax.textContent = maxFeed;
  const percentageFeedrate = Math.min((feedrate / maxFeed) * 100, 100);
  feedrateFill.style.width = `${percentageFeedrate}%`;
  feedrateFill.textContent = `${feedrate.toFixed(1)} mm/s`;
  
  addFeedrateDataPoint(feedrate, now);
  
  // Posiciones X, Y, Z
  posX.textContent = posXValue.toFixed(2);
  posY.textContent = posYValue.toFixed(2);
  posZ.textContent = posZValue.toFixed(2);
  
  currentPos.x = posXValue;
  currentPos.y = posYValue;
  currentPos.z = posZValue;
  
  // Actualizar modelo 3D
  update3DPrinterPosition(posXValue, posYValue, posZValue);
  
  addLogEntry({
    tempExtrusor,
    tempBase,
    posXValue,
    posYValue,
    posZValue,
    feedrate
  });
});

function addFeedrateDataPoint(feedrate, timestamp) {
  feedrateData.push(feedrate);
  timeLabels.push(timestamp.toLocaleTimeString());
  
  if (feedrateData.length > MAX_DATA_POINTS) {
    feedrateData.shift();
    timeLabels.shift();
  }
  
  updateChartStats();
  drawFeedrateChart();
}

function updateChartStats() {
  if (feedrateData.length === 0) return;
  
  const current = feedrateData[feedrateData.length - 1];
  const max = Math.max(...feedrateData);
  const min = Math.min(...feedrateData);
  const avg = feedrateData.reduce((a, b) => a + b, 0) / feedrateData.length;
  
  chartCurrent.textContent = `${current.toFixed(1)} mm/s`;
  chartAvg.textContent = `${avg.toFixed(1)} mm/s`;
  chartMax.textContent = `${max.toFixed(1)} mm/s`;
  chartMin.textContent = `${min.toFixed(1)} mm/s`;
}

function drawFeedrateChart() {
  const width = chartCanvas.width = chartCanvas.offsetWidth;
  const height = chartCanvas.height = chartCanvas.offsetHeight;
  
  chartCtx.clearRect(0, 0, width, height);
  
  if (feedrateData.length < 2) return;
  
  const padding = 40;
  const graphWidth = width - 2 * padding;
  const graphHeight = height - 2 * padding;
  
  const maxValue = Math.max(...feedrateData, 100);
  const minValue = 0;
  
  chartCtx.strokeStyle = '#d1d5db';
  chartCtx.lineWidth = 2;
  
  chartCtx.beginPath();
  chartCtx.moveTo(padding, padding);
  chartCtx.lineTo(padding, height - padding);
  chartCtx.stroke();
  
  chartCtx.beginPath();
  chartCtx.moveTo(padding, height - padding);
  chartCtx.lineTo(width - padding, height - padding);
  chartCtx.stroke();
  
  chartCtx.strokeStyle = '#e5e7eb';
  chartCtx.lineWidth = 1;
  chartCtx.setLineDash([5, 5]);
  
  for (let i = 0; i <= 4; i++) {
    const y = padding + (graphHeight / 4) * i;
    chartCtx.beginPath();
    chartCtx.moveTo(padding, y);
    chartCtx.lineTo(width - padding, y);
    chartCtx.stroke();
    
    const value = maxValue - (maxValue / 4) * i;
    chartCtx.fillStyle = '#6b7280';
    chartCtx.font = '12px sans-serif';
    chartCtx.textAlign = 'right';
    chartCtx.fillText(value.toFixed(0), padding - 10, y + 5);
  }
  
  chartCtx.setLineDash([]);
  
  chartCtx.beginPath();
  chartCtx.moveTo(padding, height - padding);
  
  feedrateData.forEach((value, index) => {
    const x = padding + (graphWidth / (feedrateData.length - 1)) * index;
    const y = height - padding - ((value - minValue) / (maxValue - minValue)) * graphHeight;
    chartCtx.lineTo(x, y);
  });
  
  chartCtx.lineTo(width - padding, height - padding);
  chartCtx.closePath();
  
  const gradient = chartCtx.createLinearGradient(0, padding, 0, height - padding);
  gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
  gradient.addColorStop(1, 'rgba(102, 126, 234, 0.05)');
  chartCtx.fillStyle = gradient;
  chartCtx.fill();
  
  chartCtx.beginPath();
  chartCtx.strokeStyle = '#667eea';
  chartCtx.lineWidth = 3;
  chartCtx.lineJoin = 'round';
  chartCtx.lineCap = 'round';
  
  feedrateData.forEach((value, index) => {
    const x = padding + (graphWidth / (feedrateData.length - 1)) * index;
    const y = height - padding - ((value - minValue) / (maxValue - minValue)) * graphHeight;
    
    if (index === 0) {
      chartCtx.moveTo(x, y);
    } else {
      chartCtx.lineTo(x, y);
    }
  });
  
  chartCtx.stroke();
  
  feedrateData.forEach((value, index) => {
    const x = padding + (graphWidth / (feedrateData.length - 1)) * index;
    const y = height - padding - ((value - minValue) / (maxValue - minValue)) * graphHeight;
    
    chartCtx.beginPath();
    chartCtx.arc(x, y, 4, 0, Math.PI * 2);
    chartCtx.fillStyle = '#667eea';
    chartCtx.fill();
    chartCtx.strokeStyle = 'white';
    chartCtx.lineWidth = 2;
    chartCtx.stroke();
  });
  
  chartCtx.fillStyle = '#6b7280';
  chartCtx.font = '12px sans-serif';
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Tiempo', width / 2, height - 10);
  
  chartCtx.save();
  chartCtx.translate(15, height / 2);
  chartCtx.rotate(-Math.PI / 2);
  chartCtx.textAlign = 'center';
  chartCtx.fillText('Velocidad (mm/s)', 0, 0);
  chartCtx.restore();
}

function addLogEntry(data) {
  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  const time = new Date().toLocaleTimeString();
  logItem.textContent = `[${time}] Extrusor: ${data.tempExtrusor.toFixed(1)}°C | Base: ${data.tempBase.toFixed(1)}°C | Feedrate: ${data.feedrate.toFixed(1)} mm/s | Pos: X${data.posXValue.toFixed(1)} Y${data.posYValue.toFixed(1)} Z${data.posZValue.toFixed(1)}`;
  
  logList.insertBefore(logItem, logList.firstChild);
  
  while (logList.children.length > 20) {
    logList.removeChild(logList.lastChild);
  }
}

// Inicializar el modelo 3D cuando la página cargue
window.addEventListener('load', () => {
  init3DPrinter();
});

// Redibujar gráfica al cambiar tamaño de ventana
window.addEventListener('resize', () => {
  drawFeedrateChart();
});

