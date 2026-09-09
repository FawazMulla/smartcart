// Smart Cart Scanner Controller (1D Barcodes & Cart QR Codes)

class ScannerController {
  constructor() {
    this.videoElement = null;
    this.stream = null;
    this.isScanning = false;
    this.barcodeDetector = null;
    this.scanCallback = null;
    this.scanType = 'BARCODE'; // 'BARCODE' or 'CART_QR'

    this.initNativeDetector();
  }

  async initNativeDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        this.barcodeDetector = new window.BarcodeDetector({ formats });
        console.log("Native BarcodeDetector ready with formats:", formats);
      } catch (e) {
        console.warn("BarcodeDetector supported but failed to init:", e);
      }
    }
  }

  async startCamera(videoEl, scanType, onScanned) {
    this.videoElement = videoEl;
    this.scanType = scanType;
    this.scanCallback = onScanned;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
        this.isScanning = true;
        this.startDetectionLoop();
      }
      return { success: true };
    } catch (err) {
      console.warn("Camera access denied or unavailable:", err);
      return { success: false, error: err.message };
    }
  }

  stopCamera() {
    this.isScanning = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  async startDetectionLoop() {
    if (!this.isScanning || !this.videoElement) return;

    if (this.barcodeDetector && this.videoElement.readyState === 4) {
      try {
        const barcodes = await this.barcodeDetector.detect(this.videoElement);
        if (barcodes && barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          if (rawValue) {
            this.handleScanResult(rawValue);
            return; // Pause detection loop on successful scan
          }
        }
      } catch (e) {
        // Detection frame skipped
      }
    }

    if (this.isScanning) {
      requestAnimationFrame(() => this.startDetectionLoop());
    }
  }

  handleScanResult(codeValue) {
    const cleaned = String(codeValue).trim();
    if (this.scanCallback) {
      this.scanCallback(cleaned, this.scanType);
    }
  }

  // Trigger simulated scan for fast testing
  simulateScan(codeValue, scanType = 'BARCODE') {
    this.scanType = scanType;
    this.handleScanResult(codeValue);
  }
}

window.scannerController = new ScannerController();
