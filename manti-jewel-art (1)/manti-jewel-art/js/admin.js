// ============================================================
// admin.js — Admin Dashboard Logic
// ============================================================
let allProducts=[],allOrders=[],editingId=null,deleteTargetId=null,deleteTargetType='product',productSizes=[],unsubProducts=null,unsubActiveUsers=null,unsubOrders=null,globalPricing={goldPrice:0,silverPrice:0,makingCharges:0,gst:0};

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('adminDateBadge').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  auth.onAuthStateChanged(user=>{
    if(user&&user.email===ADMIN_EMAIL){ showDash(user); }
    else if(user){ showGateErr('Access denied. Not an admin account.'); auth.signOut(); }
    else { showGate(); }
  });
  setupLoginForm(); setupTabs(); setupDeleteModal();
  document.getElementById('sizeInp')?.addEventListener('keydown',e=>{ if(e.key==='Enter'){e.preventDefault();addSize();} });
  document.getElementById('saveBtn')?.addEventListener('click', saveProduct);
  document.getElementById('cancelBtn')?.addEventListener('click', ()=>{ switchTab('products'); });
});

function showGate(){ document.getElementById('adminLoginPage').style.display='flex'; document.getElementById('adminDashboard').style.display='none'; }
function showGateErr(msg){ const e=document.getElementById('gate-err'); e.textContent=msg; e.classList.add('show'); }

function generateProductId(){
  const el = document.getElementById('pId');
  if(!el) return;
  const id = `MANTI-${Math.floor(100000 + Math.random() * 900000)}-${Date.now().toString().slice(-5)}`;
  el.value = id;
  showToast(`Product ID generated: ${id}`);
}
window.generateProductId = generateProductId;

function showDash(user){
  document.getElementById('adminLoginPage').style.display='none';
  document.getElementById('adminDashboard').style.display='block';
  const em=document.getElementById('sidebarEmail'); if(em) em.textContent=user.email;
  const av=document.getElementById('sidebarAvatar'); if(av) av.textContent=(user.email||'A').charAt(0).toUpperCase();
  // Seed demo data if collection is empty, then listen
  seedDemoData().catch(()=>{}).finally(()=>{ listenProducts(); });
  loadPromoSettings();
  loadPricingSettings();
  listenOrders();
  document.getElementById('savePromoBtn')?.addEventListener('click', savePromoSettings);
  document.getElementById('savePricingBtn')?.addEventListener('click', savePricingSettings);
  listenActiveUsers();
  // Initialize Customer Details feature with current user
  cdSetCurrentUser(user);
}

function loadPromoSettings(){
  db.collection('settings').doc('promo').get().then(doc=>{
    if(!doc.exists) return;
    const data=doc.data();
    if(data){
      document.getElementById('promoCode').value=data.code||'';
      document.getElementById('promoTitleInput').value=data.title||'';
      document.getElementById('promoText').value=data.text||'';
    }
  }).catch(err=>{ console.error('Failed to load promo settings', err); });
}

function listenActiveUsers(){
  if(unsubActiveUsers) unsubActiveUsers();
  unsubActiveUsers = db.collection('activeUsers').onSnapshot(snap => {
    const count = snap.size;
    document.getElementById('stActiveUsers').textContent = count;
  }, e => console.error('Active users listener failed', e));
}

async function savePromoSettings(){
  const code=document.getElementById('promoCode').value.trim();
  const title=document.getElementById('promoTitleInput').value.trim();
  const text=document.getElementById('promoText').value.trim();
  const errEl=document.getElementById('promoFormErr'); errEl.classList.remove('show'); errEl.textContent='';
  if(!code||!title||!text){ errEl.textContent='All fields are required.'; errEl.classList.add('show'); return; }
  try{
    await db.collection('settings').doc('promo').set({code,title,text,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    showToast('Promo settings saved.');
  }catch(err){ console.error(err); errEl.textContent='Save failed: '+err.message; errEl.classList.add('show'); }
}
window.savePromoSettings=savePromoSettings;

function loadPricingSettings(){
  db.collection('settings').doc('pricing').get().then(doc=>{
    if(!doc.exists) return;
    const data=doc.data();
    if(!data) return;
    globalPricing = {
      goldPrice: Number(data.goldPrice) || 0,
      silverPrice: Number(data.silverPrice) || 0,
      makingCharges: Number(data.makingCharges) || 0,
      gst: Number(data.gst) || 0
    };
    document.getElementById('priceGold').value = globalPricing.goldPrice || '';
    document.getElementById('priceSilver').value = globalPricing.silverPrice || '';
    document.getElementById('priceMakingCharges').value = globalPricing.makingCharges || '';
    document.getElementById('priceGst').value = globalPricing.gst || '';
    applyPricingToProductForm();
  }).catch(err=>{ console.error('Failed to load pricing settings', err); });
}

async function savePricingSettings(){
  const goldPrice = parseFloat(document.getElementById('priceGold').value);
  const silverPrice = parseFloat(document.getElementById('priceSilver').value);
  const makingCharges = parseFloat(document.getElementById('priceMakingCharges').value);
  const gst = parseFloat(document.getElementById('priceGst').value);
  const errEl=document.getElementById('pricingFormErr'); errEl.classList.remove('show'); errEl.textContent='';
  if(!Number.isFinite(goldPrice) || !Number.isFinite(silverPrice) || !Number.isFinite(makingCharges) || !Number.isFinite(gst) || goldPrice<=0 || silverPrice<=0 || makingCharges<0 || gst<0){ errEl.textContent='Enter valid pricing values.'; errEl.classList.add('show'); return; }
  const btn=document.getElementById('savePricingBtn'); btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Saving…';
  try{
    await db.collection('settings').doc('pricing').set({
      goldPrice, silverPrice, makingCharges, gst,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    globalPricing = { goldPrice, silverPrice, makingCharges, gst };
    await updateAllProductsPricing(goldPrice, silverPrice, makingCharges, gst);
    showToast('Pricing saved and product prices updated.');
    applyPricingToProductForm();
  }catch(err){ console.error('Failed to save pricing settings', err); errEl.textContent='Save failed: '+err.message; errEl.classList.add('show'); }
  finally{ btn.disabled=false; btn.innerHTML='<i class="fa fa-save"></i> Save Pricing Settings'; }
}

async function updateAllProductsPricing(goldPrice, silverPrice, makingCharges, gst){
  const snap = await db.collection('products').get();
  if(snap.empty) return;
  let batch = db.batch();
  let opCount = 0;
  const commits = [];
  snap.docs.forEach(doc=>{
    const data = doc.data();
    const updates = { makingCharges, gst };
    if(data.category==='gold') updates.price = goldPrice;
    else if(data.category==='silver') updates.price = silverPrice;
    batch.update(doc.ref, updates);
    opCount += 1;
    if(opCount === 450){ commits.push(batch.commit()); batch = db.batch(); opCount = 0; }
  });
  if(opCount > 0) commits.push(batch.commit());
  await Promise.all(commits);
}

function getGlobalProductPrice(category, purity){
  if(!globalPricing) return null;
  if(category==='gold' && globalPricing.goldPrice > 0){
    const purityFactors = {
      '24K': 1,
      '22K': 0.917,
      '18K': 0.75,
      '14K': 0.582,
      '9K': 0.375
    };
    const factor = purityFactors[purity] ?? 1;
    return Math.round(globalPricing.goldPrice * factor * 100) / 100;
  }
  if(category==='silver' && globalPricing.silverPrice > 0){
    const purityFactors = {
      'Pure Silver': 1,
      'Silver': 0.925,
      '925 Silver': 0.925,
      'Silver 925': 0.925,
      'Sterling Silver': 0.925,
      '925': 0.925
    };
    const factor = purityFactors[purity] ?? 1;
    return Math.round(globalPricing.silverPrice * factor * 100) / 100;
  }
  return null;
}

function applyPricingToProductForm(){
  if(!globalPricing) return;
  const priceEl = document.getElementById('pPrice');
  const makingEl = document.getElementById('pMakingCharges');
  const gstEl = document.getElementById('pGst');
  if(makingEl && Number.isFinite(globalPricing.makingCharges)){
    makingEl.value = globalPricing.makingCharges;
  }
  if(gstEl && Number.isFinite(globalPricing.gst)){
    gstEl.value = globalPricing.gst;
  }
  const cat = document.getElementById('pCat')?.value;
  if(!priceEl || !cat) return;
  const purity = document.getElementById('pPurity')?.value;
  const price = getGlobalProductPrice(cat, purity);
  if(price !== null){ priceEl.value = price; }
}

function setupLoginForm(){
  document.getElementById('adminLoginForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=document.getElementById('gateEmail').value.trim(), pass=document.getElementById('gatePassword').value;
    const btn=document.getElementById('gateBtn'), errEl=document.getElementById('gate-err');
    errEl.classList.remove('show');
    if(email!==ADMIN_EMAIL){ showGateErr('Access denied. Invalid admin email.'); return; }
    btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Verifying…';
    try{ await auth.signInWithEmailAndPassword(email,pass); }
    catch(err){ const m={'auth/wrong-password':'Incorrect password.','auth/user-not-found':'Admin account not found.','auth/invalid-credential':'Invalid credentials.','auth/too-many-requests':'Too many attempts.'}; showGateErr(m[err.code]||'Login failed.'); }
    finally{ btn.disabled=false; btn.innerHTML='<i class="fa fa-sign-in-alt"></i> Enter Dashboard'; }
  });
}

function updatePurityOptions(){
  const cat=document.getElementById('pCat')?.value;
  const purityEl=document.getElementById('pPurity');
  if(!purityEl) return;
  if(cat==='gold'){
    purityEl.innerHTML=`<option value="">Select…</option><option value="22K">22K</option><option value="24K">24K</option><option value="18K">18K</option><option value="14K">14K</option><option value="9K">9K</option><option value="Other">Other</option>`;
  }else if(cat==='silver'){
    purityEl.innerHTML=`<option value="">Select…</option><option value="Pure Silver">Pure Silver</option><option value="Silver">Silver</option><option value="Other">Other</option>`;
  }else{
    purityEl.innerHTML=`<option value="">Select…</option><option value="22K">22K</option><option value="24K">24K</option><option value="18K">18K</option><option value="14K">14K</option><option value="9K">9K</option><option value="Pure Silver">Pure Silver</option><option value="Other">Other</option>`;
  }
  applyPricingToProductForm();
}
window.updatePurityOptions=updatePurityOptions;

function togglePw(btn){ const inp=btn.closest('.input-wrap').querySelector('input'); const t=inp.type==='text'; inp.type=t?'password':'text'; btn.innerHTML=t?'<i class="fa fa-eye"></i>':'<i class="fa fa-eye-slash"></i>'; }
window.togglePw=togglePw;

function adminLogout(){ if(unsubProducts)unsubProducts(); auth.signOut().then(()=>{ showToast('Logged out.'); showGate(); }); }
window.adminLogout=adminLogout;

// ── LISTEN ────────────────────────────────────────────────────
function listenProducts(){
  if(unsubProducts)unsubProducts();
  // Show loading state
  const tb=document.getElementById('productsTbody');
  if(tb) tb.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:36px"><div class="spinner"></div></td></tr>`;
  const rb=document.getElementById('recentTbody');
  if(rb) rb.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:28px"><div class="spinner"></div></td></tr>`;

  // Try with orderBy first, fallback to unordered if index missing
  const tryListen=(ordered)=>{
    const query = ordered
      ? db.collection('products').orderBy('createdAt','desc')
      : db.collection('products');
    unsubProducts = query.onSnapshot(snap=>{
      allProducts=snap.docs.map(d=>({id:d.id,...d.data()}));
      // Sort client-side as fallback
      if(!ordered) allProducts.sort((a,b)=>{ const ta=a.createdAt?.toMillis?.()||0, tb=b.createdAt?.toMillis?.()||0; return tb-ta; });
      updateStats(); renderTable(allProducts); renderRecent();
    }, e=>{
      console.error('Products listener error:', e);
      if(ordered && (e.code==='failed-precondition'||e.message?.includes('index'))){
        console.warn('Index missing, falling back to unordered query');
        tryListen(false);
      } else {
        showToast('Failed to load products.','err');
        if(tb) tb.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)"><i class="fa fa-exclamation-circle" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.5"></i>Failed to load products.<br><small style="font-size:.75rem">Check console for details.</small></td></tr>`;
      }
    });
  };
  tryListen(true);
}

function updateStats(){
  const p=allProducts;
  document.getElementById('stTotal').textContent=p.length;
  document.getElementById('stGold').textContent=p.filter(x=>x.category==='gold').length;
  document.getElementById('stSilver').textContent=p.filter(x=>x.category==='silver').length;
  document.getElementById('stOut').textContent=p.filter(x=>!x.inStock).length;
}

function renderTable(list){
  const tb=document.getElementById('productsTbody'); if(!tb) return;
  if(!list.length){ tb.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No products found. <button onclick="switchTab('add')" style="color:var(--gold2);font-weight:600;background:none;border:none;cursor:pointer">Add first product →</button></td></tr>`; return; }
  tb.innerHTML=list.map(p=>{
    const inStock=p.inStock!==false; const cb=p.category==='gold'?'badge-gold':p.category==='silver'?'badge-gray':'badge-green';
    return`<tr>
      <td><img class="atbl-img" src="${esc(p.imageUrl)}" onerror="this.src='https://placehold.co/52x52/f5f3f0/999'"/></td>
      <td><p class="atbl-name">${esc(p.name)}</p><p class="atbl-id">PID: ${esc(p.productId||p.id)}</p></td>
      <td><span class="badge ${cb}">${catLabel(p.category)}</span></td>
      <td><strong>${formatPrice(p.price)}</strong></td>
      <td><span class="badge ${inStock?'badge-green':'badge-red'}" style="cursor:pointer" title="Click to toggle" onclick="toggleStock('${p.id}',${inStock})">${inStock?'✓ In Stock':'✗ Out of Stock'}</span></td>
      <td>${p.hasSizes&&p.availableSizes?.length?`<span style="font-size:.78rem;color:var(--gold2);font-weight:600">${(p.availableSizes||[]).length} sizes</span>`:`<span style="color:var(--muted);font-size:.76rem">N/A</span>`}</td>
      <td><div style="display:flex;gap:6px"><button class="tbl-btn tbl-edit" onclick="editProduct('${p.id}')"><i class="fa fa-pen"></i> Edit</button><button class="tbl-btn tbl-del" onclick="confirmDelete('${p.id}')"><i class="fa fa-trash"></i></button></div></td>
    </tr>`;
  }).join('');
}

function renderRecent(){
  const tb=document.getElementById('recentTbody'); if(!tb) return;
  const list=allProducts.slice(0,6);
  if(!list.length){ tb.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--muted)">No products yet.</td></tr>`; return; }
  tb.innerHTML=list.map(p=>{
    const inStock=p.inStock!==false; const cb=p.category==='gold'?'badge-gold':p.category==='silver'?'badge-gray':'badge-green';
    return`<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><img class="atbl-img" src="${esc(p.imageUrl)}" onerror="this.src='https://placehold.co/52x52/f5f3f0/999'"/><div><p class="atbl-name">${esc(p.name)}</p><p class="atbl-id">PID: ${esc(p.productId||p.id)}</p></div></div></td>
      <td><span class="badge ${cb}">${catLabel(p.category)}</span></td>
      <td><strong>${formatPrice(p.price)}</strong></td>
      <td><span class="badge ${inStock?'badge-green':'badge-red'}">${inStock?'✓ In Stock':'✗ Out of Stock'}</span></td>
      <td><div style="display:flex;gap:6px"><button class="tbl-btn tbl-edit" onclick="editProduct('${p.id}')"><i class="fa fa-pen"></i> Edit</button><button class="tbl-btn tbl-del" onclick="confirmDelete('${p.id}')"><i class="fa fa-trash"></i></button></div></td>
    </tr>`;
  }).join('');
}

function listenOrders(){
  if(unsubOrders) unsubOrders();
  const tb=document.getElementById('ordersTbody');
  if(tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:36px"><div class="spinner"></div></td></tr>`;

  const tryListen = (ordered)=>{
    const query = ordered ? db.collection('orders').orderBy('createdAt','desc') : db.collection('orders');
    unsubOrders = query.onSnapshot(snap=>{
      allOrders = snap.docs.map(doc=>({id:doc.id,...doc.data()}));
      if(!ordered){
        allOrders.sort((a,b)=>{ const ta=a.createdAt?.toMillis?.()||0, tb=b.createdAt?.toMillis?.()||0; return tb-ta; });
      }
      renderOrdersTable(allOrders);
    }, err=>{
      console.error('Orders listener error:', err);
      if(ordered){
        console.warn('Collection orderBy failed, retrying without orderBy');
        tryListen(false);
        return;
      }
      if(tb) tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)"><i class="fa fa-exclamation-circle" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.5"></i>Failed to load orders.<br><small style="font-size:.75rem">Make sure Firestore rules allow access to the orders collection and refresh the page.</small></td></tr>`;
    });
  };

  tryListen(true);
}

function getOrderDisplayName(order){
  const name = (order.customerName || order.name || order.userName || '').toString().trim();
  if(name) return name;
  if(order.userEmail) return order.userEmail.split('@')[0];
  return 'Guest';
}

function getOrderStatusLabel(status){
  const key = (status||'pending').toString().trim().toLowerCase();
  return {
    pending: 'Pending',
    confirmed: 'Confirm',
    'payment completed': 'Payment Completed',
    processing: 'Processing',
    'ready to dispatch': 'Ready to Dispatch',
    delivered: 'Delivered'
  }[key] || status || 'Pending';
}

function normalizeOrderStatus(input){
  if(!input) return null;
  const key = input.toString().trim().toLowerCase();
  if(key==='confirm' || key==='confirmed') return 'confirmed';
  if(key==='payment completed' || key==='paymentcompleted' || key==='payment_completed') return 'payment completed';
  if(key==='processing') return 'processing';
  if(key==='ready to dispatch' || key==='readytodispatch' || key==='ready_to_dispatch') return 'ready to dispatch';
  if(key==='delivered') return 'delivered';
  return null;
}

function renderOrdersTable(list){
  updateOrderStats(list);
  const tb=document.getElementById('ordersTbody'); if(!tb) return;
  if(!list.length){ tb.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">No orders yet.</td></tr>`; return; }
  const groups = groupOrdersByDate(list);
  const rows = [];
  const addGroup = (label, items) => {
    if(!items.length) return;
    rows.push(`<tr class="orders-group-row"><td colspan="6"><strong>${label} (${items.length})</strong></td></tr>`);
    rows.push(...items.map(orderToRow));
  };
  addGroup('Today’s Orders', groups.today);
  addGroup('Yesterday’s Orders', groups.yesterday);
  addGroup('Earlier Orders', groups.earlier);
  tb.innerHTML = rows.join('');
}

function orderToRow(order){
  const status = order.status || 'pending';
  const label = getOrderStatusLabel(status);
  const badge = status==='pending' ? 'badge-gold' : status==='confirmed' || status==='delivered' ? 'badge-green' : status==='payment completed' ? 'badge-blue' : 'badge-gray';
  const when = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : '–';
  const customer = esc(getOrderDisplayName(order));
  const emailInfo = order.userEmail ? esc(order.userEmail) : esc(order.address?.slice(0,24) || order.id || 'Order');
  const orderTotal = order.total ?? order.grandTotal ?? 0;
  return `
      <tr>
        <td>
          <button class="tbl-btn btn-outline btn-sm" style="padding:6px 10px;font-size:.82rem" onclick="showOrderDetails('${order.id}')">${customer}</button>
          <p class="atbl-id" style="margin-top:6px">${emailInfo}</p>
        </td>
        <td>${esc(order.phone || 'N/A')}</td>
        <td><strong>${formatPrice(orderTotal)}</strong></td>
        <td><span class="badge ${badge}">${esc(label)}</span></td>
        <td>${when}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
             <button class="tbl-btn tbl-edit" onclick="confirmOrder('${order.id}')"><i class="fa fa-check"></i> Confirm</button>
             <button class="tbl-btn tbl-edit" onclick="updateOrderStatus('${order.id}')"><i class="fa fa-edit"></i> Update Status</button>
             <button class="tbl-btn tbl-edit" onclick="sendOrderConfirmation('${order.id}')"><i class="fa fa-whatsapp"></i> Send WhatsApp</button>
             <button class="tbl-btn tbl-del" onclick="confirmDelete('${order.id}','order')"><i class="fa fa-trash"></i> Delete</button>
           </div></td>
      </tr>`;
}

function groupOrdersByDate(list){
  const today = [];
  const yesterday = [];
  const earlier = [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  list.forEach(order => {
    const created = order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt instanceof Date ? order.createdAt : null;
    if(!created){ earlier.push(order); return; }
    const orderDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    if(orderDay.getTime() === startOfToday.getTime()) {
      today.push(order);
    } else if(orderDay.getTime() === startOfYesterday.getTime()) {
      yesterday.push(order);
    } else {
      earlier.push(order);
    }
  });
  return { today, yesterday, earlier };
}

function updateOrderStats(list){
  const total = list.length;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  let todayCount = 0, yesterdayCount = 0, earlierCount = 0;
  list.forEach(order => {
    const created = order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt instanceof Date ? order.createdAt : null;
    if(!created){ earlierCount++; return; }
    const orderDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    if(orderDay.getTime() === startOfToday.getTime()) {
      todayCount += 1;
    } else if(orderDay.getTime() === startOfYesterday.getTime()) {
      yesterdayCount += 1;
    } else {
      earlierCount += 1;
    }
  });
  const totalEl = document.getElementById('ordersTotalCount');
  const todayEl = document.getElementById('ordersTodayCount');
  const yesterdayEl = document.getElementById('ordersYesterdayCount');
  const earlierEl = document.getElementById('ordersEarlierCount');
  if(totalEl) totalEl.textContent = total;
  if(todayEl) todayEl.textContent = todayCount;
  if(yesterdayEl) yesterdayEl.textContent = yesterdayCount;
  if(earlierEl) earlierEl.textContent = earlierCount;
}

function filterOrders(){
  const q = (document.getElementById('ordersSearch')?.value||'').trim().toLowerCase();
  if(!q){ renderOrdersTable(allOrders); return; }
  const filtered = allOrders.filter(o=>{
    return (o.customerName||'').toLowerCase().includes(q)
      || (o.phone||'').toLowerCase().includes(q)
      || (o.userEmail||'').toLowerCase().includes(q)
      || (o.id||'').toLowerCase().includes(q)
      || (o.address||'').toLowerCase().includes(q);
  });
  renderOrdersTable(filtered);
}

function showOrderDetails(orderId){
  const order = allOrders.find(o=>o.id===orderId);
  if(!order){ showToast('Order not found.','err'); return; }
  const customerName = getOrderDisplayName(order);
  const customerEmail = order.userEmail || order.email || 'N/A';
  const addressHtml = esc(order.address||'N/A').replace(/\n/g,'<br/>');
  const mapUrl = (order.address||'').match(/https?:\/\/www\.google\.com\/maps[^\s]*/i)?.[0] || '';
  const items = Array.isArray(order.items)?order.items:[];
  const itemSummaries = items.map(item=>{
    const productId = item.productId || item.id || item.docId || item.productCode || null;
    const productMatch = allProducts.find(p => p.productId === productId || p.id === productId || p.productId === item.docId || p.id === item.docId || p.name === item.name);
    const itemId = productId || productMatch?.productId || productMatch?.id || '—';
    const itemImage = item.imageUrl || item.image || item.imageSrc || productMatch?.imageUrl || '';
    const itemName = item.name || productMatch?.name || '—';
    const itemWeight = item.weight ?? item.grams ?? productMatch?.weight ?? '';
    const unitPrice = item.unitTotal ?? item.price ?? 0;
    const makingRate = item.makingChargesPct ?? item.makingChargePct ?? productMatch?.makingCharges ?? null;
    const gstRate = item.gst ?? item.gstPct ?? productMatch?.gst ?? null;
    let basePrice = item.basePrice;
    if (basePrice === undefined || basePrice === null) {
      if (unitPrice && makingRate !== null && gstRate !== null) {
        const factor = 1 + makingRate / 100 + gstRate / 100;
        basePrice = factor > 0 ? Math.round(unitPrice / factor) : 0;
      } else {
        basePrice = item.basePrice ?? productMatch?.price ?? 0;
      }
    }
    const makingAmount = item.makingCharges ?? (makingRate !== null ? Math.round(basePrice * makingRate / 100) : 0);
    const gstAmount = item.gstAmt ?? (gstRate !== null ? Math.round(basePrice * gstRate / 100) : 0);
    const unitTotal = item.unitTotal ?? item.price ?? (basePrice + makingAmount + gstAmount);
    const quantity = item.quantity || 1;
    const lineTotal = item.lineTotal ?? (unitTotal * quantity);
    const makingText = makingRate !== null ? `${esc(makingRate+'%')} (${formatPrice(makingAmount)})` : formatPrice(makingAmount);
    const gstText = gstRate !== null ? `${esc(gstRate+'%')} (${formatPrice(gstAmount)})` : formatPrice(gstAmount);
    return {
      name: itemName,
      id: itemId,
      image: itemImage,
      grams: itemWeight,
      basePrice,
      makingAmount,
      makingRate,
      makingText,
      gstAmount,
      gstRate,
      gstText,
      unitTotal,
      quantity,
      lineTotal
    };
  });
  const totals = itemSummaries.reduce((sum,item)=>({
    base: sum.base + item.basePrice * item.quantity,
    making: sum.making + item.makingAmount * item.quantity,
    gst: sum.gst + item.gstAmount * item.quantity,
    line: sum.line + item.lineTotal
  }), {base:0,making:0,gst:0,line:0});
  const customerDetails = `
    <div class="order-details-summary">
      <div class="order-details-card">
        <h4>Customer Details</h4>
        <div class="order-details-row"><span>Name:</span><span>${esc(customerName)}</span></div>
        <div class="order-details-row"><span>Phone:</span><span>${esc(order.phone||'N/A')}</span></div>
        <div class="order-details-row"><span>Email:</span><span>${esc(customerEmail)}</span></div>
        <div class="order-details-row"><span>Location:</span><span>${addressHtml}</span></div>
        ${mapUrl?`<div class="order-details-row"><span>Map:</span><span><a href="${esc(mapUrl)}" target="_blank" rel="noopener">Open map</a></span></div>`:''}
        <div class="order-details-row"><span>Order Note:</span><span>${esc(order.note||'None')}</span></div>
      </div>
      <div class="order-details-card">
        <h4>Order Info</h4>
        <div class="order-details-row"><span>Order ID:</span><span>${esc(order.id)}</span></div>
        <div class="order-details-row"><span>Status:</span><span>${esc(getOrderStatusLabel(order.status))}</span></div>
        ${order.dispatchDate?`<div class="order-details-row"><span>Dispatch Date:</span><span>${esc(order.dispatchDate)}</span></div>`:''}
        <div class="order-details-row"><span>Placed:</span><span>${order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}) : 'N/A'}</span></div>
        <div class="order-details-row"><span>Items:</span><span>${items.length}</span></div>
        <div class="order-details-row"><span>Grand Total:</span><span>${formatPrice(order.total ?? order.grandTotal ?? totals.line ?? 0)}</span></div>
      </div>
    </div>`;
  const productRows = itemSummaries.map(item=>`
      <tr>
        <td>${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" style="height:36px;width:36px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="openProductImage('${esc(item.image)}')" onerror="this.style.display='none'"/>` : '—'}</td>
        <td>${esc(item.name)}</td>
        <td>${esc(item.id)}</td>
        <td>${item.grams ? esc(item.grams + 'g') : '—'}</td>
        <td>${formatPrice(item.basePrice)}</td>
        <td>${item.makingText}</td>
        <td>${item.gstText}</td>
        <td>${item.quantity}</td>
        <td>${formatPrice(item.lineTotal)}</td>
      </tr>`).join('');
  const productDetails = `
    <div>
      <h4 style="margin-bottom:10px">Product Details</h4>
      <div class="admin-table-wrap">
        <table class="admin-table" style="font-size:.82rem">
          <thead><tr><th>Image</th><th>Product</th><th>Product ID</th><th>Grams</th><th>Base Price</th><th>Making Charge (%)</th><th>GST (%)</th><th>Qty</th><th>Line Total</th></tr></thead>
          <tbody>${productRows||'<tr><td colspan="9" style="text-align:center;color:var(--muted)">No items found</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  const modal = document.getElementById('orderDetailsModal');
  if(!modal) return;
  const content = modal.querySelector('.order-details-content');
  if(content) content.innerHTML = `${customerDetails}${productDetails}`;
  modal.classList.add('show');
}
window.showOrderDetails=showOrderDetails;

function openProductImage(imageUrl){
  if(!imageUrl) return;
  const modal = document.getElementById('imagePreviewModal');
  if(!modal) return;
  const img = modal.querySelector('img');
  if(img){ img.src = imageUrl; img.alt = 'Product image'; }
  modal.classList.add('show');
}
window.openProductImage=openProductImage;

async function confirmOrder(orderId){
  try{
    await db.collection('orders').doc(orderId).update({status:'confirmed', dispatchDate: firebase.firestore.FieldValue.delete(), updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    showToast('Order marked confirmed.');
  }catch(err){ console.error('Failed to confirm order:', err); showToast('Could not update order status.','err'); }
}

async function updateOrderStatus(orderId){
  const order = allOrders.find(o=>o.id===orderId);
  if(!order){ showToast('Order not found.','err'); return; }
  const modal = document.getElementById('statusModal');
  if(!modal) return;
  const select = document.getElementById('statusSelect');
  const dateGroup = document.getElementById('dispatchDateGroup');
  const dateInput = document.getElementById('dispatchDateInput');
  select.value = normalizeOrderStatus(order.status) || 'confirmed';
  dateInput.value = order.dispatchDate || '';
  dateGroup.style.display = (select.value==='processing' || select.value==='ready to dispatch') ? 'block' : 'none';
  document.getElementById('statusModalOrderId').value = orderId;
  modal.classList.add('show');
}

function toggleDispatchField(status){
  const dateGroup = document.getElementById('dispatchDateGroup');
  if(!dateGroup) return;
  dateGroup.style.display = (status==='processing' || status==='ready to dispatch') ? 'block' : 'none';
}

async function submitOrderStatusUpdate(){
  const orderId = document.getElementById('statusModalOrderId').value;
  if(!orderId){ showToast('Order not found.','err'); return; }
  const status = normalizeOrderStatus(document.getElementById('statusSelect').value);
  if(!status){ showToast('Invalid status selected.','err'); return; }
  const updates = { status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
  if(status==='processing' || status==='ready to dispatch'){
    const dateValue = document.getElementById('dispatchDateInput').value.trim();
    if(!dateValue){ showToast('Dispatch date is required for this status.','err'); return; }
    updates.dispatchDate = dateValue;
  } else {
    updates.dispatchDate = firebase.firestore.FieldValue.delete();
  }
  try{
    await db.collection('orders').doc(orderId).update(updates);
    document.getElementById('statusModal')?.classList.remove('show');
    showToast('Order status updated.');
  } catch(err){
    console.error('Failed to update order status:', err);
    showToast('Could not update order status.','err');
  }
}

function sendOrderConfirmation(orderId){
  const order = allOrders.find(o=>o.id===orderId);
  if(!order){ showToast('Order not found.','err'); return; }
  const items = Array.isArray(order.items) ? order.items : [];
  const name = order.customerName || 'Customer';
  const address = order.address || '';
  const phone = order.phone || '';
  const orderTotal = order.total ?? order.grandTotal ?? 0;
  if(!phone){
    showToast('No customer WhatsApp number available for this order.','err');
    return;
  }
  const url = buildCustomerConfirmationWhatsAppURL(order.id, items, orderTotal, name, address, phone);
  if(!url){
    showToast('Invalid customer phone number.','err');
    return;
  }
  window.open(url, '_blank');
  showToast('Opening WhatsApp to send confirmation.');

}

async function toggleStock(id, cur){
  try{ await db.collection('products').doc(id).update({inStock:!cur}); showToast(!cur?'✓ Marked In Stock':'✗ Marked Out of Stock'); }
  catch(e){ showToast('Failed.','err'); }
}
window.toggleStock=toggleStock;

// ── EDIT ──────────────────────────────────────────────────────
function editProduct(id){
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  editingId=id;
  document.getElementById('editId').value=id;
  document.getElementById('pName').value=p.name||'';
  document.getElementById('pPrice').value=p.price||'';
  const savedMaking = Number(p.makingCharges || 0);
  let editMaking = savedMaking;
  if (savedMaking > 100 && p.price > 0) {
    // old-style rupee-based entries. convert to percentage for edit mode.
    editMaking = Math.round((savedMaking / p.price) * 100 * 100) / 100;
  }
  document.getElementById('pMakingCharges').value=editMaking;
  document.getElementById('pGst').value=p.gst||'';
  document.getElementById('pWeight').value=p.weight||'';
  document.getElementById('pCat').value=p.category||'';
  // updatePurityOptions BEFORE setting purity so the dropdown has the right options
  updatePurityOptions();
  document.getElementById('pPurity').value=p.purity||'';
  if(globalPricing){
    if(globalPricing.makingCharges !== undefined) document.getElementById('pMakingCharges').value = globalPricing.makingCharges;
    if(globalPricing.gst !== undefined) document.getElementById('pGst').value = globalPricing.gst;
  }
  applyPricingToProductForm();
  document.getElementById('pStock').value=String(p.inStock!==false);
  document.getElementById('pDesc').value=p.description||'';
  document.getElementById('pUrl').value=p.imageUrl||'';
  document.getElementById('pId').value=p.productId || p.id || '';
  document.getElementById('pHasSizes').value=String(p.hasSizes||false);
  productSizes=[...(p.availableSizes||[])];
  livePreview(); toggleSizeMgr(); renderSizeTags();
  document.getElementById('formTitle').innerHTML='<i class="fa fa-pen" style="color:var(--gold2)"></i> Edit Product';
  document.getElementById('saveTxt').textContent='Update Product';
  // Switch tab directly without triggering resetForm
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(b=>b.classList.remove('active'));
  const addSection=document.getElementById('tab-add'); if(addSection) addSection.classList.add('active');
  const addBtn=document.querySelector('.admin-nav-item[data-tab="add"]'); if(addBtn) addBtn.classList.add('active');
  const t=document.getElementById('adminPageTitle'); if(t) t.textContent='Edit Product';
  window.scrollTo({top:0,behavior:'smooth'});
}
window.editProduct=editProduct;

// ── SAVE ──────────────────────────────────────────────────────
async function saveProduct(){
  console.log('Save button clicked');
  const name=document.getElementById('pName').value.trim(), rawPrice=parseFloat(document.getElementById('pPrice').value),
        formMakingPct=parseFloat(document.getElementById('pMakingCharges').value)||0,
        formGst=parseFloat(document.getElementById('pGst').value)||0,
        weight=parseFloat(document.getElementById('pWeight').value)||0,
        cat=document.getElementById('pCat').value, purity=document.getElementById('pPurity').value,
        inStock=document.getElementById('pStock').value==='true',
        imageUrl=document.getElementById('pUrl').value.trim(), desc=document.getElementById('pDesc').value.trim(),
        hasSizes=document.getElementById('pHasSizes').value==='true',
        productId=document.getElementById('pId').value.trim();
  let price = rawPrice;
  if(globalPricing){
    const computedPrice = getGlobalProductPrice(cat, purity);
    if(computedPrice !== null){ price = computedPrice; }
  }
  const makingPct = globalPricing ? globalPricing.makingCharges : formMakingPct;
  const gst = globalPricing ? globalPricing.gst : formGst;
  const makingCharges = makingPct;
  const errEl=document.getElementById('formErr'); errEl.classList.remove('show');

  let finalProductId = productId || `MANTI-${Math.floor(100000 + Math.random() * 900000)}-${Date.now().toString().slice(-5)}`;
  if(!name){errEl.textContent='Product name is required.';errEl.classList.add('show');return;}
  if(!price||price<=0){errEl.textContent='Enter a valid price.';errEl.classList.add('show');return;}
  if(!cat){errEl.textContent='Please select a category.';errEl.classList.add('show');return;}
  if(!imageUrl){errEl.textContent='Image URL is required.';errEl.classList.add('show');return;}
  if(!finalProductId){errEl.textContent='Product ID generation failed. Please retry.';errEl.classList.add('show');return;}
  const btn=document.getElementById('saveBtn'); btn.disabled=true;
  document.getElementById('saveTxt').textContent='Saving…';
  const data={name,price,makingCharges:makingPct,gst,weight,purity,category:cat,inStock,imageUrl,description:desc,hasSizes,availableSizes:hasSizes?productSizes:[],productId:finalProductId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  try{
    if(editingId){ await db.collection('products').doc(editingId).update(data); showToast('Product updated! ✓'); }
    else{
      const docRef = await db.collection('products').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      if(!productId){ await docRef.update({productId:docRef.id}); }
      showToast('Product added! ✨');
    }
    console.log('Product saved successfully');
    resetForm(); switchTab('products');
  }catch(err){ console.error('Save failed:', err); errEl.textContent='Save failed: '+err.message; errEl.classList.add('show'); }
  finally{ btn.disabled=false; document.getElementById('saveTxt').textContent='Save Product'; }
}

function resetForm(){
  editingId=null; productSizes=[];
  ['pName','pPrice','pMakingCharges','pGst','pWeight','pDesc','pUrl','pId','editId'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('pCat').value=''; document.getElementById('pPurity').value=''; document.getElementById('pStock').value='true'; document.getElementById('pHasSizes').value='false';
  document.getElementById('pMakingCharges').value = globalPricing.makingCharges || '';
  document.getElementById('pGst').value = globalPricing.gst || '';
  document.getElementById('formTitle').innerHTML='<i class="fa fa-plus-circle" style="color:var(--gold2)"></i> Add New Product';
  document.getElementById('saveTxt').textContent='Save Product';
  document.getElementById('formErr').classList.remove('show');
  document.getElementById('previewImg').style.display='none';
  document.getElementById('previewPh').style.display='block';
  document.getElementById('liveImgWrap').innerHTML='<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px"><i class="fa fa-image" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>Image preview</p>';
  document.getElementById('liveName').textContent='Product Name';
  document.getElementById('livePrice').textContent='₹0';
  document.getElementById('liveCat').textContent='Category';
  toggleSizeMgr(); renderSizeTags();
}

// ── IMAGE PREVIEW ─────────────────────────────────────────────
function livePreview(){
  const url=(document.getElementById('pUrl')?.value||'').trim();
  const img=document.getElementById('previewImg'), ph=document.getElementById('previewPh');
  const liveWrap=document.getElementById('liveImgWrap');
  if(url){
    img.src=url; img.style.display='block'; if(ph)ph.style.display='none';
    img.onerror=()=>{img.style.display='none';if(ph)ph.style.display='block';};
    liveWrap.innerHTML=`<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<p style=color:var(--muted);text-align:center;padding:20px;font-size:.8rem>Invalid URL</p>'"/>`;
  }else{
    img.style.display='none'; if(ph)ph.style.display='block';
    liveWrap.innerHTML='<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px"><i class="fa fa-image" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>Image preview</p>';
  }
  const name=document.getElementById('pName')?.value||'Product Name';
  const price=parseFloat(document.getElementById('pPrice')?.value)||0;
  const makingChargesPct=parseFloat(document.getElementById('pMakingCharges')?.value)||0;
  const gst=parseFloat(document.getElementById('pGst')?.value)||0;
  const weight=parseFloat(document.getElementById('pWeight')?.value)||0;
  const purity=document.getElementById('pPurity')?.value||'';
  const base = price * weight;  // gold value
  const makingAmount = base * makingChargesPct / 100;  // making based on gold value
  const gstAmount = base * gst / 100;  // GST on gold value
  const total = base + makingAmount + gstAmount;
  const cat=document.getElementById('pCat')?.value||'category';
  document.getElementById('liveName').textContent=name||'Product Name';
  document.getElementById('livePrice').textContent=total?formatPrice(total):'₹0';
  document.getElementById('liveCat').textContent=(catLabel(cat)||'Category') + (purity?` · ${purity}`:'') + (weight?` · ${weight}g`:'');
}
window.livePreview=livePreview;
// Attach input listeners after DOM ready
document.addEventListener('DOMContentLoaded',()=>{
  ['pName','pPrice','pMakingCharges','pGst','pWeight','pCat'].forEach(id=>document.getElementById(id)?.addEventListener('input',livePreview));
});

// ── SIZES ─────────────────────────────────────────────────────
function toggleSizeMgr(){ const has=document.getElementById('pHasSizes')?.value==='true'; const m=document.getElementById('sizeMgr'); if(m)m.style.display=has?'block':'none'; }
window.toggleSizeMgr=toggleSizeMgr;

function renderSizeTags(){
  const wrap=document.getElementById('sizeTags'); if(!wrap) return;
  if(!productSizes.length){wrap.innerHTML='<p style="font-size:.78rem;color:var(--muted);font-style:italic">No sizes added yet.</p>';return;}
  wrap.innerHTML=productSizes.map((s,i)=>`<span class="size-tag">${esc(s)}<button onclick="removeSize(${i})" title="Remove">×</button></span>`).join('');
}
function addSize(){ const inp=document.getElementById('sizeInp'); const v=inp?.value.trim(); if(!v) return; if(productSizes.includes(v)){showToast('Already added.','err');return;} productSizes.push(v); inp.value=''; renderSizeTags(); }
function removeSize(idx){ productSizes.splice(idx,1); renderSizeTags(); }
window.addSize=addSize; window.removeSize=removeSize;

// ── DELETE ────────────────────────────────────────────────────
function confirmDelete(id,type='product'){ deleteTargetId=id; deleteTargetType=type; const title = type==='order' ? 'Delete Order?' : 'Delete Product?'; const titleEl=document.getElementById('deleteModalTitle'); if(titleEl) titleEl.textContent=title; document.getElementById('deleteModal').classList.add('show'); }
window.confirmDelete=confirmDelete;

function setupDeleteModal(){
  document.getElementById('confirmDelBtn')?.addEventListener('click',async()=>{
    if(!deleteTargetId) return;
    try{
      const collectionName = deleteTargetType==='order' ? 'orders' : 'products';
      await db.collection(collectionName).doc(deleteTargetId).delete();
      showToast(deleteTargetType==='order' ? 'Order deleted.' : 'Product deleted.');
      document.getElementById('deleteModal').classList.remove('show');
      deleteTargetId=null;
      deleteTargetType='product';
    }catch(e){ showToast('Failed to delete.','err'); }
  });
  document.getElementById('deleteModal')?.addEventListener('click',e=>{ if(e.target===e.currentTarget) e.currentTarget.classList.remove('show'); });
}

// ── TABS ─────────────────────────────────────────────────────
function setupTabs(){
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(btn=>{
    btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
  });
}
function switchTab(name){
  document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item[data-tab]').forEach(b=>b.classList.remove('active'));
  const s=document.getElementById('tab-'+name); if(s) s.classList.add('active');
  const b=document.querySelector(`.admin-nav-item[data-tab="${name}"]`); if(b) b.classList.add('active');
  const titles={dashboard:'Dashboard',products:'All Products',orders:'New Orders',add:editingId?'Edit Product':'Add Product','customer-details':'Customer Details'};
  const t=document.getElementById('adminPageTitle'); if(t) t.textContent=titles[name]||name;
  // Only reset the form when navigating AWAY from add tab (not to add tab)
  if(name==='dashboard'||name==='products'){ resetForm(); }
  // Re-render table when switching to products tab to ensure freshness
  if(name==='products'){ renderTable(allProducts); }
  // Load customer details when switching to that tab
  if(name==='customer-details'){ cdLoadNotes(); }
}
window.switchTab=switchTab;

// ────────────────────────────────────────────────────────────
// ── CUSTOMER DETAILS NOTES FEATURE (FIREBASE REALTIME) ──────
// ────────────────────────────────────────────────────────────

let cdNotes = []; // All customer notes
let cdCurrentNoteId = null; // Currently selected note ID
let cdIsNewMode = false; // Flag for new note creation mode
let cdUnsubscribe = null; // Firestore listener unsubscribe function
let cdAutoSaveTimeout = null; // Auto-save debounce timer
let cdCurrentUser = null; // Current admin user

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupCustomerDetailsEventListeners();
});

function setupCustomerDetailsEventListeners() {
  const textarea = document.getElementById('cdEditorTextarea');
  if (textarea) {
    textarea.addEventListener('input', () => {
      // Auto-save with 1 second debounce
      if (cdAutoSaveTimeout) clearTimeout(cdAutoSaveTimeout);
      cdAutoSaveTimeout = setTimeout(() => {
        if (cdCurrentNoteId && !cdIsNewMode) {
          cdAutoSaveToFirebase();
        }
      }, 1000);
    });
  }
}

// Set current user (called from auth module)
function cdSetCurrentUser(user) {
  cdCurrentUser = user;
}

// Load and listen to notes from Firebase in real-time
function cdLoadNotes() {
  console.log('🔍 cdLoadNotes() called');
  console.log('📌 cdCurrentUser:', cdCurrentUser);
  console.log('✅ db initialized:', !!db);
  
  if (!cdCurrentUser) {
    console.warn('⚠️ cdCurrentUser is null! User not authenticated.');
    showToast('Not authenticated. Please log in as admin.', 'err');
    return;
  }

  if (!db) {
    console.error('❌ Firebase Firestore not initialized!');
    showToast('❌ Firestore not initialized. Refresh the page.', 'err');
    return;
  }

  console.log('✅ User authenticated as:', cdCurrentUser.email);

  // Unsubscribe from previous listener if exists
  if (cdUnsubscribe) cdUnsubscribe();

  const fileList = document.getElementById('cdFileList');
  if (!fileList) {
    console.error('❌ cdFileList element not found in DOM');
    return;
  }

  console.log('🔄 Loading customer notes from Firestore for:', cdCurrentUser.email);

  try {
    // Real-time listener for this admin's notes
    // Note: This requires a Firestore index to be created
    // If you see an error about missing index, click the link in the Firebase Console to create it
    cdUnsubscribe = db.collection('customerNotes')
      .where('adminEmail', '==', cdCurrentUser.email)
      .orderBy('updatedAt', 'desc')
      .onSnapshot(
        (snapshot) => {
          console.log('✅ Firestore snapshot received:', snapshot.docs.length, 'documents');
          
          cdNotes = snapshot.docs.map(doc => ({
            docId: doc.id,
            ...doc.data()
          }));

          console.log('📋 Loaded notes:', cdNotes);

          // Render the list
          if (cdNotes.length === 0) {
            console.log('📭 No notes found, showing empty state');
            fileList.innerHTML = `<p style="text-align:center;color:var(--muted);padding:24px 16px;font-size:.85rem">
              <i class="fa fa-file-circle-exclamation" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.5"></i>
              No notes yet. Create one to get started.
            </p>`;
            if (!cdCurrentNoteId) cdShowEditorEmpty();
            return;
          }

          fileList.innerHTML = cdNotes.map((note) => `
            <div class="customer-details-item ${cdCurrentNoteId === note.docId ? 'active' : ''}" onclick="cdSelectNote('${note.docId}')">
              <div class="customer-details-item-name">${esc(note.name)} ${note.phone}</div>
              <div class="customer-details-item-date">${note.filename}</div>
            </div>
          `).join('');
          
          console.log('✅ Notes list rendered successfully');
        },
        (error) => {
          console.error('❌ Firestore snapshot error:', error);
          console.error('Error code:', error.code);
          console.error('Error message:', error.message);
          
          if (error.code === 'permission-denied') {
            showToast('⛔ Permission denied. Check Firestore rules.', 'err');
          } else if (error.code === 'failed-precondition') {
            showToast('⚠️ Firestore index needed. Check Firebase Console.', 'err');
          } else if (error.code === 'unauthenticated') {
            showToast('❌ Not authenticated. Please refresh.', 'err');
          } else {
            showToast('❌ Failed to load notes: ' + (error.message || error.code), 'err');
          }
        }
      );
  } catch(err) {
    console.error('❌ Exception in cdLoadNotes:', err);
    showToast('❌ Error: ' + err.message, 'err');
  }
}

// Filter notes based on search query
function cdFilterNotes() {
  const query = document.getElementById('cdSearchBox')?.value.trim().toLowerCase() || '';
  const fileList = document.getElementById('cdFileList');
  if (!fileList) return;

  const filtered = cdNotes.filter(note =>
    note.name.toLowerCase().includes(query) ||
    note.phone.toLowerCase().includes(query) ||
    note.filename.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    fileList.innerHTML = `<p style="text-align:center;color:var(--muted);padding:24px 16px;font-size:.85rem">
      <i class="fa fa-search" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.5"></i>
      No results found
    </p>`;
    return;
  }

  fileList.innerHTML = filtered.map(note => `
    <div class="customer-details-item ${cdCurrentNoteId === note.docId ? 'active' : ''}" onclick="cdSelectNote('${note.docId}')">
      <div class="customer-details-item-name">${esc(note.name)} ${note.phone}</div>
      <div class="customer-details-item-date">${note.filename}</div>
    </div>
  `).join('');
}

// Select a note to view/edit
function cdSelectNote(noteId) {
  cdCurrentNoteId = noteId;
  const note = cdNotes.find(n => n.docId === noteId);
  if (!note) return;

  cdIsNewMode = false;

  // Hide new note form, show editor
  const newForm = document.getElementById('cdNewNoteForm');
  if (newForm) newForm.style.display = 'none';

  const editorWrap = document.getElementById('cdEditorWrap');
  const editorEmpty = document.getElementById('cdEditorEmpty');
  if (editorWrap) editorWrap.style.display = 'block';
  if (editorEmpty) editorEmpty.style.display = 'none';

  // Update header
  const header = document.getElementById('cdEditorHeader');
  if (header) header.style.display = 'flex';

  document.getElementById('cdFileName').textContent = note.filename;
  document.getElementById('cdFileDate').textContent = new Date(note.updatedAt.toDate()).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Load content
  document.getElementById('cdEditorTextarea').value = note.content;

  // Update active item in list
  cdLoadNotes();
}

// New note button
function cdNewNote() {
  cdIsNewMode = true;
  cdCurrentNoteId = null;

  // Show new note form
  const newForm = document.getElementById('cdNewNoteForm');
  if (newForm) newForm.style.display = 'block';

  const editorWrap = document.getElementById('cdEditorWrap');
  const editorEmpty = document.getElementById('cdEditorEmpty');
  if (editorWrap) editorWrap.style.display = 'none';
  if (editorEmpty) editorEmpty.style.display = 'none';

  const header = document.getElementById('cdEditorHeader');
  if (header) header.style.display = 'none';

  // Clear form fields
  document.getElementById('cdNewName').value = '';
  document.getElementById('cdNewPhone').value = '';
  document.getElementById('cdNewContent').value = '';
  document.getElementById('cdNewName').focus();
}

// Create new note in Firebase
async function cdCreateNote() {
  const name = document.getElementById('cdNewName')?.value.trim();
  const phone = document.getElementById('cdNewPhone')?.value.trim();
  const content = document.getElementById('cdNewContent')?.value.trim();

  if (!name || !phone || !content) {
    showToast('Please fill all fields', 'err');
    return;
  }

  // Validate phone (digits only)
  if (!/^\d{10,}$/.test(phone.replace(/\D/g, ''))) {
    showToast('Invalid phone number', 'err');
    return;
  }

  // Generate filename
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `${name}_${phone}_${dateStr}.txt`;

  if (!db) {
    console.error('❌ Firestore not initialized');
    showToast('❌ Firestore not initialized. Refresh the page.', 'err');
    return;
  }

  if (!cdCurrentUser) {
    console.error('❌ User not authenticated');
    showToast('❌ Not authenticated. Please refresh.', 'err');
    return;
  }

  try {
    // Create note object
    const newNote = {
      name,
      phone,
      content,
      filename,
      adminEmail: cdCurrentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    console.log('📝 Creating note:', filename);
    await db.collection('customerNotes').add(newNote);
    showToast(`✅ Note created: ${filename}`);

    // Clear form and reload
    document.getElementById('cdNewName').value = '';
    document.getElementById('cdNewPhone').value = '';
    document.getElementById('cdNewContent').value = '';

    // Close form
    cdCancelNew();
    cdLoadNotes();
  } catch (error) {
    console.error('❌ Error creating note:', error.code, error.message);
    if (error.code === 'permission-denied') {
      showToast('⛔ Permission denied. Check Firestore rules.', 'err');
    } else if (error.code === 'unavailable') {
      showToast('⚠️ Firestore unavailable. Try again.', 'err');
    } else {
      showToast('❌ Failed to create note: ' + error.message, 'err');
    }
  }
}

// Cancel new note
function cdCancelNew() {
  cdIsNewMode = false;
  cdCurrentNoteId = null;
  const newForm = document.getElementById('cdNewNoteForm');
  if (newForm) newForm.style.display = 'none';
  cdShowEditorEmpty();
}

// Auto-save current note to Firebase
async function cdAutoSaveToFirebase() {
  if (!cdCurrentNoteId) return;
  if (!db) {
    console.warn('⚠️ Firestore not initialized for auto-save');
    return;
  }

  const note = cdNotes.find(n => n.docId === cdCurrentNoteId);
  if (!note) return;

  const newContent = document.getElementById('cdEditorTextarea')?.value || '';
  if (newContent === note.content) return; // No changes

  try {
    console.log('💾 Auto-saving note...');
    await db.collection('customerNotes').doc(note.docId).update({
      content: newContent,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Note auto-saved');
    // Show subtle indicator
    const header = document.getElementById('cdEditorHeader');
    if (header) header.style.opacity = '1';
  } catch (error) {
    console.error('❌ Error auto-saving:', error.code, error.message);
    showToast('⚠️ Failed to save: ' + error.message, 'err');
  }
}

// Manual save (keep for backup)
async function cdSaveNote() {
  if (!db) {
    showToast('❌ Firestore not initialized. Refresh the page.', 'err');
    return;
  }

  if (!cdCurrentNoteId) {
    showToast('No note selected', 'err');
    return;
  }

  await cdAutoSaveToFirebase();
  showToast('✅ Saved', '');
}

// Delete current note from Firebase
async function cdDeleteNote() {
  if (!db) {
    showToast('❌ Firestore not initialized.', 'err');
    return;
  }

  if (!cdCurrentNoteId) {
    showToast('No note selected', 'err');
    return;
  }

  const note = cdNotes.find(n => n.docId === cdCurrentNoteId);
  if (!note) return;

  if (!confirm(`Delete "${note.filename}"? This cannot be undone.`)) return;

  try {
    console.log('🗑️ Deleting note:', note.docId);
    await db.collection('customerNotes').doc(note.docId).delete();
    showToast(`✅ Deleted: ${note.filename}`);

    cdCurrentNoteId = null;
    cdShowEditorEmpty();
    cdLoadNotes();
  } catch (error) {
    console.error('❌ Error deleting note:', error.code, error.message);
    if (error.code === 'permission-denied') {
      showToast('⛔ Permission denied. Check Firestore rules.', 'err');
    } else {
      showToast('❌ Failed to delete note: ' + error.message, 'err');
    }
  }
}

// Download note as .txt
function cdDownloadNote() {
  if (!cdCurrentNoteId) {
    showToast('No note selected', 'err');
    return;
  }

  const note = cdNotes.find(n => n.docId === cdCurrentNoteId);
  if (!note) return;

  const text = note.content;
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', note.filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);

  showToast(`Downloaded: ${note.filename} ✓`);
}

// Show empty editor state
function cdShowEditorEmpty() {
  const editorWrap = document.getElementById('cdEditorWrap');
  const editorEmpty = document.getElementById('cdEditorEmpty');
  const header = document.getElementById('cdEditorHeader');
  const newForm = document.getElementById('cdNewNoteForm');

  if (editorWrap) editorWrap.style.display = 'none';
  if (editorEmpty) editorEmpty.style.display = 'flex';
  if (header) header.style.display = 'none';
  if (newForm) newForm.style.display = 'none';
}

// Expose functions globally for HTML onclick handlers
window.cdNewNote = cdNewNote;
window.cdCreateNote = cdCreateNote;
window.cdCancelNew = cdCancelNew;
window.cdSelectNote = cdSelectNote;
window.cdSaveNote = cdSaveNote;
window.cdDeleteNote = cdDeleteNote;
window.cdDownloadNote = cdDownloadNote;
window.cdFilterNotes = cdFilterNotes;
window.cdLoadNotes = cdLoadNotes;
window.cdSetCurrentUser = cdSetCurrentUser;



