
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

// Orientation range for cursor control (degrees)
// Increasing this range requires larger device rotations; decreasing makes it more sensitive
const ALPHA_RANGE = 45;  // 90 degree total sweep for left-right (decreasing alpha moves right)
const BETA_RANGE = 45;   // 90 degree total sweep for up-down (decreasing beta moves down)

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
    // Update pointer position based on device orientation
    // The user holds the phone screen up; default alpha ≈ 0, beta ≈ 0.
    // We recenter alpha around 0 to handle the 360-degree wrap.
    // Decreasing alpha (rotating left) moves cursor to the right.
    // Decreasing beta (tilting forward) moves cursor downward.

    // Convert alpha to -180 to +180 range centered at 0
    let alphaDelta = rotateDegrees;
    if (alphaDelta > 180) alphaDelta -= 360;

    // Map centered deltas to 0-1 range using the defined ranges
    pointerX = map(alphaDelta, ALPHA_RANGE, -ALPHA_RANGE, 0, 1, true);
    pointerY = map(frontToBack, BETA_RANGE, -BETA_RANGE, 0, 1, true);

    // Emit the normalized position
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


