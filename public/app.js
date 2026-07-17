// ==========================================================================
// 🛍️ GLOBAL APP STATE
// ==========================================================================
const state = {
  cart: [],
  products: [],
  currentRoute: '',
  customerToken: sessionStorage.getItem('pj_customer_token') || '',
  customerName: sessionStorage.getItem('pj_customer_name') || '',
  customerEmail: sessionStorage.getItem('pj_customer_email') || '',
  customerPhone: sessionStorage.getItem('pj_customer_phone') || '',
  customerAddress: sessionStorage.getItem('pj_customer_address') || '',
  customerRegion: sessionStorage.getItem('pj_customer_region') || '',
  paystackPublicKey: 'pk_test_1f87a0cc8c3f62c2dceeaf58ae24c49d63f06295',
  forgotEmail: '',
  resetToken: '',
  wishlistIds: [],   // array of product ids saved by the logged-in customer
  recentlyViewed: JSON.parse(localStorage.getItem('pj_recently_viewed') || '[]'),
  regionalPriceCache: new Map()
};

// Resolve display price: regional override > base product price
async function resolvePrice(productId, basePrice, region) {
  if (!region) return parseFloat(basePrice);

  const cacheKey = `${productId}:${region}`;
  if (state.regionalPriceCache.has(cacheKey)) {
    return state.regionalPriceCache.get(cacheKey);
  }

  try {
    const product = state.products.find(p => p.id === productId);
    const slug = product ? product.slug : null;
    if (!slug) return parseFloat(basePrice);

    const data = await apiFetch(`/pj-secure-boutique/get-regional-prices/${encodeURIComponent(slug)}`);
    const match = (data.prices || []).find(p => p.region === region && p.is_active);
    const resolved = match ? parseFloat(match.price) : parseFloat(basePrice);
    state.regionalPriceCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return parseFloat(basePrice);
  }
}

// ==========================================================================
// 🚀 ROUTER & APPLICATION BOOTSTRAP
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('hashchange', router);
  router();
  initCartListeners();
  updateCartUI();
  updateAuthHeaderUI();
  initAuthModalListeners();
  initAuthFormListeners();
  loadCategoriesSidebar();
  loadWishlist();
  initProfileDropdown();
});

async function router() {
  const hash = window.location.hash || '#/';
  state.currentRoute = hash;

  document.querySelectorAll('nav a').forEach(el => {
    el.classList.remove('text-brand', 'border-b-2', 'border-brand');
    el.classList.add('text-brand-muted');
  });
  
  const appContainer = document.getElementById('app');
  appContainer.innerHTML = '';

  // The Collections sidebar is hidden on the boutique/home page (full-width
  // catalog) and appears only once the user clicks into a category or product.
  updateSidebarVisibility(hash);

  if (hash === '#/' || hash === '') {
    const navEl = document.getElementById('nav-home');
    if (navEl) navEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    await renderHome(appContainer);
  } else if (hash.startsWith('#/category/')) {
    const categoryMatch = hash.substring(11).split('?');
    const category = decodeURIComponent(categoryMatch[0]);
    const urlParams = new URLSearchParams(categoryMatch[1] || '');
    const productType = decodeURIComponent(urlParams.get('type') || '');
    
    if (category === 'Men') {
      const menEl = document.getElementById('nav-men');
      if (menEl) menEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    }
    if (category === 'Women') {
      const womenEl = document.getElementById('nav-women');
      if (womenEl) womenEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    }
    await renderHome(appContainer, category, productType);
  } else if (hash.startsWith('#/product/')) {
    const slug = hash.substring(10);
    await renderProductDetail(appContainer, slug);
  } else if (hash === '#/wishlist') {
    const wishEl = document.getElementById('nav-wishlist');
    if (wishEl) wishEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    await renderWishlist(appContainer);
  } else if (hash === '#/lookbook') {
    const lookEl = document.getElementById('nav-lookbook');
    if (lookEl) lookEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    await renderLookbookIndex(appContainer);
  } else if (hash.startsWith('#/lookbook/')) {
    const slug = decodeURIComponent(hash.substring(10));
    await renderLookbookDetail(appContainer, slug);
  } else if (hash === '#/checkout') {
    if (!state.customerToken) {
      showNotification('Please log in or create an account to proceed.', 'error');
      openAuthModal();
      window.location.hash = '#/';
      return;
    }
    renderCheckout(appContainer);
  } else if (hash === '#/track') {
    const trackEl = document.getElementById('nav-track');
    if (trackEl) trackEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    renderTrackSearch(appContainer);
  } else if (hash.startsWith('#/track/')) {
    const trackEl = document.getElementById('nav-track');
    if (trackEl) trackEl.className = "text-xs uppercase tracking-premium font-semibold text-brand border-b-2 border-brand pb-1 premium-transition";
    const token = hash.substring(8);
    await renderTrackResult(appContainer, token);
  } else if (hash === '#/profile' || hash.startsWith('#/profile/')) {
    if (!state.customerToken) {
      showNotification('Please log in to view your profile.', 'error');
      openAuthModal('signin');
      window.location.hash = '#/';
      return;
    }
    renderProfilePage(appContainer);
  } else {
    appContainer.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <h2 class="text-2xl uppercase tracking-premium font-extrabold mb-4">Route Unavailable</h2>
        <p class="text-sm text-brand-muted mb-8">The requested link is invalid.</p>
        <a href="#/" class="bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-4 hover:bg-brand-hover premium-transition">Return to Catalog</a>
      </div>
    `;
  }
  
  window.scrollTo(0, 0);
}

// ==========================================================================
// 📣 COMMON UI COMPONENTS & FEEDBACK HELPERS
// ==========================================================================
function showNotification(message, type = 'success') {
  const toast = document.getElementById('app-notification');
  toast.innerText = message;
  
  let typeClasses = 'bg-brand text-white';
  if (type === 'error') typeClasses = 'bg-red-500 text-white';
  if (type === 'info') typeClasses = 'bg-brand-gold text-brand';

  toast.className = `fixed bottom-6 right-6 z-[100] transform translate-y-0 opacity-100 premium-transition px-6 py-4 font-semibold text-xs uppercase tracking-premium shadow-2xl ${typeClasses}`;
  
  setTimeout(() => {
    toast.className = `fixed bottom-6 right-6 z-[100] transform translate-y-24 opacity-0 premium-transition px-6 py-4 font-semibold text-xs uppercase tracking-premium shadow-2xl ${typeClasses}`;
  }, 4000);
}

async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Server request failed.');
    }
    return data;
  } catch (err) {
    console.error(`API Error [${url}]:`, err.message);
    throw err;
  }
}

// Update displayed prices on the page based on the customer's region
async function refreshRegionPrices(scope = document) {
  if (!state.customerRegion) return;
  const nodes = scope.querySelectorAll('.region-price');
  await Promise.all(Array.from(nodes).map(async (el) => {
    const id = parseInt(el.getAttribute('data-id'));
    const base = parseFloat(el.getAttribute('data-base'));
    if (!id || isNaN(base)) return;
    const resolved = await resolvePrice(id, base, state.customerRegion);
    el.innerText = `GH₵ ${resolved.toFixed(2)}`;
  }));
}

// ==========================================================================
// ❤️ WISHLIST HELPERS (per-customer, DB-backed)
// ==========================================================================

// Load the logged-in customer's saved product ids into state
async function loadWishlist() {
  if (!state.customerToken) {
    state.wishlistIds = [];
    return;
  }
  try {
    state.wishlistIds = await apiFetch('/pj-secure-boutique/get-wishlist', {
      headers: { 'Authorization': `Bearer ${state.customerToken}` }
    });
  } catch (err) {
    state.wishlistIds = [];
  }
}

function isWishlisted(productId) {
  return state.wishlistIds.includes(productId);
}

// Toggle a product in the wishlist. Returns the new saved state (boolean).
async function toggleWishlist(productId) {
  if (!state.customerToken) {
    showNotification('Please log in to save favorites.', 'error');
    openAuthModal('signin');
    return false;
  }

  try {
    const result = await apiFetch('/pj-secure-boutique/toggle-wishlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify({ product_id: productId })
    });

    if (result.saved) {
      if (!state.wishlistIds.includes(productId)) state.wishlistIds.push(productId);
      showNotification('Saved to your wishlist.', 'success');
    } else {
      state.wishlistIds = state.wishlistIds.filter(id => id !== productId);
      showNotification('Removed from wishlist.', 'info');
    }
    return result.saved;
  } catch (err) {
    showNotification(err.message || 'Could not update wishlist.', 'error');
    return isWishlisted(productId);
  }
}

// ==========================================================================
// 👁️ RECENTLY VIEWED HELPERS (localStorage, per-browser)
// ==========================================================================

function recordRecentlyViewed(product) {
  if (!product || !product.id) return;
  // Remove if already present, then unshift to the front
  state.recentlyViewed = state.recentlyViewed.filter(p => p.id !== product.id);
  state.recentlyViewed.unshift({
    id: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    image_url: product.image_url,
    category: product.category
  });
  // Keep only the last 8
  state.recentlyViewed = state.recentlyViewed.slice(0, 8);
  localStorage.setItem('pj_recently_viewed', JSON.stringify(state.recentlyViewed));
}

// ==========================================================================
// 🧩 REUSABLE PRODUCT CARD
// ==========================================================================
// Renders a single product card with optional wishlist heart.
function renderProductCard(prod, { showWishlist = true } = {}) {
  const heartFilled = showWishlist && isWishlisted(prod.id);
  const heartBtn = showWishlist ? `
    <button
      class="absolute top-3 right-3 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-white/90 shadow-sm premium-transition hover:scale-110 wishlist-toggle ${heartFilled ? 'text-red-500' : 'text-brand-muted'}"
      data-id="${prod.id}"
      aria-label="Save to wishlist">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="${heartFilled ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    </button>
  ` : '';

  return `
    <div class="group flex flex-col relative animate-fade-in-up">
      <div class="relative overflow-hidden bg-neutral-50 h-48 sm:h-64 md:h-80 custom-hover-zoom border border-neutral-100">
        ${prod.stock === 0 ? '<span class="absolute top-4 left-4 bg-red-500 text-[10px] font-bold text-white uppercase tracking-premium px-3 py-1.5 z-10 shadow-sm">Sold Out</span>' : ''}
        ${heartBtn}
        <a href="#/product/${prod.slug}">
          <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
        </a>

        ${prod.stock > 0 ? `
          <div class="absolute bottom-0 inset-x-0 p-4 bg-white/95 border-t border-neutral-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex">
            <button class="w-full bg-brand text-white hover:bg-brand-hover text-xs uppercase tracking-premium font-bold py-3 premium-transition quick-add-btn" data-slug="${prod.slug}">Quick Add</button>
          </div>
        ` : ''}
      </div>
      <div class="py-4 space-y-1">
        <span class="text-[10px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
        <a href="#/product/${prod.slug}" class="block"><h3 class="text-sm font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
        <p class="text-sm font-extrabold text-brand region-price" data-id="${prod.id}" data-base="${parseFloat(prod.price).toFixed(2)}">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
      </div>
    </div>
  `;
}

// Re-attach the listeners (quick-add + wishlist toggle) to cards rendered via renderProductCard
function attachProductCardListeners(scope = document) {
  scope.querySelectorAll('.quick-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      quickAddToCart(btn.getAttribute('data-slug'));
    });
  });

  scope.querySelectorAll('.wishlist-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = parseInt(btn.getAttribute('data-id'));
      const saved = await toggleWishlist(id);
      // Update the heart icon in place
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', saved ? 'currentColor' : 'none');
      }
      btn.classList.toggle('text-red-500', saved);
      btn.classList.toggle('text-brand-muted', !saved);
    });
  });
}

// ==========================================================================
// 👤 CUSTOMER ACCOUNT & AUTHENTICATION (Half-Image Modal)
// ==========================================================================

// Show error message inside the auth modal
function showModalError(message) {
  const el = document.getElementById('auth-modal-error');
  if (!el) return;
  el.innerText = message;
  el.classList.remove('hidden');
}

function hideModalError() {
  const el = document.getElementById('auth-modal-error');
  if (!el) return;
  el.classList.add('hidden');
  el.innerText = '';
}

// Initialize auth modal event listeners
function initAuthModalListeners() {
  // Auth login button in header
  const loginBtn = document.getElementById('auth-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => openAuthModal('signin'));
  }

  // Auth modal close button
  const closeBtn = document.getElementById('auth-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAuthModal);
  }

  // Close modal on overlay click
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuthModal();
    });
  }

  // Switch view buttons
  const switchToSignup = document.getElementById('switch-to-signup');
  if (switchToSignup) {
    switchToSignup.addEventListener('click', () => switchAuthView('signup'));
  }

  const switchToSignin = document.getElementById('switch-to-signin');
  if (switchToSignin) {
    switchToSignin.addEventListener('click', () => switchAuthView('signin'));
  }

  const forgotPasswordBtn = document.getElementById('forgot-password-btn');
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', showForgotPasswordView);
  }

  const backToSignin = document.getElementById('back-to-signin');
  if (backToSignin) {
    backToSignin.addEventListener('click', () => switchAuthView('signin'));
  }

  const resendCodeBtn = document.getElementById('resend-code-btn');
  if (resendCodeBtn) {
    resendCodeBtn.addEventListener('click', resendResetCode);
  }
}

// Initialize auth form event listeners
function initAuthFormListeners() {
  const signinForm = document.getElementById('signin-form');
  if (signinForm) {
    signinForm.addEventListener('submit', handleCustomerSignIn);
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', handleCustomerSignUp);
  }

  const forgotRequestForm = document.getElementById('forgot-request-form');
  if (forgotRequestForm) {
    forgotRequestForm.addEventListener('submit', handleForgotPasswordRequest);
  }

  const forgotVerifyForm = document.getElementById('forgot-verify-form');
  if (forgotVerifyForm) {
    forgotVerifyForm.addEventListener('submit', handleVerifyResetCode);
  }

  const forgotResetForm = document.getElementById('forgot-reset-form');
  if (forgotResetForm) {
    forgotResetForm.addEventListener('submit', handleResetPassword);
  }
}

// Open/Close Modal
function openAuthModal(view = 'signin') {
  document.getElementById('auth-modal').classList.remove('hidden');
  switchAuthView(view);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  // Reset forgot password flow
  resetForgotPasswordFlow();
}

// Switch between Sign In / Sign Up / Forgot Password views
function switchAuthView(view) {
  const views = ['signin', 'signup', 'forgot'];
  views.forEach(v => {
    const el = document.getElementById(`auth-view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });
  
  // Hide inline modal error when switching views
  hideModalError();
  
  // Reset forgot password flow when switching away from it
  if (view !== 'forgot') {
    resetForgotPasswordFlow();
  }
}

// Forgot Password: Show the forgot password view
function showForgotPasswordView() {
  switchAuthView('forgot');
  resetForgotPasswordFlow();
}

// Reset the forgot password flow steps
function resetForgotPasswordFlow() {
  document.getElementById('forgot-step-1').classList.remove('hidden');
  document.getElementById('forgot-step-2').classList.add('hidden');
  document.getElementById('forgot-step-3').classList.add('hidden');
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-code').value = '';
  document.getElementById('forgot-new-password').value = '';
  document.getElementById('forgot-confirm-password').value = '';
  state.resetToken = '';
  state.forgotEmail = '';
}

// Step 1: Request 6-digit verification code
async function handleForgotPasswordRequest(event) {
  event.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return;

  const btn = document.getElementById('forgot-send-btn');
  btn.disabled = true;
  btn.innerText = 'Sending...';

  try {
    const response = await apiFetch('/pj-customer-auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    // Store email for subsequent steps
    state.forgotEmail = email;
    document.getElementById('forgot-email-display').innerText = email;
    
    // Show step 2 (verify code)
    document.getElementById('forgot-step-1').classList.add('hidden');
    document.getElementById('forgot-step-2').classList.remove('hidden');
    
    if (response.email_sent) {
      showNotification('Verification code sent to your email.', 'info');
    } else {
      showNotification('Email delivery failed. Check console for dev code.', 'error');
    }
    
    // Always show code in console for development
    if (response.code_for_dev_testing) {
      console.log('🔐 Dev Reset Code:', response.code_for_dev_testing);
    }
    
  } catch (err) {
    showNotification(err.message || 'Failed to send verification code.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Send Verification Code';
  }
}

// Resend the reset code
async function resendResetCode() {
  if (!state.forgotEmail) return;
  
  try {
    const response = await apiFetch('/pj-customer-auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.forgotEmail })
    });
    
    if (response.email_sent) {
      showNotification('New verification code sent to your email.', 'info');
    } else {
      showNotification('Email delivery failed. Check console for dev code.', 'error');
    }
    
    if (response.code_for_dev_testing) {
      console.log('🔐 New Dev Reset Code:', response.code_for_dev_testing);
    }
    
  } catch (err) {
    showNotification(err.message || 'Failed to resend code.', 'error');
  }
}

// Step 2: Verify the 6-digit code
async function handleVerifyResetCode(event) {
  event.preventDefault();
  const code = document.getElementById('forgot-code').value.trim();
  if (!code || code.length !== 6) {
    showNotification('Please enter the full 6-digit verification code.', 'error');
    return;
  }

  const btn = document.getElementById('forgot-verify-btn');
  btn.disabled = true;
  btn.innerText = 'Verifying...';

  try {
    const response = await apiFetch('/pj-customer-auth/verify-reset-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.forgotEmail, code })
    });

    state.resetToken = response.reset_token;
    
    // Show step 3 (new password)
    document.getElementById('forgot-step-2').classList.add('hidden');
    document.getElementById('forgot-step-3').classList.remove('hidden');
    
    showNotification('Code verified! Set your new password.', 'success');
  } catch (err) {
    showNotification(err.message || 'Invalid or expired code.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Verify Code';
  }
}

// Step 3: Reset the password
async function handleResetPassword(event) {
  event.preventDefault();
  hideModalError();
  
  const newPassword = document.getElementById('forgot-new-password').value;
  const confirmPassword = document.getElementById('forgot-confirm-password').value;

  if (newPassword !== confirmPassword) {
    showModalError('Passwords do not match.');
    return;
  }

  if (newPassword.length < 8) {
    showModalError('Password must be at least 8 characters.');
    return;
  }
  if (!/[A-Z]/.test(newPassword)) {
    showModalError('Password must include at least one uppercase letter.');
    return;
  }
  if (!/[a-z]/.test(newPassword)) {
    showModalError('Password must include at least one lowercase letter.');
    return;
  }
  if (!/[0-9]/.test(newPassword)) {
    showModalError('Password must include at least one number.');
    return;
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
    showModalError('Password must include at least one special character.');
    return;
  }

  const btn = document.getElementById('forgot-reset-btn');
  btn.disabled = true;
  btn.innerText = 'Resetting...';

  try {
    const response = await apiFetch('/pj-customer-auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token: state.resetToken, new_password: newPassword })
    });

    showNotification('Password reset successfully! Please sign in.', 'success');
    
    // Return to sign in view
    switchAuthView('signin');
    resetForgotPasswordFlow();
  } catch (err) {
    showNotification(err.message || 'Password reset failed.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Reset Password';
  }
}

// Sign Up handler
async function handleCustomerSignUp(event) {
  event.preventDefault();
  hideModalError();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const region = document.getElementById('signup-region').value;

  // Client-side password validation
  if (password.length < 8) {
    showModalError('Password must be at least 8 characters.');
    return;
  }
  if (!/[A-Z]/.test(password)) {
    showModalError('Password must include at least one uppercase letter.');
    return;
  }
  if (!/[a-z]/.test(password)) {
    showModalError('Password must include at least one lowercase letter.');
    return;
  }
  if (!/[0-9]/.test(password)) {
    showModalError('Password must include at least one number.');
    return;
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    showModalError('Password must include at least one special character.');
    return;
  }

  try {
    const response = await apiFetch('/pj-customer-auth/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, region })
    });

    state.customerToken = response.token;
    state.customerName = response.customer.name;
    state.customerEmail = response.customer.email;
    sessionStorage.setItem('pj_customer_token', response.token);
    sessionStorage.setItem('pj_customer_name', response.customer.name);
    sessionStorage.setItem('pj_customer_email', response.customer.email);

    showNotification(`Welcome, ${response.customer.name}! Account created.`);
    closeAuthModal();
    updateAuthHeaderUI();
    router();
    setTimeout(() => refreshRegionPrices(), 500);
  } catch (err) {
    showModalError(err.message || 'Signup failed.');
  }
}

// Sign In handler
async function handleCustomerSignIn(event) {
  event.preventDefault();
  hideModalError();
  const email = document.getElementById('signin-email').value;
  const password = document.getElementById('signin-password').value;

  try {
    const response = await apiFetch('/pj-customer-auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    state.customerToken = response.token;
    state.customerName = response.customer.name;
    state.customerEmail = response.customer.email;
    sessionStorage.setItem('pj_customer_token', response.token);
    sessionStorage.setItem('pj_customer_name', response.customer.name);
    sessionStorage.setItem('pj_customer_email', response.customer.email);

    // Load customer profile data
    loadCustomerProfile();

    showNotification(`Welcome back, ${response.customer.name}!`);
    closeAuthModal();
    updateAuthHeaderUI();
    router();
    setTimeout(() => refreshRegionPrices(), 500);
  } catch (err) {
    showModalError(err.message || 'Invalid email or password.');
  }
}

async function loadCustomerProfile() {
  if (!state.customerToken) return;
  try {
    const profile = await apiFetch('/pj-customer-auth/profile', {
      headers: { 'Authorization': `Bearer ${state.customerToken}` }
    });
    if (profile.phone) {
      state.customerPhone = profile.phone;
      sessionStorage.setItem('pj_customer_phone', profile.phone);
    }
    if (profile.address) {
      state.customerAddress = profile.address;
      sessionStorage.setItem('pj_customer_address', profile.address);
    }
    if (profile.region) {
      state.customerRegion = profile.region;
      sessionStorage.setItem('pj_customer_region', profile.region);
    }
  } catch (err) {
    // Silently fail - profile data is optional
    console.warn('Could not load full profile:', err.message);
  }
}

function handleCustomerLogout() {
  state.customerToken = '';
  state.customerName = '';
  state.customerEmail = '';
  state.customerPhone = '';
  state.customerAddress = '';
  state.customerRegion = '';
  sessionStorage.removeItem('pj_customer_token');
  sessionStorage.removeItem('pj_customer_name');
  sessionStorage.removeItem('pj_customer_email');
  sessionStorage.removeItem('pj_customer_phone');
  sessionStorage.removeItem('pj_customer_address');
  sessionStorage.removeItem('pj_customer_region');
  showNotification('Logged out successfully.');
  updateAuthHeaderUI();
  window.location.hash = '#/';
}

// Profile dropdown management
function initProfileDropdown() {
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    const avatar = document.getElementById('profile-avatar');
    if (dropdown && avatar && !avatar.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function toggleProfileDropdown() {
  const dropdown = document.getElementById('profile-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

function updateAuthHeaderUI() {
  const container = document.getElementById('customer-profile-container');
  if (!container) return;

  if (state.customerToken) {
    const firstInitial = state.customerName ? state.customerName.charAt(0).toUpperCase() : '?';
    container.innerHTML = `
      <div class="relative">
        <button id="profile-avatar" class="h-9 w-9 rounded-full bg-brand text-white flex items-center justify-center text-sm font-extrabold uppercase tracking-premium hover:bg-brand-hover premium-transition shadow-sm border-2 border-white" title="${state.customerName}">
          ${firstInitial}
        </button>
        <div id="profile-dropdown" class="hidden absolute right-0 top-full mt-2 w-48 bg-white border border-neutral-100 rounded-lg shadow-xl z-50 py-2 animate-fade-in-up">
          <div class="px-4 py-3 border-b border-neutral-100">
            <p class="text-xs font-bold text-brand truncate">${state.customerName}</p>
            <p class="text-[10px] text-brand-muted truncate">${state.customerEmail}</p>
          </div>
          <a href="#/profile" id="profile-dropdown-link" class="flex items-center space-x-3 px-4 py-2.5 text-xs font-semibold text-brand-muted hover:text-brand hover:bg-neutral-50 premium-transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Profile</span>
          </a>
          <button id="profile-dropdown-logout" class="flex items-center space-x-3 w-full text-left px-4 py-2.5 text-xs font-semibold text-brand-muted hover:text-red-500 hover:bg-neutral-50 premium-transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Log Out</span>
          </button>
        </div>
      </div>
    `;

    // Attach event listeners
    const avatar = document.getElementById('profile-avatar');
    if (avatar) {
      avatar.addEventListener('click', toggleProfileDropdown);
    }
    const logoutBtn = document.getElementById('profile-dropdown-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleProfileLogout);
    }
    const profileLink = document.getElementById('profile-dropdown-link');
    if (profileLink) {
      profileLink.addEventListener('click', () => {
        toggleProfileDropdown();
      });
    }
  } else {
    container.innerHTML = `
      <button id="auth-login-btn" class="text-brand hover:text-brand-gold premium-transition font-bold">Log In</button>
    `;
    const loginBtn = document.getElementById('auth-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => openAuthModal('signin'));
    }
  }
}

function handleProfileLogout() {
  handleCustomerLogout();
}

// ==========================================================================
// 👤 PROFILE PAGE
// ==========================================================================
function renderProfilePage(container) {
  const firstInitial = state.customerName ? state.customerName.charAt(0).toUpperCase() : '?';
  const currentProfileTab = window.location.hash.replace('#/profile/', '') || 'settings';
  
  container.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 py-10 animate-fade-in-up">
      <!-- Profile Header -->
      <div class="text-center mb-10">
        <div class="h-20 w-20 rounded-full bg-brand text-white flex items-center justify-center text-3xl font-extrabold mx-auto mb-4 shadow-md border-4 border-white ring-2 ring-neutral-100">
          ${firstInitial}
        </div>
        <h2 class="text-2xl font-extrabold uppercase tracking-tight text-brand">${state.customerName}</h2>
        <p class="text-sm text-brand-muted mt-1">${state.customerEmail}</p>
      </div>

      <div class="flex flex-col md:flex-row gap-8">
        <!-- LEFT: Mini Sidebar -->
        <div class="md:w-56 flex-shrink-0">
          <div class="bg-white border border-neutral-100 rounded-lg shadow-sm overflow-hidden sticky top-24">
            <nav class="flex flex-col">
              <button id="profile-tab-settings" data-tab="settings" class="flex items-center space-x-3 w-full text-left px-5 py-4 text-xs font-semibold uppercase tracking-premium premium-transition border-b border-neutral-100 ${currentProfileTab === 'settings' ? 'bg-brand text-white' : 'text-brand-muted hover:text-brand hover:bg-neutral-50'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </button>
              <button id="profile-tab-wishlist" data-tab="wishlist" class="flex items-center space-x-3 w-full text-left px-5 py-4 text-xs font-semibold uppercase tracking-premium premium-transition border-b border-neutral-100 ${currentProfileTab === 'wishlist' ? 'bg-brand text-white' : 'text-brand-muted hover:text-brand hover:bg-neutral-50'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span>Wishlist</span>
              </button>
              <button id="profile-tab-orders" data-tab="orders" class="flex items-center space-x-3 w-full text-left px-5 py-4 text-xs font-semibold uppercase tracking-premium premium-transition border-b border-neutral-100 ${currentProfileTab === 'orders' ? 'bg-brand text-white' : 'text-brand-muted hover:text-brand hover:bg-neutral-50'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
                <span>Orders</span>
              </button>
              <button id="profile-tab-newsletter" data-tab="newsletter" class="flex items-center space-x-3 w-full text-left px-5 py-4 text-xs font-semibold uppercase tracking-premium premium-transition border-b border-neutral-100 ${currentProfileTab === 'newsletter' ? 'bg-brand text-white' : 'text-brand-muted hover:text-brand hover:bg-neutral-50'}">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Newsletter</span>
              </button>
              <button id="profile-tab-logout" class="flex items-center space-x-3 w-full text-left px-5 py-4 text-xs font-semibold uppercase tracking-premium premium-transition text-red-400 hover:text-red-500 hover:bg-red-50">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Log Out</span>
              </button>
            </nav>
          </div>
        </div>

        <!-- RIGHT: Content Area -->
        <div id="profile-content" class="flex-1 min-w-0">
          <!-- Settings tab -->
          <div id="profile-view-settings" class="${currentProfileTab === 'settings' ? 'block' : 'hidden'}">
            <div class="bg-white border border-neutral-100 rounded-lg shadow-sm overflow-hidden">
              <div class="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
                <h3 class="text-xs uppercase tracking-premium font-extrabold text-brand flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Account Settings</span>
                </h3>
              </div>
              <form id="profile-form" class="p-6 space-y-5">
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Full Name</label>
                  <input type="text" id="profile-name" value="${state.customerName}" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="Your full name">
                </div>
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Email Address</label>
                  <input type="email" id="profile-email" value="${state.customerEmail}" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition bg-neutral-50 text-brand-muted" readonly>
                  <p class="text-[9px] text-brand-muted mt-1">Email cannot be changed.</p>
                </div>
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Phone Number</label>
                  <input type="tel" id="profile-phone" value="${state.customerPhone || ''}" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="+233 55 123 4567">
                </div>
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Delivery Address</label>
                  <input type="text" id="profile-address" value="${state.customerAddress || ''}" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="House / Block Number / Landmark">
                </div>
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Ghana Region</label>
                  <select id="profile-region" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none bg-white premium-transition">
                    <option value="">Select Region</option>
                    ${['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'].map(r => 
                      `<option value="${r}" ${state.customerRegion === r ? 'selected' : ''}>${r}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="pt-4 border-t border-neutral-100">
                  <button type="submit" class="w-full bg-brand text-white text-xs uppercase tracking-premium font-bold py-4 hover:bg-brand-hover premium-transition shadow-lg">Save Changes</button>
                </div>
              </form>
            </div>
          </div>

          <!-- Wishlist tab -->
          <div id="profile-view-wishlist" class="${currentProfileTab === 'wishlist' ? 'block' : 'hidden'}">
            <div class="bg-white border border-neutral-100 rounded-lg shadow-sm overflow-hidden">
              <div class="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
                <h3 class="text-xs uppercase tracking-premium font-extrabold text-brand flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>My Wishlist</span>
                </h3>
              </div>
              <div class="p-6 text-center">
                <p class="text-xs text-brand-muted mb-6">View and manage your saved favorites.</p>
                <a href="#/wishlist" class="inline-block bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-3 hover:bg-brand-hover premium-transition">Go to Wishlist</a>
              </div>
            </div>
          </div>

          <!-- Orders tab -->
          <div id="profile-view-orders" class="${currentProfileTab === 'orders' ? 'block' : 'hidden'}">
            <div class="bg-white border border-neutral-100 rounded-lg shadow-sm overflow-hidden">
              <div class="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
                <h3 class="text-xs uppercase tracking-premium font-extrabold text-brand flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0" />
                  </svg>
                  <span>Track Orders</span>
                </h3>
              </div>
              <div class="p-6 text-center">
                <p class="text-xs text-brand-muted mb-6">Track your delivery or view past orders.</p>
                <a href="#/track" class="inline-block bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-3 hover:bg-brand-hover premium-transition">Track an Order</a>
              </div>
            </div>
          </div>

          <!-- Newsletter tab -->
          <div id="profile-view-newsletter" class="${currentProfileTab === 'newsletter' ? 'block' : 'hidden'}">
            <div class="bg-white border border-neutral-100 rounded-lg shadow-sm overflow-hidden">
              <div class="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
                <h3 class="text-xs uppercase tracking-premium font-extrabold text-brand flex items-center space-x-2">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Newsletter Preferences</span>
                </h3>
              </div>
              <div class="p-6">
                <p class="text-xs text-brand-muted mb-4">Stay updated with our latest arrivals, exclusive offers, and style inspiration delivered to your inbox.</p>
                <div class="flex items-start space-x-3 mb-4">
                  <div class="flex items-center h-5">
                    <input id="newsletter-subscribed" type="checkbox" checked class="h-4 w-4 rounded border-neutral-300 text-brand focus:ring-brand premium-transition">
                  </div>
                  <label for="newsletter-subscribed" class="text-xs font-semibold text-brand">Subscribe to newsletter</label>
                </div>
                <p class="text-[10px] text-brand-muted">You can unsubscribe at any time. We respect your privacy.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach sidebar tab click listeners
  document.querySelectorAll('[id^="profile-tab-"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = btn.getAttribute('data-tab');
      if (tab === 'logout') {
        handleProfileLogout();
        return;
      }
      // Update hash to show the right tab
      window.location.hash = `#/profile/${tab}`;
    });
  });

  // Attach profile form submit listener
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', handleProfileUpdate);
  }

  // Attach profile page logout button
  const profileLogoutBtn = document.getElementById('profile-tab-logout');
  if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', handleProfileLogout);
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();
  
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const address = document.getElementById('profile-address').value.trim();
  const region = document.getElementById('profile-region').value;

  if (!name) {
    showNotification('Name is required.', 'error');
    return;
  }

  const btn = document.querySelector('#profile-form button[type="submit"]');
  btn.disabled = true;
  btn.innerText = 'Saving...';

  try {
    await apiFetch('/pj-customer-auth/update-profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify({ name, phone, address, region })
    });

    // Update state and session storage
    state.customerName = name;
    state.customerPhone = phone;
    state.customerAddress = address;
    state.customerRegion = region;
    sessionStorage.setItem('pj_customer_name', name);
    sessionStorage.setItem('pj_customer_phone', phone);
    sessionStorage.setItem('pj_customer_address', address);
    sessionStorage.setItem('pj_customer_region', region);

    showNotification('Profile updated successfully!');
    updateAuthHeaderUI();
    refreshRegionPrices();
  } catch (err) {
    showNotification(err.message || 'Failed to update profile.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Save Changes';
  }
}

// ==========================================================================
// 📂 CATEGORY SIDEBAR
// ==========================================================================

async function loadCategoriesSidebar() {
  const nav = document.getElementById('category-nav');
  if (!nav) return;

  try {
    const categories = await apiFetch('/pj-secure-boutique/get-categories');
    
    if (categories.length === 0) {
      nav.innerHTML = '<p class="text-xs text-brand-muted">No collections available</p>';
      return;
    }

    nav.innerHTML = categories.map(cat => `
      <a href="#/category/${encodeURIComponent(cat.name)}" 
         class="category-nav-item flex items-center space-x-3 p-3 rounded-lg hover:bg-neutral-50 premium-transition group"
         data-category="${cat.name}">
        <img src="${cat.image_url || 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=100'}" 
             class="h-10 w-10 object-cover bg-neutral-100 rounded border border-neutral-200 group-hover:border-brand premium-transition"
             alt="${cat.name}">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${cat.name}</p>
        </div>
      </a>
    `).join('');

    // Attach click handlers — simply navigate into the collection
    document.querySelectorAll('.category-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const category = item.getAttribute('data-category');
        window.location.hash = `#/category/${encodeURIComponent(category)}`;
      });
    });
  } catch (err) {
    nav.innerHTML = '<p class="text-xs text-red-500">Error loading collections</p>';
  }
}

function updateSidebarVisibility(hash) {
  const sidebar = document.getElementById('categories-sidebar');
  if (!sidebar) return;

  const isShopping =
    hash.startsWith('#/category/') ||
    hash.startsWith('#/product/');

  if (isShopping) {
    // Preserve the responsive "hidden on mobile, shown on lg+" behaviour.
    sidebar.classList.remove('hidden');
    sidebar.classList.add('lg:block');
  } else {
    // Keep it fully hidden on non-shopping pages (checkout, tracking, etc.)
    sidebar.classList.add('hidden');
    sidebar.classList.remove('lg:block');
  }
}

// Full-screen product image lightbox (used by the boutique product images)
function openImageLightbox(imageUrl, altText = '') {
  // Remove any existing lightbox first
  const existing = document.getElementById('image-lightbox');
  if (existing) {
    existing.remove();
  }

  const lightboxHTML = `
    <div id="image-lightbox" class="fixed inset-0 z-50 bg-neutral-900/90 backdrop-blur-sm flex items-center justify-center cursor-zoom-out animate-fade-in-up">
      <div class="relative max-w-5xl w-full mx-4 flex flex-col items-center">
        <img src="${imageUrl}" class="max-h-[85vh] w-full object-contain rounded-lg shadow-2xl border border-white/10" alt="${altText}">
        <p class="text-center text-white/70 text-xs uppercase tracking-premium mt-3">Click outside to close</p>
        <button id="image-lightbox-close" class="absolute -top-3 -right-3 sm:top-0 sm:right-0 bg-white text-brand h-10 w-10 rounded-full flex items-center justify-center text-xl font-bold shadow-lg hover:scale-110 premium-transition">&times;</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', lightboxHTML);

  const lightbox = document.getElementById('image-lightbox');
  const close = () => {
    const el = document.getElementById('image-lightbox');
    if (el) el.remove();
  };

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.id === 'image-lightbox-close') {
      close();
    }
  });
}

// ==========================================================================
// 🏠 HOME / CATALOG VIEW RENDER
// ==========================================================================
async function renderHome(container, categoryFilter = '', productTypeFilter = '') {
  let heroHTML = '';
  
  if (!categoryFilter) {
    heroHTML = `
      <section class="relative bg-neutral-50 h-[65vh] w-full overflow-hidden flex items-center mb-16 animate-fade-in-up">
        <img src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1200" class="absolute inset-0 h-full w-full object-cover object-center" alt="Fashion look">
        <div class="absolute inset-0 bg-neutral-900/10"></div>
        <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full z-10 text-white">
          <span class="text-xs uppercase tracking-wide font-extrabold text-neutral-200 block mb-3">Payjay Trends</span>
          <h2 class="text-5xl sm:text-6xl font-extrabold uppercase tracking-tight mb-8 leading-tight">STREETWEAR<br>ESSENTIALS</h2>
          <a href="#/category/Men" class="inline-block bg-white text-brand text-xs uppercase tracking-premium font-bold px-8 py-4 hover:bg-neutral-100 premium-transition shadow-lg">Discover Collection</a>
        </div>
      </section>
    `;
  }

  container.innerHTML = `
    ${heroHTML}
    
    <!-- New Arrivals Section (only on home page) -->
    ${!categoryFilter ? `
    <section id="new-arrivals-section" class="py-10 animate-fade-in-up">
      <div class="flex justify-between items-center mb-8">
        <h2 class="text-2xl font-bold uppercase tracking-premium text-brand">New Arrivals</h2>
        <span class="text-xs text-brand-muted uppercase tracking-premium font-semibold">Fresh drops</span>
      </div>
        <div id="new-arrivals-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-16">
        ${Array(4).fill(0).map(() => `
          <div class="space-y-2 md:space-y-3 animate-pulse">
            <div class="bg-neutral-100 h-48 sm:h-56 md:h-64 w-full"></div>
            <div class="h-3 bg-neutral-100 w-1/3"></div>
            <div class="h-3 bg-neutral-100 w-3/4"></div>
          </div>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <section class="py-10 animate-fade-in-up">
      <h2 class="text-2xl font-bold uppercase tracking-premium text-brand mb-10 text-center">${categoryFilter ? `${categoryFilter}'s Collection${productTypeFilter ? ` - ${productTypeFilter}` : ''}` : 'Boutique Shelf'}</h2>
      
      <!-- Search Bar -->
      <div class="max-w-md mx-auto mb-8">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-muted pointer-events-none" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" id="product-search" placeholder="Search products..." class="w-full border border-neutral-200 px-4 py-3 pl-10 text-sm focus:border-brand outline-none premium-transition">
        </div>
      </div>

      
      <div class="flex justify-center space-x-3 mb-8" id="category-filters">
        <!-- Category filters populated dynamically -->
      </div>
      
      <div class="flex justify-center mb-12" id="product-type-filters">
        <!-- Product type filters populated dynamically -->
      </div>

      <div id="product-grid-target" class="grid grid-cols-2 md:grid-cols-3 gap-8">
        ${Array(6).fill(0).map(() => `
          <div class="space-y-4 animate-pulse">
            <div class="bg-neutral-100 h-96 w-full"></div>
            <div class="h-4 bg-neutral-100 w-1/3"></div>
            <div class="h-4 bg-neutral-100 w-3/4"></div>
            <div class="h-4 bg-neutral-100 w-1/4"></div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- Recently Viewed (below Boutique Shelf, auto-animated grid) -->
    ${!categoryFilter && state.recentlyViewed.length > 0 ? `
    <section class="py-10 animate-fade-in-up">
      <div class="flex justify-between items-center mb-8">
        <h2 class="text-2xl font-bold uppercase tracking-premium text-brand">Recently Viewed</h2>
        <span class="text-xs text-brand-muted uppercase tracking-premium font-semibold">Your history</span>
      </div>
      <div id="recently-viewed-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <!-- 4 items shown at a time, auto-rotated via JS -->
      </div>
    </section>
    ` : ''}
  `;

  // Load and display new arrivals (only on home page)
  if (!categoryFilter) {
    try {
      const newArrivals = await apiFetch('/pj-secure-boutique/get-new-arrivals?limit=4');
      const arrivalsGrid = document.getElementById('new-arrivals-grid');
      
      if (arrivalsGrid && newArrivals.length > 0) {
        arrivalsGrid.innerHTML = newArrivals.map(prod => `
          <div class="group flex flex-col relative animate-fade-in-up">
            <div class="relative overflow-hidden bg-neutral-50 h-48 sm:h-56 md:h-64 custom-hover-zoom border border-neutral-100">
              ${prod.stock === 0 ? '<span class="absolute top-3 left-3 bg-red-500 text-[9px] font-bold text-white uppercase tracking-premium px-2 py-1 z-10">Sold Out</span>' : ''}
              <a href="#/product/${prod.slug}">
                <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
              </a>
              ${prod.stock > 0 ? `
                <div class="absolute bottom-0 inset-x-0 p-3 bg-white/95 border-t border-neutral-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <button class="w-full bg-brand text-white hover:bg-brand-hover text-xs uppercase tracking-premium font-bold py-2.5 premium-transition quick-add-btn" data-slug="${prod.slug}">Quick Add</button>
                </div>
              ` : ''}
            </div>
            <div class="py-3 space-y-1">
              <span class="text-[9px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
              <a href="#/product/${prod.slug}" class="block"><h3 class="text-xs font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
              <p class="text-xs font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
            </div>
          </div>
        `).join('');

        // Attach quick add event listeners for new arrivals
        document.querySelectorAll('#new-arrivals-grid .quick-add-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            quickAddToCart(btn.getAttribute('data-slug'));
          });
        });
      }
    } catch (err) {
      console.error('Error loading new arrivals:', err);
    }
  }

  // Load categories and populate category filter buttons
  try {
    const categories = await apiFetch('/pj-secure-boutique/get-categories');
    const categoryFiltersContainer = document.getElementById('category-filters');
    
    if (categoryFiltersContainer && categories.length > 0) {
      const allFilterClass = !categoryFilter ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50';
      
      let categoryFiltersHTML = `
        <button class="px-5 py-2.5 text-xs font-semibold uppercase tracking-premium border transition-all ${allFilterClass}" data-filter="">All Styles</button>
      `;
      
      categories.forEach(cat => {
        const isActive = categoryFilter === cat.name;
        const activeClass = isActive ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50';
        categoryFiltersHTML += `<button class="px-5 py-2.5 text-xs font-semibold uppercase tracking-premium border transition-all ${activeClass}" data-filter="${cat.name}">${cat.name}</button>`;
      });
      
      categoryFiltersContainer.innerHTML = categoryFiltersHTML;

      // Attach category filter button event listeners
      document.querySelectorAll('#category-filters [data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          const filter = btn.getAttribute('data-filter');
          window.location.hash = filter ? `#/category/${filter}` : '#/';
        });
      });
    }
  } catch (err) {
    console.error('Error loading category filters:', err);
  }

  // Load product type filters based on selected category
  try {
    const productTypes = await apiFetch(`/pj-secure-boutique/get-product-types?category=${encodeURIComponent(categoryFilter || '')}`);
    const productTypeFiltersContainer = document.getElementById('product-type-filters');
    
    if (productTypeFiltersContainer && productTypes.length > 0) {
      let typeFiltersHTML = '';
      
      // Add "All" button
      const allTypeClass = !productTypeFilter ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50';
      typeFiltersHTML += `
        <button class="px-4 py-2 text-xs font-semibold uppercase tracking-premium border transition-all ${allTypeClass}" data-type="">All Types</button>
      `;
      
      productTypes.forEach(type => {
        const isActive = productTypeFilter === type;
        const activeClass = isActive ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50';
        typeFiltersHTML += `
          <button class="px-4 py-2 text-xs font-semibold uppercase tracking-premium border transition-all ${activeClass}" data-type="${type}">${type}</button>
        `;
      });
      
      productTypeFiltersContainer.innerHTML = typeFiltersHTML;

      // Attach product type filter button event listeners
      document.querySelectorAll('#product-type-filters [data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-type');
          if (categoryFilter) {
            window.location.hash = type ? `#/category/${categoryFilter}?type=${encodeURIComponent(type)}` : `#/category/${categoryFilter}`;
          } else {
            window.location.hash = type ? `#/?type=${encodeURIComponent(type)}` : '#/';
          }
        });
      });
    } else if (productTypeFiltersContainer) {
      productTypeFiltersContainer.innerHTML = '';
    }
  } catch (err) {
    console.error('Error loading product type filters:', err);
  }

  // Load the product grid (reusable so search can refresh it without rebuilding the page)
  await renderProductGrid(categoryFilter, productTypeFilter);

  // Populate Recently Viewed grid (auto-rotating fade animation)
  if (!categoryFilter && state.recentlyViewed.length > 0) {
    try {
      const grid = document.getElementById('recently-viewed-grid');
      if (grid) {
        const allProducts = await apiFetch('/pj-secure-boutique/get-shelf');
        const matched = state.recentlyViewed
          .map(r => allProducts.find(p => p.id === r.id))
          .filter(Boolean);

        if (matched.length > 0) {
          // Show up to 4 products in a grid. Auto-rotate every 5s with fade.
          const visible = matched.slice(0, 4);
          grid.innerHTML = visible.map(prod => `
            <div class="group flex flex-col recent-item" style="opacity: 1; transition: opacity 0.8s ease;">
              <div class="relative overflow-hidden bg-neutral-50 h-48 sm:h-56 md:h-64 custom-hover-zoom border border-neutral-100">
                ${prod.stock === 0 ? '<span class="absolute top-3 left-3 bg-red-500 text-[9px] font-bold text-white uppercase tracking-premium px-2 py-1 z-10">Sold Out</span>' : ''}
                <a href="#/product/${prod.slug}">
                  <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
                </a>
              </div>
              <div class="py-3 space-y-1">
                <span class="text-[9px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
                <a href="#/product/${prod.slug}" class="block"><h3 class="text-xs font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
                <p class="text-xs font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
              </div>
            </div>
          `).join('');

          // Auto-cycle through products if we have more than 4, every 5 seconds
          if (matched.length > 4) {
            let startIdx = 0;
            setInterval(() => {
              startIdx = (startIdx + 1) % matched.length;
              const batch = [];
              for (let i = 0; i < 4; i++) {
                batch.push(matched[(startIdx + i) % matched.length]);
              }
              const items = grid.querySelectorAll('.recent-item');
              // Fade out
              items.forEach(el => el.style.opacity = '0');
              setTimeout(() => {
                grid.innerHTML = batch.map(prod => `
                  <div class="group flex flex-col recent-item" style="opacity: 0; transition: opacity 0.8s ease;">
                    <div class="relative overflow-hidden bg-neutral-50 h-48 sm:h-56 md:h-64 custom-hover-zoom border border-neutral-100">
                      ${prod.stock === 0 ? '<span class="absolute top-3 left-3 bg-red-500 text-[9px] font-bold text-white uppercase tracking-premium px-2 py-1 z-10">Sold Out</span>' : ''}
                      <a href="#/product/${prod.slug}">
                        <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
                      </a>
                    </div>
                    <div class="py-3 space-y-1">
                      <span class="text-[9px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
                      <a href="#/product/${prod.slug}" class="block"><h3 class="text-xs font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
                      <p class="text-xs font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
                    </div>
                  </div>
                `).join('');
                // Fade in
                requestAnimationFrame(() => {
                  grid.querySelectorAll('.recent-item').forEach(el => el.style.opacity = '1');
                });
              }, 800);
            }, 5000);
          }
        } else {
          const section = grid.closest('section');
          if (section) section.classList.add('hidden');
        }
      }
    } catch (err) {
      console.error('Error loading recently viewed:', err);
    }
  }

  // Search functionality
  const searchInput = document.getElementById('product-search');
  if (searchInput && !categoryFilter) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        const query = e.target.value.trim();
        if (query.length < 2) {
          // Reload original products without destroying the search input
          renderProductGrid(categoryFilter, productTypeFilter);
          return;
        }
        
        try {
          const results = await apiFetch(`/pj-secure-boutique/search?q=${encodeURIComponent(query)}`);
          const gridTarget = document.getElementById('product-grid-target');
          
          if (results.length === 0) {
            gridTarget.innerHTML = `<p class="text-xs uppercase tracking-premium font-bold text-brand-muted text-center py-20 col-span-full">No products match your search.</p>`;
            return;
          }

          gridTarget.innerHTML = results.map(prod => `
            <div class="group flex flex-col relative animate-fade-in-up">
              <div class="relative overflow-hidden bg-neutral-50 h-[380px] sm:h-[440px] custom-hover-zoom border border-neutral-100">
                ${prod.stock === 0 ? '<span class="absolute top-4 left-4 bg-red-500 text-[10px] font-bold text-white uppercase tracking-premium px-3 py-1.5 z-10 shadow-sm">Sold Out</span>' : ''}
                <a href="#/product/${prod.slug}">
                  <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
                </a>
                
                ${prod.stock > 0 ? `
                  <div class="absolute bottom-0 inset-x-0 p-4 bg-white/95 border-t border-neutral-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex">
                    <button class="w-full bg-brand text-white hover:bg-brand-hover text-xs uppercase tracking-premium font-bold py-3 premium-transition quick-add-btn" data-slug="${prod.slug}">Quick Add</button>
                  </div>
                ` : ''}
              </div>
              <div class="py-4 space-y-1">
                <span class="text-[10px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
                <a href="#/product/${prod.slug}" class="block"><h3 class="text-sm font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
                <p class="text-sm font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
              </div>
            </div>
          `).join('');

          // Re-attach quick add listeners for search results
          document.querySelectorAll('#product-grid-target .quick-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              quickAddToCart(btn.getAttribute('data-slug'));
            });
          });
        } catch (err) {
          console.error('Search error:', err);
        }
      }, 300);
    });
  }
}

// Fetch and render the product grid for the given category/type filters.
async function renderProductGrid(categoryFilter = '', productTypeFilter = '') {
  const gridTarget = document.getElementById('product-grid-target');
  if (!gridTarget) return;

  try {
    let url = '/pj-secure-boutique/get-shelf';
    const params = new URLSearchParams();
    
    if (categoryFilter) params.append('category', categoryFilter);
    if (productTypeFilter) params.append('type', productTypeFilter);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
        
    state.products = await apiFetch(url);

    if (state.products.length === 0) {
      gridTarget.innerHTML = `<p class="text-xs uppercase tracking-premium font-bold text-brand-muted text-center py-20 col-span-full">No products found in this category.</p>`;
      return;
    }

    gridTarget.innerHTML = state.products.map(prod => `
      <div class="group flex flex-col relative animate-fade-in-up">
        <div class="relative overflow-hidden bg-neutral-50 h-48 sm:h-64 md:h-80 custom-hover-zoom border border-neutral-100">
          ${prod.stock === 0 ? '<span class="absolute top-4 left-4 bg-red-500 text-[10px] font-bold text-white uppercase tracking-premium px-3 py-1.5 z-10 shadow-sm">Sold Out</span>' : ''}
          <a href="#/product/${prod.slug}">
            <img src="${prod.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600'}" class="h-full w-full object-cover object-center" alt="${prod.name}" loading="lazy">
          </a>
          
          ${prod.stock > 0 ? `
            <div class="absolute bottom-0 inset-x-0 p-4 bg-white/95 border-t border-neutral-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 flex">
              <button class="w-full bg-brand text-white hover:bg-brand-hover text-xs uppercase tracking-premium font-bold py-3 premium-transition quick-add-btn" data-slug="${prod.slug}">Quick Add</button>
            </div>
          ` : ''}
        </div>
        <div class="py-4 space-y-1">
          <span class="text-[10px] uppercase font-bold text-brand-muted tracking-premium">${prod.category}</span>
          <a href="#/product/${prod.slug}" class="block"><h3 class="text-sm font-semibold text-brand truncate group-hover:text-brand-gold premium-transition">${prod.name}</h3></a>
          <p class="text-sm font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</p>
        </div>
      </div>
    `).join('');

    // Attach quick add event listeners
    document.querySelectorAll('.quick-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        quickAddToCart(btn.getAttribute('data-slug'));
      });
    });
  } catch (err) {
    gridTarget.innerHTML = `
      <p class="text-xs font-bold uppercase tracking-premium text-brand-muted text-center py-20 col-span-full">Catalog currently updating. Please check back shortly.</p>
    `;
  }
}

// ==========================================================================
// ❤️ WISHLIST PAGE VIEW
// ==========================================================================
async function renderWishlist(container) {
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-10 animate-fade-in-up">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold uppercase tracking-tight text-brand">Your Wishlist</h2>
        <p class="text-sm text-brand-muted mt-2">Saved favorites for ${state.customerName || 'your account'}</p>
      </div>
      <div id="wishlist-grid" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        ${Array(4).fill(0).map(() => `
          <div class="space-y-4 animate-pulse">
            <div class="bg-neutral-100 h-72 w-full"></div>
            <div class="h-4 bg-neutral-100 w-1/2"></div>
            <div class="h-4 bg-neutral-100 w-1/4"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (!state.customerToken) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <h2 class="text-2xl uppercase tracking-premium font-extrabold text-brand mb-4">Sign in to view your wishlist</h2>
        <p class="text-sm text-brand-muted mb-8">Your saved favorites are linked to your account.</p>
        <button class="bg-brand text-white text-xs uppercase tracking-premium font-bold px-8 py-4 hover:bg-brand-hover premium-transition" id="wishlist-login-btn">Log In</button>
      </div>
    `;
    const loginBtn = document.getElementById('wishlist-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => openAuthModal('signin'));
    return;
  }

  try {
    await loadWishlist();
    const products = await apiFetch('/pj-secure-boutique/get-wishlist-products', {
      headers: { 'Authorization': `Bearer ${state.customerToken}` }
    });

    const grid = document.getElementById('wishlist-grid');
    if (!grid) return;

    if (products.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-20">
          <p class="text-xs uppercase tracking-premium font-bold text-brand-muted">No saved items yet.</p>
          <a href="#/" class="inline-block mt-6 bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-4 hover:bg-brand-hover premium-transition">Browse the Boutique</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = products.map(prod => renderProductCard(prod, { showWishlist: true })).join('');
    attachProductCardListeners(grid);
  } catch (err) {
    const grid = document.getElementById('wishlist-grid');
    if (grid) {
      grid.innerHTML = `<p class="col-span-full text-center text-xs uppercase tracking-premium font-bold text-brand-muted py-20">Could not load your wishlist.</p>`;
    }
  }
}

// ==========================================================================
// 📖 LOOKBOOK INDEX VIEW
// ==========================================================================
async function renderLookbookIndex(container) {
  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-10 animate-fade-in-up">
      <div class="text-center mb-12">
        <span class="text-xs uppercase tracking-premium font-bold text-brand-gold">Editorial</span>
        <h2 class="text-3xl font-extrabold uppercase tracking-tight text-brand mt-2">Lookbooks</h2>
        <p class="text-sm text-brand-muted mt-2">Shop the look — curated styling inspiration.</p>
      </div>
      <div id="lookbook-grid" class="grid grid-cols-1 md:grid-cols-3 gap-8">
        ${Array(3).fill(0).map(() => `
          <div class="space-y-4 animate-pulse">
            <div class="bg-neutral-100 h-80 w-full"></div>
            <div class="h-4 bg-neutral-100 w-1/2"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  try {
    const lookbooks = await apiFetch('/pj-secure-boutique/get-lookbooks');
    const grid = document.getElementById('lookbook-grid');
    if (!grid) return;

    if (lookbooks.length === 0) {
      grid.innerHTML = `<p class="col-span-full text-center text-xs uppercase tracking-premium font-bold text-brand-muted py-20">Lookbooks coming soon.</p>`;
      return;
    }

    grid.innerHTML = lookbooks.map(lb => `
      <a href="#/lookbook/${encodeURIComponent(lb.slug)}" class="group relative block h-96 overflow-hidden bg-neutral-100 animate-fade-in-up">
        <img src="${lb.image_url || 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=800'}" class="h-full w-full object-cover object-center premium-transition group-hover:scale-105" alt="${lb.title}">
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
        <div class="absolute bottom-0 left-0 right-0 p-6 text-white">
          <p class="text-[10px] uppercase tracking-premium font-bold text-brand-gold mb-1">${lb.subtitle || 'Lookbook'}</p>
          <h3 class="text-xl font-extrabold uppercase tracking-tight">${lb.title}</h3>
          <span class="inline-block mt-3 text-xs uppercase tracking-premium font-bold border border-white/60 px-4 py-2 premium-transition group-hover:bg-white group-hover:text-brand">Shop the Look</span>
        </div>
      </a>
    `).join('');
  } catch (err) {
    const grid = document.getElementById('lookbook-grid');
    if (grid) grid.innerHTML = `<p class="col-span-full text-center text-xs uppercase tracking-premium font-bold text-brand-muted py-20">Could not load lookbooks.</p>`;
  }
}

// ==========================================================================
// 📖 LOOKBOOK DETAIL VIEW (Shop the Look)
// ==========================================================================
async function renderLookbookDetail(container, slug) {
  container.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-20 text-center text-xs uppercase tracking-premium font-bold text-brand-muted">Curating this look...</div>`;

  try {
    const lb = await apiFetch(`/pj-secure-boutique/get-lookbook/${encodeURIComponent(slug)}`);

    const products = lb.products || [];

    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in-up">
        <div class="relative h-[55vh] w-full overflow-hidden flex items-end mb-12 bg-neutral-100">
          <img src="${lb.image_url || 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=1200'}" class="absolute inset-0 h-full w-full object-cover object-center" alt="${lb.title}">
          <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
          <div class="relative z-10 p-8 text-white max-w-3xl">
            <p class="text-[10px] uppercase tracking-premium font-bold text-brand-gold mb-2">${lb.subtitle || 'Lookbook'}</p>
            <h2 class="text-4xl sm:text-5xl font-extrabold uppercase tracking-tight leading-tight">${lb.title}</h2>
            <p class="text-sm mt-4 max-w-xl text-neutral-200">${lb.description || ''}</p>
          </div>
        </div>

        <h3 class="text-2xl font-bold uppercase tracking-premium text-brand mb-10 text-center">Shop the Look</h3>
        <div id="lookbook-products" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          ${products.length === 0 ? `<p class="col-span-full text-center text-xs uppercase tracking-premium font-bold text-brand-muted py-20">No products in this look yet.</p>` : ''}
        </div>
      </div>
    `;

    const grid = document.getElementById('lookbook-products');
    if (grid && products.length > 0) {
      grid.innerHTML = products.map(prod => renderProductCard(prod, { showWishlist: true })).join('');
      attachProductCardListeners(grid);
    }
  } catch (err) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <h2 class="text-xl uppercase tracking-premium font-extrabold mb-4">Lookbook Not Found</h2>
        <p class="text-sm text-brand-muted mb-8">${err.message || 'This editorial is unavailable.'}</p>
        <a href="#/lookbook" class="bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-4 hover:bg-brand-hover premium-transition">All Lookbooks</a>
      </div>
    `;
  }
}

// ==========================================================================
// 🔍 PRODUCT DETAIL PAGE VIEW
// ==========================================================================
async function renderProductDetail(container, slug) {
  container.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-20 text-center text-xs uppercase tracking-premium font-bold text-brand-muted">Fetching item specifications...</div>`;

  try {
    const prod = await apiFetch(`/pj-secure-boutique/get-shelf/${slug}`);

    // Track this product in the customer's Recently Viewed list
    recordRecentlyViewed(prod);

    const heartFilled = isWishlisted(prod.id);
    
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in-up">
        <div class="text-[10px] uppercase font-bold text-brand-muted tracking-premium mb-8">
          <a href="#/" class="hover:text-brand">Home</a> / <a href="#/category/${prod.category}" class="hover:text-brand">${prod.category}</a> / ${prod.name}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20">
          <div class="bg-neutral-50 overflow-hidden border border-neutral-100 max-h-[400px] sm:max-h-[500px] md:max-h-[600px]">
            <img src="${prod.image_url}" alt="${prod.name}" class="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105" loading="lazy">
          </div>
          
          <div class="flex flex-col justify-center">
            <div class="flex items-start justify-between gap-4">
              <h2 class="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-brand mb-4 leading-tight">${prod.name}</h2>
              <button class="wishlist-toggle shrink-0 h-11 w-11 flex items-center justify-center rounded-full border border-neutral-200 premium-transition hover:scale-110 ${heartFilled ? 'text-red-500' : 'text-brand-muted'}" data-id="${prod.id}" aria-label="Save to wishlist">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="${heartFilled ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            </div>
            
            <div class="border-b border-neutral-100 pb-6 mb-6">
              <span class="text-2xl font-extrabold text-brand">GH₵ ${parseFloat(prod.price).toFixed(2)}</span>
              <div class="mt-3 text-[10px] font-bold uppercase tracking-premium">
                ${prod.stock > 0 
                  ? `<span class="text-green-500">● ${prod.stock} items in stock</span>`
                  : `<span class="text-red-500">● Out of Stock</span>`
                }
              </div>
            </div>
            
            <p class="text-sm text-brand-muted leading-relaxed mb-8">${prod.description || 'Premium boutique apparel crafted with quality stitching.'}</p>
            
            ${prod.stock > 0 ? `
              <div class="mb-6">
                <h4 class="text-[10px] uppercase font-bold text-brand tracking-premium mb-3">Select Color</h4>
                <div class="flex gap-2 flex-wrap" id="detail-color-swatches">
                  ${prod.colors.map((c, i) => `
                    <button class="border px-4 py-2.5 text-xs font-semibold uppercase tracking-premium premium-transition ${i === 0 ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50'}" data-color="${c}">${c}</button>
                  `).join('')}
                </div>
              </div>
              
              <div class="mb-8">
                <h4 class="text-[10px] uppercase font-bold text-brand tracking-premium mb-3">Select Size</h4>
                <div class="flex gap-2 flex-wrap" id="detail-size-swatches">
                  ${prod.sizes.map((s, i) => `
                    <button class="border min-w-[48px] h-12 flex items-center justify-center text-xs font-semibold uppercase tracking-premium premium-transition ${i === 0 ? 'bg-brand text-white border-brand' : 'bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50'}" data-size="${s}">${s}</button>
                  `).join('')}
                </div>
              </div>
              
              <div class="flex space-x-4">
                <div class="flex border border-neutral-200 h-14">
                  <button class="w-12 flex items-center justify-center font-bold text-brand hover:bg-neutral-50 premium-transition" id="detail-qty-minus">-</button>
                  <input type="text" id="detail-qty" value="1" readonly class="w-12 text-center font-bold text-sm bg-white outline-none">
                  <button class="w-12 flex items-center justify-center font-bold text-brand hover:bg-neutral-50 premium-transition" id="detail-qty-plus">+</button>
                </div>
                
                <button class="flex-1 bg-brand hover:bg-brand-hover text-white text-xs uppercase tracking-premium font-bold h-14 premium-transition shadow-lg" id="add-detail-to-cart" data-id="${prod.id}" data-name="${prod.name.replace(/'/g, "\\'")}" data-price="${prod.price}" data-image="${prod.image_url || ''}" data-stock="${prod.stock}">Add to selection</button>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // Color swatch listeners
    const colors = document.querySelectorAll('#detail-color-swatches button');
    colors.forEach(btn => btn.addEventListener('click', () => {
      colors.forEach(c => {
        c.className = "border px-4 py-2.5 text-xs font-semibold uppercase tracking-premium bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50 premium-transition";
      });
      btn.className = "border px-4 py-2.5 text-xs font-semibold uppercase tracking-premium bg-brand text-white border-brand premium-transition";
    }));

    // Size swatch listeners
    const sizes = document.querySelectorAll('#detail-size-swatches button');
    sizes.forEach(btn => btn.addEventListener('click', () => {
      sizes.forEach(s => {
        s.className = "border min-w-[48px] h-12 flex items-center justify-center text-xs font-semibold uppercase tracking-premium bg-white text-brand-muted border-neutral-200 hover:bg-neutral-50 premium-transition";
      });
      btn.className = "border min-w-[48px] h-12 flex items-center justify-center text-xs font-semibold uppercase tracking-premium bg-brand text-white border-brand premium-transition";
    }));

    // Quantity buttons
    const qtyMinus = document.getElementById('detail-qty-minus');
    const qtyPlus = document.getElementById('detail-qty-plus');
    if (qtyMinus) qtyMinus.addEventListener('click', () => adjustDetailQty(-1));
    if (qtyPlus) qtyPlus.addEventListener('click', () => adjustDetailQty(1));

    // Add to cart button
    const addBtn = document.getElementById('add-detail-to-cart');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addDetailToCart(
          parseInt(addBtn.getAttribute('data-id')),
          addBtn.getAttribute('data-name'),
          parseFloat(addBtn.getAttribute('data-price')),
          addBtn.getAttribute('data-image'),
          parseInt(addBtn.getAttribute('data-stock'))
        );
      });
    }

    // Wishlist toggle on product detail page
    const detailWishlistBtn = document.querySelector('#app .wishlist-toggle');
    if (detailWishlistBtn) {
      detailWishlistBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = parseInt(detailWishlistBtn.getAttribute('data-id'));
        const saved = await toggleWishlist(id);
        const svg = detailWishlistBtn.querySelector('svg');
        if (svg) svg.setAttribute('fill', saved ? 'currentColor' : 'none');
        detailWishlistBtn.classList.toggle('text-red-500', saved);
        detailWishlistBtn.classList.toggle('text-brand-muted', !saved);
      });
    }

  } catch (err) {
    container.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <h2 class="text-xl uppercase tracking-premium font-extrabold mb-4">Item Catalog Sync Issue</h2>
        <p class="text-sm text-brand-muted mb-8">${err.message || 'Details not found.'}</p>
        <a href="#/" class="bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-4 hover:bg-brand-hover premium-transition">Return to Catalog</a>
      </div>
    `;
  }
}

function adjustDetailQty(amount) {
  const el = document.getElementById('detail-qty');
  let val = parseInt(el.value);
  val = Math.max(1, val + amount);
  el.value = val;
}

function quickAddToCart(slug) {
  const prod = state.products.find(p => p.slug === slug);
  if (!prod) return;
  
  addToCart({
    id: prod.id,
    name: prod.name,
    price: parseFloat(prod.price),
    image: prod.image_url,
    size: prod.sizes[0],
    color: prod.colors[0],
    quantity: 1,
    stock: prod.stock
  });
}

function addDetailToCart(id, name, price, image, stock) {
  const colorNode = document.querySelector('#detail-color-swatches button.border-brand');
  const sizeNode = document.querySelector('#detail-size-swatches button.border-brand');
  const qty = parseInt(document.getElementById('detail-qty').value);

  addToCart({
    id,
    name,
    price: parseFloat(price),
    image,
    size: sizeNode ? sizeNode.dataset.size : 'M',
    color: colorNode ? colorNode.dataset.color : 'White',
    quantity: qty,
    stock
  });
}

// ==========================================================================
// 🛒 SHOPPING BAG OVERLAY & EVENTS
// ==========================================================================
function initCartListeners() {
  const btnOpen = document.getElementById('cart-toggle-btn');
  const btnClose = document.getElementById('cart-close-btn');
  const overlayClose = document.getElementById('cart-overlay-close');
  const sidebar = document.getElementById('cart-sidebar');
  const btnCheckout = document.getElementById('checkout-btn');

  const openDrawer = () => {
    sidebar.classList.remove('invisible');
    sidebar.querySelector('.cart-drawer-translate').classList.remove('translate-x-full');
  };
  const closeDrawer = () => {
    sidebar.querySelector('.cart-drawer-translate').classList.add('translate-x-full');
    setTimeout(() => sidebar.classList.add('invisible'), 300);
  };

  btnOpen.addEventListener('click', openDrawer);
  btnClose.addEventListener('click', closeDrawer);
  overlayClose.addEventListener('click', closeDrawer);

  btnCheckout.addEventListener('click', () => {
    if (state.cart.length === 0) {
      showNotification('Cart bag is empty.', 'error');
      return;
    }
    closeDrawer();
    window.location.hash = '#/checkout';
  });
}

async function refreshCartPrices() {
  if (!state.customerRegion || state.cart.length === 0) return;
  for (const item of state.cart) {
    const resolved = await resolvePrice(item.id, item.basePrice || item.price, state.customerRegion);
    item.price = resolved;
  }
}

function addToCart(item) {
  const index = state.cart.findIndex(i => i.id === item.id && i.size === item.size && i.color === item.color);
  
  if (index > -1) {
    const qty = state.cart[index].quantity + item.quantity;
    if (qty > item.stock) {
      showNotification(`Max stock limit is ${item.stock}.`, 'error');
      return;
    }
    state.cart[index].quantity = qty;
  } else {
    // Store base price so cart totals can be recalculated with regional overrides
    state.cart.push({
      ...item,
      basePrice: parseFloat(item.price),
      price: parseFloat(item.price)
    });
  }
  
  updateCartUI();
  showNotification(`Added ${item.name} to bag.`);
  
  const sidebar = document.getElementById('cart-sidebar');
  sidebar.classList.remove('invisible');
  sidebar.querySelector('.cart-drawer-translate').classList.remove('translate-x-full');
}

function removeCartItem(idx) {
  state.cart.splice(idx, 1);
  updateCartUI();
}

async function updateCartUI() {
  const count = document.getElementById('cart-badge-count');
  const container = document.getElementById('cart-items-container');
  const totalEl = document.getElementById('cart-total-price');

  await refreshCartPrices();

  const totalQty = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  count.innerText = totalQty;

  const totalBill = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  totalEl.innerText = `GH₵ ${totalBill.toFixed(2)}`;

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div class="text-center py-20 text-xs font-bold uppercase tracking-premium text-brand-muted">
        Your selection bag is empty.
      </div>
    `;
    return;
  }

  container.innerHTML = state.cart.map((item, idx) => `
    <div class="flex items-center justify-between border-b border-neutral-100 pb-4">
      <div class="flex items-center space-x-4">
        <img src="${item.image}" class="h-16 w-12 object-cover bg-neutral-50">
        <div>
          <h4 class="text-xs font-semibold text-brand max-w-[180px] truncate">${item.name}</h4>
          <p class="text-[9px] uppercase tracking-premium text-brand-muted mt-1">Size: ${item.size} | Color: ${item.color} | Qty: ${item.quantity}</p>
          <p class="text-xs font-extrabold text-brand mt-1">GH₵ ${(item.price * item.quantity).toFixed(2)}</p>
        </div>
      </div>
      <button class="text-brand-muted hover:text-red-500 premium-transition remove-cart-item" data-index="${idx}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  `).join('');

  // Attach remove cart item listeners
  document.querySelectorAll('.remove-cart-item').forEach(btn => {
    btn.addEventListener('click', () => {
      removeCartItem(parseInt(btn.getAttribute('data-index')));
    });
  });
}

// ==========================================================================
// 💳 CHECKOUT VIEW RENDER & PAYMENT
// ==========================================================================
async function renderCheckout(container) {
  if (state.cart.length === 0) {
    container.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-20 text-center"><p class="text-sm text-brand-muted">Cart is empty.</p></div>`;
    return;
  }

  await refreshCartPrices();

  const totalBill = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const regions = [
    'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 
    'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 
    'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'
  ];

  container.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in-up">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        <div class="lg:col-span-7 space-y-6">
          <div class="bg-white border border-neutral-100 p-8 shadow-sm">
            <h3 class="text-sm font-extrabold uppercase tracking-premium border-b border-brand pb-3 mb-6">Delivery details (Ghana Only)</h3>
            <form id="checkout-form">
              <div class="mb-4">
                <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Recipient Name</label>
                <input type="text" id="c-name" required autocomplete="name" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="Daniel Mensah" value="${state.customerName || ''}">
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Email Address</label>
                  <input type="email" id="c-email" required autocomplete="email" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="daniel@domain.com" value="${state.customerEmail || ''}">
                </div>
                <div>
                  <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Contact Hotline</label>
                  <input type="tel" id="c-phone" required autocomplete="tel" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="+233 55 123 4567" value="${state.customerPhone || ''}">
                </div>
              </div>

              <div class="mb-4">
                <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Shipping Street Address</label>
                <input type="text" id="c-address" required autocomplete="street-address" class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none premium-transition" placeholder="House / Block Number / Landmark" value="${state.customerAddress || ''}">
              </div>

              <div class="mb-6">
                <label class="block text-[10px] uppercase tracking-premium font-bold text-brand-muted mb-2">Ghana Region</label>
                <select id="c-region" required class="w-full border border-neutral-200 px-4 py-3 text-sm focus:border-brand outline-none bg-white premium-transition">
                  <option value="" disabled ${!state.customerRegion ? 'selected' : ''}>Select Region</option>
                  ${regions.map(r => `<option value="${r}" ${state.customerRegion === r ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
              </div>

              <button type="submit" class="w-full bg-brand text-white text-xs uppercase tracking-premium font-bold py-4 hover:bg-brand-hover premium-transition shadow-lg">Proceed to Paystack</button>
            </form>
          </div>
        </div>

        <div class="lg:col-span-5 space-y-6">
          <div class="bg-white border border-neutral-100 p-8 shadow-sm">
            <h3 class="text-sm font-extrabold uppercase tracking-premium border-b border-brand pb-3 mb-6">Summary</h3>
            <div class="space-y-4 max-h-[300px] overflow-y-auto pr-2">
              ${state.cart.map(item => `
                <div class="flex justify-between items-center text-xs pb-3 border-b border-neutral-100">
                  <div>
                    <p class="font-semibold text-brand">${item.name}</p>
                    <p class="text-[9px] uppercase tracking-premium text-brand-muted mt-1">Size: ${item.size} | Color: ${item.color} | Qty: ${item.quantity}</p>
                  </div>
                  <span class="font-bold text-brand">GH₵ ${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              `).join('')}
            </div>

            <div class="border-t border-brand pt-4 mt-6 flex justify-between items-center text-sm font-extrabold uppercase tracking-premium mb-6">
              <span>Grand Total</span>
              <span>GH₵ ${totalBill.toFixed(2)}</span>
            </div>

            <div class="flex items-center justify-center space-x-2 bg-neutral-50 py-3 text-[10px] text-brand-muted uppercase tracking-premium font-bold">
              <span>Secured By</span>
              <span class="bg-[#09a5db] text-white px-2 py-0.5 rounded text-[8px] tracking-normal font-black">paystack</span>
            </div>

            <div class="border-t border-neutral-100 mt-6 pt-4 text-center">
              <span class="text-[9px] uppercase tracking-premium font-bold text-brand-muted block mb-2">Sandbox Simulation</span>
              <button id="sandbox-checkout-btn" class="w-full border border-brand text-brand hover:bg-brand hover:text-white py-2.5 text-[10px] uppercase font-bold tracking-premium premium-transition">Verify Sandbox Bypass</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Attach checkout form submit
  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', handleCheckoutSubmit);
  }

  // Attach sandbox button
  const sandboxBtn = document.getElementById('sandbox-checkout-btn');
  if (sandboxBtn) {
    sandboxBtn.addEventListener('click', triggerSandboxCheckout);
  }
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();

  const checkoutBtn = document.querySelector('#checkout-form button[type="submit"]');
  checkoutBtn.disabled = true;
  checkoutBtn.innerText = 'Creating order...';

  // Check if PaystackPop is loaded
  if (typeof PaystackPop === 'undefined') {
    checkoutBtn.disabled = false;
    checkoutBtn.innerText = 'Proceed to Paystack';
    showNotification('Payment system loading. Please try again in a moment.', 'error');
    return;
  }

  const orderPayload = {
    customer_name: document.getElementById('c-name').value,
    customer_email: document.getElementById('c-email').value,
    customer_phone: document.getElementById('c-phone').value,
    delivery_address: document.getElementById('c-address').value,
    region: document.getElementById('c-region').value,
    cart: state.cart.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      size: i.size,
      color: i.color
    }))
  };

  try {
    const response = await apiFetch('/pj-secure-boutique/intake-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify(orderPayload)
    });

    const orderToken = response.token;
    
    // Ensure callback is a proper function
    const paymentCallback = function(payResponse) {
      try {
        showNotification('Verifying with secure transaction audit...', 'info');
        verifyCheckoutReference(orderToken, payResponse.reference).catch(err => {
          showNotification(err.message || 'Payment verification failed.', 'error');
        });
      } catch (e) {
        showNotification('Payment callback error.', 'error');
      }
    };
    
    const paymentOnClose = function() {
      checkoutBtn.disabled = false;
      checkoutBtn.innerText = 'Proceed to Paystack';
      showNotification('Payment process suspended.', 'error');
    };

    const paystack = PaystackPop.setup({
      key: state.paystackPublicKey,
      email: response.email,
      amount: Math.round(parseFloat(response.total) * 100),
      currency: 'GHS',
      ref: 'pj_paystack_' + Math.floor((Math.random() * 100000000) + 1),
      callback: paymentCallback,
      onClose: paymentOnClose
    });

    paystack.openIframe();
  } catch (err) {
    checkoutBtn.disabled = false;
    checkoutBtn.innerText = 'Proceed to Paystack';
    showNotification(err.message || 'Checkout creation failed.', 'error');
  }
}

async function triggerSandboxCheckout() {
  const nameEl = document.getElementById('c-name');
  if (!nameEl || !nameEl.value) {
    showNotification('Please fill in recipient details first.', 'error');
    return;
  }

  const orderPayload = {
    customer_name: nameEl.value,
    customer_email: document.getElementById('c-email').value || 'test@payjay.com',
    customer_phone: document.getElementById('c-phone').value || '+233 24 123 4567',
    delivery_address: document.getElementById('c-address').value || '123 Test St, Accra',
    region: document.getElementById('c-region').value || 'Greater Accra',
    cart: state.cart.map(i => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      size: i.size,
      color: i.color
    }))
  };

  try {
    const response = await apiFetch('/pj-secure-boutique/intake-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.customerToken}`
      },
      body: JSON.stringify(orderPayload)
    });

    showNotification('Syncing sandbox verification reference...', 'info');
    await verifyCheckoutReference(response.token, 'pj_sandbox_payment_ref_override');
  } catch (err) {
    showNotification(err.message || 'Sandbox failed.', 'error');
  }
}

  async function verifyCheckoutReference(token, reference) {
    try {
      const result = await apiFetch('/pj-secure-boutique/audit-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_token: token, paystack_reference: reference })
      });

      if (result.success) {
        showNotification('Purchase verified! Preparing packaging.');
        state.cart = [];
        updateCartUI();
        window.location.hash = `#/track/${token}`;
      }
    } catch (err) {
      showNotification(err.message || 'Audit transaction failed.', 'error');
      
      // Provide fallback manual verification option
      setTimeout(() => {
        const shouldVerify = confirm(
          `Automatic verification failed: ${err.message}\n\nWould you like to open the manual payment verification page?`
        );
        if (shouldVerify) {
          window.location.href = `/verify-payment?token=${token}&ref=${encodeURIComponent(reference)}`;
        }
      }, 300);
    }
  }

// ==========================================================================
// 📍 CONSIGNMENT TRACKING
// ==========================================================================
function renderTrackSearch(container) {
  container.innerHTML = `
    <div class="max-w-md mx-auto px-4 py-20 text-center animate-fade-in-up">
      <h2 class="text-xl uppercase tracking-premium font-extrabold text-brand mb-3">Track Shipment</h2>
      <p class="text-xs text-brand-muted uppercase tracking-premium font-semibold mb-8">Enter your secure PJ Token below</p>
      
      <form id="track-form">
        <div class="flex border border-brand">
          <input type="text" id="track-token-input" required class="flex-1 px-4 py-3 text-sm outline-none" placeholder="e.g. PJ-A1B2-C3D4">
          <button type="submit" class="bg-brand text-white hover:bg-brand-hover text-xs uppercase tracking-premium font-bold px-6 premium-transition">Query</button>
        </div>
      </form>
    </div>
  `;

  const trackForm = document.getElementById('track-form');
  if (trackForm) {
    trackForm.addEventListener('submit', handleTrackQuery);
  }
}

function handleTrackQuery(event) {
  event.preventDefault();
  const token = document.getElementById('track-token-input').value.trim();
  if (token) {
    window.location.hash = `#/track/${token}`;
  }
}

async function renderTrackResult(container, token) {
  container.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-20 text-center text-xs uppercase tracking-premium font-bold text-brand-muted">Fetching timeline records...</div>`;

  try {
    const details = await apiFetch(`/pj-secure-boutique/track-consignment/${token}`);
    const order = details.order;
    const items = details.items;

    const statuses = ['placed', 'verified', 'processing', 'dispatched', 'delivered'];
    const activeIdx = statuses.indexOf(order.status);

    const steps = [
      { label: 'Placed', info: 'Order created' },
      { label: 'Verified', info: 'Payment cleared' },
      { label: 'Processing', info: 'Packaging item' },
      { label: 'Dispatched', info: 'In transit' },
      { label: 'Delivered', info: 'Arrived at site' }
    ];

    container.innerHTML = `
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in-up space-y-10">
        <div class="bg-white border border-neutral-100 p-8 shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-6">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-premium text-brand">Consignment PJ-Token: ${order.token}</h3>
            <p class="text-xs text-brand-muted mt-2 font-medium">Placed on: ${new Date(order.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <span class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-premium bg-brand text-white">${order.status}</span>
          </div>
        </div>

        <div class="bg-white border border-neutral-100 p-8 shadow-sm">
          <h4 class="text-xs uppercase tracking-premium font-extrabold text-brand-muted mb-8">Delivery Timeline Tracker</h4>
          
          <div class="grid grid-cols-1 md:grid-cols-5 gap-6 relative">
            ${steps.map((step, idx) => {
              let colorClasses = 'border-neutral-200 text-brand-muted';
              if (idx < activeIdx) colorClasses = 'border-brand bg-brand text-white';
              else if (idx === activeIdx) colorClasses = 'border-brand-gold bg-brand-gold text-brand font-bold shadow-lg';

              return `
                <div class="flex md:flex-col items-center md:text-center space-x-4 md:space-x-0">
                  <div class="w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-extrabold ${colorClasses} md:mb-3">
                    ${idx + 1}
                  </div>
                  <div>
                    <p class="text-xs uppercase tracking-premium font-bold ${idx === activeIdx ? 'text-brand-gold' : 'text-brand'}">${step.label}</p>
                    <p class="text-[9px] text-brand-muted mt-1">${step.info}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="bg-white border border-neutral-100 p-8 shadow-sm">
          <h4 class="text-xs uppercase tracking-premium font-extrabold text-brand-muted mb-6">Order Items</h4>
          <div class="space-y-4">
            ${items.map(item => `
              <div class="flex items-center space-x-4 border-b border-neutral-100 pb-4">
                <img src="${item.image_url || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=100'}" class="h-16 w-12 object-cover bg-neutral-50">
                <div>
                  <p class="text-sm font-semibold text-brand">${item.name}</p>
                  <p class="text-[9px] uppercase tracking-premium text-brand-muted mt-1">Size: ${item.size} | Color: ${item.color} | Qty: ${item.quantity}</p>
                  <p class="text-xs font-extrabold text-brand mt-1">GH₵ ${(parseFloat(item.price) * item.quantity).toFixed(2)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="bg-white border border-neutral-100 p-8 shadow-sm">
          <h4 class="text-xs uppercase tracking-premium font-extrabold text-brand-muted mb-4">Delivery Address</h4>
          <p class="text-sm text-brand">${order.delivery_address}</p>
          <p class="text-xs text-brand-muted mt-1">${order.region}, Ghana</p>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="max-w-5xl mx-auto px-4 py-20 text-center animate-fade-in-up">
        <h2 class="text-xl uppercase tracking-premium font-extrabold mb-4">Tracking Not Found</h2>
        <p class="text-sm text-brand-muted mb-8">${err.message || 'No records match this token.'}</p>
        <a href="#/track" class="bg-brand text-white text-xs uppercase tracking-premium font-bold px-6 py-4 hover:bg-brand-hover premium-transition">Try Another Token</a>
      </div>
    `;
  }
}