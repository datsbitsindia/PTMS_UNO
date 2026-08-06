const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const database = require('./database/init');
const {
    exposeUser
} = require('./middleware/auth');
const helpers = require('./utils/helpers');
const notifications = require('./services/notificationService');
async function start() {
    await database.init();
    fs.mkdirSync(config.uploadDir, {
        recursive: true
    });
    const webApp = express();
    if (config.cookieSecure) webApp.set('trust proxy', 1);
    webApp.set('view engine', 'ejs');
    webApp.set('views', path.join(config.root, 'views'));
    webApp.use(helmet({
        contentSecurityPolicy: false
    }));
    webApp.use(express.urlencoded({
        extended: false,
        limit: '1mb'
    }));
    webApp.use(express.json({
        limit: '100kb'
    }));
    webApp.use(express.static(path.join(config.root, 'public'), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('manifest.json')) {
                res.setHeader('Content-Type', 'application/manifest+json');
            }
            if (filePath.endsWith('sw.js')) {
                res.setHeader('Service-Worker-Allowed', '/');
                res.setHeader('Cache-Control', 'no-cache');
            }
        }
    }));
    const sessionOptions = {
        ...config.mysql,
        schema: {
            tableName: 'dataevol_sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    };
    webApp.use(session({
        store: new MySQLStore(sessionOptions),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: config.cookieSecure,
            maxAge: 28800000
        }
    }));
    webApp.use(exposeUser);
    webApp.use(require('./middleware/audit'));
    webApp.use(async (req, res, next) => {
        try {
            Object.assign(res.locals, helpers);
            if (req.session.user) await notifications.syncOverdue();
            res.locals.unread = req.session.user ? (await database.db.prepare('SELECT COUNT(*) count FROM notifications WHERE user_id=? AND is_read=0').get(req.session.user.id)).count : 0;
            next();
        } catch (e) {
            next(e);
        }
    });
    webApp.use(require('./routes/audit'));
    webApp.use(require('./routes'));
    webApp.use((req, res) => res.status(404).render('error', {
        message: 'Page not found'
    }));
    webApp.use((err, req, res, next) => {
        console.error(err);
        res.status(500).render('error', {
            message: err.message || 'Something went wrong'
        });
    });
    const server = await new Promise((resolve, reject) => {
        const instance = webApp.listen(config.port);
        instance.once('listening', () => resolve(instance));
        instance.once('error', reject);
    });
    console.log(`Task Manager running at http://localhost:${config.port}`);
    return {
        webApp,
        server
    };
}
if (require.main === module) start().catch(error => {
    console.error('Startup failed:', error);
    process.exitCode = 1;
});
module.exports = {
    start
};