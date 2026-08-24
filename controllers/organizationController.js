const { db } = require('../database/init');

/**
 * POST /api/organization/switch
 * Body: { organization_id }
 * Switches the active organization in the user's session.
 */
exports.switchOrganization = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });

        const targetOrgId = Number(req.body.organization_id);
        if (!targetOrgId) return res.status(400).json({ success: false, message: 'Invalid organization_id' });

        // Verify the user actually belongs to this org
        const membership = await db.prepare(
            'SELECT uo.organization_id, o.name FROM user_organizations uo JOIN organizations o ON o.id=uo.organization_id WHERE uo.user_id=? AND uo.organization_id=?'
        ).get(user.id, targetOrgId);

        if (!membership) {
            return res.status(403).json({ success: false, message: 'You do not have access to that organization.' });
        }

        // Update session active org
        req.session.user.organization_id = targetOrgId;

        // Refresh the full organizations list from DB
        const userOrgs = await db.prepare(
            'SELECT o.id, o.name FROM user_organizations uo JOIN organizations o ON o.id=uo.organization_id WHERE uo.user_id=? ORDER BY o.name'
        ).all(user.id);

        req.session.user.organizations = userOrgs;

        req.session.save(err => {
            if (err) return res.status(500).json({ success: false, message: 'Session save error' });
            res.json({ success: true, organization: membership });
        });
    } catch (err) {
        console.error('Switch org error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
