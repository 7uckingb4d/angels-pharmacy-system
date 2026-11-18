/* Stock helpers for customer pages (catalog, medicine details, customer home).
   Out-of-stock medicines are labelled and can't be added to the cart. */
window.APStock = (function () {
    function qty(med) {
        const n = Number(med && (med.stock_qty ?? med.stock_quantity));
        return Number.isFinite(n) ? n : null; // null = unknown (treat as available)
    }
    function isOut(med) { const n = qty(med); return n !== null && n <= 0; }

    function ensureDialog() {
        let overlay = document.getElementById('stock-alert-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.className = 'ap-dialog-overlay';
        overlay.id = 'stock-alert-overlay';
        overlay.innerHTML =
            '<div class="ap-dialog" role="alertdialog" aria-modal="true" aria-labelledby="stock-alert-title" aria-describedby="stock-alert-msg">' +
            '<div class="ap-dialog-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg></div>' +
            '<h3 id="stock-alert-title">Out of stock</h3>' +
            '<p id="stock-alert-msg"></p>' +
            '<button class="btn" type="button" id="stock-alert-ok">OK</button>' +
            '</div>';
        document.body.appendChild(overlay);
        const close = () => overlay.classList.remove('open');
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#stock-alert-ok').addEventListener('click', close);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        return overlay;
    }

    function alert(name, message) {
        const overlay = ensureDialog();
        overlay.querySelector('#stock-alert-title').textContent = message ? 'Not enough stock' : 'Out of stock';
        overlay.querySelector('#stock-alert-msg').textContent = message ||
            ((name || 'This item') + ' was not added to your cart — it is out of stock. Please check back later or ask the pharmacy.');
        overlay.classList.add('open');
        overlay.querySelector('#stock-alert-ok').focus();
    }

    return { qty, isOut, alert };
})();
