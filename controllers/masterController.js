const masterService = require('../services/masterService');

exports.getDepartmentsAPI = async (req, res) => {
    try {
        const q = req.query.q || '';
        const list = await masterService.getActiveDepartments(q);
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.getDesignationsAPI = async (req, res) => {
    try {
        const q = req.query.q || '';
        const list = await masterService.getActiveDesignations(q);
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.createDepartmentAPI = async (req, res) => {
    try {
        const name = req.body.name || '';
        const result = await masterService.findOrCreateDepartment(name);
        res.json({ success: true, item: result });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.createDesignationAPI = async (req, res) => {
    try {
        const name = req.body.name || '';
        const result = await masterService.findOrCreateDesignation(name);
        res.json({ success: true, item: result });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
};

exports.masterManagementPage = async (req, res) => {
    try {
        const departments = await masterService.getAllDepartments();
        const designations = await masterService.getAllDesignations();
        res.render('master-management', {
            departments,
            designations,
            currentUserRole: req.session.user.role,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (e) {
        res.status(500).render('error', { message: e.message });
    }
};

exports.saveDepartment = async (req, res) => {
    try {
        const { id, name } = req.body;
        await masterService.saveDepartment(id, name, req.session.user.id);
        res.redirect('/master?success=Department saved successfully');
    } catch (e) {
        res.redirect(`/master?error=${encodeURIComponent(e.message)}`);
    }
};

exports.saveDesignation = async (req, res) => {
    try {
        const { id, name } = req.body;
        await masterService.saveDesignation(id, name, req.session.user.id);
        res.redirect('/master?success=Designation saved successfully');
    } catch (e) {
        res.redirect(`/master?error=${encodeURIComponent(e.message)}`);
    }
};

exports.toggleDepartment = async (req, res) => {
    try {
        await masterService.toggleDepartment(req.params.id, req.session.user.id);
        res.redirect('/master?success=Department status updated');
    } catch (e) {
        res.redirect(`/master?error=${encodeURIComponent(e.message)}`);
    }
};

exports.toggleDesignation = async (req, res) => {
    try {
        await masterService.toggleDesignation(req.params.id, req.session.user.id);
        res.redirect('/master?success=Designation status updated');
    } catch (e) {
        res.redirect(`/master?error=${encodeURIComponent(e.message)}`);
    }
};
