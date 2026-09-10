import os
import time
import random
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='.')
CORS(app)

# In-Memory Product Database (Seeded with initial store catalog)
PRODUCTS = [
    {
        "id": "P001",
        "barcode": "8901234567890",
        "name": "Coca-Cola Can (330ml)",
        "price": 40,
        "expectedWeight": 350,
        "category": "Beverages",
        "icon": "🥤",
        "gradient": "linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)"
    },
    {
        "id": "P002",
        "barcode": "8901234567891",
        "name": "Lay's Classic Potato Chips",
        "price": 20,
        "expectedWeight": 50,
        "category": "Snacks",
        "icon": "🥔",
        "gradient": "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)"
    },
    {
        "id": "P003",
        "barcode": "8901234567892",
        "name": "Amul Taaza Milk (1L)",
        "price": 66,
        "expectedWeight": 1030,
        "category": "Dairy",
        "icon": "🥛",
        "gradient": "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
    },
    {
        "id": "P004",
        "barcode": "8901234567893",
        "name": "Cadbury Dairy Milk Silk",
        "price": 175,
        "expectedWeight": 150,
        "category": "Chocolates",
        "icon": "🍫",
        "gradient": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    },
    {
        "id": "P005",
        "barcode": "8901234567894",
        "name": "Britannia Good Day Cookies",
        "price": 30,
        "expectedWeight": 120,
        "category": "Snacks",
        "icon": "🍪",
        "gradient": "linear-gradient(135deg, #f83600 0%, #f9d423 100%)"
    },
    {
        "id": "P006",
        "barcode": "8901234567895",
        "name": "Red Bull Energy Drink",
        "price": 125,
        "expectedWeight": 260,
        "category": "Beverages",
        "icon": "⚡",
        "gradient": "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)"
    }
]

# Telemetry log memory store
TELEMETRY_LOGS = []

# In-Memory Hardware Command Queue (per cart_id)
HARDWARE_QUEUES = {}

def queue_hardware_command(cart_id, command_type, product_info=None):
    """
    Enqueues a hardware command for a specific cart_id to be retrieved by ESP8266 polling.
    """
    if not cart_id:
        cart_id = "CART-001"
    cart_id = str(cart_id).strip().upper()

    if cart_id not in HARDWARE_QUEUES:
        HARDWARE_QUEUES[cart_id] = []

    # Standardize product info format
    formatted_product = None
    if product_info and isinstance(product_info, dict):
        formatted_product = {
            "name": product_info.get("name", "Unknown Item"),
            "barcode": product_info.get("barcode", "0000000000000"),
            "weight": float(product_info.get("expectedWeight", product_info.get("weight", 0))),
            "price": float(product_info.get("price", 0))
        }

    cmd_item = {
        "command": command_type,
        "cart_id": cart_id,
        "timestamp": int(time.time())
    }
    if formatted_product:
        cmd_item["product"] = formatted_product

    HARDWARE_QUEUES[cart_id].append(cmd_item)
    print(f"[HARDWARE COMMAND QUEUED] cart={cart_id} command={command_type}")
    return cmd_item

# --- STATIC FILE ROUTES FOR PWA ---

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('.', path)):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

# --- API ENDPOINTS ---

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "Smart Cart Python API Engine",
        "timestamp": int(time.time()),
        "products_count": len(PRODUCTS)
    }), 200

@app.route('/api/products', methods=['GET'])
def get_products():
    return jsonify({"success": True, "products": PRODUCTS}), 200

@app.route('/api/products/<barcode>', methods=['GET'])
def get_product_by_barcode(barcode):
    cleaned = str(barcode).strip()
    product = next((p for p in PRODUCTS if p["barcode"] == cleaned), None)
    if product:
        return jsonify({"success": True, "product": product}), 200
    return jsonify({"success": False, "error": f"Product with barcode {cleaned} not found"}), 404

@app.route('/api/products', methods=['POST'])
def add_custom_product():
    data = request.get_json() or {}
    if not data.get("barcode") or not data.get("name") or not data.get("price"):
        return jsonify({"success": False, "error": "Missing required fields: barcode, name, price"}), 400
    
    new_product = {
        "id": f"P{len(PRODUCTS) + 1:03d}",
        "barcode": str(data["barcode"]).strip(),
        "name": str(data["name"]).strip(),
        "price": float(data["price"]),
        "expectedWeight": float(data.get("expectedWeight", 100)),
        "category": data.get("category", "General"),
        "icon": data.get("icon", "📦"),
        "gradient": "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)"
    }
    PRODUCTS.append(new_product)
    return jsonify({"success": True, "product": new_product}), 201

@app.route('/api/cart/verify', methods=['POST'])
def verify_weight():
    """
    Python Weight Verification Engine
    Calculates expected weight vs measured weight within tolerance.
    Automatically enqueues hardware commands (ADD, REMOVE, or VERIFY_FAIL).
    """
    data = request.get_json() or {}
    cart_id = data.get("cartId", "CART-001")
    product_data = data.get("product")
    current_total_weight = float(data.get("currentTotalWeight", 0))
    product_weight = float(data.get("productWeight", 0))
    action = data.get("action", "ADD").upper() # "ADD" or "REMOVE"
    tolerance = float(data.get("toleranceGrams", 50))
    force_fail = data.get("forceFail", False)

    if action == "ADD":
        expected_new_weight = current_total_weight + product_weight
    else:
        expected_new_weight = max(0.0, current_total_weight - product_weight)

    measured_weight = expected_new_weight
    if force_fail:
        measured_weight += (tolerance + 200)

    diff = abs(measured_weight - expected_new_weight)
    passed = diff <= tolerance

    result = {
        "pass": passed,
        "action": action,
        "expectedWeight": expected_new_weight,
        "measuredWeight": measured_weight,
        "diff": diff,
        "tolerance": tolerance,
        "message": f"Weight verified within ±{tolerance}g tolerance" if passed else f"Weight mismatch of {diff}g detected!"
    }

    # Queue hardware command based on verification result
    if passed:
        queue_hardware_command(cart_id, action, product_data)
    else:
        queue_hardware_command(cart_id, "VERIFY_FAIL", product_data)

    return jsonify({"success": True, "verification": result}), 200

@app.route('/api/cart/checkout', methods=['POST'])
def checkout_cart():
    """
    Generates a Python-backed verified digital receipt and queues CHECKOUT command.
    """
    data = request.get_json() or {}
    items = data.get("items", [])
    cart_id = data.get("cartId", "CART-001")
    session_id = data.get("sessionId", f"SESS-{random.randint(100000, 999999)}")

    if not items:
        return jsonify({"success": False, "error": "Cart is empty"}), 400

    subtotal = sum(float(item.get("price", 0)) for item in items)
    total_weight = sum(float(item.get("expectedWeight", 0)) for item in items)
    tax = round(subtotal * 0.05, 2)
    final_total = subtotal + tax

    receipt_id = f"REC-{int(time.time()) % 1000000:06d}"
    verification_code = f"VERIFIED-PY-{random.randint(1000, 9999)}"

    receipt = {
        "receiptId": receipt_id,
        "cartId": cart_id,
        "sessionId": session_id,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "items": items,
        "totalWeight": total_weight,
        "subtotal": subtotal,
        "tax": tax,
        "totalAmount": final_total,
        "verificationCode": verification_code
    }

    # Queue hardware CHECKOUT command
    queue_hardware_command(cart_id, "CHECKOUT")

    return jsonify({"success": True, "receipt": receipt}), 200

# --- HARDWARE CLOUD COMMAND QUEUE ROUTES ---

@app.route('/api/hardware/queue', methods=['POST'])
def enqueue_hardware_command_route():
    """
    Manual / Web App Endpoint to queue a hardware command.
    """
    data = request.get_json() or {}
    cart_id = data.get("cart_id") or data.get("cartId") or "CART-001"
    command_type = (data.get("command") or "ADD").upper()
    product_info = data.get("product")

    queued_item = queue_hardware_command(cart_id, command_type, product_info)
    return jsonify({"success": True, "queued": queued_item}), 201

@app.route('/api/hardware/commands/<cart_id>', methods=['GET'])
def poll_hardware_commands(cart_id):
    """
    ESP8266 Outbound HTTPS Polling Endpoint.
    Returns the oldest pending command for cart_id and removes it from queue.
    """
    cart_id = str(cart_id).strip().upper()
    if cart_id in HARDWARE_QUEUES and len(HARDWARE_QUEUES[cart_id]) > 0:
        cmd = HARDWARE_QUEUES[cart_id].pop(0)
        print(f"[HARDWARE COMMAND POLLED] cart={cart_id} command={cmd['command']}")
        
        response = {
            "available": True,
            "command": cmd["command"],
            "cart_id": cart_id
        }
        if "product" in cmd and cmd["product"]:
            response["product"] = cmd["product"]
            
        return jsonify(response), 200

    return jsonify({"available": False}), 200

@app.route('/api/hardware/queue/<cart_id>', methods=['GET'])
def inspect_hardware_queue(cart_id):
    """
    Inspection endpoint to check current pending queue for a cart_id.
    """
    cart_id = str(cart_id).strip().upper()
    queue = HARDWARE_QUEUES.get(cart_id, [])
    return jsonify({"cart_id": cart_id, "pending_count": len(queue), "queue": queue}), 200

@app.route('/api/hardware/update', methods=['POST'])
def hardware_update():
    """
    ESP8266 Telemetry & LCD update bridge route.
    """
    payload = request.get_json() or {}
    payload["server_received_at"] = time.time()
    TELEMETRY_LOGS.append(payload)
    if len(TELEMETRY_LOGS) > 100:
        TELEMETRY_LOGS.pop(0)
    return jsonify({"success": True, "message": "Hardware telemetry received", "payload": payload}), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"[*] Starting Smart Cart Python Flask app on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)


