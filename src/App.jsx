import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, addDoc, onSnapshot,
  updateDoc, deleteDoc, doc
} from "firebase/firestore";

const DEPARTMENTS = ["All", "Network", "Customer Service", "IT", "Operations", "Finance"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["To Do", "In Progress", "Review", "Done"];

const PRIORITY_COLORS = {
  Low: "#4ade80", Medium: "#facc15", High: "#f97316", Critical: "#ef4444",
};
const STATUS_COLORS = {
  "To Do": "#64748b", "In Progress": "#3b82f6", "Review": "#a855f7", "Done": "#22c55e",
};

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",backdropFilter:"blur(4px)" }}>
      <div style={{ background:"#0f1724",border:"1px solid #1e3a5f",borderRadius:"16px",width:"100%",maxWidth:"560px",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px 16px",borderBottom:"1px solid #1e3a5f" }}>
          <span style={{ color:"#e2e8f0",fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:"17px" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:"20px" }}>✕</button>
        </div>
        <div style={{ padding:"20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen }) {
  const done = task.checklist.filter(c => c.done).length;
  const total = task.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== "Done";
  return (
    <div onClick={() => onOpen(task)} style={{ background:"linear-gradient(135deg,#0f1724,#111e30)",border:"1px solid #1e3a5f",borderRadius:"14px",padding:"18px 20px",cursor:"pointer",transition:"all 0.2s",boxShadow:"0 4px 16px rgba(0,0,0,0.3)" }}
      onMouseEnter={e => { e.currentTarget.style.border="1px solid #3b82f6"; e.currentTarget.style.transform="translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.border="1px solid #1e3a5f"; e.currentTarget.style.transform="translateY(0)"; }}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:"10px" }}>
        <span style={{ color:PRIORITY_COLORS[task.priority],fontSize:"10px",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",background:PRIORITY_COLORS[task.priority]+"18",padding:"3px 8px",borderRadius:"20px" }}>{task.priority}</span>
        <span style={{ color:STATUS_COLORS[task.status],fontSize:"10px",fontWeight:600 }}>● {task.status}</span>
      </div>
      <div style={{ color:"#e2e8f0",fontFamily:"'Sora',sans-serif",fontWeight:600,fontSize:"14px",marginBottom:"8px",lineHeight:1.4 }}>{task.title}</div>
      <div style={{ display:"flex",gap:"12px",marginBottom:"14px" }}>
        <span style={{ color:"#64748b",fontSize:"11px" }}>🏢 {task.department}</span>
        <span style={{ color:isOverdue?"#ef4444":"#64748b",fontSize:"11px" }}>📅 {isOverdue?"⚠ ":""}{task.dueDate}</span>
      </div>
      <div style={{ marginBottom:"8px" }}>
        <div style={{ display:"flex",justifyContent:"space-between",marginBottom:"5px" }}>
          <span style={{ color:"#94a3b8",fontSize:"11px" }}>Checklist</span>
          <span style={{ color:"#94a3b8",fontSize:"11px" }}>{done}/{total}</span>
        </div>
        <div style={{ background:"#1e3a5f",borderRadius:"99px",height:"4px" }}>
          <div style={{ width:`${pct}%`,height:"4px",borderRadius:"99px",background:pct===100?"#22c55e":"linear-gradient(90deg,#3b82f6,#60a5fa)",transition:"width 0.4s" }} />
        </div>
      </div>
      <div style={{ color:"#475569",fontSize:"11px" }}>👤 {task.assignee}</div>
    </div>
  );
}

function TaskDetail({ task, onClose, onUpdate, onDelete }) {
  const [localTask, setLocalTask] = useState({ ...task, checklist: task.checklist.map(c => ({ ...c })) });
  const [newItem, setNewItem] = useState("");
  const inputStyle = { background:"#0a1120",border:"1px solid #1e3a5f",borderRadius:"8px",color:"#e2e8f0",padding:"8px 12px",fontSize:"13px",width:"100%",outline:"none",fontFamily:"'Sora',sans-serif" };
  const labelStyle = { color:"#64748b",fontSize:"11px",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:"6px",display:"block" };
  const done = localTask.checklist.filter(c => c.done).length;
  const total = localTask.checklist.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Modal title="Task Details" onClose={() => { onUpdate(localTask); onClose(); }}>
      <div style={{ display:"flex",flexDirection:"column",gap:"16px" }}>
        <div><label style={labelStyle}>Title</label><input style={inputStyle} value={localTask.title} onChange={e => setLocalTask(t => ({ ...t, title:e.target.value }))} /></div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px" }}>
          <div><label style={labelStyle}>Department</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={localTask.department} onChange={e => setLocalTask(t => ({ ...t, department:e.target.value }))}>
              {DEPARTMENTS.filter(d => d!=="All").map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label style={labelStyle}>Priority</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={localTask.priority} onChange={e => setLocalTask(t => ({ ...t, priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div><label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={localTask.status} onChange={e => setLocalTask(t => ({ ...t, status:e.target.value }))}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select></div>
          <div><label style={labelStyle}>Due Date</label><input type="date" style={inputStyle} value={localTask.dueDate} onChange={e => setLocalTask(t => ({ ...t, dueDate:e.target.value }))} /></div>
        </div>
        <div><label style={labelStyle}>Assignee</label><input style={inputStyle} value={localTask.assignee} onChange={e => setLocalTask(t => ({ ...t, assignee:e.target.value }))} /></div>
        <div>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:"10px" }}>
            <label style={{ ...labelStyle,marginBottom:0 }}>Checklist — {done}/{total} ({pct}%)</label>
          </div>
          <div style={{ background:"#1e3a5f",borderRadius:"99px",height:"4px",marginBottom:"12px" }}>
            <div style={{ width:`${pct}%`,height:"4px",borderRadius:"99px",background:pct===100?"#22c55e":"linear-gradient(90deg,#3b82f6,#60a5fa)",transition:"width 0.3s" }} />
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:"8px",marginBottom:"10px" }}>
            {localTask.checklist.map(item => (
              <div key={item.id} style={{ display:"flex",alignItems:"center",gap:"10px",background:"#0a1120",borderRadius:"8px",padding:"8px 12px",border:"1px solid #1e3a5f" }}>
                <input type="checkbox" checked={item.done} onChange={() => setLocalTask(t => ({ ...t, checklist:t.checklist.map(c => c.id===item.id?{ ...c,done:!c.done }:c) }))} style={{ accentColor:"#3b82f6",width:"15px",height:"15px",cursor:"pointer" }} />
                <span style={{ color:item.done?"#475569":"#cbd5e1",fontSize:"13px",flex:1,textDecoration:item.done?"line-through":"none" }}>{item.text}</span>
                <button onClick={() => setLocalTask(t => ({ ...t, checklist:t.checklist.filter(c => c.id!==item.id) }))} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:"14px" }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display:"flex",gap:"8px" }}>
            <input style={{ ...inputStyle,flex:1 }} placeholder="Add checklist item..." value={newItem} onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter"&&newItem.trim()){ setLocalTask(t => ({ ...t, checklist:[...t.checklist,{ id:Date.now(),text:newItem.trim(),done:false }] })); setNewItem(""); }}} />
            <button onClick={() => { if(newItem.trim()){ setLocalTask(t => ({ ...t, checklist:[...t.checklist,{ id:Date.now(),text:newItem.trim(),done:false }] })); setNewItem(""); }}}
              style={{ background:"#1d4ed8",color:"#fff",border:"none",borderRadius:"8px",padding:"8px 16px",cursor:"pointer",fontSize:"13px",fontWeight:600 }}>Add</button>
          </div>
        </div>
        <div style={{ display:"flex",gap:"10px",marginTop:"4px" }}>
          <button onClick={() => { onUpdate(localTask); onClose(); }} style={{ flex:1,background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"#fff",border:"none",borderRadius:"10px",padding:"11px",cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:"13px" }}>Save Changes</button>
          <button onClick={() => { onDelete(task.id); onClose(); }} style={{ background:"#1a0a0a",color:"#ef4444",border:"1px solid #7f1d1d",borderRadius:"10px",padding:"11px 18px",cursor:"pointer",fontWeight:600,fontSize:"13px" }}>Delete</button>
        </div>
      </div>
    </Modal>
  );
}

function NewTaskModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ title:"",department:"Network",priority:"Medium",status:"To Do",assignee:"",dueDate:"" });
  const inputStyle = { background:"#0a1120",border:"1px solid #1e3a5f",borderRadius:"8px",color:"#e2e8f0",padding:"8px 12px",fontSize:"13px",width:"100%",outline:"none",fontFamily:"'Sora',sans-serif" };
  const labelStyle = { color:"#64748b",fontSize:"11px",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:"6px",display:"block" };
  return (
    <Modal title="Create New Task" onClose={onClose}>
      <div style={{ display:"flex",flexDirection:"column",gap:"14px" }}>
        <div><label style={labelStyle}>Task Title *</label><input style={inputStyle} placeholder="Enter task title..." value={form.title} onChange={e => setForm(f => ({ ...f,title:e.target.value }))} /></div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px" }}>
          <div><label style={labelStyle}>Department</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={form.department} onChange={e => setForm(f => ({ ...f,department:e.target.value }))}>
              {DEPARTMENTS.filter(d => d!=="All").map(d => <option key={d}>{d}</option>)}
            </select></div>
          <div><label style={labelStyle}>Priority</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={form.priority} onChange={e => setForm(f => ({ ...f,priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div><label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle,cursor:"pointer" }} value={form.status} onChange={e => setForm(f => ({ ...f,status:e.target.value }))}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select></div>
          <div><label style={labelStyle}>Due Date</label><input type="date" style={inputStyle} value={form.dueDate} onChange={e => setForm(f => ({ ...f,dueDate:e.target.value }))} /></div>
        </div>
        <div><label style={labelStyle}>Assignee</label><input style={inputStyle} placeholder="Employee name..." value={form.assignee} onChange={e => setForm(f => ({ ...f,assignee:e.target.value }))} /></div>
        <button onClick={() => { if(!form.title.trim()) return; onCreate(form); onClose(); }}
          style={{ background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"#fff",border:"none",borderRadius:"10px",padding:"12px",cursor:"pointer",fontFamily:"'Sora',sans-serif",fontWeight:700,fontSize:"14px" }}>Create Task</button>
      </div>
    </Modal>
  );
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    const unsub = onSnapshot(collection(db, "tasks"), snap => {
      setTasks(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filtered = tasks.filter(t => {
    if (selectedDept !== "All" && t.department !== selectedDept) return false;
    if (selectedStatus !== "All" && t.status !== selectedStatus) return false;
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase()) && !t.assignee?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: tasks.length,
    done: tasks.filter(t => t.status === "Done").length,
    critical: tasks.filter(t => t.priority === "Critical").length,
    inProgress: tasks.filter(t => t.status === "In Progress").length,
  };

  const createTask = async (form) => {
    await addDoc(collection(db, "tasks"), { ...form, checklist:[], createdAt:new Date().toISOString().slice(0,10) });
  };

  const updateTask = async (updated) => {
    const { id, ...data } = updated;
    await updateDoc(doc(db, "tasks", id), data);
  };

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, "tasks", id));
  };

  return (
    <div style={{ minHeight:"100vh",background:"#070d18",fontFamily:"'Sora',sans-serif",color:"#e2e8f0" }}>
      <div style={{ background:"linear-gradient(180deg,#0a1528,#070d18)",borderBottom:"1px solid #1e3a5f",padding:"0 32px",position:"sticky",top:0,zIndex:100 }}>
        <div style={{ maxWidth:"1280px",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:"64px" }}>
          <div style={{ display:"flex",alignItems:"center",gap:"14px" }}>
            <div style={{ width:"36px",height:"36px",borderRadius:"10px",background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"16px",fontWeight:800,color:"#fff" }}>W</div>
            <div>
              <div style={{ fontSize:"15px",fontWeight:800,color:"#f1f5f9" }}>WE Telecom Egypt</div>
              <div style={{ fontSize:"10px",color:"#3b82f6",letterSpacing:"1.5px",textTransform:"uppercase" }}>Task Management</div>
            </div>
          </div>
          <button onClick={() => setShowNew(true)} style={{ background:"linear-gradient(135deg,#1d4ed8,#2563eb)",color:"#fff",border:"none",borderRadius:"10px",padding:"9px 20px",cursor:"pointer",fontWeight:700,fontSize:"13px" }}>+ New Task</button>
        </div>
      </div>

      <div style={{ maxWidth:"1280px",margin:"0 auto",padding:"28px 32px" }}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",marginBottom:"28px" }}>
          {[
            { label:"Total Tasks",value:stats.total,color:"#3b82f6",icon:"📋" },
            { label:"In Progress",value:stats.inProgress,color:"#f97316",icon:"⚡" },
            { label:"Completed",value:stats.done,color:"#22c55e",icon:"✅" },
            { label:"Critical",value:stats.critical,color:"#ef4444",icon:"🔴" },
          ].map(s => (
            <div key={s.label} style={{ background:"linear-gradient(135deg,#0f1724,#111e30)",border:"1px solid #1e3a5f",borderRadius:"14px",padding:"18px 20px",display:"flex",alignItems:"center",gap:"14px" }}>
              <div style={{ width:"44px",height:"44px",borderRadius:"12px",background:s.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px" }}>{s.icon}</div>
              <div>
                <div style={{ fontSize:"26px",fontWeight:800,color:s.color,lineHeight:1 }}>{s.value}</div>
                <div style={{ fontSize:"11px",color:"#64748b",marginTop:"3px" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex",gap:"12px",marginBottom:"24px",flexWrap:"wrap",alignItems:"center" }}>
          <input placeholder="🔍  Search tasks or assignees..." style={{ background:"#0f1724",border:"1px solid #1e3a5f",borderRadius:"10px",color:"#e2e8f0",padding:"9px 14px",fontSize:"13px",outline:"none",flex:"1",minWidth:"200px" }} value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display:"flex",gap:"6px",flexWrap:"wrap" }}>
            {DEPARTMENTS.map(d => (
              <button key={d} onClick={() => setSelectedDept(d)} style={{ background:selectedDept===d?"#1d4ed8":"#0f1724",color:selectedDept===d?"#fff":"#94a3b8",border:`1px solid ${selectedDept===d?"#2563eb":"#1e3a5f"}`,borderRadius:"8px",padding:"7px 14px",cursor:"pointer",fontSize:"12px",fontWeight:600 }}>{d}</button>
            ))}
          </div>
          <select style={{ background:"#0f1724",border:"1px solid #1e3a5f",borderRadius:"10px",color:"#94a3b8",padding:"9px 14px",fontSize:"12px",outline:"none",cursor:"pointer" }} value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"16px" }}>
          {STATUSES.map(status => {
            const col = filtered.filter(t => t.status === status);
            return (
              <div key={status}>
                <div style={{ display:"flex",alignItems:"center",gap:"8px",marginBottom:"14px" }}>
                  <div style={{ width:"8px",height:"8px",borderRadius:"50%",background:STATUS_COLORS[status] }} />
                  <span style={{ color:"#94a3b8",fontSize:"12px",fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase" }}>{status}</span>
                  <span style={{ background:"#1e3a5f",color:"#64748b",borderRadius:"99px",padding:"1px 7px",fontSize:"11px",fontWeight:700,marginLeft:"auto" }}>{col.length}</span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:"10px",minHeight:"200px" }}>
                  {col.map(t => <TaskCard key={t.id} task={t} onOpen={setSelectedTask} />)}
                  {col.length === 0 && <div style={{ border:"2px dashed #1e3a5f",borderRadius:"14px",padding:"32px 16px",textAlign:"center",color:"#334155",fontSize:"12px" }}>No tasks</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={updateTask} onDelete={deleteTask} />}
      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onCreate={createTask} />}
    </div>
  );
}