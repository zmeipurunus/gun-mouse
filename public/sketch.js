
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

// calibration baseline for alpha; set when we first get a reading
let centerAlpha = null;

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
    // Update pointer position based on device orientation
    // The user holds the phone screen up; default alpha ≈ 0 or 360, beta ≈ 0.
    // Moving device left→right decreases alpha.  Map alpha (0‑360) so that
    // decreasing values move the cursor from left to right across the screen.
    // Moving device up→down decreases beta.  Map beta (‑90‑90) so that
    // decreasing values move the cursor top→bottom.
    // We send the normalized coordinates to the server for mouse control.

    // normalize alpha into 0‑360 range just in case
    let a = rotateDegrees % 360;
    if (a < 0) a += 360;

    // set calibration baseline on first reading
    if (centerAlpha === null) {
      centerAlpha = a;
    }

    // compute shortest angular difference from baseline
    // result in range [-180, 180]
    function angleDelta(base, current) {
      let diff = (current - base + 540) % 360 - 180;
      return diff;
    }

    let offset = angleDelta(centerAlpha, a);
    // map +/-90 degrees of rotation to full width; clamp beyond
    pointerX = map(offset, -90, 90, 0, 1, true);

    // beta is stored in frontToBack; map from 90..-90 -> 0..1 (downwards when beta decreases)
    pointerY = map(frontToBack, 90, -90, 0, 1, true);

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
    "Alpha: " + rotateDegrees.toFixed(2) + (centerAlpha !== null ? ` (base ${centerAlpha.toFixed(1)})` : ""),
    10,
    120
  );
  if (centerAlpha !== null) {
    let off = angleDelta(centerAlpha, rotateDegrees % 360);
    text(`Offset: ${off.toFixed(1)}`, 10, 140);
    text(
      "Beta: " + frontToBack.toFixed(2),
      10,
      160
    );
    text(
      "Gamma: " + leftToRight.toFixed(2),
      10,
      180
    );
  } else {
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


