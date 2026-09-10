// Smart Cart Domain & State Manager (Phase 1 MVP)

class CartState {
  constructor() {
    this.cartId = null;
    this.sessionId = null;
    this.items = []; // Array of { cartItemId, product, addedAt, status: 'ADDED'|'PENDING_REMOVAL' }
    this.status = 'DISCONNECTED'; // DISCONNECTED, ACTIVE, COUNTER_REQUIRED, CHECKOUT_COMPLETE
    
    // Software Weight Verification Configuration (Phase 1)
    this.verificationMode = 'NORMAL'; // 'NORMAL' (auto pass), 'FORCE_FAIL' (testing failure)
    this.toleranceGrams = 50; // ±50g tolerance for simulated weight check
    this.simulatedWeightMismatchGrams = 0; // Mismatch offset for edge-case testing
    
    this.lastVerificationResult = null;
    this.lastCheckoutReceipt = null;

    this.listeners = [];
    this.loadPersistedState();
  }

  loadPersistedState() {
    try {
      const stored = sessionStorage.getItem("smartcart_session");
      if (stored) {
        const data = JSON.parse(stored);
        this.cartId = data.cartId;
        this.sessionId = data.sessionId;
        this.items = data.items || [];
        this.status = data.status || 'ACTIVE';
        if (this.cartId && window.hardwareAPI) {
          window.hardwareAPI.sendCartConnected(this.cartId);
        }
      }
    } catch (e) {
      console.warn("Failed to load session state", e);
    }
  }

  savePersistedState() {
    try {
      if (this.cartId) {
        sessionStorage.setItem("smartcart_session", JSON.stringify({
          cartId: this.cartId,
          sessionId: this.sessionId,
          items: this.items,
          status: this.status
        }));
      } else {
        sessionStorage.removeItem("smartcart_session");
      }
    } catch (e) {
      console.warn("Failed to save session state", e);
    }
  }

  // Connect to Cart ID via scanned QR code
  connectCart(cartId) {
    this.cartId = cartId.trim().toUpperCase();
    this.sessionId = `SESS-${Math.floor(100000 + Math.random() * 900000)}`;
    this.items = [];
    this.status = 'ACTIVE';
    this.lastVerificationResult = null;
    this.lastCheckoutReceipt = null;

    if (window.hardwareAPI) {
      window.hardwareAPI.sendCartConnected(this.cartId);
    }
    this.savePersistedState();
    this.notify();
  }

  disconnectCart() {
    this.cartId = null;
    this.sessionId = null;
    this.items = [];
    this.status = 'DISCONNECTED';
    this.lastVerificationResult = null;

    this.savePersistedState();
    this.notify();
  }

  // Total expected weight of all verified items currently in cart
  getTotalExpectedWeight() {
    return this.items.reduce((sum, item) => {
      return item.status === 'ADDED' ? sum + (item.product.expectedWeight * (item.quantity || 1)) : sum;
    }, 0);
  }

  // Total price calculation
  getTotalPrice() {
    return this.items.reduce((sum, item) => {
      return item.status === 'ADDED' ? sum + (item.product.price * (item.quantity || 1)) : sum;
    }, 0);
  }

  // Total items count including quantities
  getTotalItemCount() {
    return this.items.reduce((sum, item) => {
      return item.status === 'ADDED' ? sum + (item.quantity || 1) : sum;
    }, 0);
  }

  // Verification Engine (Phase 1 Simulated Weight Verification)
  async verifyWeightChangeAsync(product, action, customSimulatedMeasured = null) {
    if (window.hardwareAPI) {
      window.hardwareAPI.sendVerificationStart(product.name);
    }

    const currentTotalWeight = this.getTotalExpectedWeight();
    
    try {
      const res = await fetch('/api/cart/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartId: this.cartId || "CART-001",
          product: product,
          currentTotalWeight,
          productWeight: product.expectedWeight,
          action,
          toleranceGrams: this.toleranceGrams,
          forceFail: (this.verificationMode === 'FORCE_FAIL')
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.verification) {
          const v = data.verification;
          const result = {
            pass: v.pass,
            action: action,
            product: product,
            expectedWeight: v.expectedWeight,
            measuredWeight: v.measuredWeight,
            diff: v.diff,
            tolerance: v.tolerance,
            message: v.message
          };
          this.lastVerificationResult = result;
          return result;
        }
      }
    } catch (e) {
      console.log("[Python API] Falling back to local weight verification engine");
    }

    // Local Fallback Verification Engine
    let expectedNewTotalWeight = currentTotalWeight;
    if (action === 'ADD') {
      expectedNewTotalWeight += product.expectedWeight;
    } else if (action === 'REMOVE') {
      expectedNewTotalWeight -= product.expectedWeight;
    }

    let measuredWeight = expectedNewTotalWeight;
    if (customSimulatedMeasured !== null) {
      measuredWeight = customSimulatedMeasured;
    } else if (this.verificationMode === 'FORCE_FAIL') {
      measuredWeight = expectedNewTotalWeight + (this.toleranceGrams + 200);
    } else if (this.simulatedWeightMismatchGrams !== 0) {
      measuredWeight = expectedNewTotalWeight + this.simulatedWeightMismatchGrams;
    }

    const diff = Math.abs(measuredWeight - expectedNewTotalWeight);
    const pass = diff <= this.toleranceGrams;

    const result = {
      pass: pass,
      action: action,
      product: product,
      expectedWeight: expectedNewTotalWeight,
      measuredWeight: measuredWeight,
      diff: diff,
      tolerance: this.toleranceGrams,
      message: pass 
        ? `Weight verified within ±${this.toleranceGrams}g tolerance`
        : `Weight mismatch of ${diff}g detected! (Expected: ${expectedNewTotalWeight}g, Measured: ${measuredWeight}g)`
    };

    this.lastVerificationResult = result;
    return result;
  }

  // Add product flow after scanning 1D barcode
  async addProduct(product) {
    if (this.status === 'COUNTER_REQUIRED') {
      return { success: false, reason: "Cart locked due to verification failure. Please visit Checkout Counter." };
    }

    const verifyResult = await this.verifyWeightChangeAsync(product, 'ADD');

    if (verifyResult.pass) {
      const existing = this.items.find(i => i.product.barcode === product.barcode && i.status === 'ADDED');
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        const cartItemId = `ITEM-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        const cartItem = {
          cartItemId,
          product,
          quantity: 1,
          addedAt: new Date().toISOString(),
          status: 'ADDED'
        };
        this.items.push(cartItem);
      }

      this.savePersistedState();

      if (window.hardwareAPI) {
        window.hardwareAPI.sendPassAdd(product.name, product.expectedWeight);
      }
      this.notify();

      return { success: true, totalItems: this.getTotalItemCount(), verifyResult };
    } else {
      // Verification Failed -> Escalate to Counter
      this.status = 'COUNTER_REQUIRED';
      this.savePersistedState();

      if (window.hardwareAPI) {
        window.hardwareAPI.sendFailVerification("Weight Mismatch on Add");
      }
      this.notify();

      return { success: false, verifyResult, reason: "Verification Failed. Proceed to Checkout Counter." };
    }
  }

  // Increase item quantity (+ button)
  async increaseQuantity(cartItemId) {
    const item = this.items.find(i => i.cartItemId === cartItemId);
    if (!item) return { success: false, reason: "Item not found" };

    const verifyResult = await this.verifyWeightChangeAsync(item.product, 'ADD');
    if (verifyResult.pass) {
      item.quantity = (item.quantity || 1) + 1;
      this.savePersistedState();
      if (window.hardwareAPI) window.hardwareAPI.sendPassAdd(item.product.name, item.product.expectedWeight);
      this.notify();
      return { success: true, verifyResult };
    } else {
      this.status = 'COUNTER_REQUIRED';
      this.savePersistedState();
      if (window.hardwareAPI) window.hardwareAPI.sendFailVerification("Weight Mismatch on Quantity Increase");
      this.notify();
      return { success: false, verifyResult, reason: "Verification Failed on quantity increase" };
    }
  }

  // Decrease item quantity (- button)
  async decreaseQuantity(cartItemId) {
    const itemIndex = this.items.findIndex(i => i.cartItemId === cartItemId);
    if (itemIndex === -1) return { success: false, reason: "Item not found" };

    const item = this.items[itemIndex];
    const verifyResult = await this.verifyWeightChangeAsync(item.product, 'REMOVE');
    if (verifyResult.pass) {
      if ((item.quantity || 1) > 1) {
        item.quantity -= 1;
      } else {
        this.items.splice(itemIndex, 1);
      }
      this.savePersistedState();
      if (window.hardwareAPI) window.hardwareAPI.sendPassRemove(item.product.name, item.product.expectedWeight);
      this.notify();
      return { success: true, verifyResult };
    } else {
      this.status = 'COUNTER_REQUIRED';
      this.savePersistedState();
      if (window.hardwareAPI) window.hardwareAPI.sendFailVerification("Weight Mismatch on Quantity Decrease");
      this.notify();
      return { success: false, verifyResult, reason: "Verification Failed on quantity decrease" };
    }
  }

  // Two-step removal request (Step 1: Request Pending Removal)
  requestProductRemoval(cartItemId) {
    const item = this.items.find(i => i.cartItemId === cartItemId);
    if (!item) return null;

    item.status = 'PENDING_REMOVAL';
    this.notify();
    return item;
  }

  // Two-step removal execution (Step 2: Confirm physical removal & verify weight drop)
  async confirmProductRemoval(cartItemId, customSimulatedMeasured = null) {
    const itemIndex = this.items.findIndex(i => i.cartItemId === cartItemId);
    if (itemIndex === -1) return { success: false, reason: "Item not found in cart" };

    const item = this.items[itemIndex];
    const verifyResult = await this.verifyWeightChangeAsync(item.product, 'REMOVE', customSimulatedMeasured);

    if (verifyResult.pass) {
      // Remove item completely from cart array
      const removed = this.items.splice(itemIndex, 1)[0];
      this.savePersistedState();

      if (window.hardwareAPI) {
        window.hardwareAPI.sendPassRemove(removed.product.name, removed.product.expectedWeight * (removed.quantity || 1));
      }
      this.notify();

      return { success: true, removedItem: removed, verifyResult };
    } else {
      // Failed removal: revert item status back to ADDED, keep in total, escalate to counter
      item.status = 'ADDED';
      this.status = 'COUNTER_REQUIRED';
      this.savePersistedState();

      if (window.hardwareAPI) {
        window.hardwareAPI.sendFailVerification("Weight Mismatch on Remove");
      }
      this.notify();

      return { success: false, verifyResult, reason: "Physical removal not verified. Item retained in bill. Proceed to Checkout Counter." };
    }
  }

  cancelProductRemovalRequest(cartItemId) {
    const item = this.items.find(i => i.cartItemId === cartItemId);
    if (item) {
      item.status = 'ADDED';
      this.notify();
    }
  }

  // Complete digital checkout
  async checkout() {
    if (this.items.length === 0) {
      return { success: false, reason: "Cart is empty. Scan items to checkout." };
    }
    if (this.status === 'COUNTER_REQUIRED') {
      return { success: false, reason: "Verification failure unresolved. Must checkout at Counter." };
    }

    const expandedItems = [];
    this.items.forEach(i => {
      const qty = i.quantity || 1;
      for (let q = 0; q < qty; q++) {
        expandedItems.push(i.product);
      }
    });

    const itemsPayload = this.items.map(i => i.product);

    try {
      const res = await fetch('/api/cart/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: expandedItems,
          cartId: this.cartId,
          sessionId: this.sessionId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.receipt) {
          const receipt = data.receipt;
          this.lastCheckoutReceipt = receipt;
          this.status = 'CHECKOUT_COMPLETE';
          
          if (window.hardwareAPI) {
            window.hardwareAPI.sendCheckoutComplete(receipt.totalAmount);
          }
          
          sessionStorage.removeItem("smartcart_session");
          this.notify();
          return { success: true, receipt };
        }
      }
    } catch (e) {
      console.log("[Python API] Falling back to local receipt generation");
    }

    // Local Fallback Checkout Calculation
    const subtotal = this.getTotalPrice();
    const tax = Math.round(subtotal * 0.05); // 5% GST
    const finalTotal = subtotal + tax;

    const receipt = {
      receiptId: `REC-${Date.now().toString().slice(-6)}`,
      cartId: this.cartId,
      sessionId: this.sessionId,
      timestamp: new Date().toLocaleString(),
      items: [...expandedItems],
      totalWeight: this.getTotalExpectedWeight(),
      subtotal: subtotal,
      tax: tax,
      totalAmount: finalTotal,
      verificationCode: `VERIFIED-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    };

    this.lastCheckoutReceipt = receipt;
    this.status = 'CHECKOUT_COMPLETE';
    
    if (window.hardwareAPI) {
      window.hardwareAPI.sendCheckoutComplete(finalTotal);
    }
    
    sessionStorage.removeItem("smartcart_session");
    this.notify();

    return { success: true, receipt };
  }

  setVerificationMode(mode, tolerance = 50, offset = 0) {
    this.verificationMode = mode;
    this.toleranceGrams = Number(tolerance);
    this.simulatedWeightMismatchGrams = Number(offset);
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb({
      cartId: this.cartId,
      sessionId: this.sessionId,
      items: this.items,
      status: this.status,
      totalPrice: this.getTotalPrice(),
      totalWeight: this.getTotalExpectedWeight(),
      verificationMode: this.verificationMode,
      toleranceGrams: this.toleranceGrams,
      lastVerificationResult: this.lastVerificationResult,
      lastCheckoutReceipt: this.lastCheckoutReceipt
    }));
  }
}

window.cartState = new CartState();
