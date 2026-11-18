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
// counter    → dashboard, orders (status updates only), settings
const PANEL_ACCESS = {
    dashboard: ['admin', 'pharmacist', 'counter'],
    pos: ['admin'],
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

    const isAdmin = _role === 'admin';
    const isPharmacy = Auth.isPharmacy(_role);

    // Hide what this role cannot use
    // 'important' is needed: the theme styles sidebar links with display:flex !important.
    const hide = el => el.style.setProperty('display', 'none', 'important');
    if (!isAdmin) document.querySelectorAll('.admin-only').forEach(hide);
    if (!isPharmacy) document.querySelectorAll('.rx-only').forEach(hide);

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
    document.getElementById('settings-email').textContent = _adminUser.email;
    document.getElementById('settings-role').textContent = label;

    await loadDashboard();
    if (isPharmacy) { loadCategories(); loadProducts(); loadPrescriptions(); }
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
          <div class="activity-text"><strong>Order ${o.order_id.slice(0, 8)}…</strong> — ${esc(o.profiles?.full_name || 'Customer')}</div>
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
            tbody.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--muted);">No users yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((u, i) => `
      <tr>
        <td class="muted">${i + 1}</td>
        <td><strong>${esc(u.full_name || '—')}</strong></td>
        <td class="muted">${esc(u.email)}</td>
        <td class="muted">${esc(u.phone || '—')}</td>
        <td>${statusPill(u.role)}</td>
        <td class="muted">${new Date(u.created_at).toLocaleDateString('en-PH')}</td>
        <td>
          ${u.id === _adminUser.id
            ? '<span class="muted" style="font-size:12px;">You</span>'
            : `<select class="role-select" aria-label="Role for ${esc(u.full_name || u.email)}"
                 data-current="${esc(Auth.normalizeRole(u.role))}"
                 onchange="changeUserRole('${u.id}', this.value, this)">
                 ${ROLE_OPTIONS.map(r => `<option value="${r}" ${Auth.normalizeRole(u.role) === r ? 'selected' : ''}>${Auth.roleLabel(r)}</option>`).join('')}
               </select>`}
        </td>
      </tr>
    `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--red);">${err.message}</td></tr>`;
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
            `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--red);">${err.message}</td></tr>`;
    }
}

async function deactivateProduct(id) {
    if (!isAdminUser()) { showAdminOnly('Only an admin can remove medicines from the catalog.'); return; }
    const name = _medicines.find(m => m.medicine_id === id)?.name || 'this product';
    if (!confirm(`Deactivate "${name}"? It will no longer appear in the catalogue.`)) return;
    const res = await Auth.fetch(`/medicines/${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('Product deactivated.'); loadProducts(); }
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
            tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--muted);">No orders found.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(o => `
      <tr>
        <td class="muted"><strong>${o.order_id.slice(0, 8)}…</strong></td>
        <td>${esc(o.profiles?.full_name || '—')}<br><span class="muted" style="font-size:11px;">${esc(o.profiles?.phone || '')}</span></td>
        <td>₱${parseFloat(o.total_amount).toFixed(2)}</td>
        <td class="muted">${new Date(o.placed_at).toLocaleString('en-PH')}</td>
        <td>${statusPill(o.status)}</td>
        <td>
          ${o.status === 'pending' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','confirmed')">Confirm</button>` : ''}
          ${o.status === 'confirmed' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','ready')">Mark Ready</button>` : ''}
          ${o.status === 'ready' ? `<button class="row-action" onclick="updateOrderStatus('${o.order_id}','completed')">Complete</button>` : ''}
          ${['pending', 'confirmed'].includes(o.status) ? `<button class="row-action danger" onclick="updateOrderStatus('${o.order_id}','cancelled')">Cancel</button>` : ''}
        </td>
      </tr>
    `).join('');
    } catch (err) {
        document.getElementById('orders-tbody').innerHTML =
            `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--red);">${err.message}</td></tr>`;
    }
}

async function updateOrderStatus(id, status) {
    const res = await Auth.fetch(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
    if (res.ok) { showToast(`Order marked as ${status}.`); loadOrders(); loadDashboard(); }
    else { const d = await res.json(); showToast('' + d.error); }
}

/* ── POS ── */
function renderPosProducts(filter = '') {
    const grid = document.getElementById('pos-products-grid');
    const list = _medicines.filter(m =>
        m.is_active && (!filter || m.name.toLowerCase().includes(filter.toLowerCase()))
    );
    if (!list.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--muted);">No medicines found.</div>';
        return;
    }
    grid.innerHTML = list.map(m => `
    <button class="pos-product-btn ${m.requires_rx ? 'rx-item' : ''}"
            data-id="${esc(m.medicine_id)}" data-name="${esc(m.name)}" data-price="${m.unit_price}" data-rx="${m.requires_rx ? '1' : ''}"
            onclick="addToPosCart(this.dataset.id, this.dataset.name, this.dataset.price, this.dataset.rx === '1')">
      <span class="pos-product-badge ${m.requires_rx ? 'status-pill pending' : 'status-pill verified'}">${m.requires_rx ? 'Rx' : 'OTC'}</span>
      <span class="pos-product-name">${esc(m.name)}</span>
      <span class="pos-product-price">₱${parseFloat(m.unit_price).toFixed(2)}</span>
    </button>
  `).join('');
}

function filterPosProducts(val) { renderPosProducts(val); }

function addToPosCart(id, name, price, requiresRx) {
    const existing = posCart.find(i => i.id === id);
    if (existing) { existing.qty++; }
    else { posCart.push({ id, name, price: parseFloat(price), requiresRx, qty: 1 }); }
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
    item.qty += delta;
    if (item.qty <= 0) posCart = posCart.filter(i => i.id !== id);
    renderPosCart();
}

function clearPosCart() {
    posCart = [];
    document.querySelectorAll('.pos-payment-btn').forEach(b => b.classList.remove('selected'));
    renderPosCart();
}



async function processSale() {
    if (!isAdminUser()) { showAdminOnly('Only an admin can process POS sales.'); return; }
    if (!posCart.length) { showToast('Add items to the cart first.'); return; }

    const btn = document.getElementById('pos-process-btn');
    btn.disabled = true; btn.textContent = 'Processing…';

    try {
        const items = posCart.map(i => ({ medicine_id: i.id, quantity: i.qty }));
        const res = await Auth.fetch(`/orders`, {
            method: 'POST',
            body: JSON.stringify({ items, notes: 'POS walk-in sale · Payment at pick-up' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        await Auth.fetch(`/orders/${data.order_id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' }),
        });

        showReceipt(data.order_id);
        clearPosCart();
        loadDashboard();
    } catch (err) {
        showToast('' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Process Sale ';
    }
}

function showReceipt(orderId) {
    const total = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    const now = new Date().toLocaleString('en-PH');
    const items = [...posCart];

    document.getElementById('receipt-body').innerHTML = `
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Date &amp; Time</span><span>${now}</span></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Payment</span><span>To be collected at pick-up</span></div>
    <div class="receipt-row" style="border:none;padding-bottom:4px;"><span style="color:var(--muted);">Order ID</span><span style="font-size:11px;">${orderId.slice(0, 8)}…</span></div>
    <div style="border-top:1px dashed var(--border);margin:10px 0;"></div>
    ${items.map(i => `<div class="receipt-row"><span>${esc(i.name)} × ${i.qty}</span><span>₱${(i.price * i.qty).toFixed(2)}</span></div>`).join('')}
    <div style="border-top:2px solid var(--border);margin:10px 0;"></div>
    <div class="receipt-total"><span>TOTAL</span><span>₱${total.toFixed(2)}</span></div>
    <div style="text-align:center;margin-top:16px;font-size:12px;color:var(--muted);">Thank you for your purchase!<br>Angel's Pharmacy — Valenzuela City</div>
  `;
    document.getElementById('receipt-overlay').classList.add('open');
}

function closeReceipt() { document.getElementById('receipt-overlay').classList.remove('open'); }
function printReceipt() { window.print(); }

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
    settings: 'Settings',
};

function switchPanel(name, btn) {
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAdminOnly(); });
