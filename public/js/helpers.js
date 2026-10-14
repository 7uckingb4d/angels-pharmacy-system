/*-- Helper function for loading HTML fragments --*/
async function loadFragment(targetId, url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);

        const htmlText = await response.text();
        document.getElementById(targetId).innerHTML = htmlText;
    } catch (error) {
        console.error("Error inserting fragment:", error);
    }
}


/*-- Render helper for NAVIGATION BAR --*/
async function renderNavBar() {
    const _currentUser = await Auth.requireAuth();

    await loadFragment('site-nav', '/fragments/navbar.html');  // Renders fragment from file

    // Populate greetings for logged user
    const firstName = _currentUser.full_name;
    const initial = firstName.charAt(0).toUpperCase();
    const avatar = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    if (avatar) { avatar.textContent = initial; avatar.title = _currentUser.full_name || _currentUser.email || ''; }
    if (nameEl) { nameEl.textContent = 'Hi, ' + firstName + '!'; nameEl.style.display = ''; }
}