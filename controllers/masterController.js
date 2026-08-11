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
