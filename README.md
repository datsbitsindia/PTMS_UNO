# 📋 PTMS — Project & Task Management System

A full-featured, role-based **Project & Task Management System (PTMS)** built as a **Progressive Web App (PWA)** using Node.js, Express, EJS, MySQL, and vanilla JavaScript. Designed for internal company use to manage projects, assign tasks, track daily routines, and monitor employee performance.

---

## 🚀 Live Demo

> **URL:** [http://43.205.188.68](http://43.205.188.68)
> Hosted on AWS EC2 (Ubuntu 22.04) with Nginx reverse proxy and PM2 process manager.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 18+ |
| **Framework** | Express.js |
| **Template Engine** | EJS |
| **Database** | MySQL 8.4 |
| **Auth** | express-session + bcrypt |
| **File Uploads** | Multer |
| **Process Manager** | PM2 |
| **Web Server** | Nginx |
| **PWA** | Service Worker + Web App Manifest |

---

## 👥 Roles & Access

### 🔴 Admin
- Full access to all modules
- Create, edit, delete users (managers & employees)
- Create and manage all projects
- Assign tasks to any user
- View all reports, audit logs, and activity history
- Manage daily routines

### 🔵 Manager
- View and manage assigned projects
- Create tasks and assign to employees or other managers
- Forward tasks to other employees/managers
- View team performance and task reports
- Manage daily routines for employees
- Post project progress updates

### 🟢 Employee
- View assigned tasks and projects
- Update task status (Pending → In Progress → Completed)
- Forward tasks to colleagues or managers
- View and complete daily routines
- Post comments and attach files to tasks
- Manage personal profile

---

## ✨ Features

### 📁 Project Management
- Create projects with name, description, start/end dates, and status
- Project status: `Planned` → `In Progress` → `Completed` / `Cancelled`
- Project progress updates with percentage tracking
- View all tasks within a project
- Manager-wise project filtering

### ✅ Task Management
- Create tasks with priority (`Low`, `Medium`, `High`, `Critical`)
- Task status tracking: `Pending` → `In Progress` → `Completed` / `Cancelled`
- Assign tasks to employees **or managers**
- Task forwarding (employee ↔ employee, employee ↔ manager, manager ↔ manager)
- Task forward history with reason tracking
- Duplicate tasks
- File attachments (PDF, images, documents)
- Comments on tasks

### 🔁 Daily Routine Management
- Create recurring daily routines linked to projects
- Assign routines to specific employees
- Routine auto-generates daily task logs
- Track completion status per day
- Configurable repeat type: Daily, Weekly (specific days)
- Mandatory/optional flag

### 👤 Employee & User Management
- Add employees and managers with department and designation
- Upload profile photos
- Activate / Deactivate users
- Reset passwords
- Role management (admin, manager, employee)

### 🔔 Notifications
- Real-time in-app notifications
- Task assignment notifications
- Task forwarding notifications
- Mark as read / clear all

### 📊 Reports & Analytics
- Task completion reports
- Employee performance overview
- Project-wise task breakdown
- Activity logs and audit trail

### 🔐 Security
- Session-based authentication
- bcrypt password hashing (12 rounds)
- Role-based route protection middleware
- Audit event logging for all critical actions
- MySQL trigger-based audit columns

---

## 🗂️ Project Structure

```
TaskManager/
├── app.js                  # Express app entry point
├── config/                 # App configuration (MySQL, session, etc.)
├── controllers/
│   ├── authController.js       # Login, logout
│   ├── dashboardController.js  # Dashboard stats
│   ├── employeeController.js   # User CRUD
│   ├── profileController.js    # Profile & password
│   ├── projectController.js    # Project CRUD
│   └── taskController.js       # Task CRUD, forward, status
├── database/
│   └── init.js             # DB init, migrations, seeding
├── middleware/             # Auth guard, audit logger
├── routes/                 # Express route definitions
├── services/               # Daily routine scheduler
├── public/
│   ├── css/                # Styles
│   ├── js/                 # Client-side scripts, PWA
│   └── icons/              # PWA icons
├── views/
│   ├── partials/           # Reusable EJS partials (navbar, modals)
│   └── *.ejs               # Page templates
├── uploads/                # User-uploaded files
├── aws/                    # SSH key (gitignored)
└── .env                    # Environment config (gitignored)
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- Git

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/datsbitsindia/PTMS.git
cd PTMS

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials

# 4. Start the app
npm start

# 5. Open in browser
# http://localhost:3000
```

### `.env` Configuration

```env
PORT=3000
SESSION_SECRET=your-long-random-secret
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=yourpassword
DB_NAME=taskmanager
```

> The app **automatically creates** the database, all tables, triggers, views, and seed data on first start.

---

## 🌐 EC2 Production Deployment

```bash
# On EC2 (Ubuntu 22.04)
sudo apt update && sudo apt install -y nodejs npm mysql-server nginx

# Install PM2
sudo npm install -g pm2

# Clone & setup
git clone https://github.com/datsbitsindia/PTMS.git ~/TaskManager
cd ~/TaskManager
npm install
cp .env.example .env
# Edit .env

# Start with PM2
pm2 start app.js --name taskmanager
pm2 save
pm2 startup
```

### Update Deployment

```bash
cd ~/TaskManager
git pull
pm2 restart taskmanager
```

---

## 📱 PWA Installation (Mobile)

1. Open the app URL in **Google Chrome** (Android)
2. Tap **⋮ Menu → Add to Home Screen**
3. App installs as a native-like standalone app

---

## 🔑 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | chetan@gmail.com | chetan |
| Manager | bhavin@gmail.com | bhavin |
| Employee | chintan@gmail.com | chintan |
| Employee | jemini@gmail.com | jemini |

> ⚠️ **Change all passwords immediately after first login in production!**

---

## 🗄️ Database

- **Engine:** MySQL 8.4 (hosted on EC2 localhost)
- **Main Tables:** `dataevol_users`, `dataevol_projects`, `dataevol_tasks`, `dataevol_daily_routines`, `dataevol_daily_routine_logs`, `dataevol_task_forward_logs`, `dataevol_notifications`, `dataevol_activity_logs`, `dataevol_audit_events`
- **Views:** `dataevol_project_summary`, `dataevol_task_details`, `dataevol_daily_routine_summary`

### Database Backup

```bash
# On EC2
mysqldump -u root -p taskmanager > taskmanager_backup_$(date +%Y%m%d).sql
```

### Local Access via MySQL Workbench (SSH Tunnel)

Use **Standard TCP/IP over SSH** connection method:
- SSH Hostname: `<EC2-Public-IP>:22`
- SSH Username: `ubuntu`
- SSH Key File: `path/to/taskmanager-key.pem`
- MySQL Host: `127.0.0.1`
- MySQL Port: `3306`
- Username: `root`
- Schema: `taskmanager`

---

## 🔒 Security Notes

- Never commit `.env` file (it is gitignored)
- Never commit `.pem` SSH key files (gitignored)
- Use strong `SESSION_SECRET` in production
- Enable HTTPS (SSL) for production use
- Keep MySQL bound to `localhost` only

---

## 📄 License

Internal use only — © 2026 Dataevol / PTMS Team. All rights reserved.
