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

const SUPER_ADMIN = "mohamed817238@gmail.com";
const HEAD_MANAGER = "rania.zaki@te.eg";
const LOWER_MANAGERS = [
  { email: "mostafa.ghazy@te.eg", name: "Mostafa Ghazy" },
  { email: "omar.nasr@te.eg", name: "Omar Nasr" },
  { email: "eman.r.hasan@te.eg", name: "Eman Hasan" },
];
const ALLOWED_EMAILS = [
  SUPER_ADMIN,
  HEAD_MANAGER,
  ...LOWER_MANAGERS.map(m => m.email),
];

const isMobile = () => window.innerWidth < 768;

const PRIORITY_COLORS = {
  Low: "#4ade80", Medium: "#facc15", High: "#f97316", Critical: "#ef4444",
};
const STATUS_COLORS = {
  Pending: "#facc15", Done: "#22c55e", Overdue: "#ef4444",
};

function getTaskStatus(task) {
  if (task.status === "Done") return "Done";
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
        } catch (e) { console.log("profile save error", e); }
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
    } catch (e) { setError("Could not send reset email. Check the address."); }
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
              {error && <div style={{ color: "#ef4444", fontSize: "12px", padding: "10px 12px", background: "#1a0a0a", borderRadius: "8px" }}>{error}</div>}
              {success && <div style={{ color: "#22c55e", fontSize: "12px", padding: "10px 12px", background: "#0a1a0a", borderRadius: "8px" }}>{success}</div>}
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

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, onOpen }) {
  const status = getTaskStatus(task);
  const done = (task.checklist || []).filter(c => c.done).length;
  const total = (task.checklist || []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div onClick={() => onOpen(task)} style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${status === "Overdue" ? "#7f1d1d" : "#1e3a5f"}`, borderRadius: "12px", padding: "14px 16px", cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ color: PRIORITY_COLORS[task.priority] || "#facc15", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", background: (PRIORITY_COLORS[task.priority] || "#facc15") + "18", padding: "3px 8px", borderRadius: "20px" }}>{task.priority || "Medium"}</span>
        <span style={{ color: STATUS_COLORS[status], fontSize: "10px", fontWeight: 700 }}>● {status}</span>
      </div>
      <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "13px", marginBottom: "8px", lineHeight: 1.4 }}>{task.title}</div>
      {task.dueDate && <div style={{ color: status === "Overdue" ? "#ef4444" : "#64748b", fontSize: "11px", marginBottom: total > 0 ? "10px" : 0 }}>📅 {task.dueDate}</div>}
      {task.assignedBy && <div style={{ color: "#475569", fontSize: "10px", marginBottom: total > 0 ? "8px" : 0 }}>📌 Assigned by {task.assignedBy}</div>}
      {total > 0 && (
        <div>
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
  );
}

// ─── TASK DETAIL ──────────────────────────────────────────────────────────────
function TaskDetail({ task, onClose, onUpdate, onDelete, currentUserEmail }) {
  const [localTask, setLocalTask] = useState({ ...task, checklist: (task.checklist || []).map(c => ({ ...c })) });
  const [newItem, setNewItem] = useState("");
  const status = getTaskStatus(localTask);
  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  const role = getRole(currentUserEmail);
  const isAdmin = role === "superadmin" || role === "head";
  const isOwner = task.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase();
  const isAssignedByMe = task.assignedByEmail?.toLowerCase() === currentUserEmail?.toLowerCase();
  const canDelete = isAdmin || isOwner || isAssignedByMe;
  const canEdit = isAdmin || isOwner;
  // Lower manager can mark checklist done even on assigned tasks
  const canCheckList = isAdmin || isOwner || task.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase() ||
    task.assignedToEmail?.toLowerCase() === currentUserEmail?.toLowerCase();

  return (
    <Modal title="Task Details" onClose={() => { onUpdate(localTask); onClose(); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ color: STATUS_COLORS[status], background: STATUS_COLORS[status] + "18", padding: "6px 20px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: `1px solid ${STATUS_COLORS[status]}40` }}>● {status}</span>
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
                  onChange={() => canCheckList && setLocalTask(t => ({ ...t, checklist: t.checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c) }))}
                  style={{ accentColor: "#3b82f6", width: "15px", height: "15px", cursor: canCheckList ? "pointer" : "default", flexShrink: 0 }} />
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

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => { onUpdate(localTask); onClose(); }} style={{ flex: 1, background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>Save</button>
          {canDelete && <button onClick={() => { onDelete(task.id); onClose(); }} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "11px 16px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Delete</button>}
        </div>
      </div>
    </Modal>
  );
}

// ─── PROJECT SECTION ──────────────────────────────────────────────────────────
function ProjectSection({ project, tasks, onSelectTask, onDeleteProject, onAddTask, currentUserEmail, mobile }) {
  const role = getRole(currentUserEmail);
  const isAdmin = role === "superadmin" || role === "head";
  const canDeleteProject = isAdmin
    ? true
    : project.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase() && !project.assignedBy;

  const ptasks = tasks.filter(t => t.projectId === project.id);
  const done = ptasks.filter(t => getTaskStatus(t) === "Done").length;
  const overdue = ptasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const pending = ptasks.filter(t => getTaskStatus(t) === "Pending").length;
  const pct = ptasks.length ? Math.round((done / ptasks.length) * 100) : 0;

  return (
    <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9" }}>{project.name}</div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
            {project.ownerName && `👤 ${project.ownerName}`}
            {project.assignedBy && <span style={{ color: "#3b82f6" }}> · 📌 by {project.assignedBy}</span>}
            {project.createdAt && ` · 📅 ${project.createdAt}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {(isAdmin || project.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase()) &&
            <button onClick={() => onAddTask(project)} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Task</button>}
          {canDeleteProject &&
            <button onClick={() => onDeleteProject(project.id)} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "7px 12px", cursor: "pointer", fontSize: "13px" }}>🗑</button>}
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
        {ptasks.map(t => <TaskCard key={t.id} task={t} onOpen={onSelectTask} />)}
        {ptasks.length === 0 && <div style={{ color: "#334155", fontSize: "12px", padding: "16px", textAlign: "center", border: "2px dashed #1e3a5f", borderRadius: "10px" }}>No tasks yet</div>}
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
            <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Sign Out</button>
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
            <ProjectSection key={project.id} project={project} tasks={tasks} onSelectTask={setSelectedTask}
              onDeleteProject={deleteProject} onAddTask={setNewTaskProject}
              currentUserEmail={user.email} mobile={mobile} />
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

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} currentUserEmail={user.email} />}
    </div>
  );
}

// ─── ADMIN / HEAD DASHBOARD ───────────────────────────────────────────────────
function AdminDashboard({ user, role }) {
  const [allProjects, setAllProjects] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedManagerEmail, setSelectedManagerEmail] = useState("all");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskProject, setNewTaskProject] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTarget, setNewProjectTarget] = useState(LOWER_MANAGERS[0].email);
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "" });
  const [newTaskTarget, setNewTaskTarget] = useState(LOWER_MANAGERS[0].email);
  const [mobile, setMobile] = useState(isMobile());

  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener("resize", handleResize);
    const unsub1 = onSnapshot(collection(db, "projects"), snap => setAllProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsub2 = onSnapshot(collection(db, "tasks"), snap => setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, []);

  const isSuper = role === "superadmin";
  const accentColor = isSuper ? "#a855f7" : "#f97316";

  const filteredProjects = selectedManagerEmail === "all"
    ? allProjects
    : allProjects.filter(p => p.ownerEmail?.toLowerCase() === selectedManagerEmail.toLowerCase());

  const createProjectForManager = async () => {
    if (!newProjectName.trim()) return;
    const target = LOWER_MANAGERS.find(m => m.email.toLowerCase() === newProjectTarget.toLowerCase());
    await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(),
      ownerEmail: newProjectTarget.toLowerCase(),
      ownerName: target?.name || newProjectTarget,
      assignedBy: user.email === SUPER_ADMIN ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewProjectName(""); setShowNewProject(false);
  };

  const createTaskForManager = async () => {
    if (!newTask.title.trim() || !newTaskProject) return;
    const target = LOWER_MANAGERS.find(m => m.email.toLowerCase() === newTaskTarget.toLowerCase());
    await addDoc(collection(db, "tasks"), {
      ...newTask,
      projectId: newTaskProject.id,
      projectName: newTaskProject.name,
      ownerEmail: newTaskProject.ownerEmail,
      ownerName: newTaskProject.ownerName,
      assignedBy: user.email === SUPER_ADMIN ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      status: "Pending", checklist: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewTask({ title: "", priority: "Medium", dueDate: "" });
    setNewTaskProject(null);
  };

  const updateTask = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) });
  };

  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));

  const deleteProject = async (id) => {
    const projectTasks = allTasks.filter(t => t.projectId === id);
    await Promise.all(projectTasks.map(t => deleteDoc(doc(db, "tasks", t.id))));
    await deleteDoc(doc(db, "projects", id));
  };

  const totalDone = allTasks.filter(t => getTaskStatus(t) === "Done").length;
  const totalOverdue = allTasks.filter(t => getTaskStatus(t) === "Overdue").length;

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
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowNewProject(true)} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Project</button>
            <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px" }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total Projects", value: allProjects.length, color: "#3b82f6", icon: "📁" },
            { label: "Total Tasks", value: allTasks.length, color: "#a855f7", icon: "📋" },
            { label: "Done", value: totalDone, color: "#22c55e", icon: "✅" },
            { label: "Overdue", value: totalOverdue, color: "#ef4444", icon: "🔴" },
          ].map(s => (
            <div key={s.label} style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "14px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{s.icon}</div>
              <div><div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
            </div>
          ))}
        </div>

        {/* Manager Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>View Manager:</span>
          <select value={selectedManagerEmail} onChange={e => setSelectedManagerEmail(e.target.value)}
            style={{ background: "#0f1724", border: `1px solid ${accentColor}40`, borderRadius: "10px", color: "#e2e8f0", padding: "8px 14px", fontSize: "13px", outline: "none", fontFamily: "'Sora',sans-serif", cursor: "pointer", minWidth: "200px" }}>
            <option value="all">👥 All Managers</option>
            {LOWER_MANAGERS.map(m => <option key={m.email} value={m.email}>👤 {m.name}</option>)}
          </select>
        </div>

        {/* Projects */}
        {filteredProjects.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px", color: "#475569" }}>
            <div style={{ fontSize: "56px" }}>📭</div>
            <div style={{ fontSize: "15px", fontWeight: 600, marginTop: "12px" }}>No projects found</div>
          </div>
        ) : (
          filteredProjects.map(project => (
            <ProjectSection key={project.id} project={project} tasks={allTasks}
              onSelectTask={setSelectedTask} onDeleteProject={deleteProject}
              onAddTask={(p) => { setNewTaskProject(p); setNewTaskTarget(p.ownerEmail || LOWER_MANAGERS[0].email); }}
              currentUserEmail={user.email} mobile={mobile} />
          ))
        )}
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <Modal title="Assign New Project" onClose={() => setShowNewProject(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Assign To</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={newProjectTarget} onChange={e => setNewProjectTarget(e.target.value)}>
                {LOWER_MANAGERS.map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
              </select></div>
            <div><label style={labelStyle}>Project Name</label>
              <input style={inputStyle} placeholder="Enter project name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProjectForManager()} autoFocus /></div>
            <button onClick={createProjectForManager} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Create & Assign Project</button>
          </div>
        </Modal>
      )}

      {/* New Task Modal */}
      {newTaskProject && (
        <Modal title={`Add Task — ${newTaskProject.name}`} onClose={() => setNewTaskProject(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#0a1120", borderRadius: "8px", padding: "10px 12px", border: "1px solid #1e3a5f", fontSize: "12px", color: "#64748b" }}>
              📁 Project: <span style={{ color: "#3b82f6", fontWeight: 600 }}>{newTaskProject.name}</span> · 👤 <span style={{ color: "#94a3b8" }}>{newTaskProject.ownerName}</span>
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

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} currentUserEmail={user.email} />}
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