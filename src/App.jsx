import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import {
  collection, addDoc, onSnapshot,
  updateDoc, deleteDoc, doc, query, where
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "firebase/auth";
import * as XLSX from "xlsx";

const SUPER_ADMIN = "mohamed817238@gmail.com";
const HEAD_MANAGER = "rania.zaki@te.eg";
const LOWER_MANAGERS = [
  { email: "mostafa.ghazy@te.eg", name: "Mostafa Ghazy" },
  { email: "omar.nasr@te.eg", name: "Omar Nasr" },
  { email: "eman.r.hasan@te.eg", name: "Eman Hasan" },
];
const ALLOWED_EMAILS = [
  SUPER_ADMIN, HEAD_MANAGER,
  ...LOWER_MANAGERS.map(m => m.email),
];

const isMobile = () => window.innerWidth < 768;

const PRIORITY_COLORS = {
  Low: "#4ade80", Medium: "#facc15", High: "#f97316", Critical: "#ef4444",
};
const STATUS_COLORS = {
  Pending: "#facc15", Done: "#22c55e", Overdue: "#ef4444", "Under Review": "#a855f7",
};

function getTaskStatus(task) {
  if (task.status === "Done") return "Done";
  if (task.status === "Under Review") return "Under Review";
  if (task.dueDate && new Date(task.dueDate) < new Date()) return "Overdue";
  return "Pending";
}

function getRole(email) {
  if (!email) return null;
  const e = email.toLowerCase().trim();
  if (e === SUPER_ADMIN.toLowerCase()) return "superadmin";
  if (e === HEAD_MANAGER.toLowerCase()) return "head";
  if (LOWER_MANAGERS.map(m => m.email.toLowerCase()).includes(e)) return "manager";
  return null;
}

// ─── EXPORT REPORT ────────────────────────────────────────────────────────────
function exportReport(projects, tasks) {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("en-GB");

  // ── TASKS SHEET ──
  const taskRows = [];
  const pendingOverdueTasks = tasks.filter(t => {
    const s = getTaskStatus(t);
    return s === "Pending" || s === "Overdue";
  });

  // Group by owner
  const tasksByOwner = {};
  pendingOverdueTasks.forEach(t => {
    const owner = t.ownerName || t.ownerEmail || "Unknown";
    if (!tasksByOwner[owner]) tasksByOwner[owner] = [];
    tasksByOwner[owner].push(t);
  });

  Object.entries(tasksByOwner).forEach(([owner, ownerTasks]) => {
    taskRows.push({ "": `── ${owner} ──`, " ": "", "  ": "", "   ": "", "    ": "", "     ": "", "      ": "" });
    ownerTasks.forEach(t => {
      taskRows.push({
        "Owner": owner,
        "Project": t.projectName || "-",
        "Task": t.title || "-",
        "Priority": t.priority || "-",
        "Status": getTaskStatus(t),
        "Due Date": t.dueDate || "-",
        "Created": t.createdAt || "-",
      });
    });
    taskRows.push({ "Owner": "" });
  });

  if (taskRows.length === 0) {
    taskRows.push({ "Owner": "No pending or overdue tasks", "Project": "", "Task": "", "Priority": "", "Status": "", "Due Date": "", "Created": "" });
  }

  const wsTask = XLSX.utils.json_to_sheet(taskRows);
  wsTask["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsTask, "Pending Tasks");

  // ── PROJECTS SHEET ──
  const projectRows = [];
  const pendingOverdueProjects = projects.filter(p => {
    const s = p.status || "Pending";
    if (s === "Pending") {
      const projectTasks = tasks.filter(t => t.projectId === p.id);
      const hasOverdue = projectTasks.some(t => getTaskStatus(t) === "Overdue");
      return true;
    }
    return false;
  });

  const projectsByOwner = {};
  pendingOverdueProjects.forEach(p => {
    const owner = p.ownerName || p.ownerEmail || "Unknown";
    if (!projectsByOwner[owner]) projectsByOwner[owner] = [];
    projectsByOwner[owner].push(p);
  });

  Object.entries(projectsByOwner).forEach(([owner, ownerProjects]) => {
    projectRows.push({ "": `── ${owner} ──`, " ": "", "  ": "", "   ": "", "    ": "", "     ": "" });
    ownerProjects.forEach(p => {
      const projectTasks = tasks.filter(t => t.projectId === p.id);
      const doneTasks = projectTasks.filter(t => getTaskStatus(t) === "Done").length;
      const overdueTasks = projectTasks.filter(t => getTaskStatus(t) === "Overdue").length;
      const pendingTasks = projectTasks.filter(t => getTaskStatus(t) === "Pending").length;
      const pct = projectTasks.length ? Math.round((doneTasks / projectTasks.length) * 100) : 0;
      projectRows.push({
        "Owner": owner,
        "Project Name": p.name || "-",
        "Total Tasks": projectTasks.length,
        "Pending Tasks": pendingTasks,
        "Overdue Tasks": overdueTasks,
        "Progress %": `${pct}%`,
        "Created": p.createdAt || "-",
        "Assigned By": p.assignedBy || "Self",
      });
    });
    projectRows.push({ "Owner": "" });
  });

  if (projectRows.length === 0) {
    projectRows.push({ "Owner": "No pending projects", "Project Name": "", "Total Tasks": "", "Pending Tasks": "", "Overdue Tasks": "", "Progress %": "", "Created": "", "Assigned By": "" });
  }

  const wsProject = XLSX.utils.json_to_sheet(projectRows);
  wsProject["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsProject, "Pending Projects");

  // ── SUMMARY SHEET ──
  const summaryRows = [
    { "WE Telecom Egypt — Pending Report": `Generated: ${today}`, " ": "" },
    { "WE Telecom Egypt — Pending Report": "", " ": "" },
    { "WE Telecom Egypt — Pending Report": "TASKS SUMMARY", " ": "" },
  ];

  LOWER_MANAGERS.forEach(m => {
    const managerTasks = tasks.filter(t => t.ownerEmail?.toLowerCase() === m.email.toLowerCase());
    const pending = managerTasks.filter(t => getTaskStatus(t) === "Pending").length;
    const overdue = managerTasks.filter(t => getTaskStatus(t) === "Overdue").length;
    summaryRows.push({
      "WE Telecom Egypt — Pending Report": m.name,
      " ": `Pending: ${pending} | Overdue: ${overdue} | Total: ${pending + overdue}`,
    });
  });

  summaryRows.push({ "WE Telecom Egypt — Pending Report": "", " ": "" });
  summaryRows.push({ "WE Telecom Egypt — Pending Report": "PROJECTS SUMMARY", " ": "" });

  LOWER_MANAGERS.forEach(m => {
    const managerProjects = projects.filter(p => p.ownerEmail?.toLowerCase() === m.email.toLowerCase() && (p.status || "Pending") === "Pending");
    summaryRows.push({
      "WE Telecom Egypt — Pending Report": m.name,
      " ": `Pending Projects: ${managerProjects.length}`,
    });
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 35 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  XLSX.writeFile(wb, `WE_Telecom_Pending_Report_${today.replace(/\//g, "-")}.xlsx`);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const inputStyle = {
    background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "10px",
    color: "#e2e8f0", padding: "12px 14px", fontSize: "14px", width: "100%",
    outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box",
  };

  const submit = async () => {
    setError(""); setSuccess("");
    if (!email.trim() || !password.trim()) { setError("Please fill all fields"); return; }
    const role = getRole(email.trim());
    if (!role) { setError("This email is not authorized to access this system."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        if (!name.trim()) { setError("Please enter your name"); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try {
          await addDoc(collection(db, "users"), {
            uid: cred.user.uid, email: email.trim().toLowerCase(),
            name: name.trim(), role,
          });
        } catch (e) { console.log("profile error", e); }
      }
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setError("Already registered — please Sign In.");
      else if (e.code === "auth/weak-password") setError("Password must be at least 6 characters.");
      else if (e.code === "auth/invalid-email") setError("Invalid email address.");
      else if (e.code === "auth/invalid-credential") setError("Wrong email or password.");
      else setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const sendReset = async () => {
    if (!resetEmail.trim()) { setError("Enter your email"); return; }
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccess("Reset email sent! Check your inbox.");
      setShowReset(false);
    } catch (e) { setError("Could not send reset email."); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'Sora',sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: "60px", height: "60px", borderRadius: "16px", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", fontWeight: 800, color: "#fff", margin: "0 auto 16px", boxShadow: "0 8px 24px rgba(59,130,246,0.4)" }}>W</div>
          <div style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}>WE Telecom Egypt</div>
          <div style={{ fontSize: "11px", color: "#3b82f6", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px" }}>Task Management System</div>
        </div>
        <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "20px", padding: "28px 24px" }}>
          <div style={{ display: "flex", marginBottom: "24px", background: "#0a1120", borderRadius: "10px", padding: "4px" }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); setSuccess(""); }} style={{ flex: 1, padding: "9px", background: mode === m ? "#1d4ed8" : "none", color: mode === m ? "#fff" : "#64748b", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "13px" }}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
          {!showReset ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {mode === "signup" && <input style={inputStyle} placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />}
              <input style={inputStyle} placeholder="Work Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              <input style={inputStyle} placeholder="Password (min 6 chars)" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
              {error && <div style={{ color: "#ef4444", fontSize: "12px", padding: "10px 12px", background: "#1a0a0a", borderRadius: "8px", border: "1px solid #7f1d1d" }}>{error}</div>}
              {success && <div style={{ color: "#22c55e", fontSize: "12px", padding: "10px 12px", background: "#0a1a0a", borderRadius: "8px", border: "1px solid #14532d" }}>{success}</div>}
              <button onClick={submit} disabled={loading} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "13px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "14px", opacity: loading ? 0.7 : 1, marginTop: "4px" }}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>
              {mode === "login" && <button onClick={() => setShowReset(true)} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "12px", fontFamily: "'Sora',sans-serif" }}>Forgot password?</button>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ color: "#94a3b8", fontSize: "13px", textAlign: "center" }}>Enter your email to receive a reset link</div>
              <input style={inputStyle} placeholder="Your work email" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
              {error && <div style={{ color: "#ef4444", fontSize: "12px", padding: "10px", background: "#1a0a0a", borderRadius: "8px" }}>{error}</div>}
              {success && <div style={{ color: "#22c55e", fontSize: "12px", padding: "10px", background: "#0a1a0a", borderRadius: "8px" }}>{success}</div>}
              <button onClick={sendReset} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "13px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "14px" }}>Send Reset Email</button>
              <button onClick={() => { setShowReset(false); setError(""); }} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "12px", fontFamily: "'Sora',sans-serif" }}>← Back to Sign In</button>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", color: "#334155", fontSize: "11px", marginTop: "16px" }}>Only authorized WE Telecom accounts can access this system</div>
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#0f1724", border: "1px solid #1e3a5f", borderRadius: "16px", width: "100%", maxWidth: "520px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #1e3a5f" }}>
          <span style={{ color: "#e2e8f0", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "16px" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px" }}>✕</button>
        </div>
        <div style={{ padding: "16px 20px 20px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = "Confirm", confirmColor = "#22c55e" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#0f1724", border: "1px solid #1e3a5f", borderRadius: "16px", width: "100%", maxWidth: "400px", padding: "24px", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontSize: "18px", fontWeight: 800, color: "#f1f5f9", marginBottom: "12px" }}>{title}</div>
        <div style={{ fontSize: "14px", color: "#94a3b8", marginBottom: "24px", lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{ flex: 1, background: "#0a1120", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "10px", padding: "11px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: "13px" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: confirmColor, color: "#fff", border: "none", borderRadius: "10px", padding: "11px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "13px" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, onOpen, onMarkDone, onReview, currentUserEmail }) {
  const status = getTaskStatus(task);
  const done = (task.checklist || []).filter(c => c.done).length;
  const total = (task.checklist || []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const role = getRole(currentUserEmail);
  const isAdmin = role === "superadmin" || role === "head";
  const canMarkDone = status === "Pending" || status === "Overdue";
  const canReview = isAdmin && status === "Done";

  return (
    <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${status === "Overdue" ? "#7f1d1d" : status === "Done" ? "#14532d" : "#1e3a5f"}`, borderRadius: "12px", padding: "14px 16px", transition: "all 0.2s" }}>
      <div onClick={() => onOpen(task)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ color: PRIORITY_COLORS[task.priority] || "#facc15", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", background: (PRIORITY_COLORS[task.priority] || "#facc15") + "18", padding: "3px 8px", borderRadius: "20px" }}>{task.priority || "Medium"}</span>
          <span style={{ color: STATUS_COLORS[status] || "#64748b", fontSize: "10px", fontWeight: 700 }}>● {status}</span>
        </div>
        <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "13px", marginBottom: "8px", lineHeight: 1.4 }}>{task.title}</div>
        {task.dueDate && <div style={{ color: status === "Overdue" ? "#ef4444" : "#64748b", fontSize: "11px", marginBottom: "6px" }}>📅 {task.dueDate}</div>}
        {task.assignedBy && <div style={{ color: "#475569", fontSize: "10px", marginBottom: "8px" }}>📌 by {task.assignedBy}</div>}
        {total > 0 && (
          <div style={{ marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>Checklist</span>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>{done}/{total}</span>
            </div>
            <div style={{ background: "#1e3a5f", borderRadius: "99px", height: "4px" }}>
              <div style={{ width: `${pct}%`, height: "4px", borderRadius: "99px", background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#60a5fa)" }} />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
        {canMarkDone && (
          <button onClick={e => { e.stopPropagation(); onMarkDone(task); }}
            style={{ flex: 1, background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>
            ✅ Mark Done
          </button>
        )}
        {status === "Done" && !isAdmin && (
          <div style={{ flex: 1, background: "#0a1a0a", color: "#22c55e", border: "1px solid #14532d", borderRadius: "8px", padding: "6px", fontSize: "11px", fontWeight: 600, textAlign: "center" }}>✅ Completed</div>
        )}
        {canReview && (
          <>
            <button onClick={e => { e.stopPropagation(); onReview(task, "approve"); }}
              style={{ flex: 1, background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>✅ Pass</button>
            <button onClick={e => { e.stopPropagation(); onReview(task, "reject"); }}
              style={{ flex: 1, background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d40", borderRadius: "8px", padding: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>❌ Reject</button>
          </>
        )}
        {status === "Done" && isAdmin && !canReview && (
          <div style={{ flex: 1, background: "#0a1a0a", color: "#22c55e", border: "1px solid #14532d", borderRadius: "8px", padding: "6px", fontSize: "11px", fontWeight: 600, textAlign: "center" }}>✅ Done</div>
        )}
      </div>
    </div>
  );
}

// ─── TASK DETAIL ──────────────────────────────────────────────────────────────
function TaskDetail({ task, onClose, onUpdate, onDelete, onMarkDone, onReview, currentUserEmail }) {
  const [localTask, setLocalTask] = useState({ ...task, checklist: (task.checklist || []).map(c => ({ ...c })) });
  const [newItem, setNewItem] = useState("");
  const status = getTaskStatus(localTask);
  const role = getRole(currentUserEmail);
  const isAdmin = role === "superadmin" || role === "head";
  const isOwner = task.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase();
  const isAssignedByMe = task.assignedByEmail?.toLowerCase() === currentUserEmail?.toLowerCase();
  const canDelete = isAdmin || (isOwner && !task.assignedBy) || isAssignedByMe;
  const canEdit = isAdmin || isOwner;
  const canMarkDone = (status === "Pending" || status === "Overdue") && (isAdmin || isOwner);
  const canReview = isAdmin && status === "Done";

  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <Modal title="Task Details" onClose={() => { if (canEdit) onUpdate(localTask); onClose(); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ color: STATUS_COLORS[status] || "#64748b", background: (STATUS_COLORS[status] || "#64748b") + "18", padding: "6px 20px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: `1px solid ${(STATUS_COLORS[status] || "#64748b")}40` }}>● {status}</span>
        </div>
        <div><label style={labelStyle}>Title</label>
          {canEdit ? <input style={inputStyle} value={localTask.title} onChange={e => setLocalTask(t => ({ ...t, title: e.target.value }))} />
            : <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>{localTask.title}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div><label style={labelStyle}>Priority</label>
            {canEdit
              ? <select style={{ ...inputStyle, cursor: "pointer" }} value={localTask.priority || "Medium"} onChange={e => setLocalTask(t => ({ ...t, priority: e.target.value }))}>
                {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
              </select>
              : <div style={{ color: PRIORITY_COLORS[localTask.priority], fontWeight: 600 }}>{localTask.priority}</div>}
          </div>
          <div><label style={labelStyle}>Due Date</label>
            {canEdit
              ? <input type="date" style={inputStyle} value={localTask.dueDate || ""} onChange={e => setLocalTask(t => ({ ...t, dueDate: e.target.value }))} />
              : <div style={{ color: "#e2e8f0", fontSize: "13px" }}>{localTask.dueDate || "No date"}</div>}
          </div>
        </div>
        {task.assignedBy && (
          <div style={{ background: "#0a1120", borderRadius: "8px", padding: "10px 12px", border: "1px solid #1e3a5f" }}>
            <span style={{ color: "#64748b", fontSize: "11px" }}>📌 Assigned by </span>
            <span style={{ color: "#3b82f6", fontSize: "11px", fontWeight: 600 }}>{task.assignedBy}</span>
          </div>
        )}
        <div>
          <label style={labelStyle}>Checklist ({(localTask.checklist || []).filter(c => c.done).length}/{(localTask.checklist || []).length})</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
            {(localTask.checklist || []).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0a1120", borderRadius: "8px", padding: "8px 12px", border: "1px solid #1e3a5f" }}>
                <input type="checkbox" checked={item.done}
                  onChange={() => setLocalTask(t => ({ ...t, checklist: t.checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c) }))}
                  style={{ accentColor: "#3b82f6", width: "15px", height: "15px", cursor: "pointer", flexShrink: 0 }} />
                <span style={{ color: item.done ? "#475569" : "#cbd5e1", fontSize: "13px", flex: 1, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                {canEdit && <button onClick={() => setLocalTask(t => ({ ...t, checklist: t.checklist.filter(c => c.id !== item.id) }))} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "14px" }}>✕</button>}
              </div>
            ))}
            {(localTask.checklist || []).length === 0 && <div style={{ color: "#334155", fontSize: "12px", textAlign: "center", padding: "12px" }}>No checklist items</div>}
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: "8px" }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Add item..." value={newItem} onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { setLocalTask(t => ({ ...t, checklist: [...(t.checklist || []), { id: Date.now(), text: newItem.trim(), done: false }] })); setNewItem(""); } }} />
              <button onClick={() => { if (newItem.trim()) { setLocalTask(t => ({ ...t, checklist: [...(t.checklist || []), { id: Date.now(), text: newItem.trim(), done: false }] })); setNewItem(""); } }}
                style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Add</button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {canEdit && <button onClick={() => { onUpdate(localTask); onClose(); }} style={{ flex: 1, background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>Save</button>}
          {canMarkDone && <button onClick={() => { onMarkDone(task); onClose(); }} style={{ flex: 1, background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>✅ Mark Done</button>}
          {canReview && <>
            <button onClick={() => { onReview(task, "approve"); onClose(); }} style={{ flex: 1, background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>✅ Pass</button>
            <button onClick={() => { onReview(task, "reject"); onClose(); }} style={{ flex: 1, background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>❌ Reject</button>
          </>}
          {canDelete && <button onClick={() => { onDelete(task.id); onClose(); }} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "11px 14px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>🗑</button>}
        </div>
      </div>
    </Modal>
  );
}

// ─── PROJECT SECTION ──────────────────────────────────────────────────────────
function ProjectSection({ project, tasks, onSelectTask, onDeleteProject, onAddTask, onMarkProjectDone, onReviewProject, currentUserEmail, mobile }) {
  const role = getRole(currentUserEmail);
  const isAdmin = role === "superadmin" || role === "head";
  const isOwner = project.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase();
  const canDeleteProject = isAdmin || (isOwner && !project.assignedBy);
  const canAddTask = isAdmin || isOwner;
  const projectStatus = project.status || "Pending";
  const canMarkProjectDone = (isAdmin || isOwner) && projectStatus === "Pending";
  const canReviewProject = isAdmin && projectStatus === "Done";

  const ptasks = tasks.filter(t => t.projectId === project.id);
  const done = ptasks.filter(t => getTaskStatus(t) === "Done").length;
  const overdue = ptasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const pending = ptasks.filter(t => getTaskStatus(t) === "Pending").length;
  const pct = ptasks.length ? Math.round((done / ptasks.length) * 100) : 0;
  const borderColor = projectStatus === "Done" ? "#14532d" : projectStatus === "Under Review" ? "#6b21a8" : overdue > 0 ? "#7f1d1d" : "#1e3a5f";

  return (
    <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${borderColor}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9" }}>{project.name}</div>
            <span style={{ color: STATUS_COLORS[projectStatus] || "#64748b", background: (STATUS_COLORS[projectStatus] || "#64748b") + "18", padding: "3px 10px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>● {projectStatus}</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {project.ownerName && `👤 ${project.ownerName}`}
            {project.assignedBy && <span style={{ color: "#3b82f6" }}> · 📌 by {project.assignedBy}</span>}
            {project.createdAt && ` · 📅 ${project.createdAt}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {canAddTask && projectStatus === "Pending" && (
            <button onClick={() => onAddTask(project)} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>+ Task</button>
          )}
          {canMarkProjectDone && (
            <button onClick={() => onMarkProjectDone(project)} style={{ background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>✅ Mark Done</button>
          )}
          {canReviewProject && (
            <>
              <button onClick={() => onReviewProject(project, "approve")} style={{ background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>✅ Pass</button>
              <button onClick={() => onReviewProject(project, "reject")} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>❌ Reject</button>
            </>
          )}
          {projectStatus === "Done" && !isAdmin && (
            <div style={{ background: "#0a1a0a", color: "#22c55e", border: "1px solid #14532d", borderRadius: "8px", padding: "7px 12px", fontSize: "11px", fontWeight: 600 }}>✅ Completed</div>
          )}
          {canDeleteProject && (
            <button onClick={() => onDeleteProject(project.id)} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "7px 10px", cursor: "pointer", fontSize: "13px" }}>🗑</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "14px" }}>
        {[{ label: "Pending", value: pending, color: "#facc15", icon: "⏳" }, { label: "Done", value: done, color: "#22c55e", icon: "✅" }, { label: "Overdue", value: overdue, color: "#ef4444", icon: "🔴" }].map(s => (
          <div key={s.label} style={{ background: "#0a1120", borderRadius: "10px", padding: "10px", display: "flex", alignItems: "center", gap: "8px", border: "1px solid #1e3a5f" }}>
            <span>{s.icon}</span>
            <div><div style={{ fontSize: "18px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>Progress</span>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>{pct}% · {ptasks.length} tasks</span>
        </div>
        <div style={{ background: "#1e3a5f", borderRadius: "99px", height: "6px" }}>
          <div style={{ width: `${pct}%`, height: "6px", borderRadius: "99px", background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.4s" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(220px,1fr))", gap: "8px" }}>
        {ptasks.map(t => (
          <TaskCard key={t.id} task={t} onOpen={onSelectTask}
            onMarkDone={async (task) => { await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() }); }}
            onReview={async (task, action) => {
              if (action === "approve") await deleteDoc(doc(db, "tasks", task.id));
              else await updateDoc(doc(db, "tasks", task.id), { status: "Pending" });
            }}
            currentUserEmail={currentUserEmail} />
        ))}
        {ptasks.length === 0 && (
          <div style={{ color: "#334155", fontSize: "12px", padding: "20px", textAlign: "center", border: "2px dashed #1e3a5f", borderRadius: "10px" }}>No tasks yet</div>
        )}
      </div>
    </div>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard({ user, userProfile }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTaskProject, setNewTaskProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "" });
  const [mobile, setMobile] = useState(isMobile());
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener("resize", handleResize);
    const q1 = query(collection(db, "projects"), where("ownerEmail", "==", user.email.toLowerCase()));
    const unsub1 = onSnapshot(q1, snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const q2 = query(collection(db, "tasks"), where("ownerEmail", "==", user.email.toLowerCase()));
    const unsub2 = onSnapshot(q2, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, [user.email]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(), ownerUid: user.uid,
      ownerName: userProfile?.name || user.email,
      ownerEmail: user.email.toLowerCase(),
      status: "Pending",
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewProjectName(""); setShowNewProject(false);
  };

  const createTask = async () => {
    if (!newTask.title.trim() || !newTaskProject) return;
    await addDoc(collection(db, "tasks"), {
      ...newTask, projectId: newTaskProject.id, projectName: newTaskProject.name,
      ownerUid: user.uid, ownerName: userProfile?.name || user.email,
      ownerEmail: user.email.toLowerCase(),
      status: "Pending", checklist: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewTask({ title: "", priority: "Medium", dueDate: "" }); setNewTaskProject(null);
  };

  const updateTask = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) });
  };

  const markTaskDone = async (task) => {
    await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() });
  };

  const reviewTask = async (task, action) => {
    if (action === "approve") await deleteDoc(doc(db, "tasks", task.id));
    else await updateDoc(doc(db, "tasks", task.id), { status: "Pending" });
  };

  const markProjectDone = (project) => {
    setConfirm({
      title: "Mark Project as Done?",
      message: `"${project.name}" will be marked as done and sent for review.`,
      confirmLabel: "Yes, Mark Done", confirmColor: "#22c55e",
      onConfirm: async () => {
        await updateDoc(doc(db, "projects", project.id), { status: "Done", doneAt: new Date().toISOString() });
        setConfirm(null);
      },
    });
  };

  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));
  const deleteProject = async (id) => {
    const projectTasks = tasks.filter(t => t.projectId === id);
    await Promise.all(projectTasks.map(t => deleteDoc(doc(db, "tasks", t.id))));
    await deleteDoc(doc(db, "projects", id));
  };

  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <div style={{ minHeight: "100vh", background: "#070d18", fontFamily: "'Sora',sans-serif", color: "#e2e8f0" }}>
      <div style={{ background: "linear-gradient(180deg,#0a1528,#070d18)", borderBottom: "1px solid #1e3a5f", padding: `0 ${mobile ? "16px" : "32px"}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: "#fff" }}>W</div>
            <div>
              <div style={{ fontSize: mobile ? "12px" : "14px", fontWeight: 800, color: "#f1f5f9" }}>WE Telecom Egypt</div>
              <div style={{ fontSize: "9px", color: "#3b82f6", letterSpacing: "1px", textTransform: "uppercase" }}>{userProfile?.name || user.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowNewProject(true)} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Project</button>
            <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px" }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        {projects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#475569" }}>
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>📁</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#64748b" }}>No projects yet</div>
            <div style={{ fontSize: "13px", marginTop: "8px" }}>Click "+ Project" to get started</div>
          </div>
        ) : (
          projects.map(project => (
            <ProjectSection key={project.id} project={project} tasks={tasks}
              onSelectTask={setSelectedTask} onDeleteProject={deleteProject}
              onAddTask={setNewTaskProject} onMarkProjectDone={markProjectDone}
              onReviewProject={() => {}} currentUserEmail={user.email} mobile={mobile} />
          ))
        )}
      </div>

      {showNewProject && (
        <Modal title="New Project" onClose={() => setShowNewProject(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Project Name</label>
              <input style={inputStyle} placeholder="Enter project name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} autoFocus /></div>
            <button onClick={createProject} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Create Project</button>
          </div>
        </Modal>
      )}

      {newTaskProject && (
        <Modal title={`New Task — ${newTaskProject.name}`} onClose={() => setNewTaskProject(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Task Title</label>
              <input style={inputStyle} placeholder="Enter task title..." value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} autoFocus /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div><label style={labelStyle}>Priority</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}>
                  {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
                </select></div>
              <div><label style={labelStyle}>Due Date</label>
                <input type="date" style={inputStyle} value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} /></div>
            </div>
            <button onClick={createTask} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Add Task</button>
          </div>
        </Modal>
      )}

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)}
          onUpdate={updateTask} onDelete={deleteTask}
          onMarkDone={markTaskDone} onReview={reviewTask}
          currentUserEmail={user.email} />
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} confirmColor={confirm.confirmColor}
          onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ user, role }) {
  const [allProjects, setAllProjects] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedOwnerEmail, setSelectedOwnerEmail] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTaskProject, setNewTaskProject] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTarget, setNewProjectTarget] = useState(LOWER_MANAGERS[0].email);
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "" });
  const [mobile, setMobile] = useState(isMobile());
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener("resize", handleResize);
    const unsub1 = onSnapshot(collection(db, "projects"), snap => setAllProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsub2 = onSnapshot(collection(db, "tasks"), snap => setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, []);

  const isSuper = role === "superadmin";
  const accentColor = isSuper ? "#a855f7" : "#f97316";

  const filteredProjects = selectedOwnerEmail === "all"
    ? allProjects
    : allProjects.filter(p => p.ownerEmail?.toLowerCase() === selectedOwnerEmail.toLowerCase());

  const createProjectForManager = async () => {
    if (!newProjectName.trim()) return;
    const target = LOWER_MANAGERS.find(m => m.email.toLowerCase() === newProjectTarget.toLowerCase());
    await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(),
      ownerEmail: newProjectTarget.toLowerCase(),
      ownerName: target?.name || newProjectTarget,
      assignedBy: isSuper ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      status: "Pending",
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewProjectName(""); setShowNewProject(false);
  };

  const createTaskForManager = async () => {
    if (!newTask.title.trim() || !newTaskProject) return;
    await addDoc(collection(db, "tasks"), {
      ...newTask,
      projectId: newTaskProject.id, projectName: newTaskProject.name,
      ownerEmail: newTaskProject.ownerEmail, ownerName: newTaskProject.ownerName,
      assignedBy: isSuper ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      status: "Pending", checklist: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewTask({ title: "", priority: "Medium", dueDate: "" }); setNewTaskProject(null);
  };

  const updateTask = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) });
  };

  const markTaskDone = async (task) => {
    await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() });
  };

  const reviewTask = (task, action) => {
    if (action === "approve") {
      setConfirm({
        title: "Pass this task?",
        message: `"${task.title}" will be permanently deleted after passing.`,
        confirmLabel: "Yes, Pass & Delete", confirmColor: "#22c55e",
        onConfirm: async () => { await deleteDoc(doc(db, "tasks", task.id)); setConfirm(null); },
      });
    } else {
      setConfirm({
        title: "Reject this task?",
        message: `"${task.title}" will be moved back to Pending.`,
        confirmLabel: "Yes, Reject", confirmColor: "#ef4444",
        onConfirm: async () => { await updateDoc(doc(db, "tasks", task.id), { status: "Pending" }); setConfirm(null); },
      });
    }
  };

  const reviewProject = (project, action) => {
    if (action === "approve") {
      setConfirm({
        title: "Pass this project?",
        message: `"${project.name}" and all its tasks will be permanently deleted.`,
        confirmLabel: "Yes, Pass & Delete", confirmColor: "#22c55e",
        onConfirm: async () => {
          const projectTasks = allTasks.filter(t => t.projectId === project.id);
          await Promise.all(projectTasks.map(t => deleteDoc(doc(db, "tasks", t.id))));
          await deleteDoc(doc(db, "projects", project.id));
          setConfirm(null);
        },
      });
    } else {
      setConfirm({
        title: "Reject this project?",
        message: `"${project.name}" will be moved back to Pending.`,
        confirmLabel: "Yes, Reject", confirmColor: "#ef4444",
        onConfirm: async () => {
          await updateDoc(doc(db, "projects", project.id), { status: "Pending" });
          setConfirm(null);
        },
      });
    }
  };

  const markProjectDone = (project) => {
    setConfirm({
      title: "Mark Project as Done?",
      message: `"${project.name}" will be marked as done and sent for review.`,
      confirmLabel: "Yes, Mark Done", confirmColor: "#22c55e",
      onConfirm: async () => {
        await updateDoc(doc(db, "projects", project.id), { status: "Done", doneAt: new Date().toISOString() });
        setConfirm(null);
      },
    });
  };

  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));
  const deleteProject = async (id) => {
    const projectTasks = allTasks.filter(t => t.projectId === id);
    await Promise.all(projectTasks.map(t => deleteDoc(doc(db, "tasks", t.id))));
    await deleteDoc(doc(db, "projects", id));
  };

  const totalDone = allTasks.filter(t => getTaskStatus(t) === "Done").length;
  const totalOverdue = allTasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const totalPending = allTasks.filter(t => getTaskStatus(t) === "Pending").length;
  const reviewCount = allProjects.filter(p => p.status === "Done").length + allTasks.filter(t => getTaskStatus(t) === "Done").length;

  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <div style={{ minHeight: "100vh", background: "#070d18", fontFamily: "'Sora',sans-serif", color: "#e2e8f0" }}>
      <div style={{ background: `linear-gradient(180deg,${isSuper ? "#1a0a28" : "#0a1a1a"},#070d18)`, borderBottom: "1px solid #1e3a5f", padding: `0 ${mobile ? "16px" : "32px"}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ef4444"})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: "#fff" }}>{isSuper ? "★" : "H"}</div>
            <div>
              <div style={{ fontSize: mobile ? "11px" : "14px", fontWeight: 800, color: "#f1f5f9" }}>{isSuper ? "Super Admin" : "Head Manager"}</div>
              <div style={{ fontSize: "9px", color: accentColor, letterSpacing: "1px", textTransform: "uppercase" }}>{user.email}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => exportReport(allProjects, allTasks)}
              style={{ background: "linear-gradient(135deg,#14532d,#16a34a)", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>
              📊 Export Report
            </button>
            <button onClick={() => setShowNewProject(true)} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Project</button>
            <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px" }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total Projects", value: allProjects.length, color: "#3b82f6", icon: "📁" },
            { label: "Total Tasks", value: allTasks.length, color: "#a855f7", icon: "📋" },
            { label: "Pending Tasks", value: totalPending, color: "#facc15", icon: "⏳" },
            { label: "Overdue Tasks", value: totalOverdue, color: "#ef4444", icon: "🔴" },
          ].map(s => (
            <div key={s.label} style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{s.icon}</div>
              <div><div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
            </div>
          ))}
        </div>

        {reviewCount > 0 && (
          <div style={{ background: "#1a0a28", border: "1px solid #6b21a8", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>🔍</span>
            <div>
              <div style={{ color: "#a855f7", fontWeight: 700, fontSize: "13px" }}>{reviewCount} item{reviewCount > 1 ? "s" : ""} waiting for your review</div>
              <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>Tasks and projects marked done are waiting to be passed or rejected</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>View Owner:</span>
          <select value={selectedOwnerEmail} onChange={e => setSelectedOwnerEmail(e.target.value)}
            style={{ background: "#0f1724", border: `1px solid ${accentColor}40`, borderRadius: "10px", color: "#e2e8f0", padding: "8px 14px", fontSize: "13px", outline: "none", fontFamily: "'Sora',sans-serif", cursor: "pointer", minWidth: "200px" }}>
            <option value="all">👥 All Owners</option>
            {LOWER_MANAGERS.map(m => <option key={m.email} value={m.email}>👤 {m.name}</option>)}
          </select>
        </div>

        {filteredProjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px", color: "#475569" }}>
            <div style={{ fontSize: "56px" }}>📭</div>
            <div style={{ fontSize: "15px", fontWeight: 600, marginTop: "12px" }}>No projects found</div>
          </div>
        ) : (
          filteredProjects.map(project => (
            <ProjectSection key={project.id} project={project} tasks={allTasks}
              onSelectTask={setSelectedTask} onDeleteProject={deleteProject}
              onAddTask={(p) => setNewTaskProject(p)}
              onMarkProjectDone={markProjectDone}
              onReviewProject={reviewProject}
              currentUserEmail={user.email} mobile={mobile} />
          ))
        )}
      </div>

      {showNewProject && (
        <Modal title="Assign New Project" onClose={() => setShowNewProject(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Assign To</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={newProjectTarget} onChange={e => setNewProjectTarget(e.target.value)}>
                {LOWER_MANAGERS.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
              </select></div>
            <div><label style={labelStyle}>Project Name</label>
              <input style={inputStyle} placeholder="Enter project name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProjectForManager()} autoFocus /></div>
            <button onClick={createProjectForManager} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Create & Assign</button>
          </div>
        </Modal>
      )}

      {newTaskProject && (
        <Modal title={`Add Task — ${newTaskProject.name}`} onClose={() => setNewTaskProject(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#0a1120", borderRadius: "8px", padding: "10px 12px", border: "1px solid #1e3a5f", fontSize: "12px", color: "#64748b" }}>
              📁 <span style={{ color: "#3b82f6", fontWeight: 600 }}>{newTaskProject.name}</span> · 👤 <span style={{ color: "#94a3b8" }}>{newTaskProject.ownerName}</span>
            </div>
            <div><label style={labelStyle}>Task Title</label>
              <input style={inputStyle} placeholder="Enter task title..." value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} autoFocus /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div><label style={labelStyle}>Priority</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}>
                  {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
                </select></div>
              <div><label style={labelStyle}>Due Date</label>
                <input type="date" style={inputStyle} value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} /></div>
            </div>
            <button onClick={createTaskForManager} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Assign Task</button>
          </div>
        </Modal>
      )}

      {selectedTask && (
        <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)}
          onUpdate={updateTask} onDelete={deleteTask}
          onMarkDone={markTaskDone} onReview={reviewTask}
          currentUserEmail={user.email} />
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message}
          confirmLabel={confirm.confirmLabel} confirmColor={confirm.confirmColor}
          onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const q = query(collection(db, "users"), where("uid", "==", u.uid));
        onSnapshot(q, snap => { if (!snap.empty) setUserProfile(snap.docs[0].data()); });
      } else { setUserProfile(null); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif" }}>
      <div style={{ color: "#3b82f6", fontSize: "16px", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  if (!user) return <AuthScreen />;
  const role = getRole(user.email);
  if (!role) return (
    <div style={{ minHeight: "100vh", background: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif", flexDirection: "column", gap: "16px" }}>
      <div style={{ color: "#ef4444", fontSize: "16px", fontWeight: 700 }}>⛔ Unauthorized Access</div>
      <button onClick={() => signOut(auth)} style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 600 }}>Sign Out</button>
    </div>
  );

  if (role === "superadmin" || role === "head") return <AdminDashboard user={user} role={role} />;
  return <ManagerDashboard user={user} userProfile={userProfile} />;
}