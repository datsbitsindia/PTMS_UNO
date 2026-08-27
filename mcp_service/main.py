import os
import mysql.connector
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Any, Dict
from dotenv import load_dotenv
from fastmcp import FastMCP

# Load environment variables
load_dotenv()

# MySQL Database connection configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "taskmanager")
DB_PORT = int(os.getenv("DB_PORT", 3306))

def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            port=DB_PORT
        )
        return conn
    except Exception as e:
        print(f"Database Connection Error: {e}")
        return None

# Initialize FastMCP App
mcp = FastMCP("TaskManager Python Tools")

STATUS_STR_TO_NUM = {'pending': 0, 'in progress': 1, 'completed': 2, 'cancelled': 3}
STATUS_NUM_TO_STR = {0: 'Pending', 1: 'In Progress', 2: 'Completed', 3: 'Cancelled', 4: 'Planned', 5: 'Generated', 6: 'Missed'}
PRIORITY_STR_TO_NUM = {
    'low': 0, 
    'medium': 1, 'normal': 1,
    'high': 2, 'hi': 2, 'hi priority': 2, 'very high': 2, 'higher': 2,
    'critical': 3, 'urgent': 3, 'highest': 3
}
PRIORITY_NUM_TO_STR = {0: 'Low', 1: 'Medium', 2: 'High', 3: 'Critical'}

TABLE_PREFIX = os.getenv("TABLE_PREFIX", "dataevol_")

def get_table_name(conn, base_name: str) -> str:
    """Find actual table name in MySQL database (e.g. dataevol_tasks vs tasks)"""
    try:
        cursor = conn.cursor()
        prefixed = f"{TABLE_PREFIX}{base_name}"
        cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME IN (%s, %s)", 
                       (DB_NAME, prefixed, base_name))
        rows = cursor.fetchall()
        cursor.close()
        found_names = [r[0] for r in rows]
        if prefixed in found_names:
            return prefixed
        if base_name in found_names:
            return base_name
    except Exception as e:
        print(f"Table resolver error: {e}")
    return f"{TABLE_PREFIX}{base_name}"

# --- TOOL DEFINITIONS ---

@mcp.tool()
def get_user_tasks(user_id: int, user_role: str = "user", status: Optional[str] = None, priority: Optional[str] = None, 
                   task_type: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None,
                   date_field: Optional[str] = "either") -> dict:
    """Fetch tasks matching the Dashboard UI. Supports task_type ('todo', 'assigned', 'all'), status ('Pending', 'In Progress', 'Completed', 'Overdue'), date range (start_date, end_date in YYYY-MM-DD), and date_field ('created_at' for created date, 'due_date' for due date, 'either' for both)."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}
    
    try:
        t_tbl = get_table_name(conn, "tasks")
        p_tbl = get_table_name(conn, "projects")
        u_tbl = get_table_name(conn, "users")
        a_tbl = get_table_name(conn, "task_assignees")

        cursor = conn.cursor(dictionary=True)
        assignees_subquery = f"COALESCE((SELECT GROUP_CONCAT(ta.user_id) FROM `{a_tbl}` ta WHERE ta.task_id=t.id), t.assigned_to)"

        query = f"""SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date, t.created_at, t.created_by, t.assigned_to, 
                           p.name as project_name, u_creator.name as created_by_name,
                           (SELECT GROUP_CONCAT(u.name SEPARATOR ', ') FROM `{u_tbl}` u WHERE FIND_IN_SET(u.id, {assignees_subquery}) > 0) as assigned_to_names 
                   FROM `{t_tbl}` t 
                   LEFT JOIN `{p_tbl}` p ON t.project_id = p.id 
                   LEFT JOIN `{u_tbl}` u_creator ON t.created_by = u_creator.id
                   WHERE 1=1"""
        params = []

        # Map task_type to Dashboard UI Tabs (Default: 'todo' = To Do tab/Tasks assigned to me)
        t_type = (task_type or 'todo').lower().strip()
        if t_type in ['assigned', 'assigned-by-me', 'assigned_by_me', 'assigned_out', 'assigned-out']:
            # Assigned Tab (assigned-by-me): created_by = user_id AND user_id NOT in assigned_to
            query += f" AND t.created_by = %s AND (FIND_IN_SET(%s, {assignees_subquery}) = 0 OR t.assigned_to IS NULL)"
            params.extend([user_id, str(user_id)])
        elif t_type in ['all', 'both']:
            if user_role != 'admin':
                query += f" AND (FIND_IN_SET(%s, {assignees_subquery}) > 0 OR t.created_by = %s)"
                params.extend([str(user_id), user_id])
        else:
            # Default 'todo' (assigned-to-me): user_id MUST be present in assignees_subquery
            query += f" AND FIND_IN_SET(%s, {assignees_subquery}) > 0"
            params.append(str(user_id))

        # Map status filter to UI dropdown / stats
        if status:
            s_lower = status.lower().strip()
            if s_lower == 'pending':
                query += " AND (t.status IN (0, 4) OR t.status_id IN (0, 4) OR LOWER(t.status) IN ('pending', 'planned'))"
            elif s_lower in ['in progress', 'in_progress']:
                query += " AND (t.status = 1 OR t.status_id = 1 OR LOWER(t.status) = 'in progress')"
            elif s_lower == 'completed':
                query += " AND (t.status = 2 OR t.status_id = 2 OR LOWER(t.status) = 'completed')"
            elif s_lower in ['cancelled', 'canceled']:
                query += " AND (t.status = 3 OR t.status_id = 3 OR LOWER(t.status) IN ('cancelled', 'canceled'))"
            elif s_lower == 'overdue':
                query += " AND t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status NOT IN (2, 3)"

        if priority:
            p_lower = priority.lower().strip()
            p_num = PRIORITY_STR_TO_NUM.get(p_lower, 1)
            query += " AND (t.priority = %s OR t.priority_id = %s OR LOWER(t.priority) = %s)"
            params.extend([p_num, p_num, p_lower])

        # Date Range Filter (date_field: 'created_at', 'due_date', or 'either')
        df_mode = (date_field or 'either').lower().strip()

        if start_date and end_date:
            if df_mode in ['created', 'created_at', 'created_date']:
                query += " AND (DATE(t.created_at) BETWEEN %s AND %s)"
                params.extend([start_date, end_date])
            elif df_mode in ['due', 'due_date']:
                query += " AND (t.due_date BETWEEN %s AND %s)"
                params.extend([start_date, end_date])
            else:
                query += " AND (DATE(t.created_at) BETWEEN %s AND %s OR t.due_date BETWEEN %s AND %s)"
                params.extend([start_date, end_date, start_date, end_date])
        elif start_date:
            if df_mode in ['created', 'created_at', 'created_date']:
                query += " AND (DATE(t.created_at) >= %s)"
                params.append(start_date)
            elif df_mode in ['due', 'due_date']:
                query += " AND (t.due_date >= %s)"
                params.append(start_date)
            else:
                query += " AND (DATE(t.created_at) >= %s OR t.due_date >= %s)"
                params.extend([start_date, start_date])
        elif end_date:
            if df_mode in ['created', 'created_at', 'created_date']:
                query += " AND (DATE(t.created_at) <= %s)"
                params.append(end_date)
            elif df_mode in ['due', 'due_date']:
                query += " AND (t.due_date <= %s)"
                params.append(end_date)
            else:
                query += " AND (DATE(t.created_at) <= %s OR t.due_date <= %s)"
                params.extend([end_date, end_date])

        query += " ORDER BY t.created_at DESC, t.id DESC LIMIT 50"
        cursor.execute(query, tuple(params))
        tasks = cursor.fetchall()

        for t in tasks:
            t["status_str"] = STATUS_NUM_TO_STR.get(t["status"], "Pending")
            t["priority_str"] = PRIORITY_NUM_TO_STR.get(t["priority"], "Medium")
            t["due_date"] = str(t["due_date"]) if t["due_date"] else "No Due Date"
            t["created_at"] = str(t["created_at"])[:10] if t["created_at"] else "N/A"

        return {
            "count": len(tasks),
            "applied_filter": {
                "user_id": user_id,
                "task_type": task_type or "all",
                "status": status or "all",
                "priority": priority or "all"
            },
            "tasks": tasks
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def get_task_details(task_id: int) -> dict:
    """Fetch complete details of a specific task by Task ID including description, assigned users, creator, project, and status."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        p_tbl = get_table_name(conn, "projects")
        u_tbl = get_table_name(conn, "users")

        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"""
            SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date, t.created_at,
                   p.name as project_name, u_creator.name as created_by_name,
                   (SELECT GROUP_CONCAT(u.name SEPARATOR ', ') FROM `{u_tbl}` u WHERE FIND_IN_SET(u.id, t.assigned_to) > 0) as assigned_to_names
            FROM `{t_tbl}` t 
            LEFT JOIN `{p_tbl}` p ON t.project_id = p.id
            LEFT JOIN `{u_tbl}` u_creator ON t.created_by = u_creator.id
            WHERE t.id = %s
        """, (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        task["status_str"] = STATUS_NUM_TO_STR.get(task["status"], "Pending")
        task["priority_str"] = PRIORITY_NUM_TO_STR.get(task["priority"], "Medium")
        task["due_date"] = str(task["due_date"]) if task["due_date"] else None
        task["created_at"] = str(task["created_at"]) if task["created_at"] else None
        return {"task": task}
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

def resolve_project_id(conn, project_name_input: Optional[str]) -> Optional[int]:
    """Super flexible project resolver: handles typos, phonetics, partial names, SOUNDEX, and word tokens for ACTIVE / PENDING projects ONLY."""
    if not conn or not project_name_input or not str(project_name_input).strip():
        return None

    try:
        p_tbl = get_table_name(conn, "projects")
        cursor = conn.cursor(dictionary=True)
        p_clean = str(project_name_input).strip()
        active_cond = "AND status NOT IN (2, 3, '2', '3', 'Completed', 'Cancelled') AND status_id NOT IN (2, 3)"

        # 1. Direct LIKE %name%
        cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE name LIKE %s {active_cond} LIMIT 1", (f"%{p_clean}%",))
        r = cursor.fetchone()
        if r:
            return r["id"]

        # 1b. Space-insensitive & punctuation-agnostic search (e.g. 'admit shakti', 'adwait, shakti' vs 'AdwaitShakti')
        p_nospace = p_clean.replace('.', '').replace(',', '').replace(' ', '').replace('-', '').replace('_', '').lower()
        cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name, ' ', ''), '-', ''), '_', ''), '.', ''), ',', '')) LIKE %s {active_cond} LIMIT 1", (f"%{p_nospace}%",))
        r = cursor.fetchone()
        if r:
            return r["id"]

        # 2. Tokenized word search (e.g. 'Advait', 'Sakti', 'Adwait', 'Shakti')
        words = [w.strip() for w in p_clean.replace('-', ' ').replace('_', ' ').split() if len(w.strip()) >= 2]
        for w in words:
            cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE (name LIKE %s OR %s LIKE CONCAT('%%', name, '%%')) AND name <> 'Self Task' {active_cond} LIMIT 1", 
                           (f"%{w}%", w))
            r = cursor.fetchone()
            if r:
                return r["id"]

        # 3. SOUNDEX Phonetic Match (e.g. 'Advait' vs 'Adwait', 'Sakti' vs 'Shakti')
        for w in words:
            try:
                cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE SOUNDEX(name) = SOUNDEX(%s) AND name <> 'Self Task' {active_cond} LIMIT 1", (w,))
                r = cursor.fetchone()
                if r:
                    return r["id"]
            except Exception:
                pass

        return None
    except Exception as e:
        print("resolve_project_id error:", e)
        return None

def fetch_active_projects_internal(conn) -> list:
    """Internal helper to query active projects from MySQL database."""
    try:
        p_tbl = get_table_name(conn, "projects")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"""
            SELECT id, name, status, start_date, end_date 
            FROM `{p_tbl}` 
            WHERE status NOT IN (2, 3, '2', '3', 'Completed', 'Cancelled') 
              AND status_id NOT IN (2, 3) 
              AND name <> 'Self Task'
            ORDER BY name ASC
        """)
        projects = cursor.fetchall() or []
        for p in projects:
            p["start_date"] = str(p["start_date"]) if p.get("start_date") else None
            p["end_date"] = str(p["end_date"]) if p.get("end_date") else None
        return projects
    except Exception as e:
        print("fetch_active_projects_internal error:", e)
        return []

@mcp.tool()
def get_active_projects(user_id: int, user_role: str = "user") -> dict:
    """Fetch all active (in-progress/pending) projects from database (excluding completed and cancelled projects)."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        projects = fetch_active_projects_internal(conn)
        return {"projects": projects}
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def create_new_task(title: str, user_id: int, description: Optional[str] = None, priority: Optional[str] = "Medium", 
                    assigned_to_email: Optional[str] = None, project_name: Optional[str] = None, due_date: Optional[str] = None) -> dict:
    """Create a new task in the database for a user and project."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        u_tbl = get_table_name(conn, "users")
        t_tbl = get_table_name(conn, "tasks")

        cursor = conn.cursor(dictionary=True)
        assigned_user_id = user_id
        assigned_user_name = "User"

        if assigned_to_email:
            cursor.execute(f"SELECT id, name FROM `{u_tbl}` WHERE email LIKE %s OR name LIKE %s LIMIT 1", 
                           (f"%{assigned_to_email}%", f"%{assigned_to_email}%"))
            user_row = cursor.fetchone()
            if user_row:
                assigned_user_id = user_row["id"]
                assigned_user_name = user_row["name"]

        # Strict project resolution: If project_name is provided but doesn't exist, return explicit error
        project_id = None
        if project_name and str(project_name).strip():
            project_id = resolve_project_id(conn, project_name)
            if not project_id:
                active_projs = fetch_active_projects_internal(conn)
                p_names = [p["name"] for p in active_projs]
                return {
                    "error": f"Project '{project_name}' does not exist in database. Active available projects are: {', '.join(p_names) if p_names else 'Self Task'}. Please specify a valid active project or omit project_name."
                }

        # Dynamic checks for column types in tasks table
        cursor.execute(f"SHOW COLUMNS FROM `{t_tbl}` LIKE 'priority'")
        col_row_p = cursor.fetchone()
        is_int_priority = col_row_p and "int" in str(col_row_p["Type"]).lower()

        cursor.execute(f"SHOW COLUMNS FROM `{t_tbl}` LIKE 'status'")
        col_row_s = cursor.fetchone()
        is_int_status = col_row_s and "int" in str(col_row_s["Type"]).lower()

        # Handle title truncation (100 chars limit)
        final_title = title
        final_description = description or title
        if len(title) > 100:
            final_title = title[:97] + "..."
            final_description = f"Full Title: {title}\n\n{final_description}"

        p_str = (priority or "Medium").strip()
        p_map = {
            'low': 'Low',
            'medium': 'Medium',
            'high': 'High',
            'critical': 'Critical'
        }
        p_norm = p_map.get(p_str.lower(), 'Medium')
        p_num = PRIORITY_STR_TO_NUM.get(p_str.lower(), 1)

        p_val = p_num if is_int_priority else p_norm
        s_val = 0 if is_int_status else 'Pending'

        query = f"""INSERT INTO `{t_tbl}` (title, description, priority, priority_id, status, status_id, due_date, created_by, assigned_to, project_id)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""
        
        cursor.execute(query, (
            final_title,
            final_description,
            p_val,
            p_num,
            s_val,
            0,
            due_date,
            user_id,
            str(assigned_user_id),
            project_id
        ))
        conn.commit()

        return {
            "success": True,
            "taskId": cursor.lastrowid,
            "message": f"Task #{cursor.lastrowid} ('{title}') created successfully for {assigned_user_name}."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def update_task_status(task_id: int, user_id: int, user_role: str = "user", status: str = "Completed") -> dict:
    """Update status of a task by Task ID (Pending, In Progress, Completed, Cancelled). Only assigned team members or Admin can change task status."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        a_tbl = get_table_name(conn, "task_assignees")

        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, title, created_by, assigned_to FROM `{t_tbl}` WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        # Check assignee permissions matching taskController.js canView/status access control
        cursor.execute(f"SELECT user_id FROM `{a_tbl}` WHERE task_id = %s", (task_id,))
        ta_rows = cursor.fetchall()
        ta_user_ids = [r["user_id"] for r in ta_rows] if ta_rows else []
        
        assigned_str_ids = [int(x.strip()) for x in str(task["assigned_to"] or "").split(",") if x.strip().isdigit()]
        all_assignee_ids = set(ta_user_ids + assigned_str_ids)

        if user_role != "admin" and user_id not in all_assignee_ids:
            return {
                "error": f"Permission Denied: Only assigned team members or Admin can change status of Task #{task_id} ('{task['title']}'). As a Manager/Creator, you can reassign, edit details, delete, or comment on this task."
            }

        # Dynamic checks for column types in tasks and task_assignees tables
        cursor.execute(f"SHOW COLUMNS FROM `{t_tbl}` LIKE 'status'")
        col_row_s = cursor.fetchone()
        is_int_status = col_row_s and "int" in str(col_row_s["Type"]).lower()

        cursor.execute(f"SHOW COLUMNS FROM `{a_tbl}` LIKE 'status'")
        col_row_sa = cursor.fetchone()
        is_int_status_a = col_row_sa and "int" in str(col_row_sa["Type"]).lower()

        s_str = (status or "Completed").strip()
        s_map = {
            'pending': 'Pending',
            'in progress': 'In Progress',
            'completed': 'Completed',
            'cancelled': 'Cancelled'
        }
        s_norm = s_map.get(s_str.lower(), 'Completed')
        s_num = STATUS_STR_TO_NUM.get(s_str.lower(), 2)

        s_val = s_num if is_int_status else s_norm
        s_val_a = s_num if is_int_status_a else s_norm

        # Update specific assignee in task_assignees junction table
        try:
            cursor.execute(f"""
                INSERT INTO `{a_tbl}` (task_id, user_id, status, status_id, completed_at)
                VALUES (%s, %s, %s, %s, CASE WHEN %s = 2 THEN NOW() ELSE NULL END)
                ON DUPLICATE KEY UPDATE status = %s, status_id = %s, completed_at = CASE WHEN %s = 2 THEN NOW() ELSE NULL END
            """, (task_id, user_id, s_val_a, s_num, s_num, s_val_a, s_num, s_num))
        except Exception as e:
            print("task_assignees status update warning:", e)

        # Update overall tasks table
        cursor.execute(f"UPDATE `{t_tbl}` SET status = %s, status_id = %s, completed_at = CASE WHEN %s = 2 THEN NOW() ELSE NULL END, updated_by = %s WHERE id = %s", 
                       (s_val, s_num, s_num, user_id, task_id))
        conn.commit()

        return {
            "success": True,
            "message": f"Task #{task_id} ('{task['title']}') status updated to {STATUS_NUM_TO_STR.get(s_num, 'Completed')}."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def update_task_details(task_id: int, title: Optional[str] = None, description: Optional[str] = None, priority: Optional[str] = None, due_date: Optional[str] = None, project_name: Optional[str] = None) -> dict:
    """Update title, description, priority, due_date, or project_name of an existing task by Task ID."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, title FROM `{t_tbl}` WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        updates = []
        params = []

        if title:
            updates.append("title = %s")
            params.append(title)
        if description:
            updates.append("description = %s")
            params.append(description)
        if priority:
            p_num = PRIORITY_STR_TO_NUM.get(priority.lower(), 1)
            updates.append("priority = %s, priority_id = %s")
            params.extend([p_num, p_num])
        if due_date:
            updates.append("due_date = %s")
            params.append(due_date)
        if project_name:
            p_tbl = get_table_name(conn, "projects")
            cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE name LIKE %s LIMIT 1", (f"%{project_name}%",))
            proj_row = cursor.fetchone()
            if not proj_row:
                words = [w.strip() for w in project_name.replace('-', ' ').replace('_', ' ').split() if len(w.strip()) >= 3]
                for word in words:
                    cursor.execute(f"SELECT id FROM `{p_tbl}` WHERE name LIKE %s AND name <> 'Self Task' LIMIT 1", (f"%{word}%",))
                    proj_row = cursor.fetchone()
                    if proj_row:
                        break
            if proj_row:
                updates.append("project_id = %s")
                params.append(proj_row["id"])

        if not updates:
            return {"message": "No fields specified for update."}

        params.append(task_id)
        query = f"UPDATE `{t_tbl}` SET {', '.join(updates)} WHERE id = %s"
        cursor.execute(query, tuple(params))
        conn.commit()

        return {
            "success": True,
            "message": f"Task #{task_id} updated successfully."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def delete_task(task_id: int) -> dict:
    """Delete a task permanently from the database by Task ID."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, title FROM `{t_tbl}` WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        cursor.execute(f"DELETE FROM `{t_tbl}` WHERE id = %s", (task_id,))
        conn.commit()
        return {
            "success": True,
            "message": f"Task #{task_id} ('{task['title']}') deleted successfully."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def reassign_task(task_id: int, user_id: int, assigned_to_email: str) -> dict:
    """Reassign or forward a task to another team member by employee email or name."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        u_tbl = get_table_name(conn, "users")
        t_tbl = get_table_name(conn, "tasks")
        a_tbl = get_table_name(conn, "task_assignees")
        f_tbl = get_table_name(conn, "task_forward_logs")

        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, name FROM `{u_tbl}` WHERE email LIKE %s OR name LIKE %s LIMIT 1", 
                       (f"%{assigned_to_email}%", f"%{assigned_to_email}%"))
        user_row = cursor.fetchone()
        if not user_row:
            return {"error": f"User '{assigned_to_email}' not found."}

        cursor.execute(f"SELECT id, title, assigned_to FROM `{t_tbl}` WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        target_id = user_row["id"]

        # Insert forward log
        try:
            cursor.execute(f"INSERT INTO `{f_tbl}` (task_id, from_user_id, to_user_id, reason) VALUES (%s, %s, %s, %s)",
                           (task_id, user_id, target_id, 'Forwarded via AI Assistant'))
        except Exception as e:
            print("Forward log insert note:", e)

        # Insert task assignee
        try:
            cursor.execute(f"INSERT IGNORE INTO `{a_tbl}` (task_id, user_id, status) VALUES (%s, %s, %s)",
                           (task_id, target_id, 'Pending'))
        except Exception as e:
            print("Task assignees insert note:", e)

        # Update tasks table
        cursor.execute(f"UPDATE `{t_tbl}` SET assigned_to = %s, is_forwarded = 1, updated_by = %s WHERE id = %s", 
                       (str(target_id), user_id, task_id))
        conn.commit()

        return {
            "success": True,
            "message": f"Task #{task_id} ('{task['title']}') forwarded to {user_row['name']} successfully."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def add_comment_to_task(task_id: int, user_id: int, message: str) -> dict:
    """Add a discussion comment or update note to a task by Task ID."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        c_tbl = get_table_name(conn, "comments")

        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, title FROM `{t_tbl}` WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        if not task:
            return {"error": f"Task ID {task_id} not found."}

        # Create comments table if not existing
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS `{c_tbl}` (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                user_id INT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute(f"INSERT INTO `{c_tbl}` (task_id, user_id, message) VALUES (%s, %s, %s)", (task_id, user_id, message))
        conn.commit()

        return {
            "success": True,
            "message": f"Comment added to Task #{task_id} ('{task['title']}') successfully."
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def get_team_members() -> dict:
    """Fetch active team members, employees, and managers with name, email, department, and designation for assigning tasks."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}
    try:
        u_tbl = get_table_name(conn, "users")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id, name, email, role, department, designation FROM `{u_tbl}` WHERE active = 1 ORDER BY name")
        members = cursor.fetchall()
        return {"count": len(members), "team": members}
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def get_user_productivity_report(user_id: int) -> dict:
    """Generate a productivity performance report (completed tasks, overdue count, score)."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"""
            SELECT 
                COUNT(*) as total_assigned,
                SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status IN (0, 1, 4) AND due_date < CURDATE() THEN 1 ELSE 0 END) as overdue_count
            FROM `{t_tbl}` WHERE FIND_IN_SET(%s, assigned_to) > 0
        """, (str(user_id),))
        stats = cursor.fetchone()

        total = stats["total_assigned"] or 0
        completed = stats["completed_count"] or 0
        overdue = stats["overdue_count"] or 0
        rate = round((completed / total * 100), 1) if total > 0 else 0

        score = "Excellent" if rate >= 80 else ("Good" if rate >= 60 else "Needs Improvement")

        return {
            "productivity": {
                "total_assigned_tasks": total,
                "completed_tasks": completed,
                "overdue_tasks": overdue,
                "completion_rate_percentage": rate,
                "performance_score": score
            }
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

@mcp.tool()
def get_overdue_tasks(user_id: int) -> dict:
    """Fetch urgent overdue tasks assigned to or created for the user."""
    conn = get_db_connection()
    if not conn:
        return {"error": "Database connection failed."}

    try:
        t_tbl = get_table_name(conn, "tasks")
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"""
            SELECT id, title, priority, due_date, status
            FROM `{t_tbl}` 
            WHERE FIND_IN_SET(%s, assigned_to) > 0 
              AND due_date IS NOT NULL 
              AND due_date < CURDATE() 
              AND status NOT IN (2, 3)
            ORDER BY due_date ASC
        """, (str(user_id),))
        overdue_tasks = cursor.fetchall()
        for t in overdue_tasks:
            t["due_date"] = str(t["due_date"])
        return {"count": len(overdue_tasks), "overdue_tasks": overdue_tasks}
    except Exception as e:
        return {"error": str(e)}
    finally:
        conn.close()

# --- FASTAPI SERVER DEFINITION ---

app = FastAPI(title="TaskManager Python FastMCP Server")

class ToolCallRequest(BaseModel):
    tool_name: str
    args: Dict[str, Any]
    user: Dict[str, Any]

TOOL_MAP = {
    "get_user_tasks": get_user_tasks,
    "get_task_details": get_task_details,
    "create_new_task": create_new_task,
    "update_task_status": update_task_status,
    "update_task_details": update_task_details,
    "delete_task": delete_task,
    "reassign_task": reassign_task,
    "add_comment_to_task": add_comment_to_task,
    "get_team_members": get_team_members,
    "get_active_projects": get_active_projects,
    "get_user_productivity_report": get_user_productivity_report,
    "get_overdue_tasks": get_overdue_tasks,
}

@app.get("/")
def root():
    return {"status": "online", "service": "Python FastMCP Task Tool Server"}

@app.get("/tools")
def list_tools():
    return {"tools": list(TOOL_MAP.keys())}

@app.get("/tools_schema")
def get_tools_schema():
    """Dynamically provide Gemini/Groq-compatible tool schemas to Node.js AI client"""
    return {
        "functionDeclarations": [
            {
                "name": "get_user_tasks",
                "description": "Fetch tasks matching Dashboard UI tabs. Use task_type='todo' for To Do tab (tasks assigned to me). Use task_type='assigned_by_me' for Assigned tab (tasks created by me for other team members).",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "status": {"type": "STRING", "description": "Filter by status: Pending, In Progress, Completed, Cancelled, or Overdue"},
                        "priority": {"type": "STRING", "description": "Filter by priority: Low, Medium, High, Critical"},
                        "task_type": {"type": "STRING", "description": "Filter by Dashboard tab: 'todo' = To Do tab (tasks assigned to me), 'assigned_by_me' = Assigned tab (tasks I assigned to others)"}
                    }
                }
            },
            {
                "name": "get_task_details",
                "description": "Fetch full details and description of a specific task by Task ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task"}
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "create_new_task",
                "description": "Create a new task in the database for a user and project.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "title": {"type": "STRING", "description": "Title of the task"},
                        "description": {"type": "STRING", "description": "Detailed description of the task"},
                        "priority": {"type": "STRING", "description": "Priority: Low, Medium, High, Critical"},
                        "assigned_to_email": {"type": "STRING", "description": "Email or name of employee to assign task to"},
                        "project_name": {"type": "STRING", "description": "Name of the project"},
                        "due_date": {"type": "STRING", "description": "Due date YYYY-MM-DD"}
                    },
                    "required": ["title"]
                }
            },
            {
                "name": "update_task_status",
                "description": "Update the status of an existing task by Task ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task"},
                        "status": {"type": "STRING", "description": "New status: Pending, In Progress, Completed, Cancelled"}
                    },
                    "required": ["task_id", "status"]
                }
            },
            {
                "name": "update_task_details",
                "description": "Update title, description, priority, or due_date of an existing task by Task ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task"},
                        "title": {"type": "STRING", "description": "New title"},
                        "description": {"type": "STRING", "description": "New detailed description"},
                        "priority": {"type": "STRING", "description": "New priority: Low, Medium, High, Critical"},
                        "due_date": {"type": "STRING", "description": "New due date YYYY-MM-DD"}
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "delete_task",
                "description": "Permanently delete a task by Task ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task to delete"}
                    },
                    "required": ["task_id"]
                }
            },
            {
                "name": "reassign_task",
                "description": "Reassign a task to another team member by employee email or name.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task"},
                        "assigned_to_email": {"type": "STRING", "description": "Email or name of employee to assign task to"}
                    },
                    "required": ["task_id", "assigned_to_email"]
                }
            },
            {
                "name": "add_comment_to_task",
                "description": "Add a comment, update, or discussion note to a task by Task ID.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "NUMBER", "description": "ID of the task"},
                        "message": {"type": "STRING", "description": "Discussion message or update text"}
                    },
                    "required": ["task_id", "message"]
                }
            },
            {
                "name": "get_team_members",
                "description": "Fetch list of active team members, employees, and managers for task assignment.",
                "parameters": {"type": "OBJECT", "properties": {}}
            },
            {
                "name": "get_user_productivity_report",
                "description": "Generate a productivity performance report (completed tasks, overdue count, score).",
                "parameters": {"type": "OBJECT", "properties": {}}
            },
            {
                "name": "get_overdue_tasks",
                "description": "Fetch urgent overdue tasks assigned to or created for the user.",
                "parameters": {"type": "OBJECT", "properties": {}}
            }
        ]
    }

@app.post("/call_tool")
def execute_tool_endpoint(req: ToolCallRequest):
    tool_func = TOOL_MAP.get(req.tool_name)
    if not tool_func:
        raise HTTPException(status_code=404, detail=f"Tool '{req.tool_name}' not found.")

    args = req.args or {}
    user = req.user or {}

    # Inject user context into tool function if required
    if "user_id" in tool_func.__code__.co_varnames and "user_id" not in args:
        args["user_id"] = user.get("id", 1)
    if "user_role" in tool_func.__code__.co_varnames and "user_role" not in args:
        args["user_role"] = user.get("role", "user")

    try:
        result = tool_func(**args)
        return {"success": True, "result": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("MCP_PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
