

const Auth = (() => {

    const API = '/api';  // change to your domain in production
    const ACCESS_KEY = 'ap_access_token';
    const REFRESH_KEY = 'ap_refresh_token';
    const USER_KEY = 'ap_user';

    /* ── TOKEN STORAGE ─────────────────────────────────────────────── */

    function getAccessToken() { return sessionStorage.getItem(ACCESS_KEY); }
    function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }

    function saveTokens(access_token, refresh_token) {

        sessionStorage.setItem(ACCESS_KEY, access_token);
        if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
    }

    function clearTokens() {
        sessionStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(USER_KEY);
    }

    /* ── CACHED USER ───────────────────────────────────────────────── */

    function getCachedUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); }
        catch { return null; }
    }

    function saveUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    /* ── SAFE JSON ─────────────────────────────────────────────────── */
    /* A network hiccup, VPN, or hosting error page can return HTML instead of
       JSON. Never show "Unexpected token '<'" — return a readable error.   */

    const SERVER_DOWN_MSG = "We couldn't reach the server. Check your connection (turn off VPN or data saver if it's on) and try again.";

    async function readJson(res) {
        const type = res.headers.get('content-type') || '';
        if (!type.includes('application/json')) return { __notJson: true, error: SERVER_DOWN_MSG };
        try { return await res.json(); }
        catch { return { __notJson: true, error: SERVER_DOWN_MSG }; }
    }

    // POST JSON; if the reply is not JSON (temporary error page), wait and try once more.
    async function postJson(path, body) {
        for (let attempt = 0; attempt < 2; attempt++) {
            let res;
            try {
                res = await fetch(`${API}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify(body),
                    cache: 'no-store',
                });
            } catch {
                if (attempt === 0) { await new Promise(r => setTimeout(r, 900)); continue; }
                throw new Error(SERVER_DOWN_MSG);
            }
            const data = await readJson(res);
            if (data.__notJson && attempt === 0) { await new Promise(r => setTimeout(r, 900)); continue; }
            return { res, data };
        }
    }

    /* ── API HELPER ────────────────────────────────────────────────── */

    async function apiFetch(path, options = {}) {
        const token = getAccessToken();
        const requestOptions = { ...options };
        const headers = { ...(options.headers || {}) };
        const isFormData = typeof FormData !== 'undefined' && requestOptions.body instanceof FormData;

        if (isFormData) {
            Object.keys(headers)
                .filter(name => name.toLowerCase() === 'content-type')
                .forEach(name => delete headers[name]);
        } else if (requestOptions.body !== undefined) {
            if (typeof requestOptions.body !== 'string') {
                requestOptions.body = JSON.stringify(requestOptions.body);
            }
            if (!Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) {
                headers['Content-Type'] = 'application/json';
            }
        }
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API}${path}`, { ...requestOptions, headers });

        // Token expired — try refreshing once
        if (res.status === 401) {
            const refreshed = await tryRefresh();
            if (refreshed) {
                headers['Authorization'] = `Bearer ${getAccessToken()}`;
                return fetch(`${API}${path}`, { ...requestOptions, headers });
            }
        }

        return res;
    }

    async function tryRefresh() {
        const refresh_token = getRefreshToken();
        if (!refresh_token) return false;

        try {
            const { res, data } = await postJson('/auth/refresh', { refresh_token });
            if (data.__notJson) return false; // server hiccup: keep the session, try again later
            if (!res.ok) { clearTokens(); return false; }
            const { access_token, refresh_token: new_refresh } = data;
            saveTokens(access_token, new_refresh);
            return true;
        } catch {
            clearTokens();
            return false;
        }
    }

    /* ── SIGN UP ───────────────────────────────────────────────────── */

    async function signUp(full_name, email, phone, password, confirmPassword) {
        full_name = full_name.trim();
        email = email.trim().toLowerCase();

        if (full_name.length < 2)
            throw new Error('Full name must be at least 2 characters.');
        if (password.length < 6)
            throw new Error('Password must be at least 6 characters.');
        if (password !== confirmPassword)
            throw new Error('Passwords do not match. Please try again.');

        const { res, data } = await postJson('/auth/signup', { full_name, email, phone, password });
        if (data.__notJson || !res.ok) throw new Error(data.error || 'Sign up failed.');
        return data;
    }

    /* ── LOG IN ────────────────────────────────────────────────────── */

    async function logIn(email, password) {
        email = email.trim().toLowerCase();

        if (!email || !password)
            throw new Error('Email and password are required.');

        const { res, data } = await postJson('/auth/login', { email, password });
        if (data.__notJson || !res.ok) throw new Error(data.error || 'Login failed.');

        saveTokens(data.access_token, data.refresh_token);
        saveUser(data.user);
        return data.user;
    }

    /* ── LOG OUT ───────────────────────────────────────────────────── */

    async function logOut() {
        try {
            await apiFetch('/auth/logout', { method: 'POST' });
        } catch { /* ignore network errors on logout */ }
        clearTokens();
        window.location.replace('index.html');
    }

    /* ── GET SESSION (current user) ────────────────────────────────── */

    function getSession() {

        if (!getAccessToken()) return null;
        return getCachedUser();
    }

    /* ── REQUIRE AUTH ──────────────────────────────────────────────── */
    /* Call at the top of any protected page.
       Redirects to index.html immediately if no session exists.       */

    async function requireAuth() {
        if (!getAccessToken()) {
            // Try refresh before giving up
            const refreshed = await tryRefresh();
            if (!refreshed) {
                window.location.replace('index.html');
                return null;
            }
        }

        // Validate token is still good and refresh user data
        try {
            const res = await apiFetch('/auth/me');
            if (!res.ok) throw new Error();
            const user = await res.json();
            saveUser(user);
            return user;
        } catch {
            clearTokens();
            window.location.replace('index.html');
            return null;
        }
    }

    /* ── ROLES ─────────────────────────────────────────────────────── */
    /* admin = everything · pharmacist = prescriptions + view products + orders
       counter = order status only · customer = shopper.
       Old 'owner' / 'administrator' values are treated as admin.        */

    const ROLE_LABELS = { admin: 'Admin', pharmacist: 'Pharmacist', counter: 'Counter', customer: 'Customer' };

    function normalizeRole(role) {
        const r = String(role || 'customer').toLowerCase();
        if (r === 'owner' || r === 'administrator') return 'admin';
        return ROLE_LABELS[r] ? r : 'customer';
    }
    function isAdmin(role) { return normalizeRole(role) === 'admin'; }
    function isPharmacy(role) { return ['admin', 'pharmacist'].includes(normalizeRole(role)); }
    function isStaff(role) { return ['admin', 'pharmacist', 'counter'].includes(normalizeRole(role)); }
    function roleLabel(role) { return ROLE_LABELS[normalizeRole(role)]; }
    function homeFor(user) { return user && isStaff(user.role) ? 'admin.html' : 'homepage.html'; }

    /* ── REQUIRE ADMIN ─────────────────────────────────────────────── */

    async function requireAdmin() {
        const user = await requireAuth();
        if (user && !isAdmin(user.role)) {
            window.location.replace('homepage.html');
            return null;
        }
        return user;
    }

    /* ── API FETCH (exported for other modules) ────────────────────── */
    /* Use this in homepage.js, admin.js etc. to make authenticated API calls:
       const res = await Auth.fetch('/medicines');
       const medicines = await res.json();                              */

    /* ── PUBLIC API ────────────────────────────────────────────────── */
    return {
        signUp,
        logIn,
        logOut,
        getSession,
        requireAuth,
        requireAdmin,
        normalizeRole,
        isAdmin,
        isPharmacy,
        isStaff,
        roleLabel,
        homeFor,
        fetch: apiFetch,   // authenticated fetch for use in other scripts
        readJson,          // safe res.json() that never throws on HTML replies
    };

})();
