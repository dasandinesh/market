const app = require('./app'); // Fixed path (use './app' if it's in the same directory)
const dotenv = require('dotenv');
const path = require('path');
const { service: atlasSync } = require('./atlas-sync/service');

// Load environment variables from config file
dotenv.config({ path: path.join(__dirname, 'config/config.env') });

// app.js connects the local database. Atlas uses its own independent connection.

// Start the server
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Bind to all network interfaces for local network access

app.listen(PORT, HOST, () => {
    atlasSync.start();
    console.log(`Server listening on ${HOST}:${PORT} in ${process.env.NODE_ENV} mode`);
    console.log(`Local access: http://localhost:${PORT}`);
    console.log(`Network access: http://YOUR_LOCAL_IP:${PORT}`);
    console.log('To find your local IP, run: ipconfig (Windows) or ifconfig (Mac/Linux)');
});
