function requireAuth(req,res,next){ if(!req.session.user) return res.redirect('/login'); next(); }
function requireAdmin(req,res,next){ if(req.session.user?.role !== 'admin') return res.status(403).render('error',{message:'Access denied'}); next(); }
function requireManager(req,res,next){ if(!['admin','manager'].includes(req.session.user?.role)) return res.status(403).render('error',{message:'Access denied'}); next(); }
function requireOnlyManager(req,res,next){ if(req.session.user?.role!=='manager') return res.status(403).render('error',{message:'Only a manager can perform this action'}); next(); }

async function exposeUser(req, res, next) {
    res.locals.user = req.session.user || null;
    if (req.session.user) {
        const orgId = req.session.user.organization_id || 1;
        res.locals.currentOrgId = orgId;
        res.locals.userOrgs = req.session.user.organizations || [];
        const currentOrg = (req.session.user.organizations || []).find(o => Number(o.id) === Number(orgId));
        res.locals.currentOrg = currentOrg || { id: orgId, name: 'Unomok' };
    } else {
        res.locals.currentOrgId = 1;
        res.locals.userOrgs = [];
        res.locals.currentOrg = { id: 1, name: 'Unomok' };
    }
    next();
}

module.exports={requireAuth,requireAdmin,requireManager,requireOnlyManager,exposeUser};
