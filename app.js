// ============================================
// VOLT-X Staff Scanner – app.js
// Live QR scanner + Image Upload + Manual Entry
// ============================================

// ---- Firebase Configuration ----
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// ---- State ----
let db = null;
let fbDoc, fbGetDoc, fbUpdateDoc;
let firebaseReady = false;
let html5QrCode = null;
let isScanning = false;
let currentFacingMode = "environment"; // "environment" or "user"
let currentDocRef = null;

// ---- Initialize Firebase ----
async function initFirebase() {
  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js");
    const fsModule = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
    const app = appModule.initializeApp(firebaseConfig);
    db = fsModule.getFirestore(app);
    fbDoc = fsModule.doc;
    fbGetDoc = fsModule.getDoc;
    fbUpdateDoc = fsModule.updateDoc;
    firebaseReady = true;
    console.log("[VOLT-X] Firebase connected");
  } catch (err) {
    console.warn("[VOLT-X] Firebase demo mode:", err.message);
  }
}

// ---- UI Helpers ----
function $(id) {
  return document.getElementById(id);
}

function showToast(message, isError) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast " + (isError ? "error" : "info") + " show";
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function showCard(id) {
  const cards = ["verification-card", "success-card", "error-card", "test-modal"];
  cards.forEach(c => {
    const el = $(c);
    if (el) el.classList.add("hidden");
  });
  if (id) {
    $(id).classList.remove("hidden");
    $("scan-overlay").style.display = "none";
    $("bottom-controls").style.display = "none";
  } else {
    $("scan-overlay").style.display = "block";
    $("bottom-controls").style.display = "flex";
  }
}

function updateScanButtonUI() {
  const toggleBtn = $("scan-toggle-btn");
  const overlay = $("scan-overlay");
  const hint = $("scan-hint");

  if (isScanning) {
    if (toggleBtn) {
      toggleBtn.innerHTML = "⏹ Stop Scanner";
      toggleBtn.classList.remove("btn-primary");
      toggleBtn.classList.add("btn-secondary");
    }
    if (overlay) overlay.style.display = "block";
    if (hint) hint.style.display = "block";
  } else {
    if (toggleBtn) {
      toggleBtn.innerHTML = "📷 Start Scanner";
      toggleBtn.classList.remove("btn-secondary");
      toggleBtn.classList.add("btn-primary");
    }
    if (overlay) overlay.style.display = "none";
    if (hint) hint.style.display = "none";
  }
}

// ---- QR Scanner Engine ----
function toggleScanner() {
  if (isScanning) {
    stopScanner();
  } else {
    startScanner();
  }
}

function startScanner() {
  showCard(null);

  if (html5QrCode && isScanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      launchCamera();
    }).catch(() => {
      launchCamera();
    });
  } else {
    launchCamera();
  }
}

function launchCamera() {
  $("qr-reader").innerHTML = "";
  html5QrCode = new Html5Qrcode("qr-reader");
  isScanning = true;
  updateScanButtonUI();

  const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    const boxSize = Math.floor(minEdge * 0.72);
    return { width: boxSize, height: boxSize };
  };

  const config = {
    fps: 15,
    qrbox: qrboxFunction,
    aspectRatio: 1.0,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  };

  // If Chrome blocks live getUserMedia over HTTP, use mobile native camera capture directly
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.log("[VOLT-X] MediaDevices blocked on HTTP. Opening native camera capture fallback.");
    isScanning = false;
    updateScanButtonUI();
    openNativeCameraCapture();
    return;
  }

  showToast("Activating camera…");

  html5QrCode.start(
    { facingMode: currentFacingMode },
    config,
    onScanSuccess,
    () => {} // silence per-frame scan misses
  ).then(() => {
    console.log("[VOLT-X] Camera active:", currentFacingMode);
    isScanning = true;
    updateScanButtonUI();
  }).catch(err => {
    console.warn("[VOLT-X] Primary camera failed, trying fallback:", err);
    const fallbackMode = currentFacingMode === "environment" ? "user" : "environment";
    html5QrCode.start(
      { facingMode: fallbackMode },
      config,
      onScanSuccess,
      () => {}
    ).then(() => {
      currentFacingMode = fallbackMode;
      console.log("[VOLT-X] Fallback camera active:", fallbackMode);
      isScanning = true;
      updateScanButtonUI();
    }).catch(err2 => {
      console.warn("[VOLT-X] Live camera stream denied/blocked. Opening native camera fallback:", err2);
      isScanning = false;
      updateScanButtonUI();
      openNativeCameraCapture();
    });
  });
}

function openNativeCameraCapture() {
  const input = $("camera-capture-fallback");
  if (input) {
    showToast("Opening camera…");
    input.click();
  }
}

async function handleCapturedPhoto(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  showToast("Scanning pass from photo…");
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode("qr-reader");
    }
    const decodedText = await html5QrCode.scanFile(file, true);
    onScanSuccess(decodedText);
  } catch (err) {
    console.warn("[VOLT-X] Photo scan error:", err);
    showError(
      "NO QR DETECTED",
      "Could not detect a valid QR code in the captured photo.<br><br>Please tap <b>Try Again</b> and snap the QR code clearly."
    );
  } finally {
    e.target.value = "";
  }
}

function stopScanner() {
  isScanning = false;
  updateScanButtonUI();
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      $("qr-reader").innerHTML = "";
    }).catch(() => {});
  }
}

function playSuccessBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch (_) {}
}

// ---- Scan Handler ----
function onScanSuccess(decodedText) {
  stopScanner();
  playSuccessBeep();
  if (navigator.vibrate) {
    try { navigator.vibrate(120); } catch (_) {}
  }

  console.log("[VOLT-X] Scanned QR:", decodedText);

  let bookingId = "";
  let userEmail = "";
  let stationId = "";

  try {
    const payload = JSON.parse(decodedText);
    bookingId = payload.bookingId || payload.id || payload.booking_id || payload.slotId || payload.bookingIdStr || "";
    userEmail = payload.userEmail || payload.email || payload.customerEmail || payload.customer || "";
    stationId = payload.stationId || payload.station || payload.chargerId || "";
  } catch (e) {
    try {
      if (decodedText.startsWith("http://") || decodedText.startsWith("https://")) {
        const url = new URL(decodedText);
        bookingId = url.searchParams.get("bookingId") || url.searchParams.get("id") || url.searchParams.get("booking_id") || "";
        userEmail = url.searchParams.get("email") || url.searchParams.get("userEmail") || "";
        stationId = url.searchParams.get("stationId") || url.searchParams.get("station") || "";
      }
    } catch (_) {}

    if (!bookingId) {
      bookingId = decodedText.trim();
    }
  }

  if (!bookingId) {
    showError("INVALID QR", "QR code did not contain a valid Booking ID.");
    return;
  }

  handleVerification(bookingId, userEmail, stationId);
}


// ---- Verification Flow ----
async function handleVerification(bookingId, userEmail, stationId) {
  if (!firebaseReady) {
    // Demo Mode Display
    currentDocRef = null;
    showVerification(bookingId, stationId || "ST-DEMO-01", userEmail || "customer@example.com");
    showToast("Demo Mode (Firebase not connected)");
    return;
  }

  try {
    const docRef = fbDoc(db, "charging_slots", bookingId);
    const docSnap = await fbGetDoc(docRef);

    if (!docSnap.exists()) {
      showError("NOT FOUND", `No booking found for ID: ${bookingId}`);
      return;
    }

    const data = docSnap.data();
    if (data.status !== "Booked") {
      showError("INVALID STATUS", `Current status is "${data.status}". Expected "Booked".`);
      return;
    }

    currentDocRef = docRef;
    showVerification(
      bookingId,
      data.stationId || stationId || "—",
      data.userEmail || userEmail || "—"
    );
  } catch (err) {
    console.error("[VOLT-X] Firestore error:", err);
    showError("NETWORK ERROR", "Failed to connect to Firestore. Check connection.");
  }
}

// ---- Render States ----
function showVerification(bookingId, stationId, email) {
  $("booking-id").textContent = bookingId;
  $("station-id").textContent = stationId;
  $("customer-email").textContent = email;
  showCard("verification-card");
}

function showError(title, message) {
  $("error-title").textContent = title;
  $("error-msg").innerHTML = message;
  showCard("error-card");
}

// ---- Approve Session ----
async function approveBooking() {
  const btn = $("approve-btn");
  btn.classList.add("loading");
  btn.textContent = "Activating…";

  try {
    if (currentDocRef && firebaseReady) {
      await fbUpdateDoc(currentDocRef, { status: "Charging Active" });
    }
    showCard("success-card");
    showToast("Charging session activated! ⚡");
  } catch (err) {
    console.error("[VOLT-X] Activation failed:", err);
    showToast("Failed to activate charging session", true);
  } finally {
    btn.classList.remove("loading");
    btn.innerHTML = "⚡ Approve &amp; Start Charging";
    currentDocRef = null;
  }
}

// ---- Toggle Camera Front/Back ----
function toggleCamera() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  showToast("Switching to " + (currentFacingMode === "environment" ? "Back" : "Front") + " camera");
  startScanner();
}

// ---- Test Pass Simulation ----
const SAMPLE_TEST_PASS = JSON.stringify({
  bookingId: "VOLT-8942",
  stationId: "ST-HYPER-04",
  userEmail: "alex.driver@voltx.io"
});

function openTestModal() {
  stopScanner();
  const img = $("test-qr-image");
  if (img) {
    img.src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(SAMPLE_TEST_PASS);
  }
  showCard("test-modal");
}

function simulateScan() {
  showCard(null);
  showToast("Simulating EV pass detection…");
  setTimeout(() => {
    onScanSuccess(SAMPLE_TEST_PASS);
  }, 400);
}

// ---- App Startup ----
document.addEventListener("DOMContentLoaded", () => {
  initFirebase();

  // Listeners
  if ($("scan-toggle-btn")) $("scan-toggle-btn").addEventListener("click", toggleScanner);
  if ($("camera-capture-fallback")) $("camera-capture-fallback").addEventListener("change", handleCapturedPhoto);
  if ($("camera-flip-btn")) $("camera-flip-btn").addEventListener("click", toggleCamera);
  if ($("approve-btn")) $("approve-btn").addEventListener("click", approveBooking);
  if ($("cancel-verify-btn")) $("cancel-verify-btn").addEventListener("click", () => { showCard(null); stopScanner(); });
  if ($("next-scan-btn")) $("next-scan-btn").addEventListener("click", () => { showCard(null); startScanner(); });
  if ($("error-retry-btn")) $("error-retry-btn").addEventListener("click", () => { showCard(null); startScanner(); });

  // Test Pass Listeners
  if ($("test-qr-btn")) $("test-qr-btn").addEventListener("click", openTestModal);
  if ($("quick-test-btn")) $("quick-test-btn").addEventListener("click", openTestModal);
  if ($("simulate-scan-btn")) $("simulate-scan-btn").addEventListener("click", simulateScan);
  if ($("close-test-btn")) $("close-test-btn").addEventListener("click", () => showCard(null));

  // Initial UI state (idle until button clicked)
  updateScanButtonUI();
});
