# Smart Cart System

## Overview

Smart Cart is a mobile-first shopping cart system that allows customers to connect to a shopping cart, scan products using their mobile phone, manage their cart digitally, and complete checkout without depending on a traditional checkout counter.

Each cart has a unique QR code. The customer scans the QR code using the mobile app, which connects the customer to that specific cart.

Products are scanned using the phone's barcode scanner. The application retrieves the product name, price, and expected weight and adds the product to the shopping session after verification.

The cart itself provides physical feedback through an LCD display, LED, and buzzer.

For the first phase, weight verification is simulated in software. A physical load-cell-based weight verification system will be integrated in a later phase.

---

## Core Concept

```text
                CUSTOMER
                    │
                    ▼
              Mobile App
                    │
             Scan Cart QR
                    │
                    ▼
               Cart ID
                    │
                    ▼
            Scan Product Barcode
                    │
                    ▼
             Product Database
                    │
          ┌─────────┴─────────┐
          │                   │
     Product Info        Expected Weight
          │                   │
          └─────────┬─────────┘
                    ▼
           Verification Step
                    │
          ┌─────────┴─────────┐
          │                   │
        PASS                 FAIL
          │                   │
          ▼                   ▼
     Add to Cart        Checkout Counter
          │
          ▼
   Arduino + LCD/LED/Buzzer
          │
          ▼
       Cart Updated
```

# System Architecture

```text
                         MOBILE APP
                             │
                             │ Internet / Wi-Fi
                             ▼
                    ┌─────────────────┐
                    │    ESP8266      │
                    │  Wi-Fi Module   │
                    └────────┬────────┘
                             │
                         UART/Serial
                             │
                             ▼
                    ┌─────────────────┐
                    │   ARDUINO UNO   │
                    │ Hardware Control│
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
               ▼             ▼             ▼
             16×2           LED          Buzzer
             LCD
               │
               ▼
        Future Sensors
        ├── Load Cell
        ├── HX711
        └── Other Sensors
```

## Role of Each Controller

### ESP8266

The ESP8266 acts as the communication layer.

Responsibilities:

- Connect cart to Wi-Fi
- Communicate with backend
- Receive cart commands
- Send cart status
- Transfer verification results
- Maintain communication between mobile application and cart

### Arduino UNO

The Arduino acts as the hardware controller.

Responsibilities:

- Control LCD
- Control LED
- Control buzzer
- Process hardware events
- Interface with future sensors
- Process future weight-sensor data
- Communicate with ESP8266

This separation allows additional sensors to be added later without redesigning the complete system.

---

# Product Addition

```text
User scans barcode
        ↓
Product identified
        ↓
App displays:

Coca-Cola
₹40
Expected Weight: 500g
        ↓
"Place product in cart"
        ↓
Verification
        ↓
PASS
        ↓
Product Added ✓
        ↓
Arduino → LCD + LED + Buzzer
        ↓
Cart total updated
```

### Cart Display

```text
PRODUCT ADDED ✓

Coca-Cola
Weight: 500g
Price: ₹40
```

---

# Product Removal

Product removal uses a two-step verification process.

```text
User selects "Remove"
        ↓
App asks user to physically
remove the product
        ↓
Pending Removal
        ↓
Verification
        ↓
       PASS
        │
        ▼
Product removed
        │
        ▼
Cart total updated
```

If verification fails:

```text
Verification Failed
        ↓
Product remains in cart
        ↓
Price remains in total
        ↓
User is instructed to
go to checkout counter
```

The system never removes the product digitally until the physical removal has been verified.

---

# Phase 1

## Objective

Build a working prototype of the Smart Cart system without physical weight sensors.

Weight verification will be simulated through the application/backend while keeping the architecture ready for real hardware integration.

## Phase 1 Features

### Mobile Application

- User registration/login
- Scan Cart QR
- Connect to a specific Cart ID
- Product barcode scanner
- Product database
- Product name
- Product price
- Expected product weight
- Add product
- Remove product
- Cart summary
- Total price calculation
- Verification status
- Checkout
- Checkout-counter warning

### Cart Hardware

- Arduino UNO
- ESP8266 Wi-Fi module
- 16×2 LCD display
- LED
- Buzzer
- Breadboard
- Jumper wires
- USB/power supply
- Unique QR code for each cart

---

# Phase 1 Verification

No physical weight sensor is required in Phase 1.

Instead:

```text
Product Expected Weight
          ↓
Software Verification
          ↓
    ┌─────┴─────┐
    │           │
   PASS        FAIL
    │           │
    ▼           ▼
Add/Remove   Counter
 Product      Prompt
```

The software should be designed so that the simulated verification function can later be replaced by real load-cell measurements.

---

# Phase 1 Add Flow

```text
1. Scan Cart QR
2. Scan Product Barcode
3. Retrieve Product Information
4. Display Product Name / Price / Weight
5. Ask User to Place Product in Cart
6. Run Simulated Verification
7. If PASS → Add Product
8. Update LCD
9. Trigger LED + Buzzer
10. Update Mobile Cart
```

---

# Phase 1 Remove Flow

```text
1. Select Product
2. Tap Remove
3. Ask User to Remove Product Physically
4. Enter Pending Removal State
5. Run Simulated Verification

          PASS
            ↓
      Remove Product
            ↓
      Update Cart Total

          FAIL
            ↓
     Keep Product
            ↓
   Keep Price in Bill
            ↓
 "Proceed to Checkout Counter"
```

---

# LCD Display States

| State | Display |
|---|---|
| Idle | `SMART CART / Scan Product` |
| Verification | `VERIFYING / Please Wait...` |
| Product Added | `PRODUCT ADDED / Product Name / Weight` |
| Product Removed | `PRODUCT REMOVED / Product Name / Weight` |
| Verification Failed | `VERIFICATION FAILED / Checkout Counter` |
| Checkout | `CHECKOUT COMPLETE / Thank You` |

---

# LED & Buzzer

### Successful Addition

```text
LED → ON
Buzzer → Short Beep
LCD → Product Added
```

### Successful Removal

```text
LED → ON
Buzzer → Short Beep
LCD → Product Removed
```

### Failed Verification

```text
LED → Error indication
Buzzer → Warning beep
LCD → Verification Failed
```

---

# Product Database

Each product should contain:

```text
Product ID
Barcode
Product Name
Price
Expected Weight
Category
```

Example:

```json
{
  "productId": "P001",
  "barcode": "8901234567890",
  "name": "Coca-Cola",
  "price": 40,
  "expectedWeight": 500,
  "category": "Beverages"
}
```

---

# Cart Data

Each cart should have:

```text
Cart ID
Current User/Session
Products
Quantities
Total
Verification Status
Checkout Status
```

Example:

```json
{
  "cartId": "CART-001",
  "sessionId": "SESSION-001",
  "items": ["P001", "P002"],
  "total": 90,
  "status": "ACTIVE"
}
```

---

# Recommended Phase 1 Technology

| Component | Technology |
|---|---|
| Mobile App | Flutter / React Native |
| Backend | Firebase / Node.js |
| Database | Firestore / PostgreSQL |
| Barcode Scanner | Mobile Camera |
| Cart Communication | ESP8266 |
| Hardware Controller | Arduino UNO |
| Display | 16×2 LCD |
| Feedback | LED + Buzzer |
| Cart Identification | Unique QR Code |

---

# Why QR Instead of RFID?

The original concept used RFID for product identification.

The updated system uses:

```text
Cart → QR
Product → Mobile Barcode
```

This reduces hardware complexity and makes the first prototype significantly faster to implement.

The RFID reader is therefore **not required for the current Phase 1 prototype**.

---

# Phase Roadmap

## Phase 1 — Smart Cart MVP

- QR Cart Connection
- Mobile Barcode Scanning
- Product Database
- Digital Cart
- Simulated Weight Verification
- LCD Display
- LED
- Buzzer
- Add/Remove Verification
- Checkout
- Checkout Counter Escalation

## Phase 2 — Physical Verification

Add:

- Load Cell
- HX711
- Actual weight measurement
- Real-time weight verification
- Arduino sensor processing

```text
Mobile App
    ↓
ESP8266
    ↓
Arduino
    ↓
HX711
    ↓
Load Cell
```

## Phase 3 — Camera Intelligence

Add:

- Camera
- Object Detection
- Product Recognition
- Visual verification

The final verification system becomes:

```text
Barcode Identity
       +
Weight Verification
       +
Object Detection
       ↓
Smart Product Verification
```

---

# Phase 1 Success Criteria

- [ ] User can scan a cart QR
- [ ] User can connect to a Cart ID
- [ ] User can scan a product barcode
- [ ] Product information is displayed
- [ ] Product can be added after simulated verification
- [ ] LCD displays product name and weight
- [ ] LED provides feedback
- [ ] Buzzer provides feedback
- [ ] User can request product removal
- [ ] Removal requires verification
- [ ] Failed removal keeps the product in the bill
- [ ] Failed verification shows the checkout-counter prompt
- [ ] Cart total updates correctly
- [ ] User can complete checkout

---

# Phase 1 Demo

```text
Scan Cart QR
     ↓
Scan Coca-Cola
     ↓
Place Product
     ↓
Verification PASS
     ↓
LCD: Coca-Cola / 500g
     ↓
LED + Buzzer
     ↓
Cart: ₹40
     ↓
Scan another product
     ↓
Remove a product
     ↓
Verification PASS
     ↓
Cart updated
     ↓
Demonstrate Verification FAIL
     ↓
"Proceed to Checkout Counter"
     ↓
Final Checkout
```

---

# Future Vision

The final Smart Cart will combine:

**Mobile Barcode Scanning + Cart Connectivity + Real Weight Verification + Camera Object Detection**

to create a faster and more reliable self-shopping experience while retaining a checkout-counter fallback for cases that cannot be automatically verified.
