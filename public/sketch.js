
// Create connection to Node.js Server
const socket = io();

// Identify this client as mobile to the server
socket.on('connect', () => {
  socket.emit('identify', 'mobile');
});

// Handle rejection if another mobile client is already connected
socket.on('rejected', (message) => {
  console.error('Connection rejected:', message);
  alert(message);
});

// Permission button (iOS)
let askButton;
let hasPermission = false;

// Pistol image
let pistolImage;

// Device orientation
let rotateDegrees = 0;
let frontToBack = 0;
let leftToRight = 0;

// Baseline orientation values (captured on first sensor reading)
// Used to calculate deltas regardless of device startup orientation
let baselineAlpha = null;
let baselineBeta = null;

// Crosshair/laser pointer position (raw orientation deltas)
let pointerX = 0;
let pointerY = 0;

// throttle device motion sending
let lastSent = 0;
const SEND_RATE = 16; // ms (~60 fps)

// NOTE: ALPHA_RANGE and BETA_RANGE have been moved to robotjsp/app.js
// for easier tuning on the desktop client side

function preload() {
  pistolImage = loadImage('pistol.png');
}

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("sketch-container"); 

  rectMode(CENTER);
  angleMode(DEGREES);
  imageMode(CENTER);

  // iOS permission handling
  if (
    typeof DeviceMotionEvent.requestPermission === "function" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    //add a button for permissions
    askButton = createButton("Enable Motion Sensors");
    askButton.parent("sketch-container");
    askButton.id("permission-button");
    askButton.mousePressed(handlePermissionButtonPressed);
  } else {
    // non-iOS devices always get orientation events
    window.addEventListener("deviceorientation", deviceOrientationHandler, true);
    hasPermission = true;
  }
}

function draw() {
  background(240);

  // WAITING FOR PERMISSION 
  if (!hasPermission) {
    displayPermissionMessage();
  } else {
    // Update pointer position based on device orientation
    // Calculate deltas from baseline orientation (captured on first sensor reading)
    // These raw deltas are sent to the desktop client (robotjsp/app.js) for mapping

    // Calculate alpha delta (handle 360-degree wrap)
    let alphaDelta = rotateDegrees - baselineAlpha;
    if (alphaDelta > 180) alphaDelta -= 360;
    if (alphaDelta < -180) alphaDelta += 360;

    // Calculate beta delta
    let betaDelta = frontToBack - baselineBeta;

    // Store for emission (no mapping done here; desktop client handles mapping)
    pointerX = alphaDelta;  // raw delta
    pointerY = betaDelta;   // raw delta

    // Emit the raw deltas for desktop client to process
    emitData();

    // draw the pistol centered and scaled to fill the canvas; it no longer follows the pointer
    if (pistolImage) {
      image(pistolImage, width / 2, height / 2, width, height);
    } else {
      // Fallback rectangle if image not loaded
      fill(0, 255, 0, 100);
      rect(width / 2, height / 2, width * 0.5, height * 0.5);
    }

    // Debug text
    visualiseMyData();
  }
}

// --------------------
// Custom Functions
// --------------------


function visualiseMyData() {
  // Debug text
  push();
  fill(255);
  rectMode(CORNER);
  rect(0, 20, width / 2, 190);
  pop();

  fill(0);
  textAlign(LEFT);
  textSize(12);

  text("Pointer X: " + pointerX.toFixed(2), 10, 40);
  text("Pointer Y: " + pointerY.toFixed(2), 10, 60);

  text("Orientation:", 10, 100);
  text(
    "Alpha: " + rotateDegrees.toFixed(2),
    10,
    120
  );
  text(
    "Beta: " + frontToBack.toFixed(2),
    10,
    140
  );
  text(
    "Gamma: " + leftToRight.toFixed(2),
    10,
    160
  );
}

// SEND DATA TO SERVER
function emitData() {
  //throttle
  let now = millis();
  if (now - lastSent < SEND_RATE) {
    return;
  }
  lastSent = now;

  // Emit raw orientation deltas to server
  socket.emit('cursor-update', {
    x: pointerX,
    y: pointerY
  });
}

// Permission message
function displayPermissionMessage() {
  fill(0);
  textAlign(CENTER);
  textSize(16);
  let message = "Waiting for motion sensor permission, click the button to allow.";
  text(message, width / 2, 30, width);
}

// --------------------
// Socket events
// --------------------

// Handle touch events for cursor down/up
function touchStarted() {
  socket.emit('cursor-down');
  return false;
}

function touchEnded() {
  socket.emit('cursor-up');
  return false;
}

// Desktop fallback
function mousePressed() {
  socket.emit('cursor-down');
  return false;
}

function mouseReleased() {
  socket.emit('cursor-up');
  return false;
}

// --------------------
// Permission handling
// --------------------

function handlePermissionButtonPressed() {
  // request permission for orientation events (iOS)
  DeviceOrientationEvent.requestPermission()
    .then((response) => {
      if (response === "granted") {
        window.addEventListener(
          "deviceorientation",
          deviceOrientationHandler,
          true
        );
      }
    })
    .catch(console.error);

  askButton.remove();
}

// --------------------
// Window Resize
// --------------------


function windowResized() {

  resizeCanvas(windowWidth, windowHeight);

}


// --------------------
// Sensor handlers
// --------------------


// https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientation_event
// https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained
function deviceOrientationHandler(event) {
  rotateDegrees = event.alpha || 0;
  frontToBack = event.beta || 0;
  leftToRight = event.gamma || 0;

  // Capture baseline orientation on first reading
  if (baselineAlpha === null) {
    baselineAlpha = rotateDegrees;
    baselineBeta = frontToBack;
    console.log(`Baseline orientation set: alpha=${baselineAlpha}, beta=${baselineBeta}`);
  }
}


