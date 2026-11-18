const API = '';

let _adminUser = null;
let _role = 'customer';
let _medicines = [];
let posCart = [];

function setupProductImagePreview() {
    const input = document.getElementById('edit-image');
    const uploadPrompt = document.getElementById('upload-prompt');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const previewName = document.getElementById('preview-name');
    const previewTime = document.getElementById('preview-time');
    let previewUrl = null;

    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        previewName.textContent = file.name;
        previewTime.textContent = new Date().toLocaleString('en-PH');

        if (file.type.startsWith('image/')) {
            previewUrl = URL.createObjectURL(file);
            previewImg.src = previewUrl;
            previewImg.alt = file.name;
            previewImg.style.display = '';
        } else {
            previewImg.removeAttribute('src');
            previewImg.style.display = 'none';
        }

        uploadPrompt.style.display = 'none';
        uploadPreview.style.display = 'flex';
    });
}

setupProductImagePreview();

/* ── Boot ── */
// admin      → everything
// pharmacist → dashboard, products (view only), prescriptions, orders, settings
// counter    → dashboard, POS (pick-up orders + payments), orders, settings
const PANEL_ACCESS = {
    dashboard: ['admin', 'pharmacist', 'counter'],
    pos: ['admin', 'counter'],
    users: ['admin'],
    products: ['admin', 'pharmacist'],
    prescriptions: ['admin', 'pharmacist'],
    orders: ['admin', 'pharmacist', 'counter'],
    settings: ['admin', 'pharmacist', 'counter'],
};
const canSee = (panel) => (PANEL_ACCESS[panel] || []).includes(_role);
const isAdminUser = () => _role === 'admin';

async function start() {
    _adminUser = await Auth.requireAuth();
    if (!_adminUser) return;

    _role = Auth.normalizeRole(_adminUser.role);
    if (!Auth.isStaff(_role)) {
        window.location.replace('homepage.html');
        return;
    }
    // Confirmed staff by the server — show the page (hidden until now, see the <head> guard).
    document.getElementById('ap-guard')?.remove();

    const isAdmin = _role === 'admin';
    const isPharmacy = Auth.isPharmacy(_role);

    // Hide what this role cannot use
    // 'important' is needed: the theme styles sidebar links with display:flex !important.
    const hide = el => el.style.setProperty('display', 'none', 'important');
    if (!isAdmin) document.querySelectorAll('.admin-only').forEach(hide);
    if (!isPharmacy) document.querySelectorAll('.rx-only').forEach(hide);
    if (!canSee('pos')) document.querySelectorAll('.pos-only').forEach(hide);

    const label = Auth.roleLabel(_role);
    document.getElementById('topbar-pill').textContent = `${label} Access`;
    document.getElementById('panel-role-label').textContent = isAdmin ? 'Admin Panel' : `${label} Panel`;
    if (!isAdmin) {
        const desc = document.getElementById('qa-products-desc');
        if (desc) desc.textContent = 'View prices and stock (admin edits).';
    }

    const name = _adminUser.full_name || _adminUser.email;
    document.getElementById('admin-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('admin-name').textContent = name;
    document.getElementById('admin-email').textContent = label;
    document.getElementById('settings-email').value = _adminUser.email;
    document.getElementById('settings-role').value = label;
    document.getElementById('acc-name').value = _adminUser.full_name || '';
    document.getElementById('acc-phone').value = _adminUser.phone || '';
    loadSettings();

    await loadDashboard();
    if (isPharmacy) { loadCategories(); loadProducts(); loadPrescriptions(); loadInventory(); }
    else if (canSee('pos')) loadProducts(); // counter: products for the POS
    if (canSee('pos')) searchPosCustomers('');
    if (isAdmin) loadUsers();
    loadOrders();
}

start();

/* ── DASHBOARD ── */
async function loadDashboard() {
    try {
        const res = await Auth.fetch(`/admin/dashboard`);
        const data = await res.json();
        if (!res.ok) return;
        const orders = data.orders || {};
        const total = Object.values(orders).reduce((s, v) => s + v, 0);
        document.getElementById('stat-orders').textContent = total;
        document.getElementById('stat-pending').textContent = data.pending_prescriptions ?? '—';
        document.getElementById('stat-lowstock').textContent = data.low_stock_items ?? '—';
        document.getElementById('stat-revenue').textContent = '₱' + parseFloat(data.revenue_last_30_days || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
    } catch { }

    try {
        const res = await Auth.fetch(`/orders/admin/all`);
        const data = await res.json();
        if (!res.ok || !data.length) {
            document.getElementById('activity-feed').innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);">No recent activity.</div>';
            return;
        }
        document.getElementById('activity-feed').innerHTML = data.slice(0, 5).map(o => `
      <div class="activity-item">
        <div>
          <div class="activity-text"><strong>${esc(o.order_label || 'Order ' + o.order_id.slice(0, 8))}</strong> — ${esc(o.profiles?.full_name || 'Customer')}</div>
          <div class="activity-time">${new Date(o.placed_at).toLocaleString('en-PH')} · ₱${parseFloat(o.total_amount).toFixed(2)} · <strong>${o.status}</strong></div>
        </div>
      </div>
    `).join('');
    } catch { }
}

async function loadCategories() {
    try {
        const res = await fetch('/api/medicines/categories');
        const data = await res.json();
        if (!res.ok) return;
        document.getElementById('edit-category').innerHTML =
            data.map(c => `<option value="${c.category_id}">${esc(c.category_name)}</option>`).join('');
    } catch { }
}

/* ── USERS ── */
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const label = document.getElementById('user-count-label');
    try {
        const res = await Auth.fetch('/admin/users');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('stat-users').textContent = data.length;
        label.textContent = `${data.length} registered users`;

        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--muted);">No users yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((u, i) => `
      <tr>
        <td class="muted">${i + 1}</td>
        <td><strong>${esc(u.full_name || '—')}</strong></td>
        <td class="muted">${esc(u.email)}</td>
        <td class="muted">${esc(u.phone || '—')}</td>
        <td>${statusPill(u.role)}</td>
        <td>${u.locked
            ? '<span class="status-pill cancelled">Locked</span>'
            : u.is_active === false
                ? '<span class="status-pill inactive">Deactivated</span>'
                : `<span class="status-pill active">Active</span>${u.failed_logins ? `<div class="muted" style="font-size:11px;margin-top:3px;">${u.failed_logins} wrong password${u.failed_logins === 1 ? '' : 's'}</div>` : ''}`}</td>
        <td class="muted">${new Date(u.created_at).toLocaleDateString('en-PH')}</td>
        <td>
          ${u.id === _adminUser.id
            ? '<span class="muted" style="font-size:12px;">You</span>'
            : `<select class="role-select" aria-label="Role for ${esc(u.full_name || u.email)}"
                 data-current="${esc(Auth.normalizeRole(u.role))}"
                 onchange="changeUserRole('${u.id}', this.value, this)">
                 ${ROLE_OPTIONS.map(r => `<option value="${r}" ${Auth.normalizeRole(u.role) === r ? 'selected' : ''}>${Auth.roleLabel(r)}</option>`).join('')}
               </select>
               ${u.locked ? `<button class="row-action" style="margin-top:6px;" onclick="unlockUser('${u.id}', this)">Unlock</button>` : ''}`}
        </td>
      </tr>
    `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
}

const ROLE_OPTIONS = ['customer', 'counter', 'pharmacist', 'admin'];

async function changeUserRole(userId, role, selectEl) {
    const label = Auth.roleLabel(role);
    if (!confirm(`Change this user's role to "${label}"?`)) {
        if (selectEl) selectEl.value = selectEl.dataset.current;
        return;
    }
    const res = await Auth.fetch(`/admin/users/${userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role }),
    });
    if (res.ok) { showToast(`Role updated to ${label}.`); loadUsers(); }
    else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Unable to change role.', 6000);
        if (selectEl) selectEl.value = selectEl.dataset.current;
    }
}

/* ── PRODUCTS ── */
async function loadProducts() {
    try {
        const res = await Auth.fetch(`/admin/products`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        _medicines = data;
        document.getElementById('stat-products').textContent = data.filter(p => p.is_active).length;

        const tbody = document.getElementById('products-tbody');
        tbody.innerHTML = data.map(p => `
      <tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>₱${parseFloat(p.unit_price).toFixed(2)}</td>
        <td>${p.requires_rx ? '<span class="status-pill pending">Rx</span>' : '<span class="status-pill verified">OTC</span>'}</td>
        <td>${p.same_day_available ? 'Yes' : 'No'}</td>
        <td class="muted">${esc(p.category || '—')}</td>
        <td>${stockPill(p.stock_quantity)}</td>
        <td>${p.is_active ? '<span class="status-pill active">Active</span>' : '<span class="status-pill inactive">Inactive</span>'}</td>
        <td>
          <button class="row-action" onclick="openEditModal('${p.medicine_id}')">Edit</button>
          <button class="row-action danger" onclick="deactivateProduct('${p.medicine_id}')">Remove</button>
        </td>
      </tr>
    `).join('');

        renderPosProducts();
    } catch (err) {
        document.getElementById('products-tbody').innerHTML =
            `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
}

async function deactivateProduct(id) {
    if (!isAdminUser()) { showAdminOnly('Only an admin can remove medicines from the catalog.'); return; }
    const name = _medicines.find(m => m.medicine_id === id)?.name || 'this product';
    if (!confirm(`Deactivate "${name}"? It will no longer appear in the catalogue.`)) return;
    const res = await Auth.fetch(`/medicines/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Product deactivated.'); loadProducts(); loadInventory(); }
    else { const d = await res.json(); showToast('' + d.error); }
}

/* ── PRESCRIPTIONS ── */
async function loadPrescriptions() {
    try {
        const res = await Auth.fetch(`/prescriptions/pending`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        document.getElementById('rx-count-label').textContent = `${data.length} pending`;
        document.getElementById('stat-pending').textContent = data.length;

        const tbody = document.getElementById('rx-tbody');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);">No pending prescriptions.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(r => `
      <tr>
        <td><strong>${esc(r.profiles?.full_name || '—')}</strong><br><span class="muted">${esc(r.profiles?.phone || '')}</span></td>
        <td class="muted">${esc(r.file_name || r.prescription_id.slice(0, 8) + '…')}</td>
        <td class="muted">${new Date(r.uploaded_at).toLocaleString('en-PH')}</td>
        <td>${statusPill(r.status)}</td>
        <td>
          <button class="row-action" onclick="viewRxFile('${r.prescription_id}')">View</button>
          <button class="row-action" onclick="readRxOcr('${r.prescription_id}', '${esc(r.file_name || '')}', this)">Read (OCR)</button>
          <button class="row-action" onclick="approveRx('${r.prescription_id}')">Approve</button>
          <button class="row-action danger" onclick="rejectRx('${r.prescription_id}')">Reject</button>
        </td>
      </tr>
    `).join('');
    } catch (err) {
        document.getElementById('rx-tbody').innerHTML =
            `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--red);">${err.message}</td></tr>`;
    }
}

async function viewRxFile(id) {
    const res = await Auth.fetch(`/prescriptions/${id}/file`);
    const data = await res.json();
    if (res.ok) window.open(data.url, '_blank');
    else showToast('Could not load file.');
}

async function approveRx(id) {
    if (!confirm('Approve this prescription?')) return;
    const res = await Auth.fetch(`/prescriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'verified' }),
    });
    if (res.ok) { showToast('Prescription approved!'); loadPrescriptions(); }
    else { const d = await res.json(); showToast('' + d.error); }
}

async function rejectRx(id) {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    const res = await Auth.fetch(`/prescriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'declined', rejection_reason: reason }),
    });
    if (res.ok) { showToast('Prescription rejected.'); loadPrescriptions(); }
    else { const d = await res.json(); showToast('' + d.error); }
}

/* ── ORDERS ── */
async function loadOrders() {
    const status = document.getElementById('order-status-filter')?.value || '';
    try {
        let url = `/orders/admin/all`;
        if (status) url += `?status=${status}`;
        const res = await Auth.fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const tbody = document.getElementById('orders-tbody');
        if (!data.length) {
            _orders = [];
            tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--muted);">No orders found.</td></tr>';
            return;
        }
        _orders = data;
        tbody.innerHTML = data.map(o => `
      <tr>
        <td class="muted"><strong>${esc(o.order_label || o.order_id.slice(0, 8) + '…')}</strong><br><span class="muted" style="font-size:11px;">Pick-up</span></td>
        <td>${esc(o.profiles?.full_name || '—')}<br><span class="muted" style="font-size:11px;">${esc(o.profiles?.phone || '')}</span></td>
        <td>₱${parseFloat(o.total_amount).toFixed(2)}</td>
        <td class="muted">${new Date(o.placed_at).toLocaleString('en-PH')}</td>
        <td>${statusPill(o.status)}</td>
        <td>${o.is_paid
            ? `<span class="status-pill completed">Paid</span><div class="muted" style="font-size:11px;margin-top:3px;">${esc(methodLabel(o.payment?.method))}${o.payment?.change_due > 0 ? ` · change ₱${parseFloat(o.payment.change_due).toFixed(2)}` : ''}</div>`
            : o.status === 'cancelled' ? '<span class="muted">—</span>' : '<span class="status-pill pending">Unpaid</span>'}</td>
        <td>
          ${!o.is_paid && o.status !== 'cancelled' ? `<button class="row-action pay-action" onclick="openPayment('${o.order_id}')">Proceed to Payment</button>` : ''}
          ${o.status === 'pending' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','confirmed')">Confirm</button>` : ''}
          ${o.status === 'confirmed' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','ready')">Mark Ready</button>` : ''}
          ${o.status === 'ready' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','completed')">Complete</button>` : ''}
          ${['pending', 'confirmed'].includes(o.status) ? `<button class="row-action danger" onclick="updateOrderStatus('${o.order_id}','cancelled')">Cancel</button>` : ''}
        </td>
      </tr>
    `).join('');
    } catch (err) {
        document.getElementById('orders-tbody').innerHTML =
            `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
}

async function updateOrderStatus(id, status) {
    const res = await Auth.fetch(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
    if (res.ok) { showToast(`Order marked as ${status}.`); loadOrders(); loadDashboard(); if (status === 'cancelled') { loadProducts(); loadInventory(); } }
    else { const d = await res.json(); showToast('' + d.error); }
}

/* ── POS (FT-12: click-and-collect at the counter) ── */
let _posCustomers = [];
let _posSearchTimer = null;
let _orders = [];

function stockOf(id) {
    const m = _medicines.find(x => x.medicine_id === id);
    return m ? Number(m.stock_quantity ?? m.stock_qty ?? 0) : 0;
}

function renderPosProducts(filter = '') {
    const grid = document.getElementById('pos-products-grid');
    const list = _medicines.filter(m =>
        m.is_active && (!filter || m.name.toLowerCase().includes(filter.toLowerCase()))
    );
    if (!list.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--muted);">No medicines found.</div>';
        return;
    }
    grid.innerHTML = list.map(m => {
        const stock = Number(m.stock_quantity ?? 0);
        const out = stock <= 0;
        return `
    <button class="pos-product-btn ${m.requires_rx ? 'rx-item' : ''} ${out ? 'is-out' : ''}"
            data-id="${esc(m.medicine_id)}" data-name="${esc(m.name)}" data-price="${m.unit_price}" data-rx="${m.requires_rx ? '1' : ''}"
            onclick="addToPosCart(this.dataset.id, this.dataset.name, this.dataset.price, this.dataset.rx === '1')">
      <span class="pos-product-badge ${m.requires_rx ? 'status-pill pending' : 'status-pill verified'}">${m.requires_rx ? 'Rx' : 'OTC'}</span>
      <span class="pos-product-name">${esc(m.name)}</span>
      <span class="pos-product-price">₱${parseFloat(m.unit_price).toFixed(2)}</span>
      <span class="pos-product-stock ${out ? 'is-out' : ''}">${out ? 'Out of stock' : `${stock} in stock`}</span>
    </button>`;
    }).join('');
}

function filterPosProducts(val) { renderPosProducts(val); }

function addToPosCart(id, name, price, requiresRx) {
    const stock = stockOf(id);
    if (stock <= 0) {
        showNotice('Out of stock', `${name} was not added — it is out of stock.`);
        return;
    }
    const existing = posCart.find(i => i.id === id);
    if (existing) {
        if (existing.qty >= stock) { showNotice('Not enough stock', `Only ${stock} of ${name} left in stock.`); return; }
        existing.qty++;
    } else { posCart.push({ id, name, price: parseFloat(price), requiresRx, qty: 1 }); }
    renderPosCart();
}

function renderPosCart() {
    const container = document.getElementById('pos-cart-items');
    const countEl = document.getElementById('pos-item-count');
    const totalEl = document.getElementById('pos-total');

    if (!posCart.length) {
        container.innerHTML = '<div class="pos-empty">No items added yet.<br>Click a product to add it.</div>';
        countEl.textContent = '0 items';
        totalEl.textContent = '₱0.00';
        return;
    }

    const total = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    countEl.textContent = `${posCart.reduce((s, i) => s + i.qty, 0)} items`;
    totalEl.textContent = `₱${total.toFixed(2)}`;

    container.innerHTML = posCart.map(item => `
    <div class="pos-cart-item">
      <div style="flex:1;">
        <div class="pos-item-name">${esc(item.name)} ${item.requiresRx ? '<span style="font-size:10px;color:var(--red);">Rx</span>' : ''}</div>
        <div class="pos-item-price">₱${item.price.toFixed(2)} each</div>
      </div>
      <button class="pos-qty-btn" onclick="changePosQty('${item.id}', -1)">−</button>
      <span class="pos-qty">${item.qty}</span>
      <button class="pos-qty-btn" onclick="changePosQty('${item.id}', 1)">+</button>
    </div>
  `).join('');
}

function changePosQty(id, delta) {
    const item = posCart.find(i => i.id === id);
    if (!item) return;
    if (delta > 0 && item.qty >= stockOf(id)) {
        showNotice('Not enough stock', `Only ${stockOf(id)} of ${item.name} left in stock.`);
        return;
    }
    item.qty += delta;
    if (item.qty <= 0) posCart = posCart.filter(i => i.id !== id);
    renderPosCart();
}

function clearPosCart() {
    posCart = [];
    document.querySelectorAll('.pos-payment-btn').forEach(b => b.classList.remove('selected'));
    renderPosCart();
}

// 1. Customer picker (registered customers)
function searchPosCustomers(q) {
    clearTimeout(_posSearchTimer);
    _posSearchTimer = setTimeout(async () => {
        try {
            const res = await Auth.fetch(`/admin/customers?q=${encodeURIComponent(q || '')}`);
            const data = await Auth.readJson(res);
            if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to load customers.');
            _posCustomers = data;
            const select = document.getElementById('pos-customer');
            const current = select.value;
            select.innerHTML = '<option value="">Walk-in (no account)</option>' +
                data.map(c => `<option value="${esc(c.id)}">${esc(c.full_name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('');
            if (q && data.length === 1) select.value = data[0].id;
            else if (data.some(c => c.id === current)) select.value = current;
            onPosCustomerChange();
        } catch (err) {
            document.getElementById('pos-customer-note').textContent = err.message;
        }
    }, q ? 300 : 0);
}

function onPosCustomerChange() {
    const id = document.getElementById('pos-customer').value;
    const c = _posCustomers.find(x => x.id === id);
    document.getElementById('pos-customer-note').textContent = c
        ? `Selected: ${c.full_name}. The order is saved to their account for pick-up.`
        : 'Pick a registered customer, or leave as walk-in.';
}

async function processSale() {
    if (!canSee('pos')) { showAdminOnly('Only admin or counter staff can use the POS.'); return; }
    if (!posCart.length) { showToast('Add items to the cart first.'); return; }
    const fulfillment = document.querySelector('input[name="pos-fulfillment"]:checked')?.value || 'pickup';
    if (fulfillment !== 'pickup') { showNotice('Pick-up only', 'Delivery is not available. Orders are for in-store pick-up only.'); return; }

    const customerId = document.getElementById('pos-customer').value;
    const customer = _posCustomers.find(c => c.id === customerId) || null;

    const btn = document.getElementById('pos-process-btn');
    btn.disabled = true; btn.textContent = 'Placing order…';

    try {
        const items = posCart.map(i => ({ medicine_id: i.id, quantity: i.qty }));
        const body = {
            items,
            fulfillment: 'pickup',
            notes: customer ? 'POS click-and-collect · Pick-up at counter' : 'POS walk-in sale · Pick-up at counter',
        };
        if (customer) body.customer_id = customer.id;
        const res = await Auth.fetch(`/orders`, { method: 'POST', body });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to place the order.');

        showReceipt(data, customer);
        clearPosCart();
        loadDashboard();
        loadOrders();
        loadProducts(); // stock went down — the ordered quantity is no longer available to others
        if (Auth.isPharmacy(_role)) loadInventory();
    } catch (err) {
        showToast('' + err.message, 5000);
    } finally {
        btn.disabled = false; btn.textContent = 'Confirm Order';
    }
}

function showReceipt(order, customer) {
    const total = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    const now = new Date().toLocaleString('en-PH');
    const items = [...posCart];
    const label = order.order_label || ('ORD-' + String(order.order_id).slice(0, 8).toUpperCase());

    document.getElementById('receipt-body').innerHTML = `
    <div class="receipt-order-no">Order number<strong>${esc(label)}</strong></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Date &amp; Time</span><span>${now}</span></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Customer</span><span>${esc(customer ? customer.full_name : 'Walk-in')}</span></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Fulfillment</span><span>In-store pick-up</span></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Status</span><span>Pending pick-up · Unpaid</span></div>
    <div style="border-top:1px dashed var(--border);margin:10px 0;"></div>
    ${items.map(i => `<div class="receipt-row"><span>${esc(i.name)} × ${i.qty}</span><span>₱${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
    <div style="border-top:2px solid var(--border);margin:10px 0;"></div>
    <div class="receipt-total"><span>TOTAL</span><span>₱${Number(order.total_amount ?? total).toFixed(2)}</span></div>
    <button class="btn" type="button" style="width:100%;margin-top:14px;justify-content:center;" onclick="closeReceipt(); openPayment('${order.order_id}')">Proceed to Payment</button>
    <div style="text-align:center;margin-top:12px;font-size:12px;color:var(--muted);">Added to the Orders queue as pending pick-up.<br>Angel's Pharmacy — Valenzuela City</div>
  `;
    document.getElementById('receipt-overlay').classList.add('open');
}

function closeReceipt() { document.getElementById('receipt-overlay').classList.remove('open'); }
function printReceipt() { window.print(); }

/* ── PAYMENT (FT-10 / FT-11) ── */
let _payOrder = null;
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function methodLabel(m) { return m === 'gcash' ? 'GCash' : m === 'cash' ? 'Cash' : (m || ''); }

async function openPayment(orderId) {
    let order = _orders.find(o => o.order_id === orderId);
    if (!order) {
        const res = await Auth.fetch(`/orders/${orderId}`);
        const d = await Auth.readJson(res);
        if (!res.ok || d.__notJson) { showToast(d.error || 'Order not found.'); return; }
        order = { ...d, order_label: d.order_number ? `ORD-${d.order_number}` : 'ORD-' + d.order_id.slice(0, 8).toUpperCase() };
    }
    if (order.is_paid) { showToast('This order is already paid.'); return; }
    _payOrder = order;
    document.getElementById('pay-order-label').textContent = order.order_label || order.order_id.slice(0, 8);
    document.getElementById('pay-customer').textContent = order.profiles?.full_name || '—';
    document.getElementById('pay-total').textContent = peso(order.total_amount);
    document.getElementById('pay-form').reset();
    document.getElementById('pay-error').hidden = true;
    document.getElementById('pay-form-wrap').hidden = false;
    document.getElementById('pay-done').hidden = true;
    document.getElementById('pay-title').textContent = 'Payment';
    onPayMethodChange();
    document.getElementById('pay-overlay').classList.add('open');
    setTimeout(() => document.getElementById('pay-tendered').focus(), 50);
}
function closePayment() { document.getElementById('pay-overlay').classList.remove('open'); _payOrder = null; }

function payMethod() { return document.querySelector('input[name="pay-method"]:checked')?.value || 'cash'; }
function onPayMethodChange() {
    const cash = payMethod() === 'cash';
    document.getElementById('pay-cash-field').hidden = !cash;
    document.getElementById('pay-change-row').hidden = !cash;
    document.getElementById('pay-gcash-field').hidden = cash;
    document.getElementById('pay-error').hidden = true;
    updateChangePreview();
}
function updateChangePreview() {
    if (!_payOrder) return;
    const tendered = parseFloat(document.getElementById('pay-tendered').value);
    const change = Number.isFinite(tendered) ? Math.round((tendered - Number(_payOrder.total_amount)) * 100) / 100 : 0;
    const el = document.getElementById('pay-change');
    el.textContent = change >= 0 ? peso(change) : '—';
    el.classList.toggle('is-short', change < 0);
}

async function confirmPayment() {
    if (!_payOrder) return;
    const errEl = document.getElementById('pay-error');
    errEl.hidden = true;
    const method = payMethod();
    const body = { method };
    if (method === 'cash') {
        const raw = document.getElementById('pay-tendered').value;
        if (raw === '') { errEl.textContent = 'Enter the amount tendered.'; errEl.hidden = false; return; }
        body.tendered = Number(raw);
        if (Math.round(body.tendered * 100) < Math.round(Number(_payOrder.total_amount) * 100)) {
            // FT-11 — refused; the order stays unpaid.
            errEl.textContent = 'Tendered amount is less than the total due.';
            errEl.hidden = false;
            return;
        }
    } else {
        body.reference = document.getElementById('pay-reference').value.trim();
    }

    const btn = document.getElementById('pay-confirm-btn');
    btn.disabled = true; btn.textContent = 'Recording…';
    try {
        const res = await Auth.fetch(`/orders/${_payOrder.order_id}/payment`, { method: 'POST', body });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to record the payment.');
        const paidAt = new Date(data.paid_at || Date.now()).toLocaleString('en-PH');
        document.getElementById('pay-title').textContent = 'Payment recorded';
        document.getElementById('pay-form-wrap').hidden = true;
        const done = document.getElementById('pay-done');
        done.innerHTML = `
          <div class="pay-summary">
            <div><span class="muted small">Order</span><strong>${esc(data.order_label || _payOrder.order_label || '')}</strong></div>
            <div><span class="muted small">Method</span><strong>${esc(methodLabel(data.method))}</strong></div>
            <div><span class="muted small">Time</span><strong>${esc(paidAt)}</strong></div>
          </div>
          <div class="receipt-row"><span>Total due</span><span>${peso(data.total)}</span></div>
          <div class="receipt-row"><span>Amount tendered</span><span>${peso(data.amount_tendered)}</span></div>
          ${data.reference_number ? `<div class="receipt-row"><span>Reference</span><span>${esc(data.reference_number)}</span></div>` : ''}
          <div class="pay-change pay-change-big"><span>Change</span><strong>${peso(data.change_due)}</strong></div>
          <button class="btn" type="button" style="margin-top:14px;" onclick="closePayment()">Done</button>`;
        done.hidden = false;
        showToast('Payment recorded.');
        loadOrders();
        loadDashboard();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
    } finally {
        btn.disabled = false; btn.textContent = 'Confirm';
    }
}

/* ── ADD USER / UNLOCK ── */
function openAddUserModal() {
    if (!isAdminUser()) { showAdminOnly('Only an admin can create users.'); return; }
    document.getElementById('user-form').reset();
    document.getElementById('nu-error').hidden = true;
    document.getElementById('user-overlay').classList.add('open');
    setTimeout(() => document.getElementById('nu-name').focus(), 50);
}
function closeAddUserModal() { document.getElementById('user-overlay').classList.remove('open'); }

async function createUser() {
    const errEl = document.getElementById('nu-error');
    errEl.hidden = true;
    const body = {
        full_name: document.getElementById('nu-name').value.trim(),
        email: document.getElementById('nu-email').value.trim(),
        phone: document.getElementById('nu-phone').value.trim(),
        password: document.getElementById('nu-pass').value,
        role: document.getElementById('nu-role').value,
    };
    if (body.full_name.length < 2) { errEl.textContent = 'Full name must be at least 2 characters.'; errEl.hidden = false; return; }
    if (body.password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.hidden = false; return; }
    const btn = document.getElementById('nu-save-btn');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
        const res = await Auth.fetch('/admin/users', { method: 'POST', body });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to create the user.');
        closeAddUserModal();
        if (data.warning) showNotice('User created', data.warning);
        else showToast(`User created as ${Auth.roleLabel(body.role)}.`);
        loadUsers();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
    } finally {
        btn.disabled = false; btn.textContent = 'Create User';
    }
}

async function unlockUser(userId, btn) {
    if (!confirm('Unlock this account? The user will be able to log in again.')) return;
    if (btn) btn.disabled = true;
    const res = await Auth.fetch(`/admin/users/${userId}/unlock`, { method: 'POST' });
    const data = await Auth.readJson(res);
    if (res.ok && !data.__notJson) { showToast('Account unlocked.'); loadUsers(); }
    else { showToast(data.error || 'Unable to unlock.', 6000); if (btn) btn.disabled = false; }
}

/* ── INVENTORY (inside Products) ── */
let _inventory = [];
let _invThreshold = 10;
let _restockItem = null;

function stockPill(qty) {
    const n = Number(qty ?? 0);
    if (n <= 0) return '<span class="status-pill cancelled">Out of stock</span>';
    if (n <= _invThreshold) return `<span class="status-pill pending">Low · ${n}</span>`;
    return `<span class="status-pill active">${n}</span>`;
}

function showProductTab(tab) {
    const inv = tab === 'inventory';
    document.getElementById('products-catalog-view').hidden = inv;
    document.getElementById('products-inventory-view').hidden = !inv;
    document.getElementById('tab-catalog').classList.toggle('active', !inv);
    document.getElementById('tab-inventory').classList.toggle('active', inv);
    document.getElementById('tab-catalog').setAttribute('aria-selected', String(!inv));
    document.getElementById('tab-inventory').setAttribute('aria-selected', String(inv));
    if (inv) loadInventory();
}

function openInventory(btn) {
    switchPanel('products', btn || document.querySelector('[data-panel=inventory]'));
    showProductTab('inventory');
    document.getElementById('topbar-title').textContent = 'Inventory';
}

function setInventoryFilter(value) {
    document.getElementById('inv-filter').value = value;
    renderInventory();
}

async function loadInventory() {
    if (!Auth.isPharmacy(_role)) return;
    try {
        const res = await Auth.fetch('/admin/inventory');
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to load inventory.');
        _inventory = data.filter(p => p.is_active);
        _invThreshold = data[0]?.threshold ?? _invThreshold;
        renderInventory();
        renderStockAlerts();
    } catch (err) {
        document.getElementById('inventory-tbody').innerHTML =
            `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
    loadInventoryLogs();
}

function renderInventory() {
    const out = _inventory.filter(p => p.stock_quantity <= 0);
    const low = _inventory.filter(p => p.stock_quantity > 0 && p.stock_quantity <= _invThreshold);
    const ok = _inventory.filter(p => p.stock_quantity > _invThreshold);
    document.getElementById('inv-out').textContent = out.length;
    document.getElementById('inv-low').textContent = low.length;
    document.getElementById('inv-ok').textContent = ok.length;
    document.getElementById('inv-all').textContent = _inventory.length;
    document.getElementById('inv-threshold-label').textContent = `Low-stock alert at ${_invThreshold} items or fewer (change in Settings)`;

    const filter = document.getElementById('inv-filter').value;
    const list = filter === 'out' ? out : filter === 'low' ? low : filter === 'ok' ? ok : _inventory;
    const tbody = document.getElementById('inventory-tbody');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);">Nothing here.</td></tr>';
    } else {
        tbody.innerHTML = list.map(p => `
      <tr class="${p.stock_quantity <= 0 ? 'inv-row-out' : p.stock_quantity <= _invThreshold ? 'inv-row-low' : ''}">
        <td><strong>${esc(p.name)}</strong></td>
        <td class="muted">${esc(p.category || '—')}</td>
        <td><strong>${p.stock_quantity}</strong></td>
        <td>${p.stock_quantity <= 0 ? '<span class="status-pill cancelled">Out of stock</span>' : p.stock_quantity <= _invThreshold ? '<span class="status-pill pending">Low stock</span>' : '<span class="status-pill active">OK</span>'}</td>
        <td><button class="row-action" onclick="openRestock('${p.product_id}')">Restock</button></td>
      </tr>`).join('');
    }

    // Restock alerts: everything at or below the low-stock number, out-of-stock first.
    const alerts = [...out, ...low];
    document.getElementById('restock-count').textContent = alerts.length ? `${alerts.length} need restocking` : '';
    document.getElementById('restock-alerts').innerHTML = alerts.length
        ? alerts.map(p => `
        <div class="restock-item ${p.stock_quantity <= 0 ? 'is-out' : 'is-low'}">
          <div>
            <strong>${esc(p.name)}</strong>
            <div class="small muted">${p.stock_quantity <= 0 ? 'Out of stock — customers cannot order it' : `Only ${p.stock_quantity} left (alert at ${_invThreshold})`}</div>
          </div>
          <button class="row-action" onclick="openRestock('${p.product_id}')">Restock</button>
        </div>`).join('')
        : '<div class="muted small">All products are above the low-stock alert. 👍</div>';
}

function renderStockAlerts() {
    const out = _inventory.filter(p => p.stock_quantity <= 0).length;
    const low = _inventory.filter(p => p.stock_quantity > 0 && p.stock_quantity <= _invThreshold).length;
    const total = out + low;
    ['inv-alert-count', 'inv-tab-count'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = total;
        el.hidden = total === 0;
    });
    const banner = document.getElementById('stock-alert-banner');
    if (!banner) return;
    banner.hidden = total === 0;
    if (total) {
        document.getElementById('stock-alert-title').textContent = 'Restock alert';
        document.getElementById('stock-alert-text').textContent =
            [out ? `${out} out of stock` : '', low ? `${low} low on stock` : ''].filter(Boolean).join(' · ');
    }
}

async function loadInventoryLogs() {
    const tbody = document.getElementById('inv-logs-tbody');
    try {
        const res = await Auth.fetch('/admin/inventory/logs?limit=30');
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to load stock history.');
        const typeLabel = { restock: 'Restock', sale: 'Sale', adjustment: 'Adjustment', return: 'Return' };
        tbody.innerHTML = data.length ? data.map(l => `
      <tr>
        <td class="muted">${new Date(l.log_date).toLocaleString('en-PH')}</td>
        <td>${esc(l.product_name || '—')}</td>
        <td>${l.type === 'restock' ? '<span class="status-pill active">Restock</span>' : `<span class="status-pill inactive">${esc(typeLabel[l.type] || l.type)}</span>`}</td>
        <td><strong style="color:${l.quantity > 0 ? 'var(--mint)' : 'var(--red)'};">${l.quantity > 0 ? '+' : ''}${l.quantity}</strong></td>
        <td>${l.new_stock}</td>
      </tr>`).join('')
            : '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);">No stock movements yet.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
}

function openRestock(productId) {
    if (!isAdminUser()) { showAdminOnly('Only an admin can restock. Tell an admin which items need stock.'); return; }
    const p = _inventory.find(x => x.product_id === productId);
    if (!p) return;
    _restockItem = p;
    document.getElementById('restock-title').textContent = 'Restock — ' + p.name;
    document.getElementById('restock-info').textContent = `Current stock: ${p.stock_quantity}. Enter how many units arrived.`;
    document.getElementById('restock-qty').value = '';
    document.getElementById('restock-error').hidden = true;
    document.getElementById('restock-overlay').classList.add('open');
    setTimeout(() => document.getElementById('restock-qty').focus(), 50);
}
function closeRestock() { document.getElementById('restock-overlay').classList.remove('open'); _restockItem = null; }

async function confirmRestock() {
    if (!_restockItem) return;
    const add = Number(document.getElementById('restock-qty').value);
    const errEl = document.getElementById('restock-error');
    if (!Number.isInteger(add) || add < 1) { errEl.textContent = 'Enter a whole number of 1 or more.'; errEl.hidden = false; return; }
    const btn = document.getElementById('restock-btn');
    btn.disabled = true;
    try {
        const res = await Auth.fetch('/admin/inventory', {
            method: 'POST',
            body: { product_id: _restockItem.product_id, stock_quantity: _restockItem.stock_quantity + add },
        });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to restock.');
        showToast(`${_restockItem.name}: stock is now ${data.new_stock}.`);
        closeRestock();
        loadInventory();
        loadProducts();
        loadDashboard();
    } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false;
    } finally { btn.disabled = false; }
}

/* ── PRESCRIPTION OCR (pharmacist / admin) ──
   Reads the text on a prescription photo so the pharmacist can check it quickly, and highlights
   medicines from our catalog that appear in it. A pharmacist still approves or rejects. */
const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let _tesseractLoading = null;
const _ocrCache = {};

function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!_tesseractLoading) {
        _tesseractLoading = new Promise((resolve, reject) => {
            const tag = document.createElement('script');
            tag.src = TESSERACT_SRC;
            tag.async = true;
            tag.onload = () => resolve(window.Tesseract);
            tag.onerror = () => { _tesseractLoading = null; reject(new Error('Could not load the OCR reader. Check your internet connection.')); };
            document.head.appendChild(tag);
        });
    }
    return _tesseractLoading;
}

function matchCatalog(text) {
    const hay = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const words = new Set(hay.split(/\s+/).filter(w => w.length >= 4));
    return _medicines.filter(m => {
        const tokens = String(m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
        return tokens.some(t => words.has(t) || hay.includes(t));
    }).slice(0, 10);
}

function openOcrDialog(html) {
    document.getElementById('ocr-body').innerHTML = html;
    document.getElementById('ocr-overlay').classList.add('open');
}
function closeOcrDialog() { document.getElementById('ocr-overlay').classList.remove('open'); }

function renderOcr(result) {
    const matches = result.matches.length
        ? `<div class="ocr-matches">${result.matches.map(m => `<span class="badge safe">${esc(m.name)}${m.requires_rx ? ' · Rx' : ''}</span>`).join('')}</div>`
        : '<p class="small muted" style="margin:0 0 10px;">No catalog medicine names were recognised.</p>';
    const text = result.text.trim()
        ? `<pre class="ocr-text">${esc(result.text.trim())}</pre>`
        : '<p class="small muted">No readable text was found. Open the file with “View” and read it directly.</p>';
    return `
      <div class="small" style="font-weight:700;margin-bottom:6px;">Catalog medicines found</div>
      ${matches}
      <div class="small" style="font-weight:700;margin:12px 0 6px;">Text read from the prescription</div>
      ${text}
      <p class="small muted" style="margin-top:10px;">OCR is a helper only — always check the original file before approving.</p>`;
}

async function readRxOcr(id, fileName, btn) {
    if (_ocrCache[id]) { openOcrDialog(renderOcr(_ocrCache[id])); return; }
    if (/\.pdf$/i.test(fileName || '')) {
        openOcrDialog('<p style="margin:0;">OCR reads photos (JPG, PNG, WEBP). This prescription is a PDF — click “View” to read it.</p>');
        return;
    }
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
    try {
        const res = await Auth.fetch(`/prescriptions/${id}/file`);
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Could not load the file.');
        const fileRes = await fetch(data.url);
        if (!fileRes.ok) throw new Error('Could not download the prescription file.');
        const blob = await fileRes.blob();
        if (blob.type === 'application/pdf') {
            openOcrDialog('<p style="margin:0;">OCR reads photos (JPG, PNG, WEBP). This prescription is a PDF — click “View” to read it.</p>');
            return;
        }
        const Tesseract = await loadTesseract();
        const { data: ocr } = await Tesseract.recognize(blob, 'eng', {
            logger: m => { if (btn && m.status === 'recognizing text') btn.textContent = `Reading… ${Math.round(m.progress * 100)}%`; },
        });
        const text = ocr?.text || '';
        _ocrCache[id] = { text, matches: matchCatalog(text) };
        openOcrDialog(renderOcr(_ocrCache[id]));
    } catch (err) {
        showToast(err.message || 'OCR failed. Please try again.', 5000);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = label || 'Read (OCR)'; }
    }
}

/* ── AUDIT LOG (Settings, admin only) ── */
const AUDIT_LABELS = {
    'auth.login': 'Logged in',
    'auth.login_failed': 'Wrong password',
    'auth.account_locked': 'Account locked (5 wrong passwords)',
    'auth.login_blocked': 'Login blocked — account locked',
    'auth.logout': 'Logged out',
    'auth.password_changed': 'Changed password',
    'auth.signup': 'Signed up',
    'user.created': 'Created a user',
    'user.role_changed': 'Changed a role',
    'user.unlocked': 'Unlocked an account',
    'product.created': 'Added a product',
    'product.updated': 'Edited a product',
    'product.removed': 'Removed a product',
    'product.restocked': 'Restocked',
    'product.stock_adjusted': 'Adjusted stock',
    'prescription.uploaded': 'Uploaded a prescription',
    'prescription.verified': 'Approved a prescription',
    'prescription.declined': 'Rejected a prescription',
    'order.placed': 'Placed an order',
    'order.status_changed': 'Updated an order',
    'order.payment_recorded': 'Recorded a payment',
    'order.payment_refused': 'Payment refused (not enough cash)',
    'settings.updated': 'Changed settings',
};
let _auditTimer = null;
function debounceAudit() { clearTimeout(_auditTimer); _auditTimer = setTimeout(loadAudit, 350); }

function auditDetails(row) {
    const d = row.details || {};
    const parts = [];
    if (d.order) parts.push(d.order);
    if (d.name) parts.push(d.name);
    if (d.email) parts.push(d.email);
    if (d.from && d.to) parts.push(`${Auth.roleLabel(d.from)} → ${Auth.roleLabel(d.to)}`);
    if (d.role && !d.from) parts.push(Auth.roleLabel(d.role));
    if (d.status) parts.push(`status: ${d.status}`);
    if (d.method) parts.push(methodLabel(d.method));
    if (d.total !== undefined && d.tendered !== undefined) parts.push(`total ${peso(d.total)} · tendered ${peso(d.tendered)}`);
    else if (d.total !== undefined) parts.push(`total ${peso(d.total)}`);
    if (d.change !== undefined) parts.push(`change ${peso(d.change)}`);
    if (d.previous_stock !== undefined) parts.push(`stock ${d.previous_stock} → ${d.new_stock}`);
    if (d.failed_attempts) parts.push(`${d.failed_attempts} wrong in a row`);
    if (d.reason) parts.push(`reason: ${d.reason}`);
    if (Array.isArray(d.fields) && d.fields.length) parts.push(`fields: ${d.fields.join(', ')}`);
    if (d.file) parts.push(d.file);
    if (!parts.length && row.target_id) parts.push(String(row.target_id).slice(0, 36));
    return parts.join(' · ');
}

async function loadAudit() {
    if (!isAdminUser()) return;
    const tbody = document.getElementById('audit-tbody');
    const category = document.getElementById('audit-category').value;
    const q = document.getElementById('audit-search').value.trim();
    tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);">Loading…</td></tr>';
    try {
        const res = await Auth.fetch(`/admin/audit?limit=200&category=${encodeURIComponent(category)}&q=${encodeURIComponent(q)}`);
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to load the audit log.');
        tbody.innerHTML = data.length ? data.map(r => {
            const bad = /failed|locked|blocked|refused/.test(r.action);
            return `
      <tr class="${bad ? 'audit-warn' : ''}">
        <td class="muted" style="white-space:nowrap;">${new Date(r.created_at).toLocaleString('en-PH')}</td>
        <td><strong>${esc(r.actor_name || r.actor_email || 'System')}</strong>${r.actor_name && r.actor_email ? `<br><span class="muted" style="font-size:11px;">${esc(r.actor_email)}</span>` : ''}</td>
        <td>${r.actor_role ? statusPill(r.actor_role) : '<span class="muted">—</span>'}</td>
        <td>${bad ? '<span class="status-pill cancelled">' : '<span class="status-pill ready">'}${esc(AUDIT_LABELS[r.action] || r.action)}</span></td>
        <td class="muted" style="font-size:12px;">${esc(auditDetails(r))}</td>
      </tr>`;
        }).join('') : '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--muted);">No activity found.</td></tr>';
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--red);">${esc(err.message)}</td></tr>`;
    }
}

/* ── NOTICE DIALOG ── */
function showNotice(title, message) {
    document.getElementById('notice-title').textContent = title || 'Notice';
    document.getElementById('notice-msg').textContent = message || '';
    document.getElementById('notice-overlay').classList.add('open');
    document.getElementById('notice-ok').focus();
}
function closeNotice() { document.getElementById('notice-overlay').classList.remove('open'); }

/* ── EDIT PRODUCT MODAL ── */
function showAdminOnly(message) {
    document.getElementById('admin-only-msg').textContent = message || 'This action is for admins only.';
    document.getElementById('admin-only-overlay').classList.add('open');
    document.getElementById('admin-only-ok').focus();
}
function closeAdminOnly() { document.getElementById('admin-only-overlay').classList.remove('open'); }

function openAddProductModal() {
    // Block right away — the form never opens for pharmacists / counter.
    if (!isAdminUser()) { showAdminOnly('Only an admin can add new medicines. Ask an admin to add it for you.'); return; }
    document.getElementById('edit-title').textContent = 'Add New Product';
    document.getElementById('edit-id').value = '';
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-price').value = '';
    document.getElementById('edit-brand').value = '';
    document.getElementById('edit-dosage-form').value = '';
    document.getElementById('edit-stock-qty').value = '';
    document.getElementById('edit-description').value = '';
    document.getElementById('edit-image').value = '';
    document.getElementById('upload-prompt').style.display = '';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('edit-rx-otc').value = 'false';
    document.getElementById('edit-sameday').value = 'true';
    document.getElementById('edit-overlay').classList.add('open');
}

function openEditModal(id) {
    if (!isAdminUser()) { showAdminOnly('Only an admin can edit medicines. You can view prices and stock here.'); return; }
    const p = _medicines.find(m => m.medicine_id === id);
    if (!p) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-price').value = p.unit_price;
    document.getElementById('edit-brand').value = p.brand || '';
    if (p.category_id) document.getElementById('edit-category').value = p.category_id;
    document.getElementById('edit-dosage-form').value = p.dosage_form || '';
    document.getElementById('edit-stock-qty').value = p.stock_quantity ?? 0;
    document.getElementById('edit-description').value = p.description || '';
    document.getElementById('edit-image').value = '';
    document.getElementById('upload-prompt').style.display = '';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('edit-rx-otc').value = String(p.requires_rx);
    document.getElementById('edit-sameday').value = String(p.same_day);
    document.getElementById('edit-title').textContent = 'Edit — ' + p.name;
    document.getElementById('edit-overlay').classList.add('open');
}

function closeEditModal() { document.getElementById('edit-overlay').classList.remove('open'); }
function handleEditOverlay(e) {
    // if (e.target === document.getElementById('edit-overlay')) closeEditModal();
}

async function saveEdit() {
    if (!isAdminUser()) { closeEditModal(); showAdminOnly('Only an admin can save medicine changes.'); return; }
    const id = document.getElementById('edit-id').value;
    const fileInput = document.getElementById('edit-image');
    const file = fileInput.files && fileInput.files[0];
    if (!id && !file) {
        showToast('Select a product image before creating the product.');
        return;
    }

    const fields = {
        name: document.getElementById('edit-name').value.trim(),
        brand: document.getElementById('edit-brand').value.trim(),
        category_id: document.getElementById('edit-category').value.trim(),
        price: document.getElementById('edit-price').value,
        requires_rx: document.getElementById('edit-rx-otc').value,
        dosage_form: document.getElementById('edit-dosage-form').value.trim(),
        same_day: document.getElementById('edit-sameday').value,
        stock_qty: document.getElementById('edit-stock-qty').value || '0',
        description: document.getElementById('edit-description').value.trim(),
    };
    const formData = new FormData();
    Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
    if (file) formData.append('image', file);

    try {
        const path = id ? `/medicines/${id}` : '/medicines';
        const res = await Auth.fetch(path, {
            method: id ? 'PUT' : 'POST',
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to save product.');

        showToast(id ? 'Product updated.' : 'Product added.');
        closeEditModal();
        loadProducts();
    } catch (error) {
        showToast(`${error.message || 'Unable to save product.'}`);
    }
}

/* ── PANEL SWITCHING ── */
const panelTitles = {
    dashboard: 'Dashboard', pos: 'Point of Sale',
    users: 'Users', products: 'Products',
    prescriptions: 'Prescriptions', orders: 'Orders',
    settings: 'Settings', inventory: 'Inventory',
};

function switchPanel(name, btn) {
    if (name === 'products' && !document.getElementById('products-inventory-view').hidden && !(btn && btn.dataset.panel === 'inventory')) {
        showProductTab('catalog');
    }
    if (!canSee(name)) {
        showAdminOnly(name === 'pos' || name === 'users'
            ? 'This section is for admins only.'
            : 'Your role cannot open this section.');
        return;
    }
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    const panel = document.getElementById('panel-' + name);
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    document.getElementById('topbar-title').textContent = panelTitles[name] || name;
    document.getElementById('sidebar').classList.remove('open');
    if (name === 'prescriptions') loadPrescriptions();
    if (name === 'orders') loadOrders();
    if (name === 'pos') renderPosProducts();
    if (name === 'settings') loadAudit();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

/* ── HELPERS ── */
function statusPill(s) {
    const map = {
        pending: ['pending', 'Pending'],
        confirmed: ['ready', 'Confirmed'],
        verified: ['verified', 'Verified'],
        ready: ['ready', 'Ready'],
        completed: ['completed', 'Completed'],
        cancelled: ['cancelled', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg> Cancelled'],
        active: ['active', '● Active'],
        inactive: ['inactive', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg> Inactive'],
        declined: ['cancelled', '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg> Declined'],
        admin: ['verified', 'Admin'],
        administrator: ['verified', 'Admin'],
        owner: ['verified', 'Admin'],
        pharmacist: ['ready', 'Pharmacist'],
        counter: ['pending', 'Counter'],
        customer: ['inactive', 'Customer'],
    };
    const [cls, label] = map[s] || ['inactive', s];
    return `<span class="status-pill ${cls}">${label}</span>`;
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(msg, duration = 3500) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeAdminOnly(); closeNotice(); closeOcrDialog(); closeRestock(); closeAddUserModal();
    if (document.getElementById('pay-overlay').classList.contains('open')) closePayment();
});


/* ── SETTINGS ── */
const SETTING_FIELDS = ['pharmacy_name', 'license_no', 'location', 'regulatory_body', 'contact_email',
    'contact_phone', 'hours_weekday', 'hours_saturday', 'hours_sunday', 'low_stock_threshold'];

function settingsMsg(id, text, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-ok', !!ok);
    el.classList.toggle('is-err', !!text && !ok);
}

function setBusy(btnId, busy, idleText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? 'Saving…' : idleText;
}

async function loadSettings() {
    const form = document.getElementById('settings-form');
    if (!form) return;
    let data = {};
    try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        data = await Auth.readJson(res);
    } catch { data = { __notJson: true }; }
    if (data.__notJson) { settingsMsg('settings-msg', 'Could not load settings. Reload to try again.'); return; }

    SETTING_FIELDS.forEach(f => {
        const el = document.getElementById('set-' + f);
        if (el && data[f] !== undefined && data[f] !== null) el.value = data[f];
    });
    document.getElementById('set-accepting_orders').checked = data.accepting_orders !== false;

    const canEdit = isAdminUser();
    form.querySelectorAll('input').forEach(i => { i.disabled = !canEdit; });
    document.getElementById('settings-save-btn').hidden = !canEdit;
    document.getElementById('settings-readonly-badge').hidden = canEdit;
    document.getElementById('settings-setup-note').hidden = !(canEdit && data.configured === false);
}

async function saveSettings() {
    if (!isAdminUser()) { showAdminOnly('Only admins can change pharmacy settings.'); return; }
    settingsMsg('settings-msg', '');
    const body = {};
    SETTING_FIELDS.forEach(f => { body[f] = document.getElementById('set-' + f).value; });
    body.low_stock_threshold = Number(body.low_stock_threshold);
    body.accepting_orders = document.getElementById('set-accepting_orders').checked;

    setBusy('settings-save-btn', true, 'Save Settings');
    try {
        const res = await Auth.fetch('/settings', { method: 'PUT', body });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to save settings.');
        settingsMsg('settings-msg', 'Saved.', true);
        document.getElementById('settings-setup-note').hidden = true;
        showToast('Settings saved.');
        loadDashboard();
    } catch (err) {
        settingsMsg('settings-msg', err.message);
    } finally {
        setBusy('settings-save-btn', false, 'Save Settings');
    }
}

async function saveAccount() {
    settingsMsg('account-msg', '');
    const full_name = document.getElementById('acc-name').value.trim();
    const phone = document.getElementById('acc-phone').value.trim();
    if (full_name.length < 2) { settingsMsg('account-msg', 'Full name must be at least 2 characters.'); return; }

    setBusy('account-save-btn', true, 'Save Profile');
    try {
        const body = { full_name };
        if (phone) body.phone = phone;
        const res = await Auth.fetch('/auth/me', { method: 'PATCH', body });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to save your profile.');
        _adminUser = { ..._adminUser, full_name, phone: phone || _adminUser.phone };
        localStorage.setItem('ap_user', JSON.stringify(_adminUser));
        document.getElementById('admin-name').textContent = full_name;
        document.getElementById('admin-avatar').textContent = full_name.charAt(0).toUpperCase();
        settingsMsg('account-msg', 'Saved.', true);
    } catch (err) {
        settingsMsg('account-msg', err.message);
    } finally {
        setBusy('account-save-btn', false, 'Save Profile');
    }
}

async function changePassword() {
    settingsMsg('password-msg', '');
    const current_password = document.getElementById('pw-current').value;
    const new_password = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;
    if (new_password.length < 6) { settingsMsg('password-msg', 'New password must be at least 6 characters.'); return; }
    if (new_password !== confirm) { settingsMsg('password-msg', 'New passwords do not match.'); return; }

    setBusy('password-save-btn', true, 'Change Password');
    try {
        const res = await Auth.fetch('/auth/password', { method: 'POST', body: { current_password, new_password } });
        const data = await Auth.readJson(res);
        if (!res.ok || data.__notJson) throw new Error(data.error || 'Unable to change password.');
        document.getElementById('password-form').reset();
        settingsMsg('password-msg', 'Password changed.', true);
    } catch (err) {
        settingsMsg('password-msg', err.message);
    } finally {
        setBusy('password-save-btn', false, 'Change Password');
    }
}
