process.env.TZ = 'Asia/Kolkata';
const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({
    path: path.join(root, '.env')
});
const requestedPort = Number(process.env.PORT);
const port = Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 3000;
module.exports = {
    port,
    sessionSecret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
    root,
    tablePrefix: process.env.TABLE_PREFIX || 'uno_',
    uploadDir: process.env.DATAEVOL_DATA_DIR ? path.join(process.env.DATAEVOL_DATA_DIR, 'uploads') : path.join(root, 'uploads'),
    mysql: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'taskmanager',
        waitForConnections: true,
        connectionLimit: 10,
        multipleStatements: true,
        timezone: '+05:30',
        dateStrings: true
    }
};