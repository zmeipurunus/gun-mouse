
// Create connection to Node.js Server
const socket = io();

// Identify this client as mobile to the server
socket.on('connect', () => {
  socket.emit('identify', 'mobile');
});

// orientation tracking for relative movement
let lastAlpha = null;
let lastBeta = null;

// sensitivity multipliers for mapping rotation to normalized cursor
const SENS_X = 0.005; // adjust as needed for responsiveness
const SENS_Y = 0.005;

// helper to compute shortest angular difference in degrees
function angleDiff(current, previous) {
  let diff = current - previous;
  diff = ((diff + 180) % 360) - 180; // wrap to [-180,180]
  return diff;
}

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

// Device motion
let accX = 0;
let accY = 0;
let accZ = 0;
let rrateX = 0;
let rrateY = 0;
let rrateZ = 0;

// Device orientation
let rotateDegrees = 0;
let frontToBack = 0;
let leftToRight = 0;

// Crosshair/laser pointer position (normalized 0-1)
let pointerX = 0.5;
let pointerY = 0.5;
let isTouching = false;

// throttle device motion sending
let lastSent = 0;
const SEND_RATE = 16; // ms (~60 fps)

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
    // Android / non-permission devices
    window.addEventListener("devicemotion", deviceMotionHandler, true);
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
    // Relative movement calculation
    if (lastAlpha === null) {
      lastAlpha = rotateDegrees;
      lastBeta = frontToBack;
    }

    // compute change since last frame (wrapped)
    let dA = angleDiff(rotateDegrees, lastAlpha);
    let dB = angleDiff(frontToBack, lastBeta);

    // discard large jumps (likely from axis flip) or when gamma is far from landscape
    if (
      Math.abs(dA) < 90 &&
      Math.abs(dB) < 90 &&
      Math.abs(leftToRight - 90) < 30 // require gamma about 90 ±30°
    ) {
      pointerX += -dA * SENS_X; // negative because decreasing alpha -> move right
      pointerY += -dB * SENS_Y; // negative because decreasing beta -> move down

      pointerX = constrain(pointerX, 0, 1);
      pointerY = constrain(pointerY, 0, 1);
    }

    lastAlpha = rotateDegrees;
    lastBeta = frontToBack;

    // Send pointer data to server
    emitData();

    // Display pistol centered on screen (fixed position and size)
    const pistolSize = 120;
    if (pistolImage) {
      image(pistolImage, width / 2, height / 2, pistolSize, pistolSize);
    } else {
      // Fallback circle if image not loaded
      fill(0, 255, 0, 100);
      circle(width / 2, height / 2, pistolSize);
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
  rect(0, 20, width / 2, 210);
  pop();

  fill(0);
  textAlign(LEFT);
  textSize(12);

  text("Cursor Position:", 10, 40);
  text("X (from Alpha): " + pointerX.toFixed(2), 10, 60);
  text("Y (from Beta): " + pointerY.toFixed(2), 10, 80);

  text("Device Orientation:", 10, 120);
  text(
    "Alpha (rotation): " + rotateDegrees.toFixed(1) + "°",
    10,
    140
  );
  text(
    "Beta (forward/tilt): " + frontToBack.toFixed(1) + "°",
    10,
    160
  );
  text(
    "Gamma (side tilt): " + leftToRight.toFixed(1) + "°",
    10,
    180
  );
  text("(Align Gamma to ~90°)", 10, 200);
}

// SEND DATA TO SERVER
function emitData() {
  //throttle
  let now = millis();
  if (now - lastSent < SEND_RATE) {
    return;
  }
  lastSent = now;

  // Emit normalized cursor position to server
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
  isTouching = true;
  socket.emit('cursor-down');
  return false;
}

function touchEnded() {
  isTouching = false;
  socket.emit('cursor-up');
  return false;
}

// Desktop fallback
function mousePressed() {
  isTouching = true;
  socket.emit('cursor-down');
  return false;
}

function mouseReleased() {
  isTouching = false;
  socket.emit('cursor-up');
  return false;
}

// --------------------
// Permission handling
// --------------------

function handlePermissionButtonPressed() {
  DeviceMotionEvent.requestPermission()
    .then((response) => {
      if (response === "granted") {
        //permission granted
        hasPermission = true;

        window.addEventListener(
          "devicemotion",
          deviceMotionHandler,
          true
        );
      }
    })
    .catch(console.error);

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
// https://developer.mozilla.org/en-US/docs/Web/API/Window/devicemotion_event
function deviceMotionHandler(event) {
  if (!event.acceleration || !event.rotationRate){
    return;
  }

  //acceleration in meters per second
  accX = event.acceleration.x || 0;
  accY = event.acceleration.y || 0;
  accZ = event.acceleration.z || 0;

  //degrees per second
  rrateZ = event.rotationRate.alpha || 0;
  rrateX = event.rotationRate.beta || 0;
  rrateY = event.rotationRate.gamma || 0;
}

// https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientation_event
// https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained
function deviceOrientationHandler(event) {
  rotateDegrees = event.alpha || 0;
  frontToBack = event.beta || 0;
  leftToRight = event.gamma || 0;
}


