function requireAuth(req,res,next){ if(!req.session.user) return res.redirect('/login'); next(); }
function requireAdmin(req,res,next){ if(req.session.user?.role !== 'admin') return res.status(403).render('error',{message:'Access denied'}); next(); }
function requireManager(req,res,next){ if(!['admin','manager'].includes(req.session.user?.role)) return res.status(403).render('error',{message:'Access denied'}); next(); }
function requireOnlyManager(req,res,next){ if(req.session.user?.role!=='manager') return res.status(403).render('error',{message:'Only a manager can perform this action'}); next(); }
function exposeUser(req,res,next){ res.locals.user=req.session.user || null; next(); }
module.exports={requireAuth,requireAdmin,requireManager,requireOnlyManager,exposeUser};
