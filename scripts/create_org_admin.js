/**
 * Admin Database Script: Create New Organization & ADMIN User for PTMS_UNO
 * 
 * Usage:
 *   node scripts/create_org_admin.js "<Org Name>" "<Admin Name>" "<Admin Email>" "<Password>"
 * 
 * Example:
 *   node scripts/create_org_admin.js "unotag" "Unotag Admin" "adminunotag@gmail.com" "admin"
 */

const bcrypt = require('bcrypt');
const { init, db, getPool, sqlName } = require('../database/init');

async function createOrgAndAdmin() {
    const args = process.argv.slice(2);

    const orgName = args[0] || 'unotag';
    const adminName = args[1] || 'Unotag Admin';
    const adminEmail = args[2] || 'adminunotag@gmail.com';
    const adminPassword = args[3] || 'admin';

    console.log('\n======================================================');
    console.log('       CREATE NEW ORGANIZATION & ADMIN SCRIPT');
    console.log('======================================================\n');
    console.log(`Creating Organization : "${orgName}"`);
    console.log(`Creating Admin User   : "${adminName}" (${adminEmail})`);

    // Ensure database pool is initialized
    await init();
    const pool = getPool();

    // 1. Check if admin email already exists
    const existingUser = await db.prepare("SELECT id, email, organization_id FROM users WHERE LOWER(TRIM(email)) = LOWER(?)").get(adminEmail.trim());
    if (existingUser) {
        console.error(`\n❌ ERROR: User with email "${adminEmail}" already exists (User ID: ${existingUser.id}, Org ID: ${existingUser.organization_id}).`);
        console.error('Email must be unique across all users. Please use another email.\n');
        process.exit(1);
    }

    // 2. Create Organization in database
    const orgResult = await db.prepare("INSERT INTO organizations (name) VALUES (?)").run(orgName.trim());
    const orgId = orgResult.lastInsertRowid;

    // 3. Initialize Task Counter for the new Organization
    await pool.query(sqlName("INSERT INTO organization_task_counters (organization_id, last_task_number) VALUES (?, 0) ON DUPLICATE KEY UPDATE organization_id=organization_id"), [orgId]);

    // 4. Hash Admin Password & Create Admin User (role = 'admin')
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const userResult = await db.prepare(
        "INSERT INTO users (role, name, email, password, phone, department, designation, organization_id, created_by) VALUES ('admin', ?, ?, ?, '', 'Management', 'Administrator', ?, ?)"
    ).run(adminName.trim(), adminEmail.trim().toLowerCase(), passwordHash, orgId, 1);
    const adminId = userResult.lastInsertRowid;

    // 5. Link Admin to User Organizations table
    await pool.query(sqlName("INSERT IGNORE INTO user_organizations (user_id, organization_id, role) VALUES (?, ?, 'admin')"), [adminId, orgId]);

    // 6. Create default "Self Task" system project for this Organization
    await db.prepare(
        "INSERT INTO projects (name, description, start_date, end_date, status, status_id, created_by, manager_id, organization_id) VALUES ('Self Task', 'System project for self-assigned tasks', CURDATE(), '2099-12-31', 1, 1, ?, ?, ?)"
    ).run(adminId, String(adminId), orgId);

    console.log('\n✅ SUCCESS! Organization & Admin User created successfully!\n');
    console.log('------------------------------------------------------');
    console.log(` Organization ID   : ${orgId}`);
    console.log(` Organization Name : ${orgName}`);
    console.log(` Admin User ID     : ${adminId}`);
    console.log(` Admin Name        : ${adminName}`);
    console.log(` Admin Email       : ${adminEmail}`);
    console.log(` Admin Password    : ${adminPassword}`);
    console.log(` Account Role      : ADMIN`);
    console.log('------------------------------------------------------\n');

    process.exit(0);
}

createOrgAndAdmin().catch(err => {
    console.error('\n❌ Error creating Organization & Admin:', err);
    process.exit(1);
});
