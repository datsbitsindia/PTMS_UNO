const bcrypt = require('bcrypt');
const { db } = require('../database/init');
const activity = require('../services/activityService');

exports.list = async (req, res) => {
    const currentUserRole = req.session.user.role;
    let employees = [];
    if (currentUserRole === 'admin') {
        employees = await db.prepare("SELECT * FROM users WHERE role IN ('employee', 'manager') ORDER BY role DESC, name ASC").all();
    } else {
        employees = await db.prepare("SELECT * FROM users WHERE role='employee' ORDER BY name ASC").all();
    }
    res.render('employees', { employees, currentUserRole });
};

exports.save = async (req, res) => {
    const { id, role = 'employee', name = '', email = '', phone = '', department = '', password = '' } = req.body;
    let { designation = '' } = req.body;
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const creatorRole = req.session.user.role;

    let targetRole = (role.toLowerCase() === 'manager' && creatorRole === 'admin') ? 'manager' : 'employee';
    if (!designation.trim()) {
        designation = targetRole === 'manager' ? 'Manager' : 'Employee';
    }

    if (!cleanName || !cleanEmail) {
        return res.status(400).render('error', { message: 'Name and email are required fields.' });
    }

    try {
        // Check unique name across all users
        const nameDuplicate = id
            ? await db.prepare("SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(?) AND id <> ?").get(cleanName.toLowerCase(), id)
            : await db.prepare("SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(?)").get(cleanName.toLowerCase());

        if (nameDuplicate) {
            return res.status(400).render('error', { message: `A user with the name "${cleanName}" already exists. Name must be unique.` });
        }

        // Check unique email across all users
        const emailDuplicate = id
            ? await db.prepare("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(?) AND id <> ?").get(cleanEmail, id)
            : await db.prepare("SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(?)").get(cleanEmail);

        if (emailDuplicate) {
            return res.status(400).render('error', { message: `A user with the email "${cleanEmail}" already exists. Email must be unique.` });
        }

        if (id) {
            const existing = await db.prepare("SELECT * FROM users WHERE id=?").get(id);
            if (!existing) return res.status(404).render('error', { message: 'User not found' });
            if (creatorRole !== 'admin' && existing.role !== 'employee') {
                return res.status(403).render('error', { message: 'Access denied.' });
            }

            if (password) {
                await db.prepare("UPDATE users SET role=?,name=?,email=?,phone=?,department=?,designation=?,password=? WHERE id=?")
                    .run(targetRole, cleanName, cleanEmail, phone, department, designation, await bcrypt.hash(password, 12), id);
            } else {
                await db.prepare("UPDATE users SET role=?,name=?,email=?,phone=?,department=?,designation=? WHERE id=?")
                    .run(targetRole, cleanName, cleanEmail, phone, department, designation, id);
            }
            await activity.log(req.session.user.id, `${targetRole === 'manager' ? 'Manager' : 'Employee'} Updated`, cleanName);
        } else {
            if (!password) return res.status(400).render('error', { message: 'Password is required for new team member.' });
            await db.prepare("INSERT INTO users(role,name,email,password,phone,department,designation,created_by) VALUES(?,?,?,?,?,?,?,?)")
                .run(targetRole, cleanName, cleanEmail, await bcrypt.hash(password, 12), phone, department, designation, req.session.user.id);
            await activity.log(req.session.user.id, `${targetRole === 'manager' ? 'Manager' : 'Employee'} Created`, cleanName);
        }
        res.redirect('/employees');
    } catch (e) {
        console.error('Error saving team member:', e);
        res.status(400).render('error', { message: 'Could not save team member. Please make sure name and email are unique.' });
    }
};

exports.toggle = async (req, res) => {
    const user = await db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
    if (user && (req.session.user.role === 'admin' || user.role === 'employee')) {
        const nextState = user.active ? 0 : 1;
        await db.prepare('UPDATE users SET active=? WHERE id=?').run(nextState, user.id);
        await activity.log(req.session.user.id, `User ${nextState ? 'Activated' : 'Deactivated'}`, user.name);
    }
    res.redirect('/employees');
};

exports.remove = async (req, res) => {
    const user = await db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
    if (!user) return res.status(404).render('error', { message: 'User not found' });
    if (req.session.user.role !== 'admin' && user.role !== 'employee') {
        return res.status(403).render('error', { message: 'Access denied.' });
    }

    try {
        if (user.role === 'manager') {
            await db.prepare('UPDATE projects SET manager_id=NULL WHERE manager_id=?').run(user.id);
        } else {
            await db.prepare('DELETE FROM daily_routine_logs WHERE assigned_to=?').run(user.id);
            await db.prepare('DELETE FROM daily_routines WHERE assigned_to=?').run(user.id);
            await db.prepare('DELETE FROM tasks WHERE assigned_to=?').run(user.id);
        }
        await db.prepare('DELETE FROM notifications WHERE user_id=?').run(user.id);
        await db.prepare('DELETE FROM comments WHERE user_id=?').run(user.id);
        await db.prepare('DELETE FROM attachments WHERE user_id=?').run(user.id);
        await db.prepare('DELETE FROM users WHERE id=?').run(user.id);
        await activity.log(req.session.user.id, 'User Deleted', user.name);
        res.redirect('/employees');
    } catch (e) {
        res.status(500).render('error', { message: 'Could not delete user: ' + e.message });
    }
};

// Legacy Backwards-Compatibility Handlers (Redirecting to unified /employees)
exports.managerList = (req, res) => res.redirect('/employees');
exports.managerSave = exports.save;
exports.managerToggle = exports.toggle;
exports.managerRemove = exports.remove;
