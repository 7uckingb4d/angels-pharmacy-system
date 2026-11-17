// Local development entry point. On Vercel the app is served by api/index.js.
import app from './src/app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Angel's Pharmacy running on http://localhost:${PORT}`));
