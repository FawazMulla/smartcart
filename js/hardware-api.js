// Smart Cart Physical Hardware Integration API Bridge (Arduino + ESP8266 Telemetry)

class HardwareAPIBridge {
  constructor() {
    this.hardwareIp = localStorage.getItem("smartcart_esp8266_ip") || "192.168.4.1";
    this.latestPayload = {
      cartId: null,
      lcdLine1: "SMART CART",
      lcdLine2: "Scan Cart QR",
      ledState: "IDLE", // IDLE, VERIFYING, PASS, FAIL
      buzzerSignal: null, // "SHORT_BEEP", "WARNING_ALARM", "CONNECT"
      timestamp: Date.now()
    };
    
    this.telemetryLogs = [];
    this.listeners = [];
  }

  setHardwareIp(ip) {
    this.hardwareIp = ip.trim();
    localStorage.setItem("smartcart_esp8266_ip", this.hardwareIp);
    this.logTelemetry(`[Config] ESP8266 Hardware Endpoint set to: ${this.hardwareIp}`);
  }

  logTelemetry(msg) {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false });
    this.telemetryLogs.unshift(`[${timestamp}] ${msg}`);
    if (this.telemetryLogs.length > 50) this.telemetryLogs.pop();
    this.notify();
  }

  // Broadcast payload to physical ESP8266 hardware via HTTP REST/WebSocket
  async dispatchToPhysicalHardware(payload) {
    this.latestPayload = { ...payload, timestamp: Date.now() };
    this.logTelemetry(`[Payload Sent] LCD1: "${payload.lcdLine1}" | LCD2: "${payload.lcdLine2}" | LED: ${payload.ledState} | Buzzer: ${payload.buzzerSignal || 'NONE'}`);

    // Non-blocking fetch trigger to physical ESP8266
    try {
      if (this.hardwareIp && this.hardwareIp !== 'offline') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200); // Fast timeout for responsive UI

        fetch(`http://${this.hardwareIp}/api/hardware/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        }).then(res => {
          clearTimeout(timeoutId);
          if (res.ok) {
            this.logTelemetry(`[ESP8266 Response] 200 OK - Hardware updated`);
          }
        }).catch(err => {
          clearTimeout(timeoutId);
          // Expected in standalone browser mode when physical ESP is not connected to local Wi-Fi router
        });
      }
    } catch (e) {
      // Ignore network errors in web-only mode
    }

    this.notify();
  }

  // System Event Triggers
  sendCartConnected(cartId) {
    this.dispatchToPhysicalHardware({
      cartId: cartId,
      lcdLine1: "SMART CART",
      lcdLine2: `CART: ${cartId}`,
      ledState: "IDLE",
      buzzerSignal: "CONNECT"
    });
  }

  sendVerificationStart(productName) {
    this.dispatchToPhysicalHardware({
      cartId: window.cartState ? window.cartState.cartId : "CART-001",
      lcdLine1: "VERIFYING...",
      lcdLine2: (productName || "Please wait").substring(0, 16),
      ledState: "VERIFYING",
      buzzerSignal: null
    });
  }

  sendPassAdd(productName, weight) {
    this.dispatchToPhysicalHardware({
      cartId: window.cartState ? window.cartState.cartId : "CART-001",
      lcdLine1: "PRODUCT ADDED ✓",
      lcdLine2: `${productName.substring(0, 10)} ${weight}g`,
      ledState: "PASS",
      buzzerSignal: "SHORT_BEEP"
    });

    setTimeout(() => {
      if (window.cartState && window.cartState.status === 'ACTIVE') {
        this.dispatchToPhysicalHardware({
          cartId: window.cartState.cartId,
          lcdLine1: "SMART CART",
          lcdLine2: `${window.cartState.cartId} Ready`,
          ledState: "IDLE",
          buzzerSignal: null
        });
      }
    }, 3500);
  }

  sendPassRemove(productName, weight) {
    this.dispatchToPhysicalHardware({
      cartId: window.cartState ? window.cartState.cartId : "CART-001",
      lcdLine1: "ITEM REMOVED ✓",
      lcdLine2: `${productName.substring(0, 16)}`,
      ledState: "PASS",
      buzzerSignal: "SHORT_BEEP"
    });

    setTimeout(() => {
      if (window.cartState && window.cartState.status === 'ACTIVE') {
        this.dispatchToPhysicalHardware({
          cartId: window.cartState.cartId,
          lcdLine1: "SMART CART",
          lcdLine2: `${window.cartState.cartId} Ready`,
          ledState: "IDLE",
          buzzerSignal: null
        });
      }
    }, 3500);
  }

  sendFailVerification(reason) {
    this.dispatchToPhysicalHardware({
      cartId: window.cartState ? window.cartState.cartId : "CART-001",
      lcdLine1: "VERIFY FAILED! ",
      lcdLine2: "Go to Counter ->",
      ledState: "FAIL",
      buzzerSignal: "WARNING_ALARM"
    });
  }

  sendCheckoutComplete(totalAmount) {
    this.dispatchToPhysicalHardware({
      cartId: window.cartState ? window.cartState.cartId : "CART-001",
      lcdLine1: "CHECKOUT DONE! ",
      lcdLine2: `Thank You! ₹${totalAmount}`,
      ledState: "PASS",
      buzzerSignal: "CONNECT"
    });
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb({
      hardwareIp: this.hardwareIp,
      latestPayload: this.latestPayload,
      telemetryLogs: this.telemetryLogs
    }));
  }
}

window.hardwareAPI = new HardwareAPIBridge();
