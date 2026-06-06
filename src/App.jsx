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
  onAuthStateChanged
} from "firebase/auth";

const SUPER_ADMIN = "mohamed817238@gmail.com";
const HEAD_MANAGER = "rania.zaki@te.eg";
const ALLOWED_EMAILS = [
  "mohamed817238@gmail.com",
  "rania.zaki@te.eg",
  "mostafa.ghazy@te.eg",
  "omar.nasr@te.eg",
  "eman.r.hasan@te.eg",
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
  const e = email.toLowerCase();
  if (e === SUPER_ADMIN.toLowerCase()) return "superadmin";
  if (e === HEAD_MANAGER.toLowerCase()) return "head";
  if (ALLOWED_EMAILS.map(x => x.toLowerCase()).includes(e)) return "manager";
  return null;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inputStyle = {
    background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "10px",
    color: "#e2e8f0", padding: "12px 14px", fontSize: "14px", width: "100%",
    outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box",
  };

  const submit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please fill all fields"); return; }
    const role = getRole(email.trim());
    if (!role) { setError("This email is not authorized to access this app."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        if (!name.trim()) { setError("Please enter your name"); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await addDoc(collection(db, "users"), {
          uid: cred.user.uid, email: email.trim().toLowerCase(),
          name: name.trim(), role,
        });
      }
    } catch (e) {
      setError(e.message.replace("Firebase: ", "").replace(/\(auth.*\)\.?/, "").trim());
    }
    setLoading(false);
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
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "9px", background: mode === m ? "#1d4ed8" : "none", color: mode === m ? "#fff" : "#64748b", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "13px" }}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {mode === "signup" && <input style={inputStyle} placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} />}
            <input style={inputStyle} placeholder="Work Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <input style={inputStyle} placeholder="Password (min 6 chars)" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
            {error && <div style={{ color: "#ef4444", fontSize: "12px", padding: "10px 12px", background: "#1a0a0a", borderRadius: "8px", border: "1px solid #7f1d1d" }}>{error}</div>}
            <button onClick={submit} disabled={loading} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "13px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Sora',sans-serif", fontWeight: 700, fontSize: "14px", opacity: loading ? 0.7 : 1, marginTop: "4px" }}>
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>
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
      {task.dueDate && <div style={{ color: status === "Overdue" ? "#ef4444" : "#64748b", fontSize: "11px", marginBottom: total > 0 ? "10px" : "0" }}>📅 {task.dueDate}</div>}
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
function TaskDetail({ task, onClose, onUpdate, onDelete, readOnly }) {
  const [localTask, setLocalTask] = useState({ ...task, checklist: (task.checklist || []).map(c => ({ ...c })) });
  const [newItem, setNewItem] = useState("");
  const status = getTaskStatus(localTask);
  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <Modal title={readOnly ? "Task View" : "Task Details"} onClose={() => { if (!readOnly) onUpdate(localTask); onClose(); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ color: STATUS_COLORS[status], background: STATUS_COLORS[status] + "18", padding: "6px 20px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: `1px solid ${STATUS_COLORS[status]}40` }}>● {status}</span>
        </div>
        <div><label style={labelStyle}>Title</label>
          {readOnly
            ? <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>{localTask.title}</div>
            : <input style={inputStyle} value={localTask.title} onChange={e => setLocalTask(t => ({ ...t, title: e.target.value }))} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div><label style={labelStyle}>Priority</label>
            {readOnly
              ? <div style={{ color: PRIORITY_COLORS[localTask.priority], fontWeight: 600 }}>{localTask.priority}</div>
              : <select style={{ ...inputStyle, cursor: "pointer" }} value={localTask.priority || "Medium"} onChange={e => setLocalTask(t => ({ ...t, priority: e.target.value }))}>
                {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
              </select>}
          </div>
          <div><label style={labelStyle}>Due Date</label>
            {readOnly
              ? <div style={{ color: "#e2e8f0", fontSize: "13px" }}>{localTask.dueDate || "No date"}</div>
              : <input type="date" style={inputStyle} value={localTask.dueDate || ""} onChange={e => setLocalTask(t => ({ ...t, dueDate: e.target.value }))} />}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Checklist ({(localTask.checklist || []).filter(c => c.done).length}/{(localTask.checklist || []).length})</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
            {(localTask.checklist || []).map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0a1120", borderRadius: "8px", padding: "8px 12px", border: "1px solid #1e3a5f" }}>
                <input type="checkbox" checked={item.done} onChange={() => !readOnly && setLocalTask(t => ({ ...t, checklist: t.checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c) }))} style={{ accentColor: "#3b82f6", width: "15px", height: "15px", cursor: readOnly ? "default" : "pointer", flexShrink: 0 }} />
                <span style={{ color: item.done ? "#475569" : "#cbd5e1", fontSize: "13px", flex: 1, textDecoration: item.done ? "line-through" : "none" }}>{item.text}</span>
                {!readOnly && <button onClick={() => setLocalTask(t => ({ ...t, checklist: t.checklist.filter(c => c.id !== item.id) }))} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "14px" }}>✕</button>}
              </div>
            ))}
            {(localTask.checklist || []).length === 0 && <div style={{ color: "#334155", fontSize: "12px", textAlign: "center", padding: "12px" }}>No checklist items</div>}
          </div>
          {!readOnly && (
            <div style={{ display: "flex", gap: "8px" }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Add item..." value={newItem} onChange={e => setNewItem(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { setLocalTask(t => ({ ...t, checklist: [...(t.checklist || []), { id: Date.now(), text: newItem.trim(), done: false }] })); setNewItem(""); } }} />
              <button onClick={() => { if (newItem.trim()) { setLocalTask(t => ({ ...t, checklist: [...(t.checklist || []), { id: Date.now(), text: newItem.trim(), done: false }] })); setNewItem(""); } }}
                style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Add</button>
            </div>
          )}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => { onUpdate(localTask); onClose(); }} style={{ flex: 1, background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "11px", cursor: "pointer", fontWeight: 700, fontSize: "13px" }}>Save Changes</button>
            <button onClick={() => { onDelete(task.id); onClose(); }} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "11px 16px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Delete</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard({ user, userProfile }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "" });
  const [mobile, setMobile] = useState(isMobile());

  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener("resize", handleResize);
    const q1 = query(collection(db, "projects"), where("ownerUid", "==", user.uid));
    const unsub1 = onSnapshot(q1, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(data);
      if (data.length > 0 && !activeProject) setActiveProject(data[0]);
    });
    const q2 = query(collection(db, "tasks"), where("ownerUid", "==", user.uid));
    const unsub2 = onSnapshot(q2, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, [user.uid]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    const ref = await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(), ownerUid: user.uid,
      ownerName: userProfile?.name || user.email,
      ownerEmail: user.email, createdAt: new Date().toISOString().slice(0, 10),
    });
    setActiveProject({ id: ref.id, name: newProjectName.trim(), ownerUid: user.uid, ownerName: userProfile?.name || user.email });
    setNewProjectName(""); setShowNewProject(false);
  };

  const createTask = async () => {
    if (!newTask.title.trim() || !activeProject) return;
    await addDoc(collection(db, "tasks"), {
      ...newTask, projectId: activeProject.id, projectName: activeProject.name,
      ownerUid: user.uid, ownerName: userProfile?.name || user.email,
      ownerEmail: user.email, status: "Pending", checklist: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewTask({ title: "", priority: "Medium", dueDate: "" }); setShowNewTask(false);
  };

  const updateTask = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) });
  };
  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));
  const deleteProject = async (id) => {
    await deleteDoc(doc(db, "projects", id));
    setActiveProject(projects.find(p => p.id !== id) || null);
  };

  const projectTasks = tasks.filter(t => t.projectId === activeProject?.id);
  const pending = projectTasks.filter(t => getTaskStatus(t) === "Pending").length;
  const done = projectTasks.filter(t => getTaskStatus(t) === "Done").length;
  const overdue = projectTasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const pct = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;

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
          <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Projects:</span>
          {projects.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p)} style={{ background: activeProject?.id === p.id ? "#1d4ed8" : "#0f1724", color: activeProject?.id === p.id ? "#fff" : "#94a3b8", border: `1px solid ${activeProject?.id === p.id ? "#2563eb" : "#1e3a5f"}`, borderRadius: "20px", padding: "6px 16px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>{p.name}</button>
          ))}
          <button onClick={() => setShowNewProject(true)} style={{ background: "none", color: "#3b82f6", border: "1px dashed #1e3a5f", borderRadius: "20px", padding: "6px 16px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>+ New Project</button>
        </div>

        {activeProject ? (
          <>
            <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: 800, color: "#f1f5f9" }}>{activeProject.name}</div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>📅 Created {activeProject.createdAt}</div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setShowNewTask(true)} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Add Task</button>
                  <button onClick={() => deleteProject(activeProject.id)} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "8px 12px", cursor: "pointer", fontSize: "12px" }}>🗑</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "16px" }}>
                {[{ label: "Pending", value: pending, color: "#facc15", icon: "⏳" }, { label: "Done", value: done, color: "#22c55e", icon: "✅" }, { label: "Overdue", value: overdue, color: "#ef4444", icon: "🔴" }].map(s => (
                  <div key={s.label} style={{ background: "#0a1120", borderRadius: "10px", padding: "12px", display: "flex", alignItems: "center", gap: "8px", border: "1px solid #1e3a5f" }}>
                    <span style={{ fontSize: "16px" }}>{s.icon}</span>
                    <div><div style={{ fontSize: "20px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>Progress</span>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>{pct}% ({done}/{projectTasks.length} tasks)</span>
                </div>
                <div style={{ background: "#1e3a5f", borderRadius: "99px", height: "8px" }}>
                  <div style={{ width: `${pct}%`, height: "8px", borderRadius: "99px", background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.4s" }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3,1fr)", gap: "14px" }}>
              {["Pending", "Done", "Overdue"].map(status => (
                <div key={status}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: STATUS_COLORS[status] }} />
                    <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>{status}</span>
                    <span style={{ background: "#1e3a5f", color: "#64748b", borderRadius: "99px", padding: "1px 7px", fontSize: "11px", fontWeight: 700, marginLeft: "auto" }}>{projectTasks.filter(t => getTaskStatus(t) === status).length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {projectTasks.filter(t => getTaskStatus(t) === status).map(t => <TaskCard key={t.id} task={t} onOpen={setSelectedTask} />)}
                    {projectTasks.filter(t => getTaskStatus(t) === status).length === 0 && (
                      <div style={{ border: "2px dashed #1e3a5f", borderRadius: "12px", padding: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>No tasks</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#475569" }}>
            <div style={{ fontSize: "56px", marginBottom: "16px" }}>📁</div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#64748b" }}>No projects yet</div>
            <div style={{ fontSize: "13px", marginTop: "8px" }}>Click "+ New Project" to get started</div>
          </div>
        )}
      </div>

      {showNewProject && (
        <Modal title="New Project" onClose={() => setShowNewProject(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Project Name</label><input style={inputStyle} placeholder="Enter project name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProject()} autoFocus /></div>
            <button onClick={createProject} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Create Project</button>
          </div>
        </Modal>
      )}

      {showNewTask && (
        <Modal title={`New Task — ${activeProject?.name}`} onClose={() => setShowNewTask(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div><label style={labelStyle}>Task Title</label><input style={inputStyle} placeholder="Enter task title..." value={newTask.title} onChange={e => setNewTask(t => ({ ...t, title: e.target.value }))} autoFocus /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div><label style={labelStyle}>Priority</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={newTask.priority} onChange={e => setNewTask(t => ({ ...t, priority: e.target.value }))}>
                  {["Low", "Medium", "High", "Critical"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Due Date</label><input type="date" style={inputStyle} value={newTask.dueDate} onChange={e => setNewTask(t => ({ ...t, dueDate: e.target.value }))} /></div>
            </div>
            <button onClick={createTask} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Add Task</button>
          </div>
        </Modal>
      )}

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} />}
    </div>
  );
}

// ─── OVERVIEW DASHBOARD (Head + Super Admin) ──────────────────────────────────
function OverviewDashboard({ user, role }) {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedManager, setSelectedManager] = useState("All");
  const [selectedTask, setSelectedTask] = useState(null);
  const [mobile, setMobile] = useState(isMobile());

  useEffect(() => {
    const handleResize = () => setMobile(isMobile());
    window.addEventListener("resize", handleResize);
    const unsub1 = onSnapshot(collection(db, "projects"), snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsub2 = onSnapshot(collection(db, "tasks"), snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, []);

  const managers = [...new Set(projects.map(p => p.ownerName))].filter(Boolean);
  const filteredProjects = selectedManager === "All" ? projects : projects.filter(p => p.ownerName === selectedManager);
  const isSuper = role === "superadmin";

  return (
    <div style={{ minHeight: "100vh", background: "#070d18", fontFamily: "'Sora',sans-serif", color: "#e2e8f0" }}>
      <div style={{ background: `linear-gradient(180deg,${isSuper ? "#1a0a28" : "#0a1528"},#070d18)`, borderBottom: "1px solid #1e3a5f", padding: `0 ${mobile ? "16px" : "32px"}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: isSuper ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "linear-gradient(135deg,#f97316,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: "#fff" }}>{isSuper ? "★" : "H"}</div>
            <div>
              <div style={{ fontSize: mobile ? "12px" : "14px", fontWeight: 800, color: "#f1f5f9" }}>{isSuper ? "Super Admin" : "Head Manager"} — Overview</div>
              <div style={{ fontSize: "9px", color: isSuper ? "#a855f7" : "#f97316", letterSpacing: "1px", textTransform: "uppercase" }}>{user.email}</div>
            </div>
          </div>
          <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total Projects", value: projects.length, color: "#3b82f6", icon: "📁" },
            { label: "Total Tasks", value: tasks.length, color: "#a855f7", icon: "📋" },
            { label: "Done", value: tasks.filter(t => getTaskStatus(t) === "Done").length, color: "#22c55e", icon: "✅" },
            { label: "Overdue", value: tasks.filter(t => getTaskStatus(t) === "Overdue").length, color: "#ef4444", icon: "🔴" },
          ].map(s => (
            <div key={s.label} style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{s.icon}</div>
              <div><div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>Filter by Manager:</span>
          {["All", ...managers].map(m => (
            <button key={m} onClick={() => setSelectedManager(m)} style={{ background: selectedManager === m ? "#1d4ed8" : "#0f1724", color: selectedManager === m ? "#fff" : "#94a3b8", border: `1px solid ${selectedManager === m ? "#2563eb" : "#1e3a5f"}`, borderRadius: "20px", padding: "6px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>{m}</button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filteredProjects.map(project => {
            const ptasks = tasks.filter(t => t.projectId === project.id);
            const pdone = ptasks.filter(t => getTaskStatus(t) === "Done").length;
            const poverdue = ptasks.filter(t => getTaskStatus(t) === "Overdue").length;
            const ppending = ptasks.filter(t => getTaskStatus(t) === "Pending").length;
            const ppct = ptasks.length ? Math.round((pdone / ptasks.length) * 100) : 0;
            return (
              <div key={project.id} style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: "1px solid #1e3a5f", borderRadius: "16px", padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9" }}>{project.name}</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>👤 {project.ownerName} · 📅 {project.createdAt}</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ color: "#facc15", fontSize: "11px", background: "#facc1518", padding: "3px 10px", borderRadius: "20px" }}>⏳ {ppending}</span>
                    <span style={{ color: "#22c55e", fontSize: "11px", background: "#22c55e18", padding: "3px 10px", borderRadius: "20px" }}>✅ {pdone}</span>
                    {poverdue > 0 && <span style={{ color: "#ef4444", fontSize: "11px", background: "#ef444418", padding: "3px 10px", borderRadius: "20px" }}>🔴 {poverdue}</span>}
                  </div>
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ color: "#94a3b8", fontSize: "11px" }}>Progress</span>
                    <span style={{ color: "#94a3b8", fontSize: "11px" }}>{ppct}% · {ptasks.length} tasks</span>
                  </div>
                  <div style={{ background: "#1e3a5f", borderRadius: "99px", height: "6px" }}>
                    <div style={{ width: `${ppct}%`, height: "6px", borderRadius: "99px", background: ppct === 100 ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.4s" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(200px,1fr))", gap: "8px" }}>
                  {ptasks.map(t => <TaskCard key={t.id} task={t} onOpen={setSelectedTask} />)}
                  {ptasks.length === 0 && <div style={{ color: "#334155", fontSize: "12px", padding: "12px" }}>No tasks yet</div>}
                </div>
              </div>
            );
          })}
          {filteredProjects.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px", color: "#475569" }}>
              <div style={{ fontSize: "56px" }}>📭</div>
              <div style={{ fontSize: "15px", fontWeight: 600, marginTop: "12px" }}>No projects yet</div>
            </div>
          )}
        </div>
      </div>
      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={() => {}} onDelete={() => {}} readOnly />}
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
  if (role === "superadmin" || role === "head") return <OverviewDashboard user={user} role={role} />;
  if (role === "manager") return <ManagerDashboard user={user} userProfile={userProfile} />;

  return (
    <div style={{ minHeight: "100vh", background: "#070d18", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Sora',sans-serif", color: "#ef4444", fontSize: "16px" }}>
      ⛔ Unauthorized. Please contact your administrator.
    </div>
  );
}