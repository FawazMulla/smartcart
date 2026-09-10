// Smart Cart PWA Application Controller & UI Router

class SmartCartApp {
  constructor() {
    this.currentView = 'pairing';
    this.initPWA();
    this.initEventListeners();
    this.subscribeToState();
  }

  initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SmartCart Service Worker Registered:', reg.scope))
          .catch(err => console.warn('Service Worker registration failed:', err));
      });
    }
  }

  subscribeToState() {
    window.cartState.subscribe(state => this.renderState(state));
    window.hardwareAPI.subscribe(hwState => this.renderHardwareState(hwState));
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    const targetNav = document.getElementById(`nav-${viewName}`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // Manage camera scanner start/stop based on active view
    const cameraVideo = document.getElementById('camera-feed');
    if (viewName === 'scanner') {
      window.scannerController.startCamera(cameraVideo, 'BARCODE', (code) => this.onCodeScanned(code, 'BARCODE'));
    } else if (viewName === 'pairing') {
      const pairCameraVideo = document.getElementById('pair-camera-feed');
      if (pairCameraVideo) {
        window.scannerController.startCamera(pairCameraVideo, 'CART_QR', (code) => this.onCodeScanned(code, 'CART_QR'));
      }
    } else {
      window.scannerController.stopCamera();
    }
  }

  onCodeScanned(code, type) {
    if (type === 'CART_QR') {
      if (code.startsWith("CART-") || code.length >= 4) {
        window.cartState.connectCart(code);
        this.switchView('scanner');
        this.showToast(`Connected to Cart: ${code}`);
      }
    } else if (type === 'BARCODE') {
      this.handleProductBarcode(code);
    }
  }

  handleProductBarcode(barcode) {
    const product = window.productsDB.findByBarcode(barcode);
    if (!product) {
      this.showToast(`Product not found for barcode: ${barcode}`, 'error');
      return;
    }

    // Show preview placement modal before running verification
    this.showProductAddModal(product);
  }

  showProductAddModal(product) {
    const modal = document.getElementById('modal-add-confirm');
    document.getElementById('modal-product-icon').textContent = product.icon;
    document.getElementById('modal-product-name').textContent = product.name;
    document.getElementById('modal-product-price').textContent = `₹${product.price}`;
    document.getElementById('modal-product-weight').textContent = `${product.expectedWeight}g`;

    modal.dataset.barcode = product.barcode;
    modal.classList.add('active');
  }

  async confirmProductAdd() {
    const modal = document.getElementById('modal-add-confirm');
    const barcode = modal.dataset.barcode;
    const product = window.productsDB.findByBarcode(barcode);
    modal.classList.remove('active');

    if (!product) return;

    const result = await window.cartState.addProduct(product);
    if (result.success) {
      const count = result.totalItems || 1;
      this.showToast(`Added ${product.name} (${count} item${count > 1 ? 's' : ''} in cart) ✓`, 'success');
      // Remain on scanner view so user can scan multiple items continuously
      this.switchView('scanner');
    } else {
      this.showCounterAlert(result.reason || "Verification Failed");
    }
  }

  async increaseQuantity(cartItemId) {
    const res = await window.cartState.increaseQuantity(cartItemId);
    if (res.success) {
      this.showToast(`Updated item quantity ✓`, 'success');
    } else {
      this.showCounterAlert(res.reason || "Quantity increase failed verification");
    }
  }

  async decreaseQuantity(cartItemId) {
    const res = await window.cartState.decreaseQuantity(cartItemId);
    if (res.success) {
      this.showToast(`Updated item quantity ✓`, 'success');
    } else {
      this.showCounterAlert(res.reason || "Quantity decrease failed verification");
    }
  }

  requestItemRemoval(cartItemId) {
    const item = window.cartState.requestProductRemoval(cartItemId);
    if (!item) return;

    const modal = document.getElementById('modal-remove-confirm');
    document.getElementById('modal-remove-title').textContent = item.product.name;
    document.getElementById('modal-remove-desc').textContent = `Please physically remove ${item.product.name} (${item.product.expectedWeight * (item.quantity || 1)}g) from the cart to verify.`;

    modal.dataset.cartItemId = cartItemId;
    modal.classList.add('active');
  }

  async confirmItemRemoval() {
    const modal = document.getElementById('modal-remove-confirm');
    const cartItemId = modal.dataset.cartItemId;
    modal.classList.remove('active');

    const result = await window.cartState.confirmProductRemoval(cartItemId);
    if (result.success) {
      this.showToast(`Item removed from cart ✓`, 'success');
    } else {
      this.showCounterAlert(result.reason || "Physical removal failed verification");
    }
  }

  cancelItemRemoval() {
    const modal = document.getElementById('modal-remove-confirm');
    const cartItemId = modal.dataset.cartItemId;
    modal.classList.remove('active');
    window.cartState.cancelProductRemovalRequest(cartItemId);
  }

  showCounterAlert(message) {
    const modal = document.getElementById('modal-counter-alert');
    document.getElementById('counter-alert-msg').textContent = message;
    modal.classList.add('active');
  }

  closeCounterAlert() {
    document.getElementById('modal-counter-alert').classList.remove('active');
  }

  async executeCheckout() {
    const res = await window.cartState.checkout();
    if (res.success) {
      this.renderReceipt(res.receipt);
      this.switchView('receipt');
    } else {
      if (window.cartState.status === 'COUNTER_REQUIRED') {
        this.showCounterAlert(res.reason);
      } else {
        this.showToast(res.reason, 'error');
      }
    }
  }

  renderReceipt(receipt) {
    const container = document.getElementById('receipt-container');
    if (!container) return;

    container.innerHTML = `
      <div class="receipt-card">
        <div class="receipt-header">
          <h2 style="margin-bottom:4px;">SMART CART STORE</h2>
          <p style="font-size:12px; color:#64748b;">Self-Checkout Receipt</p>
          <p style="font-size:11px; margin-top:6px;">Receipt #${receipt.receiptId}</p>
        </div>
        
        <div class="receipt-row"><span>Date:</span> <span>${receipt.timestamp}</span></div>
        <div class="receipt-row"><span>Cart ID:</span> <span>${receipt.cartId}</span></div>
        <div class="receipt-row"><span>Session:</span> <span>${receipt.sessionId}</span></div>
        <hr style="border-top:1px dashed #cbd5e1; margin:8px 0;" />
        
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${receipt.items.map(item => `
            <div class="receipt-row">
              <span>${item.name}</span>
              <span>₹${item.price}</span>
            </div>
          `).join('')}
        </div>

        <hr style="border-top:1px dashed #cbd5e1; margin:8px 0;" />
        <div class="receipt-row"><span>Items Count:</span> <span>${receipt.items.length}</span></div>
        <div class="receipt-row"><span>Total Weight:</span> <span>${receipt.totalWeight}g</span></div>
        <div class="receipt-row"><span>Subtotal:</span> <span>₹${receipt.subtotal}</span></div>
        <div class="receipt-row"><span>GST (5%):</span> <span>₹${receipt.tax}</span></div>
        <hr style="border-top:2px solid #0f172a; margin:8px 0;" />
        <div class="receipt-row" style="font-size:16px; font-weight:bold;">
          <span>FINAL PAID:</span>
          <span>₹${receipt.totalAmount}</span>
        </div>

        <div class="receipt-qr-placeholder">
          <div>
            <div style="font-size:18px;">📱 Scan at Exit</div>
            <div style="font-size:10px; margin-top:4px; font-family:monospace;">${receipt.verificationCode}</div>
          </div>
        </div>
        <p style="font-size:11px; text-align:center; color:#64748b;">Thank you for shopping with Smart Cart!</p>
      </div>
    `;
  }

  renderState(state) {
    const badgeText = document.getElementById('badge-cart-id');
    const badgeDot = document.getElementById('badge-status-dot');

    if (state.cartId) {
      if (badgeText) badgeText.textContent = state.cartId;
      if (badgeDot) badgeDot.classList.add('active');
    } else {
      if (badgeText) badgeText.textContent = "No Cart";
      if (badgeDot) badgeDot.classList.remove('active');
    }

    // Lock views if Counter Escalation is required
    const counterBanner = document.getElementById('counter-escalation-banner');
    if (state.status === 'COUNTER_REQUIRED') {
      if (counterBanner) counterBanner.style.display = 'flex';
    } else {
      if (counterBanner) counterBanner.style.display = 'none';
    }

    // Render Cart Items List
    const cartList = document.getElementById('cart-items-list');
    const cartTotalEl = document.getElementById('cart-total-price');
    const cartWeightEl = document.getElementById('cart-total-weight');
    const cartCountEl = document.getElementById('cart-items-count');

    const totalCount = window.cartState.getTotalItemCount();

    if (cartTotalEl) cartTotalEl.textContent = `₹${state.totalPrice}`;
    if (cartWeightEl) cartWeightEl.textContent = `${state.totalWeight}g`;
    if (cartCountEl) cartCountEl.textContent = `${totalCount} Item${totalCount !== 1 ? 's' : ''}`;

    if (cartList) {
      if (state.items.length === 0) {
        cartList.innerHTML = `
          <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
            <div style="font-size:40px; margin-bottom:10px;">🛒</div>
            <p>Your cart is empty.</p>
            <p style="font-size:12px; margin-top:4px;">Scan 1D product barcodes to add items.</p>
          </div>
        `;
      } else {
        cartList.innerHTML = state.items.map(item => `
          <div class="cart-item-card ${item.status === 'PENDING_REMOVAL' ? 'pending' : ''}">
            <div class="item-main-info">
              <div class="item-icon-box" style="background:${item.product.gradient}">
                ${item.product.icon}
              </div>
              <div class="item-details">
                <h4>${item.product.name}</h4>
                <p>Weight: ${item.product.expectedWeight * (item.quantity || 1)}g (${item.product.expectedWeight}g ea)</p>
                
                <div class="qty-controls">
                  <button class="qty-btn" onclick="window.app.decreaseQuantity('${item.cartItemId}')">-</button>
                  <span class="qty-value">${item.quantity || 1}</span>
                  <button class="qty-btn" onclick="window.app.increaseQuantity('${item.cartItemId}')">+</button>
                </div>

                ${item.status === 'PENDING_REMOVAL' ? '<span style="font-size:11px; color:var(--accent-warning); font-weight:bold;">Pending Physical Removal...</span>' : ''}
              </div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between;">
              <div class="item-price-tag">₹${item.product.price * (item.quantity || 1)}</div>
              ${(item.quantity || 1) > 1 ? `<div style="font-size:10px; color:var(--text-muted);">₹${item.product.price} ea</div>` : ''}
              <button class="btn-remove-sm" style="margin-top:8px;" onclick="window.app.requestItemRemoval('${item.cartItemId}')">
                Remove
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  }

  renderHardwareState(hwState) {
    const ipInput = document.getElementById('input-esp-ip');
    if (ipInput && document.activeElement !== ipInput) {
      ipInput.value = hwState.hardwareIp;
    }
  }

  showToast(message, type = 'info') {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(18, 24, 38, 0.95); border: 1px solid var(--glass-border-light);
        color: white; padding: 12px 24px; border-radius: 999px; font-size: 13px; font-weight: 600;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 200; pointer-events: none;
        transition: all 0.3s ease; opacity: 0;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  initEventListeners() {
    // Navigation buttons
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-nav');
        this.switchView(view);
      });
    });

    // Preset Cart Selection
    document.querySelectorAll('[data-cart-preset]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cartId = e.currentTarget.getAttribute('data-cart-preset');
        window.cartState.connectCart(cartId);
        this.switchView('scanner');
        this.showToast(`Connected to ${cartId}`);
      });
    });

    // Preset Barcode Scan Chips
    document.querySelectorAll('[data-barcode-chip]').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const code = e.currentTarget.getAttribute('data-barcode-chip');
        this.handleProductBarcode(code);
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new SmartCartApp();
});
