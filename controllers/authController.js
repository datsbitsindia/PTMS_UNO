const bcrypt = require('bcrypt');
const { db } = require('../database/init');
const activity = require('../services/activityService');

exports.loginPage = (req, res) => res.render('login', { error: null });

exports.login = async (req, res, next) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const user = await db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
        if (!user || !await bcrypt.compare(req.body.password || '', user.password)) {
            return res.render('login', { error: 'Invalid email or password' });
        }

        // Fetch this user's organization
        const orgId = user.organization_id || 1;
        const userOrg = await db.prepare('SELECT id, name FROM organizations WHERE id=?').get(orgId);
        const organizations = userOrg ? [userOrg] : [{ id: 1, name: 'Unomok' }];

        req.session.regenerate(err => {
            if (err) return next(err);
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization_id: orgId,
                organizations
            };
            req.session.save(async saveError => {
                if (saveError) return next(saveError);
                try { await activity.log(user.id, 'Login'); } catch (logError) {
                    console.error('Login activity could not be recorded:', logError.message);
                }
                res.redirect(user.role === 'admin' ? '/projects' : user.role === 'employee' ? '/tasks' : '/dashboard');
            });
        });
    } catch (error) {
        next(error);
    }
};

exports.logout = (req, res) => {
    const id = req.session.user?.id;
    activity.log(id, 'Logout');
    req.session.destroy(() => res.redirect('/login'));
};
