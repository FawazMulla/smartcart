// Smart Cart Product Database (Phase 1) - 1D Barcodes Only

const INITIAL_PRODUCTS = [
  {
    id: "P001",
    barcode: "8901234567890",
    name: "Coca-Cola Can (330ml)",
    price: 40,
    expectedWeight: 350, // grams
    category: "Beverages",
    icon: "🥤",
    gradient: "linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)"
  },
  {
    id: "P002",
    barcode: "8901234567891",
    name: "Lay's Classic Potato Chips",
    price: 20,
    expectedWeight: 50,
    category: "Snacks",
    icon: "🥔",
    gradient: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)"
  },
  {
    id: "P003",
    barcode: "8901234567892",
    name: "Amul Taaza Milk (1L)",
    price: 66,
    expectedWeight: 1030,
    category: "Dairy",
    icon: "🥛",
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
  },
  {
    id: "P004",
    barcode: "8901234567893",
    name: "Cadbury Dairy Milk Silk",
    price: 175,
    expectedWeight: 150,
    category: "Chocolates",
    icon: "🍫",
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
  },
  {
    id: "P005",
    barcode: "8901234567894",
    name: "Britannia Good Day Cookies",
    price: 30,
    expectedWeight: 120,
    category: "Snacks",
    icon: "🍪",
    gradient: "linear-gradient(135deg, #f83600 0%, #f9d423 100%)"
  },
  {
    id: "P006",
    barcode: "8901234567895",
    name: "Red Bull Energy Drink",
    price: 125,
    expectedWeight: 260,
    category: "Beverages",
    icon: "⚡",
    gradient: "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)"
  }
];

class ProductsDatabase {
  constructor() {
    this.products = [...INITIAL_PRODUCTS];
    this.loadCustomProducts();
    this.syncWithPythonApi();
  }

  async syncWithPythonApi() {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.products) && data.products.length > 0) {
          this.products = data.products;
          console.log("[Python API] Synced product database from server:", this.products.length, "items");
        }
      }
    } catch (e) {
      console.log("[Python API] Running in offline/fallback catalog mode");
    }
  }

  loadCustomProducts() {
    try {
      const stored = localStorage.getItem("smartcart_custom_products");
      if (stored) {
        const custom = JSON.parse(stored);
        this.products = [...INITIAL_PRODUCTS, ...custom];
      }
    } catch (e) {
      console.warn("Failed to load custom products from storage", e);
    }
  }

  getAll() {
    return this.products;
  }

  findByBarcode(barcode) {
    const cleaned = String(barcode).trim();
    return this.products.find(p => p.barcode === cleaned) || null;
  }

  findById(id) {
    return this.products.find(p => p.id === id) || null;
  }

  async addProduct(productData) {
    const newProduct = {
      id: `P${String(this.products.length + 1).padStart(3, '0')}`,
      barcode: String(productData.barcode).trim(),
      name: productData.name.trim(),
      price: Number(productData.price),
      expectedWeight: Number(productData.expectedWeight),
      category: productData.category || "General",
      icon: productData.icon || "📦",
      gradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)"
    };

    this.products.push(newProduct);
    this.saveCustomProducts();

    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
    } catch (e) {
      // Saved locally if offline
    }

    return newProduct;
  }

  saveCustomProducts() {
    try {
      const customOnly = this.products.filter(p => !INITIAL_PRODUCTS.some(init => init.id === p.id));
      localStorage.setItem("smartcart_custom_products", JSON.stringify(customOnly));
    } catch (e) {
      console.warn("Failed to save custom products", e);
    }
  }
}

window.productsDB = new ProductsDatabase();

