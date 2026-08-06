const bcrypt = require('bcrypt');
const { db } = require('../database/init');
const activity = require('../services/activityService');

exports.list = async (req, res) => {
    const employees = await db.prepare("SELECT * FROM users WHERE role='employee' ORDER BY name").all();
    res.render('employees', { employees });
};

exports.save = async (req, res) => {
    const { id, name, email, phone = '', department = '', designation = '', password = '' } = req.body;
    if (!name || !email) return res.status(400).render('error', { message: 'Name and email are required' });
    try {
        if (id) {
            if (password) {
                await db.prepare("UPDATE users SET name=?,email=?,phone=?,department=?,designation=?,password=? WHERE id=? AND role='employee'").run(name, email.toLowerCase(), phone, department, designation, await bcrypt.hash(password, 12), id);
            } else {
                await db.prepare("UPDATE users SET name=?,email=?,phone=?,department=?,designation=? WHERE id=? AND role='employee'").run(name, email.toLowerCase(), phone, department, designation, id);
            }
            await activity.log(req.session.user.id, 'Employee Updated', name);
        } else {
            if (!password) return res.status(400).render('error', { message: 'Password is required' });
            await db.prepare("INSERT INTO users(role,name,email,password,phone,department,designation) VALUES('employee',?,?,?,?,?,?)").run(name, email.toLowerCase(), await bcrypt.hash(password, 12), phone, department, designation);
            await activity.log(req.session.user.id, 'Employee Created', name);
        }
        res.redirect('/employees');
    } catch (e) {
        res.status(400).render('error', { message: 'Email already exists or input is invalid' });
    }
};

exports.toggle = async (req, res) => {
    const emp = await db.prepare("SELECT * FROM users WHERE id=? AND role='employee'").get(req.params.id);
    if (emp) {
        const nextState = emp.active ? 0 : 1;
        await db.prepare('UPDATE users SET active=? WHERE id=?').run(nextState, emp.id);
        await activity.log(req.session.user.id, `Employee ${nextState ? 'Activated' : 'Deactivated'}`, emp.name);
    }
    res.redirect('/employees');
};

exports.remove = async (req, res) => {
    const emp = await db.prepare("SELECT * FROM users WHERE id=? AND role='employee'").get(req.params.id);
    if (!emp) return res.status(404).render('error', { message: 'Employee not found' });
    try {
        await db.prepare('DELETE FROM daily_routine_logs WHERE assigned_to=?').run(emp.id);
        await db.prepare('DELETE FROM daily_routines WHERE assigned_to=?').run(emp.id);
        await db.prepare('DELETE FROM tasks WHERE assigned_to=?').run(emp.id);
        await db.prepare('DELETE FROM notifications WHERE user_id=?').run(emp.id);
        await db.prepare('DELETE FROM comments WHERE user_id=?').run(emp.id);
        await db.prepare('DELETE FROM attachments WHERE user_id=?').run(emp.id);
        await db.prepare('DELETE FROM users WHERE id=?').run(emp.id);
        await activity.log(req.session.user.id, 'Employee Deleted', emp.name);
        res.redirect('/employees');
    } catch (e) {
        res.status(500).render('error', { message: 'Could not delete employee: ' + e.message });
    }
};

exports.managerList = async (req, res) => res.render('managers', { managers: await db.prepare("SELECT * FROM users WHERE role='manager' ORDER BY name").all() });

exports.managerSave = async (req, res) => {
    const { id, name, email, password = '', phone = '', department = '', designation = 'Manager' } = req.body;
    if (!name || !email) return res.status(400).render('error', { message: 'Name and email are required' });
    try {
        if (id) {
            if (password) {
                await db.prepare("UPDATE users SET name=?,email=?,phone=?,department=?,designation=?,password=? WHERE id=? AND role='manager'").run(name, email.toLowerCase(), phone, department, designation, await bcrypt.hash(password, 12), id);
            } else {
                await db.prepare("UPDATE users SET name=?,email=?,phone=?,department=?,designation=? WHERE id=? AND role='manager'").run(name, email.toLowerCase(), phone, department, designation, id);
            }
            await activity.log(req.session.user.id, 'Manager Updated', name);
        } else {
            if (!password) return res.status(400).render('error', { message: 'Password is required for new manager' });
            await db.prepare("INSERT INTO users(role,name,email,password,phone,department,designation,created_by) VALUES('manager',?,?,?,?,?,?,?)").run(name, email.toLowerCase(), await bcrypt.hash(password, 12), phone, department, designation, req.session.user.id);
            await activity.log(req.session.user.id, 'Manager Created', name);
        }
        res.redirect('/managers');
    } catch (e) {
        res.status(400).render('error', { message: 'Email already exists or input is invalid' });
    }
};

exports.managerToggle = async (req, res) => {
    const mgr = await db.prepare("SELECT * FROM users WHERE id=? AND role='manager'").get(req.params.id);
    if (mgr) {
        const nextState = mgr.active ? 0 : 1;
        await db.prepare('UPDATE users SET active=? WHERE id=?').run(nextState, mgr.id);
        await activity.log(req.session.user.id, `Manager ${nextState ? 'Activated' : 'Deactivated'}`, mgr.name);
    }
    res.redirect('/managers');
};

exports.managerRemove = async (req, res) => {
    const mgr = await db.prepare("SELECT * FROM users WHERE id=? AND role='manager'").get(req.params.id);
    if (!mgr) return res.status(404).render('error', { message: 'Manager not found' });
    try {
        await db.prepare('UPDATE projects SET manager_id=NULL WHERE manager_id=?').run(mgr.id);
        await db.prepare('DELETE FROM notifications WHERE user_id=?').run(mgr.id);
        await db.prepare('DELETE FROM comments WHERE user_id=?').run(mgr.id);
        await db.prepare('DELETE FROM attachments WHERE user_id=?').run(mgr.id);
        await db.prepare('DELETE FROM users WHERE id=?').run(mgr.id);
        await activity.log(req.session.user.id, 'Manager Deleted', mgr.name);
        res.redirect('/managers');
    } catch (e) {
        res.status(500).render('error', { message: 'Could not delete manager: ' + e.message });
    }
};

