// Real-time Gold & Silver Price Fetcher from Admin settings
class CompactPriceFetcher {
  constructor() {
    this.init();
  }

  async fetchPricingFromFirestore() {
    try {
      const doc = await db.collection('settings').doc('pricing').get();
      if (!doc.exists) {
        console.warn('⚠️ Pricing settings not found in Firestore; using defaults');
        return { goldPrice: 6500, silverPrice: 75, makingCharges: 5, gst: 3 };
      }
      const data = doc.data();
      return {
        goldPrice: Number(data.goldPrice) || 6500,
        silverPrice: Number(data.silverPrice) || 75,
        makingCharges: Number(data.makingCharges) || 5,
        gst: Number(data.gst) || 3
      };
    } catch (error) {
      console.error('❌ Error fetching pricing from Firestore:', error);
      return { goldPrice: 6500, silverPrice: 75, makingCharges: 5, gst: 3 };
    }
  }

  async updateAllPrices() {
    try {
      const pricing = await this.fetchPricingFromFirestore();
      const price24k = Number(pricing.goldPrice);
      const price22k = price24k * 0.917;
      const priceSilver = Number(pricing.silverPrice);

      const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      setValue('rate-24k', `₹${price24k.toFixed(2)}/g`);
      setValue('rate-22k', `₹${price22k.toFixed(2)}/g`);
      setValue('rate-silver', `₹${priceSilver.toFixed(2)}/g`);
      setValue('price-24k-small', `₹${price24k.toFixed(2)}/g`);
      setValue('price-22k-small', `₹${price22k.toFixed(2)}/g`);
      setValue('price-silver-small', `₹${priceSilver.toFixed(2)}/g`);

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      document.querySelectorAll('.price-update-time').forEach(el => { if (el) el.textContent = timeStr; });
      document.querySelectorAll('.rates-update-time').forEach(el => { if (el) el.textContent = timeStr; });
    } catch (error) {
      console.error('❌ Error updating prices:', error);
      this.showAPIError(error);
    }
  }

  showAPIError(message) {
    const price22kElement = document.getElementById('price-22k-small');
    const price24kElement = document.getElementById('price-24k-small');
    const price18kElement = document.getElementById('price-18k-small');
    const price14kElement = document.getElementById('price-14k-small');
    const price9kElement = document.getElementById('price-9k-small');
    const priceSilverElement = document.getElementById('price-silver-small');
    
    const price24kHero = document.getElementById('price-24k-hero');
    const price22kHero = document.getElementById('price-22k-hero');
    const price18kHero = document.getElementById('price-18k-hero');
    const price14kHero = document.getElementById('price-14k-hero');
    const price9kHero = document.getElementById('price-9k-hero');
    const priceSilverHero = document.getElementById('price-silver-hero');

    const errorText = '–––';

    if (price22kElement) price22kElement.innerHTML = errorText;
    if (price24kElement) price24kElement.innerHTML = errorText;
    if (price18kElement) price18kElement.innerHTML = errorText;
    if (price14kElement) price14kElement.innerHTML = errorText;
    if (price9kElement) price9kElement.innerHTML = errorText;
    if (priceSilverElement) priceSilverElement.innerHTML = errorText;
    
    if (price24kHero) price24kHero.innerHTML = errorText;
    if (price22kHero) price22kHero.innerHTML = errorText;
    if (price18kHero) price18kHero.innerHTML = errorText;
    if (price14kHero) price14kHero.innerHTML = errorText;
    if (price9kHero) price9kHero.innerHTML = errorText;
    if (priceSilverHero) priceSilverHero.innerHTML = errorText;

    console.error('API Error:', message);
  }

  init() {
    console.log('🚀 CompactPriceFetcher initialized');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('📄 DOM loaded, fetching prices...');
        this.updateAllPrices();
        setInterval(() => this.updateAllPrices(), 120000);
      });
    } else {
      console.log('📄 DOM already loaded, fetching prices...');
      this.updateAllPrices();
      setInterval(() => this.updateAllPrices(), 120000);
    }
  }
}

const priceFetcher = new CompactPriceFetcher();


