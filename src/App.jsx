
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

function daysOverdue(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.floor((today - due) / (1000 * 60 * 60 * 24));
}

// ─── EXPORT REPORT ────────────────────────────────────────────────────────────
function exportReport(projects, tasks) {
  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString("en-GB");

  const pendingOverdueTasks = tasks.filter(t => {
    const s = getTaskStatus(t);
    return s === "Pending" || s === "Overdue";
  });

  const tasksByOwner = {};
  pendingOverdueTasks.forEach(t => {
    const owner = t.ownerName || t.ownerEmail || "Unknown";
    if (!tasksByOwner[owner]) tasksByOwner[owner] = [];
    tasksByOwner[owner].push(t);
  });

  const taskRows = [];
  Object.entries(tasksByOwner).forEach(([owner, ownerTasks]) => {
    taskRows.push({ "Owner": `── ${owner} ──`, "Project": "", "Task": "", "Priority": "", "Status": "", "Due Date": "", "Days Overdue": "", "Created": "" });
    ownerTasks.forEach(t => {
      const s = getTaskStatus(t);
      taskRows.push({
        "Owner": owner,
        "Project": t.projectName || "-",
        "Task": t.title || "-",
        "Priority": t.priority || "-",
        "Status": s,
        "Due Date": t.dueDate || "-",
        "Days Overdue": s === "Overdue" ? daysOverdue(t.dueDate) : "-",
        "Created": t.createdAt || "-",
      });
    });
    taskRows.push({ "Owner": "" });
  });

  if (taskRows.length === 0) taskRows.push({ "Owner": "No pending or overdue tasks", "Project": "", "Task": "", "Priority": "", "Status": "", "Due Date": "", "Days Overdue": "", "Created": "" });

  const wsTask = XLSX.utils.json_to_sheet(taskRows);
  wsTask["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsTask, "Pending Tasks");

  const pendingProjects = projects.filter(p => (p.status || "Pending") === "Pending");
  const projectsByOwner = {};
  pendingProjects.forEach(p => {
    const owner = p.ownerName || p.ownerEmail || "Unknown";
    if (!projectsByOwner[owner]) projectsByOwner[owner] = [];
    projectsByOwner[owner].push(p);
  });

  const projectRows = [];
  Object.entries(projectsByOwner).forEach(([owner, ownerProjects]) => {
    projectRows.push({ "Owner": `── ${owner} ──`, "Project Name": "", "Total Tasks": "", "Pending": "", "Overdue": "", "Progress %": "", "Created": "", "Assigned By": "" });
    ownerProjects.forEach(p => {
      const pt = tasks.filter(t => t.projectId === p.id);
      const d = pt.filter(t => getTaskStatus(t) === "Done").length;
      const ov = pt.filter(t => getTaskStatus(t) === "Overdue").length;
      const pe = pt.filter(t => getTaskStatus(t) === "Pending").length;
      const pct = pt.length ? Math.round((d / pt.length) * 100) : 0;
      projectRows.push({
        "Owner": owner, "Project Name": p.name || "-",
        "Total Tasks": pt.length, "Pending": pe, "Overdue": ov,
        "Progress %": `${pct}%`, "Created": p.createdAt || "-",
        "Assigned By": p.assignedBy || "Self",
      });
    });
    projectRows.push({ "Owner": "" });
  });

  if (projectRows.length === 0) projectRows.push({ "Owner": "No pending projects" });
  const wsProject = XLSX.utils.json_to_sheet(projectRows);
  wsProject["!cols"] = [{ wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsProject, "Pending Projects");

  const summaryRows = [
    { "Summary": `WE Telecom Egypt — Report Generated: ${today}`, " ": "" },
    { "Summary": "", " ": "" },
    { "Summary": "TASKS SUMMARY", " ": "" },
  ];
  LOWER_MANAGERS.forEach(m => {
    const mt = tasks.filter(t => t.ownerEmail?.toLowerCase() === m.email.toLowerCase());
    const pe = mt.filter(t => getTaskStatus(t) === "Pending").length;
    const ov = mt.filter(t => getTaskStatus(t) === "Overdue").length;
    summaryRows.push({ "Summary": m.name, " ": `Pending: ${pe} | Overdue: ${ov} | Total: ${pe + ov}` });
  });
  summaryRows.push({ "Summary": "", " ": "" });
  summaryRows.push({ "Summary": "PROJECTS SUMMARY", " ": "" });
  LOWER_MANAGERS.forEach(m => {
    const mp = projects.filter(p => p.ownerEmail?.toLowerCase() === m.email.toLowerCase() && (p.status || "Pending") === "Pending");
    summaryRows.push({ "Summary": m.name, " ": `Pending Projects: ${mp.length}` });
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 35 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
  XLSX.writeFile(wb, `WE_Telecom_Report_${today.replace(/\//g, "-")}.xlsx`);
}

// ─── OVERDUE PANEL ────────────────────────────────────────────────────────────
function OverduePanel({ tasks, projects, onClose }) {
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [expandedType, setExpandedType] = useState("tasks");

  const overdueTasks = tasks.filter(t => getTaskStatus(t) === "Overdue");
  const overdueProjects = projects.filter(p => {
    const pt = tasks.filter(t => t.projectId === p.id);
    return (p.status || "Pending") === "Pending" && pt.some(t => getTaskStatus(t) === "Overdue");
  });

  const personData = LOWER_MANAGERS.map(m => {
    const mTasks = overdueTasks.filter(t => t.ownerEmail?.toLowerCase() === m.email.toLowerCase());
    const mProjects = overdueProjects.filter(p => p.ownerEmail?.toLowerCase() === m.email.toLowerCase());
    return { ...m, tasks: mTasks, projects: mProjects, total: mTasks.length + mProjects.length };
  }).filter(p => p.total > 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#0f1724", border: "1px solid #7f1d1d", borderRadius: "16px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #7f1d1d", background: "#1a0a0a", borderRadius: "16px 16px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🔴</span>
            <span style={{ color: "#ef4444", fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: "16px" }}>Overdue Report</span>
            <span style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440", borderRadius: "20px", padding: "2px 10px", fontSize: "11px", fontWeight: 700 }}>{overdueTasks.length} tasks</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px" }}>✕</button>
        </div>

        <div style={{ padding: "16px 20px" }}>
          {personData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#475569" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>No overdue items!</div>
            </div>
          ) : (
            personData.map(person => (
              <div key={person.email} style={{ marginBottom: "12px", border: "1px solid #7f1d1d", borderRadius: "12px", overflow: "hidden" }}>
                {/* Person Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "#1a0a0a", cursor: "pointer" }}
                  onClick={() => setExpandedPerson(expandedPerson === person.email ? null : person.email)}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#ef444418", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>👤</div>
                    <div>
                      <div style={{ color: "#f1f5f9", fontWeight: 700, fontSize: "14px" }}>{person.name}</div>
                      <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                        {person.tasks.length > 0 && `${person.tasks.length} overdue task${person.tasks.length > 1 ? "s" : ""}`}
                        {person.tasks.length > 0 && person.projects.length > 0 && " · "}
                        {person.projects.length > 0 && `${person.projects.length} project${person.projects.length > 1 ? "s" : ""} with overdue tasks`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ background: "#ef444420", color: "#ef4444", border: "1px solid #ef444440", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", fontWeight: 800 }}>{person.total}</span>
                    <span style={{ color: "#64748b", fontSize: "16px" }}>{expandedPerson === person.email ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedPerson === person.email && (
                  <div style={{ padding: "12px 16px", background: "#0a1120" }}>
                    {/* Tab switcher */}
                    {person.tasks.length > 0 && person.projects.length > 0 && (
                      <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                        {["tasks", "projects"].map(type => (
                          <button key={type} onClick={() => setExpandedType(type)}
                            style={{ background: expandedType === type ? "#ef4444" : "#0f1724", color: expandedType === type ? "#fff" : "#64748b", border: `1px solid ${expandedType === type ? "#ef4444" : "#1e3a5f"}`, borderRadius: "8px", padding: "5px 14px", cursor: "pointer", fontSize: "11px", fontWeight: 700, fontFamily: "'Sora',sans-serif", textTransform: "capitalize" }}>
                            {type === "tasks" ? `Tasks (${person.tasks.length})` : `Projects (${person.projects.length})`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Tasks List */}
                    {(person.tasks.length === 0 || expandedType === "tasks") && person.tasks.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {person.tasks.sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate)).map(task => {
                          const days = daysOverdue(task.dueDate);
                          const urgencyColor = days > 14 ? "#ef4444" : days > 7 ? "#f97316" : "#facc15";
                          return (
                            <div key={task.id} style={{ background: "#0f1724", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "12px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>{task.title}</div>
                                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                    <span style={{ color: PRIORITY_COLORS[task.priority] || "#facc15", fontSize: "10px", fontWeight: 700, background: (PRIORITY_COLORS[task.priority] || "#facc15") + "18", padding: "2px 8px", borderRadius: "20px" }}>{task.priority || "Medium"}</span>
                                    <span style={{ color: "#64748b", fontSize: "10px" }}>📁 {task.projectName || "-"}</span>
                                    <span style={{ color: "#64748b", fontSize: "10px" }}>📅 Due: {task.dueDate}</span>
                                  </div>
                                </div>
                                <div style={{ background: urgencyColor + "18", border: `1px solid ${urgencyColor}40`, borderRadius: "8px", padding: "6px 10px", textAlign: "center", flexShrink: 0 }}>
                                  <div style={{ color: urgencyColor, fontWeight: 800, fontSize: "16px" }}>{days}</div>
                                  <div style={{ color: urgencyColor, fontSize: "9px", fontWeight: 600 }}>days late</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Projects List */}
                    {expandedType === "projects" && person.projects.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {person.projects.map(project => {
                          const pt = tasks.filter(t => t.projectId === project.id && getTaskStatus(t) === "Overdue");
                          const maxDays = Math.max(...pt.map(t => daysOverdue(t.dueDate)));
                          const urgencyColor = maxDays > 14 ? "#ef4444" : maxDays > 7 ? "#f97316" : "#facc15";
                          return (
                            <div key={project.id} style={{ background: "#0f1724", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "12px 14px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "13px", marginBottom: "4px" }}>📁 {project.name}</div>
                                  <div style={{ color: "#64748b", fontSize: "10px", marginBottom: "6px" }}>📅 Created: {project.createdAt}</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    {pt.sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate)).map(t => {
                                      const d = daysOverdue(t.dueDate);
                                      const uc = d > 14 ? "#ef4444" : d > 7 ? "#f97316" : "#facc15";
                                      return (
                                        <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a1120", borderRadius: "6px", padding: "6px 10px" }}>
                                          <span style={{ color: "#94a3b8", fontSize: "11px" }}>↳ {t.title}</span>
                                          <span style={{ color: uc, fontSize: "10px", fontWeight: 700, background: uc + "18", padding: "2px 8px", borderRadius: "20px" }}>{d}d late</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div style={{ background: urgencyColor + "18", border: `1px solid ${urgencyColor}40`, borderRadius: "8px", padding: "6px 10px", textAlign: "center", flexShrink: 0 }}>
                                  <div style={{ color: urgencyColor, fontWeight: 800, fontSize: "16px" }}>{pt.length}</div>
                                  <div style={{ color: urgencyColor, fontSize: "9px", fontWeight: 600 }}>tasks late</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
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
  const days = status === "Overdue" ? daysOverdue(task.dueDate) : 0;

  return (
    <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${status === "Overdue" ? "#7f1d1d" : status === "Under Review" ? "#6b21a8" : status === "Done" ? "#14532d" : "#1e3a5f"}`, borderRadius: "12px", padding: "14px 16px", transition: "all 0.2s" }}>
      <div onClick={() => onOpen(task)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ color: PRIORITY_COLORS[task.priority] || "#facc15", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", background: (PRIORITY_COLORS[task.priority] || "#facc15") + "18", padding: "3px 8px", borderRadius: "20px" }}>{task.priority || "Medium"}</span>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {status === "Overdue" && days > 0 && (
              <span style={{ color: "#ef4444", fontSize: "10px", fontWeight: 700, background: "#ef444418", padding: "2px 6px", borderRadius: "20px" }}>{days}d late</span>
            )}
            <span style={{ color: STATUS_COLORS[status] || "#64748b", fontSize: "10px", fontWeight: 700 }}>● {status}</span>
          </div>
        </div>
        <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "13px", marginBottom: "8px", lineHeight: 1.4 }}>{task.title}</div>
        {task.dueDate && <div style={{ color: status === "Overdue" ? "#ef4444" : "#64748b", fontSize: "11px", marginBottom: "6px" }}>📅 {task.dueDate}</div>}
        {task.assignedBy && <div style={{ color: "#475569", fontSize: "10px", marginBottom: "4px" }}>📌 by {task.assignedBy}</div>}
        {task.ownerName && isAdmin && <div style={{ color: "#475569", fontSize: "10px", marginBottom: "8px" }}>👤 {task.ownerName}</div>}
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
            style={{ flex: 1, background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>✅ Mark Done</button>
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
        {status === "Under Review" && (
          <div style={{ flex: 1, background: "#1a0a28", color: "#a855f7", border: "1px solid #6b21a840", borderRadius: "8px", padding: "6px", fontSize: "11px", fontWeight: 600, textAlign: "center" }}>🔍 Under Review</div>
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
  const days = status === "Overdue" ? daysOverdue(task.dueDate) : 0;

  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  return (
    <Modal title="Task Details" onClose={() => { if (canEdit) onUpdate(localTask); onClose(); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ color: STATUS_COLORS[status] || "#64748b", background: (STATUS_COLORS[status] || "#64748b") + "18", padding: "6px 20px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: `1px solid ${(STATUS_COLORS[status] || "#64748b")}40` }}>● {status}</span>
          {status === "Overdue" && days > 0 && (
            <span style={{ color: "#ef4444", background: "#ef444418", padding: "6px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: "1px solid #ef444440" }}>⚠ {days} days overdue</span>
          )}
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
  const ownerEmails = project.ownerEmails ? project.ownerEmails.map(e => e.toLowerCase()) : (project.ownerEmail ? [project.ownerEmail.toLowerCase()] : []);
  const isOwner = ownerEmails.includes(currentUserEmail?.toLowerCase());
  const canDeleteProject = isAdmin || (isOwner && !project.assignedBy);
  const canAddTask = isAdmin || isOwner;
  const allProjectTasks = tasks.filter(t => t.projectId === project.id);
  const visibleTasks = isAdmin ? allProjectTasks : allProjectTasks.filter(t => t.ownerEmail?.toLowerCase() === currentUserEmail?.toLowerCase());
  const statTasks = isAdmin ? allProjectTasks : visibleTasks;
  const done = statTasks.filter(t => getTaskStatus(t) === "Done").length;
  const overdue = statTasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const pending = statTasks.filter(t => getTaskStatus(t) === "Pending").length;
  const underReview = statTasks.filter(t => getTaskStatus(t) === "Under Review").length;
  const pct = statTasks.length ? Math.round((done / statTasks.length) * 100) : 0;
  const projectStatus = project.status || "Pending";
  const canMarkProjectDone = (isAdmin || isOwner) && projectStatus === "Pending";
  const canReviewProject = isAdmin && projectStatus === "Done";
  const borderColor = projectStatus === "Done" ? "#14532d" : projectStatus === "Under Review" ? "#6b21a8" : overdue > 0 ? "#7f1d1d" : "#1e3a5f";
  const ownerNames = project.ownerNames ? project.ownerNames : (project.ownerName ? [project.ownerName] : ownerEmails);

  return (
    <div style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${borderColor}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9" }}>{project.name}</div>
            <span style={{ color: STATUS_COLORS[projectStatus] || "#64748b", background: (STATUS_COLORS[projectStatus] || "#64748b") + "18", padding: "3px 10px", borderRadius: "20px", fontSize: "10px", fontWeight: 700 }}>● {projectStatus}</span>
          </div>
          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
            {ownerNames.length > 0 && `👤 ${ownerNames.join(" · ")}`}
            {project.assignedBy && <span style={{ color: "#3b82f6" }}> · 📌 by {project.assignedBy}</span>}
            {project.createdAt && ` · 📅 ${project.createdAt}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {canAddTask && projectStatus === "Pending" && <button onClick={() => onAddTask(project)} style={{ background: "linear-gradient(135deg,#1d4ed8,#2563eb)", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>+ Task</button>}
          {canMarkProjectDone && <button onClick={() => onMarkProjectDone(project)} style={{ background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>✅ Mark Done</button>}
          {canReviewProject && <>
            <button onClick={() => onReviewProject(project, "approve")} style={{ background: "#14532d", color: "#22c55e", border: "1px solid #22c55e40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>✅ Pass</button>
            <button onClick={() => onReviewProject(project, "reject")} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d40", borderRadius: "8px", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: "11px" }}>❌ Reject</button>
          </>}
          {projectStatus === "Done" && !isAdmin && <div style={{ background: "#0a1a0a", color: "#22c55e", border: "1px solid #14532d", borderRadius: "8px", padding: "7px 12px", fontSize: "11px", fontWeight: 600 }}>✅ Completed</div>}
          {canDeleteProject && <button onClick={() => onDeleteProject(project.id)} style={{ background: "#1a0a0a", color: "#ef4444", border: "1px solid #7f1d1d", borderRadius: "8px", padding: "7px 10px", cursor: "pointer", fontSize: "13px" }}>🗑</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${underReview > 0 ? 4 : 3},1fr)`, gap: "8px", marginBottom: "14px" }}>
        {[{ label: "Pending", value: pending, color: "#facc15", icon: "⏳" }, { label: "Done", value: done, color: "#22c55e", icon: "✅" }, { label: "Overdue", value: overdue, color: "#ef4444", icon: "🔴" }, ...(underReview > 0 ? [{ label: "Review", value: underReview, color: "#a855f7", icon: "🔍" }] : [])].map(s => (
          <div key={s.label} style={{ background: "#0a1120", borderRadius: "10px", padding: "10px", display: "flex", alignItems: "center", gap: "8px", border: "1px solid #1e3a5f" }}>
            <span>{s.icon}</span>
            <div><div style={{ fontSize: "18px", fontWeight: 800, color: s.color }}>{s.value}</div><div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>Progress</span>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>{pct}% · {statTasks.length} tasks</span>
        </div>
        <div style={{ background: "#1e3a5f", borderRadius: "99px", height: "6px" }}>
          <div style={{ width: `${pct}%`, height: "6px", borderRadius: "99px", background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.4s" }} />
        </div>
      </div>

      {isAdmin && ownerNames.length > 1 ? (
        ownerEmails.map((ownerEmail, idx) => {
          const ownerTasks = visibleTasks.filter(t => t.ownerEmail?.toLowerCase() === ownerEmail);
          const ownerName = ownerNames[idx] || ownerEmail;
          return (
            <div key={ownerEmail} style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>👤 {ownerName} · {ownerTasks.length} tasks</div>
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(220px,1fr))", gap: "8px" }}>
                {ownerTasks.map(t => (
                  <TaskCard key={t.id} task={t} onOpen={onSelectTask}
                    onMarkDone={async (task) => { await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() }); }}
                    onReview={async (task, action) => { if (action === "approve") await deleteDoc(doc(db, "tasks", task.id)); else await updateDoc(doc(db, "tasks", task.id), { status: "Pending" }); }}
                    currentUserEmail={currentUserEmail} />
                ))}
                {ownerTasks.length === 0 && <div style={{ color: "#334155", fontSize: "12px", padding: "14px", textAlign: "center", border: "2px dashed #1e3a5f", borderRadius: "10px" }}>No tasks for this owner</div>}
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill,minmax(220px,1fr))", gap: "8px" }}>
          {visibleTasks.map(t => (
            <TaskCard key={t.id} task={t} onOpen={onSelectTask}
              onMarkDone={async (task) => { await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() }); }}
              onReview={async (task, action) => { if (action === "approve") await deleteDoc(doc(db, "tasks", task.id)); else await updateDoc(doc(db, "tasks", task.id), { status: "Pending" }); }}
              currentUserEmail={currentUserEmail} />
          ))}
          {visibleTasks.length === 0 && <div style={{ color: "#334155", fontSize: "12px", padding: "20px", textAlign: "center", border: "2px dashed #1e3a5f", borderRadius: "10px" }}>No tasks yet</div>}
        </div>
      )}
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
    const projectMap = new Map();
    const q1a = query(collection(db, "projects"), where("ownerEmails", "array-contains", user.email.toLowerCase()));
    const q1b = query(collection(db, "projects"), where("ownerEmail", "==", user.email.toLowerCase()));
    const unsub1a = onSnapshot(q1a, snap => { snap.docs.forEach(d => projectMap.set(d.id, { id: d.id, ...d.data() })); setProjects(Array.from(projectMap.values())); });
    const unsub1b = onSnapshot(q1b, snap => { snap.docs.forEach(d => { if (!projectMap.has(d.id)) projectMap.set(d.id, { id: d.id, ...d.data() }); }); setProjects(Array.from(projectMap.values())); });
    const q2 = query(collection(db, "tasks"), where("ownerEmail", "==", user.email.toLowerCase()));
    const unsub2 = onSnapshot(q2, snap => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { unsub1a(); unsub1b(); unsub2(); window.removeEventListener("resize", handleResize); };
  }, [user.email]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(), ownerUid: user.uid,
      ownerName: userProfile?.name || user.email,
      ownerEmail: user.email.toLowerCase(),
      ownerEmails: [user.email.toLowerCase()],
      ownerNames: [userProfile?.name || user.email],
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

  const updateTask = async (updated) => { const { id, ...data } = updated; await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) }); };
  const markTaskDone = async (task) => { await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() }); };
  const reviewTask = async (task, action) => { if (action === "approve") await deleteDoc(doc(db, "tasks", task.id)); else await updateDoc(doc(db, "tasks", task.id), { status: "Pending" }); };
  const markProjectDone = (project) => {
    setConfirm({ title: "Mark Project as Done?", message: `"${project.name}" will be sent for review.`, onConfirm: async () => { await updateDoc(doc(db, "projects", project.id), { status: "Done", doneAt: new Date().toISOString() }); setConfirm(null); } });
  };
  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));
  const deleteProject = async (id) => { const pt = tasks.filter(t => t.projectId === id); await Promise.all(pt.map(t => deleteDoc(doc(db, "tasks", t.id)))); await deleteDoc(doc(db, "projects", id)); };

  const inputStyle = { background: "#0a1120", border: "1px solid #1e3a5f", borderRadius: "8px", color: "#e2e8f0", padding: "8px 12px", fontSize: "13px", width: "100%", outline: "none", fontFamily: "'Sora',sans-serif", boxSizing: "border-box" };
  const labelStyle = { color: "#64748b", fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px", display: "block" };

  const myOverdueTasks = tasks.filter(t => getTaskStatus(t) === "Overdue");

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
        {/* My overdue alert */}
        {myOverdueTasks.length > 0 && (
          <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>🔴</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ef4444", fontWeight: 700, fontSize: "13px" }}>You have {myOverdueTasks.length} overdue task{myOverdueTasks.length > 1 ? "s" : ""}</div>
              <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                {myOverdueTasks.sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate)).slice(0, 2).map(t => `${t.title} (${daysOverdue(t.dueDate)}d late)`).join(" · ")}
                {myOverdueTasks.length > 2 && ` · +${myOverdueTasks.length - 2} more`}
              </div>
            </div>
          </div>
        )}

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

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} onMarkDone={markTaskDone} onReview={reviewTask} currentUserEmail={user.email} />}
      {confirm && <ConfirmModal title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} confirmLabel="Yes, Mark Done" confirmColor="#22c55e" />}
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
  const [newTaskOwnerEmail, setNewTaskOwnerEmail] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedOwners, setSelectedOwners] = useState([LOWER_MANAGERS[0].email]);
  const [newTask, setNewTask] = useState({ title: "", priority: "Medium", dueDate: "" });
  const [mobile, setMobile] = useState(isMobile());
  const [confirm, setConfirm] = useState(null);
  const [showOverdue, setShowOverdue] = useState(false);

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
    : allProjects.filter(p => {
      const emails = p.ownerEmails ? p.ownerEmails.map(e => e.toLowerCase()) : (p.ownerEmail ? [p.ownerEmail.toLowerCase()] : []);
      return emails.includes(selectedOwnerEmail.toLowerCase());
    });

  const toggleOwner = (email) => setSelectedOwners(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);

  const createProjectForOwners = async () => {
    if (!newProjectName.trim() || selectedOwners.length === 0) return;
    const ownerDetails = selectedOwners.map(email => {
      const found = LOWER_MANAGERS.find(m => m.email.toLowerCase() === email.toLowerCase());
      return { email: email.toLowerCase(), name: found?.name || email };
    });
    await addDoc(collection(db, "projects"), {
      name: newProjectName.trim(),
      ownerEmail: ownerDetails[0].email, ownerName: ownerDetails[0].name,
      ownerEmails: ownerDetails.map(o => o.email), ownerNames: ownerDetails.map(o => o.name),
      assignedBy: isSuper ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      status: "Pending", createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewProjectName(""); setSelectedOwners([LOWER_MANAGERS[0].email]); setShowNewProject(false);
  };

  const createTaskForOwner = async () => {
    if (!newTask.title.trim() || !newTaskProject || !newTaskOwnerEmail) return;
    const ownerEmails = newTaskProject.ownerEmails || [newTaskProject.ownerEmail];
    const ownerNames = newTaskProject.ownerNames || [newTaskProject.ownerName];
    const ownerIdx = ownerEmails.findIndex(e => e.toLowerCase() === newTaskOwnerEmail.toLowerCase());
    const ownerName = ownerIdx >= 0 ? ownerNames[ownerIdx] : newTaskOwnerEmail;
    await addDoc(collection(db, "tasks"), {
      ...newTask, projectId: newTaskProject.id, projectName: newTaskProject.name,
      ownerEmail: newTaskOwnerEmail.toLowerCase(), ownerName,
      assignedBy: isSuper ? "Super Admin" : "Rania Zaki",
      assignedByEmail: user.email.toLowerCase(),
      status: "Pending", checklist: [], createdAt: new Date().toISOString().slice(0, 10),
    });
    setNewTask({ title: "", priority: "Medium", dueDate: "" }); setNewTaskProject(null); setNewTaskOwnerEmail("");
  };

  const openAddTask = (project) => {
    const oe = project.ownerEmails || (project.ownerEmail ? [project.ownerEmail] : []);
    setNewTaskOwnerEmail(oe[0] || ""); setNewTaskProject(project);
  };

  const updateTask = async (updated) => { const { id, ...data } = updated; await updateDoc(doc(db, "tasks", id), { ...data, status: getTaskStatus(updated) }); };
  const markTaskDone = async (task) => { await updateDoc(doc(db, "tasks", task.id), { status: "Done", doneAt: new Date().toISOString() }); };

  const reviewTask = (task, action) => {
    setConfirm(action === "approve"
      ? { title: "Pass this task?", message: `"${task.title}" will be permanently deleted.`, confirmLabel: "Yes, Pass & Delete", confirmColor: "#22c55e", onConfirm: async () => { await deleteDoc(doc(db, "tasks", task.id)); setConfirm(null); } }
      : { title: "Reject this task?", message: `"${task.title}" will be moved back to Pending.`, confirmLabel: "Yes, Reject", confirmColor: "#ef4444", onConfirm: async () => { await updateDoc(doc(db, "tasks", task.id), { status: "Pending" }); setConfirm(null); } }
    );
  };

  const reviewProject = (project, action) => {
    setConfirm(action === "approve"
      ? { title: "Pass this project?", message: `"${project.name}" and all tasks will be permanently deleted.`, confirmLabel: "Yes, Pass & Delete", confirmColor: "#22c55e", onConfirm: async () => { await Promise.all(allTasks.filter(t => t.projectId === project.id).map(t => deleteDoc(doc(db, "tasks", t.id)))); await deleteDoc(doc(db, "projects", project.id)); setConfirm(null); } }
      : { title: "Reject this project?", message: `"${project.name}" will be moved back to Pending.`, confirmLabel: "Yes, Reject", confirmColor: "#ef4444", onConfirm: async () => { await updateDoc(doc(db, "projects", project.id), { status: "Pending" }); setConfirm(null); } }
    );
  };

  const markProjectDone = (project) => {
    setConfirm({ title: "Mark Project as Done?", message: `"${project.name}" will be sent for review.`, confirmLabel: "Yes, Mark Done", confirmColor: "#22c55e", onConfirm: async () => { await updateDoc(doc(db, "projects", project.id), { status: "Done", doneAt: new Date().toISOString() }); setConfirm(null); } });
  };

  const deleteTask = async (id) => await deleteDoc(doc(db, "tasks", id));
  const deleteProject = async (id) => { await Promise.all(allTasks.filter(t => t.projectId === id).map(t => deleteDoc(doc(db, "tasks", t.id)))); await deleteDoc(doc(db, "projects", id)); };

  const totalOverdue = allTasks.filter(t => getTaskStatus(t) === "Overdue").length;
  const totalDone = allTasks.filter(t => getTaskStatus(t) === "Done").length;
  const totalPending = allTasks.filter(t => getTaskStatus(t) === "Pending").length;
  const reviewCount = allProjects.filter(p => p.status === "Done").length + totalDone;

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
            <button onClick={() => exportReport(allProjects, allTasks)} style={{ background: "linear-gradient(135deg,#14532d,#16a34a)", color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>📊 Export</button>
            <button onClick={() => setShowNewProject(true)} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}>+ Project</button>
            <button onClick={() => signOut(auth)} style={{ background: "#0f1724", color: "#94a3b8", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "7px 14px", cursor: "pointer", fontSize: "12px" }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: mobile ? "16px" : "24px 32px" }}>
        {/* Stats — overdue card is clickable */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            { label: "Total Projects", value: allProjects.length, color: "#3b82f6", icon: "📁", onClick: null },
            { label: "Total Tasks", value: allTasks.length, color: "#a855f7", icon: "📋", onClick: null },
            { label: "Pending Tasks", value: totalPending, color: "#facc15", icon: "⏳", onClick: null },
            { label: "Overdue Tasks", value: totalOverdue, color: "#ef4444", icon: "🔴", onClick: () => setShowOverdue(true), clickable: true },
          ].map(s => (
            <div key={s.label} onClick={s.onClick || undefined}
              style={{ background: "linear-gradient(135deg,#0f1724,#111e30)", border: `1px solid ${s.clickable && totalOverdue > 0 ? "#7f1d1d" : "#1e3a5f"}`, borderRadius: "12px", padding: "14px", display: "flex", alignItems: "center", gap: "12px", cursor: s.clickable && totalOverdue > 0 ? "pointer" : "default", transition: "all 0.2s" }}
              onMouseEnter={e => { if (s.clickable && totalOverdue > 0) e.currentTarget.style.border = "1px solid #ef4444"; }}
              onMouseLeave={e => { if (s.clickable && totalOverdue > 0) e.currentTarget.style.border = "1px solid #7f1d1d"; }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "10px", color: "#64748b" }}>{s.label}</div>
              </div>
              {s.clickable && totalOverdue > 0 && <span style={{ color: "#ef4444", fontSize: "12px" }}>▶</span>}
            </div>
          ))}
        </div>

        {reviewCount > 0 && (
          <div style={{ background: "#1a0a28", border: "1px solid #6b21a8", borderRadius: "12px", padding: "14px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>🔍</span>
            <div>
              <div style={{ color: "#a855f7", fontWeight: 700, fontSize: "13px" }}>{reviewCount} item{reviewCount > 1 ? "s" : ""} waiting for review</div>
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
              onAddTask={openAddTask} onMarkProjectDone={markProjectDone}
              onReviewProject={reviewProject} currentUserEmail={user.email} mobile={mobile} />
          ))
        )}
      </div>

      {showNewProject && (
        <Modal title="Assign New Project" onClose={() => setShowNewProject(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={labelStyle}>Assign To (select one or more owners)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {LOWER_MANAGERS.map(m => {
                  const checked = selectedOwners.includes(m.email);
                  return (
                    <div key={m.email} onClick={() => toggleOwner(m.email)}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: checked ? "#1e3a5f" : "#0a1120", border: `1px solid ${checked ? "#3b82f6" : "#1e3a5f"}`, borderRadius: "8px", cursor: "pointer" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${checked ? "#3b82f6" : "#334155"}`, background: checked ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked && <span style={{ color: "#fff", fontSize: "11px", fontWeight: 800 }}>✓</span>}
                      </div>
                      <span style={{ color: checked ? "#e2e8f0" : "#94a3b8", fontSize: "13px", fontWeight: checked ? 600 : 400 }}>{m.name}</span>
                    </div>
                  );
                })}
              </div>
              {selectedOwners.length === 0 && <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "6px" }}>Please select at least one owner</div>}
            </div>
            <div><label style={labelStyle}>Project Name</label>
              <input style={inputStyle} placeholder="Enter project name..." value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && createProjectForOwners()} autoFocus /></div>
            <button onClick={createProjectForOwners} disabled={selectedOwners.length === 0}
              style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: selectedOwners.length === 0 ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "14px", opacity: selectedOwners.length === 0 ? 0.5 : 1 }}>
              Create & Assign
            </button>
          </div>
        </Modal>
      )}

      {newTaskProject && (
        <Modal title={`Add Task — ${newTaskProject.name}`} onClose={() => { setNewTaskProject(null); setNewTaskOwnerEmail(""); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "#0a1120", borderRadius: "8px", padding: "10px 12px", border: "1px solid #1e3a5f", fontSize: "12px", color: "#64748b" }}>
              📁 <span style={{ color: "#3b82f6", fontWeight: 600 }}>{newTaskProject.name}</span>
            </div>
            {(() => {
              const oe = newTaskProject.ownerEmails || (newTaskProject.ownerEmail ? [newTaskProject.ownerEmail] : []);
              const on = newTaskProject.ownerNames || [newTaskProject.ownerName];
              if (oe.length > 1) return (
                <div>
                  <label style={labelStyle}>Assign Task To</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {oe.map((email, idx) => {
                      const n = on[idx] || email;
                      const sel = newTaskOwnerEmail === email;
                      return (
                        <div key={email} onClick={() => setNewTaskOwnerEmail(email)}
                          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", background: sel ? "#1e3a5f" : "#0a1120", border: `1px solid ${sel ? "#3b82f6" : "#1e3a5f"}`, borderRadius: "8px", cursor: "pointer" }}>
                          <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `2px solid ${sel ? "#3b82f6" : "#334155"}`, background: sel ? "#3b82f6" : "transparent", flexShrink: 0 }} />
                          <span style={{ color: sel ? "#e2e8f0" : "#94a3b8", fontSize: "13px", fontWeight: sel ? 600 : 400 }}>👤 {n}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              return null;
            })()}
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
            <button onClick={createTaskForOwner} style={{ background: `linear-gradient(135deg,${isSuper ? "#7c3aed,#a855f7" : "#f97316,#ea580c"})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: "14px" }}>Assign Task</button>
          </div>
        </Modal>
      )}

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} onMarkDone={markTaskDone} onReview={reviewTask} currentUserEmail={user.email} />}
      {confirm && <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} confirmColor={confirm.confirmColor} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      {showOverdue && <OverduePanel tasks={allTasks} projects={allProjects} onClose={() => setShowOverdue(false)} />}
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