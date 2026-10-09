const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const connectDatabase = require('./config/database');

const cookieParser = require('cookie-parser');
const app = express();
const custumerrouter = require('./routers/customerrouters'); 
const productrouter = require('./routers/productroutes');
const orderrouter = require('./routers/orderroutes');
const salerouter = require('./routers/saleroutes');
const invoicesettingrouter = require('./routers/invoicesettingroutes');
const receiptrouter = require('./routers/receiptroutes');
const ledgerrouter = require('./routers/ledgerroutes');
const backuprouter = require('./routers/backuproutes');
const driverrouter = require('./routers/driverroutes');
const vehiclerouter = require('./routers/vehicleroutes');

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'config/config.env') });


connectDatabase();

app.use(
  cors({
    origin: ["http://127.0.0.1:3000", "http://localhost:3000","http://192.168.1.103:3000"],
      methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // ✅ Allows cookies
  })
);
app.use(cookieParser());
app.use(express.json());
app.use('/api/customers', custumerrouter);
app.use('/api/products', productrouter);
app.use('/api/orders', orderrouter);
app.use('/api/sales', salerouter);
app.use('/api/invoice-settings', invoicesettingrouter);
app.use('/api/receipts', receiptrouter);
app.use('/api/ledger', ledgerrouter);
app.use('/api/backup', backuprouter);
app.use('/api/drivers', driverrouter);
app.use('/api/vehicles', vehiclerouter);

// Health check for the dashboard's three status lights: this endpoint answering at
// all means the backend is up; its `db` field says whether Mongo is connected.
// readyState: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  res.json({
    ok: true,
    db: dbState === 1,
    dbState,
    time: new Date().toISOString(),
  });
});

module.exports = app;
