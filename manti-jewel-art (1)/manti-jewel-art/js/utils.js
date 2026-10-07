// ============================================================
// utils.js — Shared Utilities + Demo Data
// ============================================================

function showToast(msg, type='') {
  let wrap = document.getElementById('toast-container');
  if (!wrap) { wrap = document.createElement('div'); wrap.id='toast-container'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast-item' + (type==='err' ? ' err' : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), 3400);
}

function formatPrice(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

function esc(str) {
  return String(str??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function debounce(fn, ms=300) {
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

function catLabel(cat) {
  return {gold:'Gold',silver:'Silver',custom:'Custom'}[cat] || cat || '';
}

function buildWhatsAppURL(items, total, name, address, phone) {
  const num = window.WHATSAPP_NUMBER || '919092727655';
  let msg = `MANTI jewel art - New Order\n`;
  msg += `----------------------------\n`;
  msg += `Name: ${name}\n`;
  msg += `Phone: ${phone}\n`;
  let finalAddress = address;
  const googleMapsMatch = address.match(/https?:\/\/www\.google\.com\/maps[^\s]*/i);
  if (googleMapsMatch) {
    finalAddress = `View location at Google Maps`; 
    msg += `Address: ${finalAddress}\n`;
    msg += `Map: ${googleMapsMatch[0]}\n\n`;
  } else {
    msg += `Address: ${address}\n\n`;
  }
  msg += `Order details:\n`;
  items.forEach((item,i) => {
    msg += `\n${i+1}. ${item.name} (${item.productId || item.id || 'N/A'})\n`;
    msg += `   Category: ${catLabel(item.category)}${item.purity?` | ${item.purity}`:''}${item.weight?` | ${item.weight}g`:''}\n`;
    if (item.imageUrl) msg += `   Image: ${item.imageUrl}\n`;
    if (item.basePrice !== undefined) msg += `   Base: ${formatPrice(item.basePrice)}\n`;
    if (item.makingChargesPct !== undefined) msg += `   Making: ${item.makingChargesPct}% (${formatPrice(item.makingCharges || 0)})\n`;
    else if (item.makingCharges !== undefined) msg += `   Making: ${formatPrice(item.makingCharges)}\n`;
    if (item.gst !== undefined) msg += `   GST: ${item.gst}%\n`;
    msg += `   Unit Total: ${formatPrice(item.price)}\n`;
    if (item.selectedSize) msg += `   Size: ${item.selectedSize}\n`;
    msg += `   Qty: ${item.quantity}\n`;
    msg += `   Subtotal: ${formatPrice(item.price * item.quantity)}\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *Total: ${formatPrice(total)}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Please confirm this order. Thank you! ✨\n`;
  msg += `\n_Ordered via MANTI jewel art_`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

function buildCustomerConfirmationWhatsAppURL(orderId, items, total, name, address, phone) {
  let num = (phone || '').replace(/\D/g, '');
  if (!num) return null;
  if (num.length === 10) num = '91' + num;
  if (num.length < 10) return null;

  let msg = `Hi ${name || 'Customer'},\n`;
  if (orderId) msg += `Your order (${orderId}) has been confirmed.\n`;
  msg += `\nOrder summary:`;
  msg += `\nTotal: ${formatPrice(total)}\n`;
  if (address) msg += `\nDelivery address:\n${address}\n`;
  msg += `\nItems:`;
  items.forEach((item, index) => {
    msg += `\n${index + 1}. ${item.name || 'Item'}${item.quantity ? ` x${item.quantity}` : ''}`;
    if (item.price !== undefined) msg += ` - ${formatPrice(item.price)}`;
    if (item.selectedSize) msg += ` (${item.selectedSize})`;
  });
  msg += `\n\nThank you for shopping with MANTI jewel art!`;

  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

async function saveOrderHistory(user, items, total, address, phone, customerName, email, note) {
  const savedName = (customerName || '').toString().trim() || user?.displayName || '';
  const orderData = {
    userId: user?.uid || null,
    customerName: savedName,
    userEmail: email || user?.email || '',
    phone: phone || '',
    address: address || '',
    note: note || '',
    items: (items || []).map(item => {
      const quantity = item.quantity || 1;
      const unitTotal = item.unitTotal ?? item.price ?? item.total ?? 0;
      const makingPct = item.makingChargesPct ?? item.makingChargePct ?? null;
      const gstPct = item.gst ?? item.gstPct ?? 0;
      const rawBase = item.basePrice;
      let basePrice = rawBase;
      const rawMaking = item.makingCharges ?? 0;
      const rawGstAmt = item.gstAmt ?? 0;

      if (basePrice === undefined || basePrice === null) {
        if (unitTotal && (rawMaking || rawGstAmt)) {
          basePrice = Math.max(0, unitTotal - rawMaking - rawGstAmt);
        } else if (unitTotal && makingPct !== null && gstPct !== null) {
          const factor = 1 + makingPct / 100 + gstPct / 100;
          basePrice = factor > 0 ? Math.round(unitTotal / factor) : 0;
        } else {
          basePrice = 0;
        }
      }

      const makingCharges = rawMaking || (makingPct !== null ? Math.round(basePrice * makingPct / 100) : 0);
      const gstAmt = rawGstAmt || Math.round(basePrice * gstPct / 100);
      const price = unitTotal;
      const lineTotal = item.lineTotal ?? Math.round(price * quantity);

      return {
        productId: item.productId || item.id || item.docId || null,
        docId: item.docId || item.productId || item.id || null,
        name: item.name || '',
        imageUrl: item.imageUrl || item.image || item.imageSrc || '',
        image: item.imageUrl || item.image || item.imageSrc || '',
        category: item.category || '',
        purity: item.purity || '',
        weight: item.weight || '',
        quantity,
        price,
        unitTotal,
        lineTotal,
        selectedSize: item.selectedSize || null,
        basePrice,
        makingChargesPct: makingPct ?? null,
        makingCharges,
        gst: gstPct,
        gstAmt
      };
    }),
    total: total || 0,
    grandTotal: total || 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'pending'
  };
  try {
    const orderRef = await db.collection('orders').add(orderData);
    const orderWithId = { ...orderData, orderId: orderRef.id };
    sendAdminNotificationEmail(orderWithId);
    sendAdminTelegramNotification(orderWithId);
  } catch (err) {
    console.error('Failed to save order history', err);
  }
}

function sendOrderConfirmationEmail(to, name, items, total, address, phone) {
  if (!to) return;
  const subject = `MANTI jewel art - Order Confirmation`;
  let body = `Hello ${name || 'Customer'},\n\n`;
  body += `Thank you for your order from MANTI jewel art. Your order is received and will be processed shortly.\n\n`;
  body += `Order summary:\n`;
  items.forEach((item, i) => {
    body += `${i+1}. ${item.name} (${item.productId || item.id || 'N/A'})\n`;
    if (item.quantity !== undefined) body += `   Quantity: ${item.quantity}\n`;
    if (item.price !== undefined) body += `   Unit price: ${formatPrice(item.price)}\n`;
    if (item.selectedSize) body += `   Size: ${item.selectedSize}\n`;
  });
  body += `\nTotal: ${formatPrice(total)}\n`;
  body += `\nDelivery address:\n${address || 'N/A'}\n`;
  body += `Phone: ${phone || 'N/A'}\n`;
  body += `\nWe will update you as soon as your order is confirmed.\n\nThanks again!\nMANTI jewel art team`;
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, '_blank');
}

function sendAdminNotificationEmail(orderData) {
  const to = window.ADMIN_EMAIL || '';
  const sendEmailUrl = window.SEND_EMAIL_URL || '';
  if (!to || !sendEmailUrl) {
    console.warn('Admin notification email skipped: missing ADMIN_EMAIL or SEND_EMAIL_URL', { to, sendEmailUrl });
    return;
  }

  const itemsSummary = (orderData.items || []).map((item, index) => {
    let line = `${index + 1}. ${item.name || 'Item'} x${item.quantity || 1}`;
    if (item.price !== undefined) line += ` - ${formatPrice(item.price)}`;
    if (item.selectedSize) line += ` | Size: ${item.selectedSize}`;
    return line;
  }).join('\n');

  const templateParams = {
    order_id: orderData.orderId || '',
    customer_name: orderData.customerName || 'N/A',
    customer_email: orderData.userEmail || 'N/A',
    customer_phone: orderData.phone || 'N/A',
    customer_address: orderData.address || 'N/A',
    order_total: formatPrice(orderData.total || orderData.grandTotal || 0),
    order_items: itemsSummary,
    order_note: orderData.note || ''
  };

  const payload = {
    to,
    subject: `MANTI jewel art - New order received`,
    templateParams
  };

  fetch(sendEmailUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(response => {
    if (!response.ok) throw new Error(`Send email failed (${response.status}: ${response.statusText})`);
    return response.json();
  })
  .then(data => console.log('Admin notification email sent', data))
  .catch(err => console.error('Admin notification email failed', err));
}

function buildTelegramMessage(orderData) {
  const name = orderData.customerName || orderData.userEmail || 'New customer';
  const total = formatPrice(orderData.total || orderData.grandTotal || 0);
  const orderId = orderData.orderId ? `Order ID: ${orderData.orderId}\n` : '';
  const itemCount = (orderData.items || []).length;
  return `🚨 New Order Received!\n${orderId}Customer: ${name}\nPhone: ${orderData.phone || 'N/A'}\nTotal: ${total}\nItems: ${itemCount}\n\nPlease review the order in the admin panel.`;
}

function sendAdminTelegramNotification(orderData) {
  const botToken = window.TELEGRAM_BOT_TOKEN || '';
  const chatId = window.TELEGRAM_CHAT_ID || '';
  if (!botToken || !chatId) {
    console.warn('Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID', { botToken, chatId });
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: buildTelegramMessage(orderData),
    parse_mode: 'HTML'
  };

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(response => {
      if (!response.ok) throw new Error(`Telegram notification failed (${response.status}: ${response.statusText})`);
      return response.json();
    })
    .then(data => console.log('Admin Telegram notification sent', data))
    .catch(err => console.error('Admin Telegram notification failed', err));
}

// ── Logo SVG string (reusable) ─────────────────────────────
const LOGO_SVG = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4C20 4 12 10 12 18C12 22.418 15.582 26 20 26C24.418 26 28 22.418 28 18C28 10 20 4 20 4Z" fill="#1a6b45" opacity=".9"/>
  <path d="M20 4C20 4 28 10 28 18C28 22.418 24.418 26 20 26" fill="#145236"/>
  <path d="M8 20C8 20 10 28 20 30C30 28 32 20 32 20" stroke="#c8922a" stroke-width="2" stroke-linecap="round"/>
  <circle cx="20" cy="18" r="4" fill="white" opacity=".8"/>
  <path d="M14 32C14 32 17 36 20 36C23 36 26 32 26 32" stroke="#1a6b45" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// ── Demo products ──────────────────────────────────────────
const DEMO_PRODUCTS = [
  { id:'p001', name:'Aquamarine Stacking Ring', price:21700, category:'gold', imageUrl:'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=80', description:'Our simple gemstone stacker is sweet on its own or in multiples for a unique stack. Whether you choose minimalist or bold, this ring adapts perfectly.', inStock:true, hasSizes:true, availableSizes:['4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0','8.5'], createdAt:new Date() },
  { id:'p002', name:'22K Bridal Gold Set', price:85000, category:'gold', imageUrl:'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&q=80', description:'Exquisite 22K gold bridal set with intricate traditional design. Includes necklace, earrings and bangles — perfect for weddings.', inStock:true, hasSizes:false, availableSizes:[], createdAt:new Date() },
  { id:'p003', name:'Diamond Pendant Necklace', price:48000, category:'gold', imageUrl:'https://images.unsplash.com/photo-1573408301185-9519f94816b5?w=600&q=80', description:'Stunning diamond pendant set in 18K white gold with a matching chain. Each stone is independently certified.', inStock:true, hasSizes:false, availableSizes:[], createdAt:new Date() },
  { id:'p004', name:'Sterling Silver Bangles Set', price:3500, category:'silver', imageUrl:'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80', description:'Set of 6 handcrafted sterling silver bangles with geometric patterns. Lightweight and perfect for daily wear.', inStock:true, hasSizes:true, availableSizes:['2.2','2.4','2.6','2.8','3.0'], createdAt:new Date() },
  { id:'p005', name:'Custom Name Gold Bracelet', price:8500, category:'custom', imageUrl:'https://images.unsplash.com/photo-1596944924616-7b38e7cfac36?w=600&q=80', description:'Personalized gold bracelet with your name in elegant calligraphy. A perfect gift for any occasion — unique and lasting.', inStock:true, hasSizes:true, availableSizes:['S','M','L','XL'], createdAt:new Date() },
  { id:'p006', name:'Temple Gold Jhumka Earrings', price:12000, category:'gold', imageUrl:'https://images.unsplash.com/photo-1635767798638-3665a0a107fc?w=600&q=80', description:'Traditional temple gold earrings with divine motifs. Handcrafted by master artisans using ancient goldsmithing techniques.', inStock:true, hasSizes:false, availableSizes:[], createdAt:new Date() },
  { id:'p007', name:'Silver Peacock Pendant', price:2200, category:'silver', imageUrl:'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80', description:'Delicate silver pendant featuring an intricate peacock with vibrant enamel work. Comes with an 18-inch chain.', inStock:false, hasSizes:false, availableSizes:[], createdAt:new Date() },
  { id:'p008', name:'Couple Engraved Ring Set', price:15000, category:'custom', imageUrl:'https://images.unsplash.com/photo-1589128777073-263566ae57e4?w=600&q=80', description:'Beautiful matching couple rings with custom date and initial engraving. Available in gold and silver.', inStock:true, hasSizes:true, availableSizes:['4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0','8.5','9.0'], createdAt:new Date() },
];

async function seedDemoData() {
  const snap = await db.collection('products').limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  DEMO_PRODUCTS.forEach(p => {
    const ref = db.collection('products').doc(p.id);
    batch.set(ref, { ...p, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
}

window.showToast            = showToast;
window.formatPrice          = formatPrice;
window.esc                  = esc;
window.debounce             = debounce;
window.catLabel             = catLabel;
window.buildWhatsAppURL     = buildWhatsAppURL;
window.saveOrderHistory     = saveOrderHistory;
window.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
window.sendAdminNotificationEmail = sendAdminNotificationEmail;
window.LOGO_SVG             = LOGO_SVG;
window.DEMO_PRODUCTS        = DEMO_PRODUCTS;
window.seedDemoData         = seedDemoData;



