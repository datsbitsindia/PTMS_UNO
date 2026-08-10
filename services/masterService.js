const { db } = require('../database/init');
const activity = require('./activityService');

function normalizeName(str) {
    return String(str || '').trim().toLowerCase();
}

exports.normalizeName = normalizeName;

exports.findOrCreateDepartment = async (rawName) => {
    const clean = String(rawName || '').trim();
    if (!clean) return null;
    const normalized = normalizeName(clean);

    let existing = await db.prepare('SELECT * FROM departments WHERE normalized_name=?').get(normalized);
    if (existing) {
        if (!existing.active) {
            await db.prepare('UPDATE departments SET active=1 WHERE id=?').run(existing.id);
            existing.active = 1;
        }
        return existing;
    }

    try {
        const res = await db.prepare('INSERT INTO departments(name, normalized_name, active) VALUES(?,?,1)').run(clean, normalized);
        return { id: res.lastInsertRowid, name: clean, normalized_name: normalized, active: 1 };
    } catch (e) {
        return await db.prepare('SELECT * FROM departments WHERE normalized_name=?').get(normalized);
    }
};

exports.findOrCreateDesignation = async (rawName) => {
    const clean = String(rawName || '').trim();
    if (!clean) return null;
    const normalized = normalizeName(clean);

    let existing = await db.prepare('SELECT * FROM designations WHERE normalized_name=?').get(normalized);
    if (existing) {
        if (!existing.active) {
            await db.prepare('UPDATE designations SET active=1 WHERE id=?').run(existing.id);
            existing.active = 1;
        }
        return existing;
    }

    try {
        const res = await db.prepare('INSERT INTO designations(name, normalized_name, active) VALUES(?,?,1)').run(clean, normalized);
        return { id: res.lastInsertRowid, name: clean, normalized_name: normalized, active: 1 };
    } catch (e) {
        return await db.prepare('SELECT * FROM designations WHERE normalized_name=?').get(normalized);
    }
};

exports.getActiveDepartments = async (q = '') => {
    const cleanQ = String(q || '').trim().toLowerCase();
    if (cleanQ) {
        return await db.prepare('SELECT * FROM departments WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?) ORDER BY name ASC').all(`%${cleanQ}%`, `%${cleanQ}%`);
    }
    return await db.prepare('SELECT * FROM departments WHERE active=1 ORDER BY name ASC').all();
};

exports.getActiveDesignations = async (q = '') => {
    const cleanQ = String(q || '').trim().toLowerCase();
    if (cleanQ) {
        return await db.prepare('SELECT * FROM designations WHERE active=1 AND (LOWER(name) LIKE ? OR LOWER(normalized_name) LIKE ?) ORDER BY name ASC').all(`%${cleanQ}%`, `%${cleanQ}%`);
    }
    return await db.prepare('SELECT * FROM designations WHERE active=1 ORDER BY name ASC').all();
};

exports.getAllDepartments = async () => {
    return await db.prepare('SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id=d.id OR LOWER(TRIM(u.department))=d.normalized_name) AS user_count FROM departments d ORDER BY d.name ASC').all();
};

exports.getAllDesignations = async () => {
    return await db.prepare('SELECT des.*, (SELECT COUNT(*) FROM users u WHERE u.designation_id=des.id OR LOWER(TRIM(u.designation))=des.normalized_name) AS user_count FROM designations des ORDER BY des.name ASC').all();
};

exports.toggleDepartment = async (id, userId) => {
    const dept = await db.prepare('SELECT * FROM departments WHERE id=?').get(id);
    if (!dept) return null;
    const nextState = dept.active ? 0 : 1;
    await db.prepare('UPDATE departments SET active=? WHERE id=?').run(nextState, id);
    if (userId) {
        await activity.log(userId, `Department ${nextState ? 'Activated' : 'Deactivated'}`, dept.name);
    }
    return nextState;
};

exports.toggleDesignation = async (id, userId) => {
    const des = await db.prepare('SELECT * FROM designations WHERE id=?').get(id);
    if (!des) return null;
    const nextState = des.active ? 0 : 1;
    await db.prepare('UPDATE designations SET active=? WHERE id=?').run(nextState, id);
    if (userId) {
        await activity.log(userId, `Designation ${nextState ? 'Activated' : 'Deactivated'}`, des.name);
    }
    return nextState;
};

exports.saveDepartment = async (id, name, userId) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Department name is required');
    const normalized = normalizeName(clean);

    if (id) {
        const existing = await db.prepare('SELECT id FROM departments WHERE normalized_name=? AND id<>?').get(normalized, id);
        if (existing) throw new Error(`Department "${clean}" already exists.`);
        await db.prepare('UPDATE departments SET name=?, normalized_name=? WHERE id=?').run(clean, normalized, id);
        if (userId) await activity.log(userId, 'Department Updated', clean);
        return id;
    } else {
        const dept = await exports.findOrCreateDepartment(clean);
        if (userId) await activity.log(userId, 'Department Created', clean);
        return dept.id;
    }
};

exports.saveDesignation = async (id, name, userId) => {
    const clean = String(name || '').trim();
    if (!clean) throw new Error('Designation name is required');
    const normalized = normalizeName(clean);

    if (id) {
        const existing = await db.prepare('SELECT id FROM designations WHERE normalized_name=? AND id<>?').get(normalized, id);
        if (existing) throw new Error(`Designation "${clean}" already exists.`);
        await db.prepare('UPDATE designations SET name=?, normalized_name=? WHERE id=?').run(clean, normalized, id);
        if (userId) await activity.log(userId, 'Designation Updated', clean);
        return id;
    } else {
        const des = await exports.findOrCreateDesignation(clean);
        if (userId) await activity.log(userId, 'Designation Created', clean);
        return des.id;
    }
};
