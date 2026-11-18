/* ── Auth guard — async, uses real Supabase session ── */
let _currentUser = null;

async function start() {
    _currentUser = await Auth.requireAuth();
    if (!_currentUser) return; // requireAuth() redirects if no session

    const userProfile = _currentUser;

    /* Populate user greeting */
    const firstName = userProfile.full_name;
    const initial = firstName.charAt(0).toUpperCase();
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    if (avatar) { avatar.textContent = initial; avatar.title = userProfile.full_name || userProfile.email || ''; }
    if (nameEl) { nameEl.textContent = 'Hi, ' + firstName + '!'; nameEl.style.display = ''; }

    /* Load data now that we have a valid session */
    await loadMedicines();
    await loadMyOrders();
}

start();

document.getElementById('year').textContent = new Date().getFullYear();

const logoImg = document.getElementById('logo-img');
if (logoImg) {
    logoImg.onload = () => { logoImg.style.display = ''; const fb = document.getElementById('logo-fallback'); if (fb) fb.style.display = 'none'; };
    logoImg.onerror = () => { logoImg.style.display = 'none'; };
}

const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('nav-menu');
if (toggle && menu) {
    toggle.addEventListener('click', () => {
        const open = !menu.hidden;
        menu.hidden = open;
        toggle.setAttribute('aria-expanded', String(!open));
    });
}

function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/* ── Load medicines from real API ── */
async function loadMedicines(search = '', sameDayOnly = false) {
    const grid = document.getElementById('products');
    const counter = document.getElementById('results-counter');
    grid.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);">Loading…</div>';

    try {
        let path = '/medicines?';
        if (search) path += `search=${encodeURIComponent(search)}&`;
        if (sameDayOnly) path += `same_day=true&`;
        const res = await Auth.fetch(path);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load medicines.');

        counter.textContent = `${data.length} result${data.length !== 1 ? 's' : ''}`;

        if (data.length === 0) {
            grid.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);">No medicines found.</div>';
            return;
        }

        grid.innerHTML = data.map(med => {
          const out = window.APStock ? APStock.isOut(med) : false;
          return `
        <div class="product-card ${out ? 'is-out' : ''}" role="listitem" data-id="${med.medicine_id}">
          <div class="product-img-wrap">
            ${med.image_url
                ? `<img src="${med.image_url}" alt="${esc(med.name)}" class="product-img" style="width:100%;height:140px;object-fit:cover;border-radius:10px;" onerror="this.style.display='none'" />`
                : `<div style="font-size:28px;text-align:center;"></div>`}
          </div>
          <div class="product-info">
            <div class="product-name">${esc(med.name)}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px;">
              ${med.requires_rx ? '<span class="badge rx">Rx</span>' : '<span class="badge otc">OTC</span>'}
              ${out ? '<span class="badge out-stock">Out of Stock</span>' : med.same_day_available ? '<span class="badge safe">Same Day</span>' : ''}
              ${med.category ? `<span class="badge" style="background:var(--off-white);color:var(--muted);border:1px solid var(--border);">${esc(med.category)}</span>` : ''}
            </div>
            <div class="product-price">₱${parseFloat(med.unit_price).toFixed(2)}</div>
          </div>
          <button class="btn add-to-cart ${out ? 'is-out-of-stock' : ''}"
                  data-id="${med.medicine_id}"
                  data-name="${esc(med.name)}"
                  data-price="${med.unit_price}"
                  data-rx="${med.requires_rx}"
                  data-stock="${window.APStock && APStock.qty(med) !== null ? APStock.qty(med) : ''}"
                  onclick="window._addToCart && window._addToCart(this)">
            ${out ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>
      `;
        }).join('');

    } catch (err) {
        grid.innerHTML = `<div style="text-align:center;padding:32px;color:var(--red);">${err.message}</div>`;
    }
}

/* ── Load my orders from real API ── */
async function loadMyOrders() {
    const container = document.getElementById('my-orders');
    try {
        const res = await Auth.fetch('/orders');
        const data = await res.json();

        if (!res.ok || data.length === 0) {
            container.innerHTML = '<div class="small muted">No orders yet.</div>';
            return;
        }

        const statusColors = {
            pending: 'var(--muted)',
            confirmed: '#1565C0',
            ready: '#2e7d32',
            completed: '#4caf50',
            cancelled: 'var(--red)',
        };

        container.innerHTML = data.slice(0, 5).map(order => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:13px;font-weight:600;">${esc(order.order_label || 'Order #' + String(order.order_id).slice(0, 8).toUpperCase())}</div>
          <span style="font-size:12px;font-weight:700;color:${statusColors[order.status] || 'var(--muted)'};">
            ${order.status.toUpperCase()}
          </span>
        </div>
        <div class="small muted">${new Date(order.placed_at).toLocaleDateString('en-PH')} · ₱${parseFloat(order.total_amount).toFixed(2)} · In-store pick-up${order.is_paid ? ' · Paid' : ''}</div>
      </div>
    `).join('');

        // Poll for status updates every 10 seconds
        setTimeout(loadMyOrders, 10000);

    } catch (err) {
        container.innerHTML = '<div class="small muted">Could not load orders.</div>';
    }
}

/* ── Search & filter listeners ── */
let searchTimer;
document.getElementById('site-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        const sameDayOnly = document.getElementById('filter-sameday').checked;
        loadMedicines(e.target.value.trim(), sameDayOnly);
    }, 350);
});

document.getElementById('filter-sameday').addEventListener('change', () => {
    const search = document.getElementById('site-search').value.trim();
    const sameDayOnly = document.getElementById('filter-sameday').checked;
    loadMedicines(search, sameDayOnly);
});

/* ── Quick refill shortcut ── */
document.getElementById('quick-refill').addEventListener('click', () => {
    document.getElementById('site-search').focus();
});

/* ── Prescription upload + OCR ───────────────────────────────────
   - One click = one upload. The same file cannot be submitted twice.
   - "View OCR" reads the text on a photo of the prescription (Tesseract.js). */
const RX_SUBMITTED_KEY = 'ap_rx_submitted';
const rx = { file: null, fp: null, uploading: false, poll: null, ocrCache: {} };

const fingerprint = (f) => `${f.name}|${f.size}|${f.lastModified}`;
function submittedList() {
    try { return JSON.parse(localStorage.getItem(RX_SUBMITTED_KEY)) || []; } catch { return []; }
}
function markSubmitted(fp) {
    const list = submittedList().filter(x => x !== fp);
    list.push(fp);
    localStorage.setItem(RX_SUBMITTED_KEY, JSON.stringify(list.slice(-30)));
}
const wasSubmitted = (fp) => submittedList().includes(fp);

function setRxStep(step) {
    // step: 0 = nothing, 1 = uploaded, 2 = verified
    [['st-uploaded', 'dot-uploaded'], ['st-verified', 'dot-verified']].forEach(([li, dot], i) => {
        const on = step > i;
        const liEl = document.getElementById(li);
        const dotEl = document.getElementById(dot);
        if (liEl) liEl.style.opacity = on ? '1' : '0.45';
        if (dotEl) dotEl.style.background = on ? 'var(--red)' : '';
    });
}

function setRequestButton(mode) {
    const btn = document.getElementById('request-verification');
    if (!btn) return;
    const modes = {
        ready: ['Request Verification', false],
        uploading: ['Uploading…', true],
        submitted: ['Submitted ✓', true],
        duplicate: ['Already submitted', true],
    };
    const [text, disabled] = modes[mode] || modes.ready;
    btn.textContent = text;
    btn.disabled = disabled;
    ['rx-cancel-btn', 'rx-x-btn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = mode === 'uploading'; });
}

document.getElementById('rx-file').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    if (rx.uploading) { showToast('Please wait — your prescription is still uploading.'); return; }

    rx.file = file;
    rx.fp = fingerprint(file);

    const previewImg = document.getElementById('preview-img');
    document.getElementById('preview-name').textContent = file.name;
    document.getElementById('preview-time').textContent = 'Selected ' + new Date().toLocaleString('en-PH');
    if (file.type.startsWith('image/')) {
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = '';
    } else {
        previewImg.removeAttribute('src');
        previewImg.style.display = 'none';
    }
    document.getElementById('upload-prompt').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'flex';

    if (wasSubmitted(rx.fp)) {
        setRequestButton('duplicate');
        setRxStep(1);
        showToast('You already submitted this prescription. Choose a different file to upload a new one.', 4500);
    } else {
        setRequestButton('ready');
        setRxStep(0);
    }
});

document.getElementById('request-verification')?.addEventListener('click', async function (e) {
    e.preventDefault();
    e.stopPropagation();
    const file = rx.file;
    if (!file) { showToast('Please select a prescription file first.'); return; }
    if (rx.uploading) return;
    if (wasSubmitted(rx.fp)) { setRequestButton('duplicate'); showToast('This prescription was already submitted.'); return; }

    rx.uploading = true;
    setRequestButton('uploading');
    const fp = rx.fp;

    try {
        const formData = new FormData();
        formData.append('prescription', file);
        // Auth.fetch adds the login token and refreshes it if it has expired.
        const res = await Auth.fetch('/prescriptions', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');

        markSubmitted(fp);
        if (typeof state !== 'undefined') {
            state.prescription = { id: data.prescription_id, status: 'pending' };
        }
        setRequestButton('submitted');
        setRxStep(1);
        document.getElementById('preview-time').textContent = 'Uploaded ' + new Date().toLocaleString('en-PH');
        showToast('Prescription uploaded! Awaiting pharmacist verification.');
        watchPrescription(data.prescription_id);
    } catch (err) {
        setRequestButton('ready');
        showToast('' + err.message);
    } finally {
        rx.uploading = false;
    }
});

function watchPrescription(prescriptionId) {
    if (rx.poll) clearInterval(rx.poll);
    rx.poll = setInterval(async () => {
        try {
            const statusRes = await Auth.fetch('/prescriptions');
            const prescriptions = await statusRes.json();
            const current = prescriptions.find(p => p.prescription_id === prescriptionId);
            if (!current) return;
            if (current.status === 'verified') {
                if (typeof state !== 'undefined' && state.prescription) state.prescription.status = 'verified';
                setRxStep(2);
                showToast('Prescription verified by pharmacist!');
                clearInterval(rx.poll);
            } else if (current.status === 'declined') {
                if (typeof state !== 'undefined' && state.prescription) state.prescription.status = 'declined';
                showToast('Prescription rejected: ' + (current.rejection_reason || 'No reason given.'), 6000);
                clearInterval(rx.poll);
            }
        } catch { }
    }, 5000);
}

/* ── Cancel / X — remove the selected file (before or after submitting) ── */
function resetRxUpload() {
    if (rx.uploading) { showToast('Please wait — your prescription is still uploading.'); return; }
    const input = document.getElementById('rx-file');
    const previewImg = document.getElementById('preview-img');
    if (previewImg.src && previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    previewImg.removeAttribute('src');
    input.value = '';
    rx.file = null;
    rx.fp = null;
    document.getElementById('preview-name').textContent = '';
    document.getElementById('preview-time').textContent = '';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('upload-prompt').style.display = '';
    setRequestButton('ready');
    if (!rx.poll) setRxStep(0);
}
['rx-cancel-btn', 'rx-x-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wasSent = rx.fp && wasSubmitted(rx.fp);
        resetRxUpload();
        if (!rx.uploading) showToast(wasSent ? 'File removed. Your submitted prescription is still with the pharmacist.' : 'Upload cancelled.');
    });
});

/* ── OCR (reads text from a prescription photo) ── */
const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let _tesseractLoading = null;
let _allMedicines = null;

function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!_tesseractLoading) {
        _tesseractLoading = new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = TESSERACT_SRC;
            tag.async = true;
            tag.onload = () => resolve(window.Tesseract);
            tag.onerror = () => { _tesseractLoading = null; reject(new Error('Could not load the OCR reader. Check your internet connection and try again.')); };
            document.head.appendChild(tag);
        });
    }
    return _tesseractLoading;
}

async function getAllMedicines() {
    if (_allMedicines) return _allMedicines;
    try {
        const res = await Auth.fetch('/medicines');
        const data = await res.json();
        _allMedicines = res.ok && Array.isArray(data) ? data : [];
    } catch { _allMedicines = []; }
    return _allMedicines;
}

function matchMedicines(text, medicines) {
    const hay = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const words = new Set(hay.split(/\s+/).filter(w => w.length >= 4));
    return medicines.filter(m => {
        const tokens = String(m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
        return tokens.some(t => words.has(t) || hay.includes(t));
    }).slice(0, 8);
}

function openOcrDialog(html) {
    document.getElementById('ocr-body').innerHTML = html;
    document.getElementById('ocr-overlay').classList.add('open');
}
function closeOcrDialog() { document.getElementById('ocr-overlay').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOcrDialog(); });

function renderOcrResult(result) {
    const matches = result.matches.length
        ? `<div class="ocr-matches">${result.matches.map(m => `<span class="badge safe">${esc(m.name)}</span>`).join('')}</div>`
        : '<p class="small muted" style="margin:0 0 10px;">No catalog medicine names were recognised. The pharmacist will still read your prescription.</p>';
    const text = result.text.trim()
        ? `<pre class="ocr-text">${esc(result.text.trim())}</pre>`
        : '<p class="small muted">No readable text was found. Try a clearer, well-lit photo taken straight on.</p>';
    return `
      <div class="small" style="font-weight:700;margin-bottom:6px;">Medicines found in our catalog</div>
      ${matches}
      <div class="small" style="font-weight:700;margin:12px 0 6px;">Text read from your prescription</div>
      ${text}
      <p class="small muted" style="margin-top:10px;">OCR is only a helper — a licensed pharmacist always confirms your prescription.</p>`;
}

document.getElementById('view-ocr-btn')?.addEventListener('click', async function (e) {
    e.preventDefault();
    e.stopPropagation();
    const file = rx.file;
    if (!file) { showToast('Upload a prescription photo first.'); return; }
    if (!file.type.startsWith('image/')) {
        openOcrDialog('<p style="margin:0;">OCR works on photos (JPG or PNG). For PDF files, the pharmacist will read the prescription directly after you request verification.</p>');
        return;
    }
    if (rx.ocrCache[rx.fp]) { openOcrDialog(renderOcrResult(rx.ocrCache[rx.fp])); return; }

    const btn = this;
    const fp = rx.fp;
    btn.disabled = true;
    btn.textContent = 'Reading…';
    try {
        const [Tesseract, medicines] = await Promise.all([loadTesseract(), getAllMedicines()]);
        const { data } = await Tesseract.recognize(file, 'eng', {
            logger: m => { if (m.status === 'recognizing text') btn.textContent = `Reading… ${Math.round(m.progress * 100)}%`; },
        });
        const text = data?.text || '';
        const result = { text, matches: matchMedicines(text, medicines) };
        rx.ocrCache[fp] = result;
        if (rx.fp === fp) openOcrDialog(renderOcrResult(result));
    } catch (err) {
        showToast(err.message || 'OCR failed. Please try again.', 5000);
    } finally {
        btn.disabled = false;
        btn.textContent = 'View OCR';
    }
});

/* ── Toast helper ── */
function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}