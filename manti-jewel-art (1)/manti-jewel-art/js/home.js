// ============================================================
// home.js — Homepage Logic
// ============================================================
let allProducts=[], activeCategory='all', searchQuery='', currentUser=null, unsubProducts=null;

function pagePath(path){
  return window.location.pathname.includes('/pages/') ? path.replace(/^pages\//,'') : path;
}

document.addEventListener('DOMContentLoaded',()=>{
  Auth.init(onLogin, onLogout);
  Auth.setupModal();
  Cart.init(()=>{});
  Cart.loadWish(null);
  setupNav();
  setupQueryParams();
  setupCatChips();
  setupSearch();
  loadProducts();
  listenPromo();
  initHeroSlider();
  initStorySlider();
});

let unsubPromo=null;
function listenPromo(){
  if(unsubPromo) unsubPromo();
  const titleEl = document.getElementById('promoBannerTitle');
  const textEl = document.getElementById('promoBannerText');
  const codeEl = document.getElementById('promoBannerCode');
  if(!titleEl || !textEl || !codeEl) return;
  unsubPromo = db.collection('settings').doc('promo').onSnapshot(doc=>{
    if(!doc.exists){
      titleEl.textContent = 'Get 20% Off on All Gold Items';
      textEl.textContent = 'Use the promo code at checkout to enjoy 20% off on our entire gold jewellery collection. Valid until 30 May 2025.';
      codeEl.textContent = 'GOLD20';
      return;
    }
    const d = doc.data();
    titleEl.textContent = d.title || 'Get 20% Off on All Gold Items';
    textEl.textContent = d.text || 'Use the promo code at checkout to enjoy 20% off on our entire gold jewellery collection. Valid until 30 May 2025.';
    codeEl.textContent = d.code || 'GOLD20';
  }, err=>{ console.warn('Promo realtime listener failed', err); });
}


function onLogin(user){ currentUser=user; Cart.listen(user.uid); Cart.loadWish(user.uid); renderNavUser(user); renderProducts();
  // Track active user
  db.collection('activeUsers').doc(user.uid).set({lastSeen:firebase.firestore.FieldValue.serverTimestamp()});
}
function onLogout(){ 
  if(currentUser && currentUser.uid) db.collection('activeUsers').doc(currentUser.uid).delete();
  currentUser=null; Cart.stop(); renderNavUser(null); renderProducts();
}

function renderNavUser(user){
  const area = document.getElementById('navAuthArea');
  if(!area) return;
  if(user){
    const init=(user.displayName||user.email||'U').charAt(0).toUpperCase();
    const name=(user.displayName||user.email||'').split(' ')[0].split('@')[0];
    area.innerHTML=`
      <div class="nav-user-pill" onclick="window.location.href='${pagePath('pages/profile.html')}'">
        <div class="nav-user-avatar">${user.photoURL?`<img src="${user.photoURL}" alt=""/>`:'<span style="font-size:.75rem;font-weight:700;color:#fff">'+init+'</span>'}</div>
        <span style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
        <i class="fa fa-chevron-down" style="font-size:.7rem;color:var(--muted)"></i>
      </div>`;
  } else {
    area.innerHTML=`<button class="nav-signin-btn" onclick="Auth.openModal()"><i class="fa fa-user"></i><span>Sign In</span></button>`;
  }
}

function loadProducts(){
  if(unsubProducts) unsubProducts();
  const tryLoad = (ordered) => {
    const query = ordered
      ? db.collection('products').orderBy('createdAt','desc')
      : db.collection('products');
    unsubProducts = query.onSnapshot(snap => {
      allProducts = snap.docs.map(d=>({id:d.id,...d.data()}));
      if(!ordered) allProducts.sort((a,b)=>{ const ta=a.createdAt?.toMillis?.()||0, tb=b.createdAt?.toMillis?.()||0; return tb-ta; });
      if(allProducts.length === 0){ allProducts = DEMO_PRODUCTS; }
      renderProducts();
    }, e => {
      console.error('loadProducts error:', e);
      if(ordered && (e.code==='failed-precondition'||e.message?.includes('index'))){
        tryLoad(false);
      } else {
        allProducts = DEMO_PRODUCTS; renderProducts();
      }
    });
  };
  tryLoad(true);
}

function renderProducts(){
  const grid = document.getElementById('productsGrid');
  if(!grid) return;
  let list = allProducts.filter(p=>{
    const cat = (p.category||'').toLowerCase();
    const name = (p.name||'').toLowerCase();
    const purity = (p.purity||'').toLowerCase();
    const productId = ((p.productId||p.id||'') + '').toLowerCase();
    const search = searchQuery.trim().toLowerCase();
    const mc = activeCategory==='all'||cat===activeCategory;
    const ms = !search || name.includes(search) || cat.includes(search) || purity.includes(search) || (p.description||'').toLowerCase().includes(search) || productId.includes(search);
    return mc && ms;
  });
  const countEl = document.getElementById('productsCount');
  if(countEl) countEl.textContent=`${list.length} item${list!==1?'s':''}`;
  if(list.length===0){
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><i class="fa fa-gem"></i><h3>No products found</h3><p>Try a different category or search term.</p></div>`;
    return;
  }
  grid.innerHTML=list.map(p=>pcardHTML(p)).join('');
  grid.querySelectorAll('.pcard').forEach(card=>{
    const id=card.dataset.id;
    card.addEventListener('click',e=>{ if(e.target.closest('.pcard-wish')||e.target.closest('.pcard-add')) return; window.location.href=`${pagePath('pages/product.html')}?id=${encodeURIComponent(id)}`; });
    card.querySelector('.pcard-wish')?.addEventListener('click',e=>{ e.stopPropagation(); handleWish(id); });
    const addBtn=card.querySelector('.pcard-add');
    if(addBtn) addBtn.addEventListener('click',e=>{ e.stopPropagation(); handleAddCart(id); });
  });
}

function pcardHTML(p){
  const wished=Cart.isWished(p.id); const inStock=p.inStock!==false;
  const weight = p.weight || 1;
  const goldRate = p.price || 0;
  const price = goldRate * weight;
  const makingPct = p.makingCharges || 0;
  const makingAmount = price * makingPct / 100; // making based on gold value
  const gst = p.gst || 0;
  const gstAmount = price * gst / 100; // GST only on gold value
  const total = price + makingAmount + gstAmount;
  return`<div class="pcard" data-id="${esc(p.id)}">
    <div class="pcard-img">
      <img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='https://placehold.co/400x400/f5f3f0/999?text=No+Image'"/>
      <span class="pcard-stock ${inStock?'in':'out'}">${inStock?'In Stock':'Out of Stock'}</span>
      <button class="pcard-wish ${wished?'wished':''}">${wished?'<i class="fas fa-heart"></i>':'<i class="far fa-heart"></i>'}</button>
    </div>
    <div class="pcard-body">
      <p class="pcard-cat">${esc(catLabel(p.category))}${p.purity?` · ${esc(p.purity)}`:''}${p.weight?` · ${p.weight}g`:''}</p>
      <h3 class="pcard-name">${esc(p.name)}</h3>
      <p class="pcard-id" style="font-size:.75rem;color:var(--muted);margin:.1rem 0;">Product ID: ${esc(p.productId||p.id)}</p>
      <div class="pcard-meta">
        <div>Making charge: ${makingPct}% (${formatPrice(makingAmount)})</div>
        <div>GST (${gst}%): ${formatPrice(gstAmount)}</div>
      </div>
      <div class="pcard-footer">
        <span class="pcard-price">${formatPrice(total)}</span>
        <div style="display:flex;gap:6px;">
          <button class="pcard-add" ${!inStock?'disabled':''} style="flex:1;">
            <i class="fa fa-plus"></i> Add to Cart
          </button>
          <button class="btn btn-primary btn-sm" ${!inStock?'disabled':''} onclick="event.stopPropagation(); buyNow('${p.id}')">
            Buy Now
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

async function handleWish(id){
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  const uid=currentUser?.uid||null;
  const added=await Cart.toggleWish(uid,p);
  showToast(added?`${p.name} added to wishlist ❤️`:'Removed from wishlist');
  const card=document.querySelector(`.pcard[data-id="${id}"]`);
  if(card){ const btn=card.querySelector('.pcard-wish'); const a=Cart.isWished(id); btn.className='pcard-wish'+(a?' wished':''); btn.innerHTML=a?'<i class="fas fa-heart"></i>':'<i class="far fa-heart"></i>'; }
}

async function handleAddCart(id){
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  if(!p.inStock){ showToast('This item is out of stock.','err'); return; }
  if(p.hasSizes&&p.availableSizes?.length>0){ window.location.href=`${pagePath('pages/product.html')}?id=${encodeURIComponent(id)}`; return; }
  if(!currentUser){ Auth.openModal(()=>handleAddCart(id)); return; }
  try{ await Cart.addItem(currentUser.uid,p,null); showToast(`${p.name} added to cart 🛍️`); }
  catch(e){ showToast('Failed to add to cart.','err'); }
}

async function buyNow(id){
  const p=allProducts.find(x=>x.id===id); if(!p) return;
  if(!p.inStock){ showToast('This item is out of stock.','err'); return; }
  // Always go to buy-now page — if product has sizes, user picks on that page too
  if(!currentUser){ Auth.openModal(()=>buyNow(id)); return; }
  window.location.href=`${pagePath('pages/buy-now.html')}?id=${encodeURIComponent(id)}`;
}

function setupNav(){
  const cartBtn = document.getElementById('cartNavBtn');
  const burgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileDrawer');

  if(cartBtn) cartBtn.addEventListener('click',goToCart);
  if(burgerBtn && drawer) {
    burgerBtn.addEventListener('click',()=>drawer.classList.add('show'));
    drawer.querySelectorAll('.mnd-link').forEach(link=>link.addEventListener('click',closeMobileNav));
    drawer.querySelector('.mnd-overlay')?.addEventListener('click',closeMobileNav);
  }

  window.addEventListener('resize', ()=>{
    if(window.innerWidth > 920) closeMobileNav();
  });
}

function setupCatChips(){
  document.querySelectorAll('.cat-chip').forEach(c=>{
    c.addEventListener('click',()=>{
      document.querySelectorAll('.cat-chip').forEach(x=>x.classList.remove('active'));
      c.classList.add('active'); activeCategory=c.dataset.cat;
      const titles={all:'All Products',gold:'Gold Collection',silver:'Silver Collection',custom:'Custom Jewellery'};
      const el=document.getElementById('productsSectionTitle'); if(el) el.textContent=titles[activeCategory]||'Products';
      renderProducts();
    });
  });
}

function setupQueryParams(){
  const params = new URLSearchParams(window.location.search);
  const urlCat = params.get('cat');
  const urlSearch = params.get('search');
  if(urlCat){ activeCategory = urlCat.toLowerCase(); }
  if(urlSearch){ searchQuery = urlSearch.trim().toLowerCase(); }
  const navSearch = document.getElementById('navSearch');
  const sectionSearch = document.getElementById('sectionSearch');
  if(navSearch && urlSearch) navSearch.value = params.get('search');
  if(sectionSearch && urlSearch) sectionSearch.value = params.get('search');
  if(urlCat){
    document.querySelectorAll('.cat-chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===activeCategory));
    const titles = { all:'All Products', gold:'Gold Collection', silver:'Silver Collection', custom:'Custom Jewellery' };
    const el = document.getElementById('productsSectionTitle');
    if(el) el.textContent = titles[activeCategory] || 'Products';
  }
}

function setupSearch(){
  const inputs = Array.from(document.querySelectorAll('#navSearch, #sectionSearch'));
  inputs.forEach(inp=>{
    if(!inp) return;
    inp.addEventListener('input',debounce(()=>{
      searchQuery = inp.value.trim().toLowerCase();
      inputs.forEach(other=>{ if(other && other !== inp) other.value = inp.value; });
      if(document.getElementById('productsSection')) renderProducts();
    },280));
    if(!document.getElementById('productsSection') && inp.id === 'navSearch'){
      inp.addEventListener('keydown', e=>{
        if(e.key === 'Enter'){
          e.preventDefault();
          const q = inp.value.trim();
          if(q) window.location.href = pagePath('pages/collections.html') + '?search=' + encodeURIComponent(q);
        }
      });
    }
  });
}

function scrollToProducts(){
  const section = document.getElementById('productsSection');
  if(section){ section.scrollIntoView({behavior:'smooth'}); return; }
  window.location.href = pagePath('pages/collections.html');
}
function scrollToSection(id){ document.getElementById(id)?.scrollIntoView({behavior:'smooth'}); }
function filterCat(cat){
  if(!document.getElementById('productsSection')){
    window.location.href = pagePath('pages/collections.html') + '?cat=' + encodeURIComponent(cat);
    return;
  }
  document.querySelectorAll('.cat-chip').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  activeCategory = cat; renderProducts(); scrollToProducts();
}
function closeMobileNav(){ document.getElementById('mobileDrawer').classList.remove('show'); }
function goToCart(){
  if(!currentUser){ Auth.openModal(()=>window.location.href=pagePath('pages/cart.html')); return; }
  window.location.href=pagePath('pages/cart.html');
}

function initHeroSlider(){
  const slider = document.querySelector('.hero-slider');
  const dots = document.querySelectorAll('.banner-dots .dot');
  if(!slider) return;
  const slides = slider.querySelectorAll('.slide');
  if(slides.length === 0) return;
  
  let currentSlide = 0;
  let autoSlideInterval;
  
  function updateDots() {
    dots.forEach((dot, index) => {
      dot.classList.toggle('active', index === currentSlide);
    });
  }
  
  function showSlide(index) {
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
  }
  
  function nextSlide(){
    const nextIndex = (currentSlide + 1) % slides.length;
    showSlide(nextIndex);
  }
  
  function startAutoSlide() {
    autoSlideInterval = setInterval(nextSlide, 5000);
  }
  
  function stopAutoSlide() {
    clearInterval(autoSlideInterval);
  }
  
  // Initialize first slide
  slides[0].classList.add('active');
  updateDots();
  
  // Add dot click handlers
  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      stopAutoSlide();
      showSlide(index);
      startAutoSlide();
    });
  });
  
  // Start auto-sliding
  startAutoSlide();
  
  // Pause on hover
  slider.addEventListener('mouseenter', stopAutoSlide);
  slider.addEventListener('mouseleave', startAutoSlide);
}

function initStorySlider(){
  const cards = Array.from(document.querySelectorAll('.story-card'));
  if(cards.length === 0) return;
  const prevBtn = document.querySelector('.story-prev');
  const nextBtn = document.querySelector('.story-next');
  const slider = document.querySelector('.story-slider');
  let currentIndex = 0;
  let intervalId = null;

  function updateCards(){
    const total = cards.length;
    cards.forEach((card, idx) => {
      card.classList.remove('prev','next','active','hidden');
      const offset = (idx - currentIndex + total) % total;
      if(offset === 0) card.classList.add('active');
      else if(offset === 1) card.classList.add('next');
      else if(offset === total - 1) card.classList.add('prev');
      else card.classList.add('hidden');
    });
  }

  function goTo(index){
    currentIndex = (index + cards.length) % cards.length;
    updateCards();
  }

  function showNext(){ goTo(currentIndex + 1); }
  function showPrev(){ goTo(currentIndex - 1); }
  function startAuto(){
    stopAuto();
    intervalId = window.setInterval(showNext, 5000);
  }
  function stopAuto(){ if(intervalId){ window.clearInterval(intervalId); intervalId = null; } }

  prevBtn?.addEventListener('click', () => { stopAuto(); showPrev(); startAuto(); });
  nextBtn?.addEventListener('click', () => { stopAuto(); showNext(); startAuto(); });
  slider?.addEventListener('mouseenter', stopAuto);
  slider?.addEventListener('mouseleave', startAuto);

  updateCards();
  startAuto();
}

window.scrollToProducts=scrollToProducts; window.scrollToSection=scrollToSection;
window.filterCat=filterCat; window.closeMobileNav=closeMobileNav; window.goToCart=goToCart;



