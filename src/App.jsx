import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCustomToken,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  getMessaging, 
  getToken, 
  onMessage,
  isSupported
} from 'firebase/messaging';
import { 
  LayoutDashboard, 
  PlusCircle, 
  ListTodo, 
  CheckCircle2, 
  Calendar, 
  Camera, 
  X,
  ChevronRight, 
  ChevronLeft,
  CalendarDays, 
  Trash2,
  Check,
  Target as TargetIcon,
  ThumbsUp,
  PlayCircle,
  Edit3,
  AlertTriangle,
  RefreshCw,
  LogOut,
  LogIn,
  Bell,
  BellOff,
  AlertCircle,
  Settings as SettingsIcon,
  Clock,
  SendHorizontal,
  Plus,
  Minus
} from 'lucide-react';

/**
 * ==========================================
 * Firebase Configuration
 * ==========================================
 */
const firebaseConfig = {
  apiKey: "AIzaSyDRu18T2yEvoDwm19-nQaEwrOfNwBGeRGk",
  authDomain: "task-manager-d1570.firebaseapp.com",
  projectId: "task-manager-d1570",
  storageBucket: "task-manager-d1570.firebasestorage.app",
  messagingSenderId: "569544638136",
  appId: "1:569544638136:web:63da55e24228c9a695be4d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'task-master-v1';
const appId = rawAppId.replace(/\//g, '_');

// --- UI Components ---
const ProgressBar = ({ value, color = "bg-indigo-600", height = "h-2" }) => {
  const safeValue = isNaN(value) ? 0 : Math.max(0, Math.min(value, 100));
  return (
    <div className={`w-full bg-gray-100 rounded-full ${height} overflow-hidden`}>
      <div 
        className={`${color} ${height} rounded-full transition-all duration-700 ease-out`} 
        style={{ width: `${safeValue}%` }}
      ></div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [schedules, setSchedules] = useState([]); 
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [now, setNow] = useState(new Date());
  
  // Notification States
  const [messaging, setMessaging] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isNotifSettingOpen, setIsNotifSettingOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const [notifConfig, setNotifConfig] = useState({
    deadlineLeadTimes: [24],
    dailySummaryTime: "08:00",
    enableSlotReminders: true
  });

  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [revisionAlert, setRevisionAlert] = useState(null);
  const [planningSelection, setPlanningSelection] = useState(null);

  const [dragStartHour, setDragStartHour] = useState(null);
  const [dragEndHour, setDragEndHour] = useState(null);

  const [formTitle, setFormTitle] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formDeadlineTime, setFormDeadlineTime] = useState('23:59');

  // 1. App Initialization
  useEffect(() => {
    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {}

      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        } catch (e) {}
      }

      try {
        const supported = await isSupported();
        if (supported) setMessaging(getMessaging(app));
      } catch (e) {}

      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
      return unsub;
    };
    init();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;
    
    const loadSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'notifications'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (!data.deadlineLeadTimes) data.deadlineLeadTimes = [24];
          setNotifConfig(data);
        }
      } catch (e) {}
    };
    loadSettings();

    const unsubTasks = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, photos: [], ...d.data() })));
    });
    const unsubSch = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTasks(); unsubSch(); };
  }, [user]);

  // 3. Notification Logic
  useEffect(() => {
    if ('Notification' in window) setNotificationPermission(Notification.permission);

    const check = () => {
      const currentTime = new Date();
      setNow(currentTime);
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const hourStr = String(currentTime.getHours()).padStart(2, '0');
      const minStr = String(currentTime.getMinutes()).padStart(2, '0');
      const todayStr = currentTime.toISOString().split('T')[0];

      if (`${hourStr}:${minStr}` === notifConfig.dailySummaryTime) {
        const count = schedules.filter(s => s.date === todayStr && !s.recorded).length;
        if (count > 0) new Notification("TaskMaster", { body: `今日は ${count}件 の作業予定があります。` });
      }

      tasks.forEach(t => {
        if (t.completed || !t.deadline) return;
        const dl = new Date(`${t.deadline}T${t.deadlineTime || "23:59"}`);
        const diff = (dl - currentTime) / (1000 * 60 * 60);
        notifConfig.deadlineLeadTimes.forEach(lt => {
          if (diff > 0 && diff <= lt && diff > (lt - 0.02)) {
            new Notification("期限リマインド", { body: `「${t.title}」の期限まであと ${lt}時間 です。` });
          }
        });
      });

      if (notifConfig.enableSlotReminders && currentTime.getMinutes() === 0) {
        const slot = schedules.find(s => s.date === todayStr && s.startTime === `${hourStr}:00` && !s.recorded);
        if (slot) {
          const task = tasks.find(x => x.id === slot.taskId);
          if (task) new Notification("作業開始", { body: `「${task.title}」の時間です。` });
        }
      }
    };

    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, [schedules, tasks, notifConfig]);

  // Actions
  const handleGoogleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) {
      if (e.code === 'auth/unauthorized-domain') setAuthErrorMessage("ドメインが許可されていません。");
    }
  };

  const handleAnonymousLogin = async () => {
    try { setLoading(true); await signInAnonymously(auth); } catch (e) { setLoading(false); }
  };

  const handleLogout = async () => {
    if (window.confirm("ログアウトしますか？")) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const saveNotifSettings = async (cfg) => {
    setNotifConfig(cfg);
    if (user) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'notifications'), cfg);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  };

  const addTask = async (e) => {
    e?.preventDefault();
    if (!user || !formTitle.trim() || !formHours) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), {
        title: formTitle.trim(), estimatedHours: parseFloat(formHours),
        deadline: formDeadline || new Date().toISOString().split('T')[0],
        deadlineTime: formDeadlineTime || "23:59",
        progress: 0, timeSpent: 0, photos: [], completed: false, createdAt: new Date().toISOString()
      });
      setFormTitle(''); setFormHours(''); setFormDeadline(''); setFormDeadlineTime('23:59');
      setIsAddingTask(false); setActiveTab('list');
    } catch (err) {}
  };

  const addSchedule = async (taskId, date, hour) => {
    if (!user || !taskId) return;
    const timeStr = `${String(hour).padStart(2, '0')}:00`;
    if (schedules.some(s => s.date === date && s.startTime === timeStr)) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), { 
      taskId, date, startTime: timeStr, recorded: false 
    });
  };

  const recordWork = async (schId, taskId, actualH, delta) => {
    if (!user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const currentRem = metrics.taskMetrics[taskId]?.remainingHours || 0;
    const currentSlots = schedules.filter(s => s.taskId === taskId && !s.recorded).length;
    const wasSafe = currentSlots >= (currentRem - 0.1);
    const newTime = (parseFloat(task.timeSpent) || 0) + actualH;
    const newProg = Math.min((task.progress || 0) + delta, 100);
    const isComp = newProg >= 100;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), { timeSpent: newTime, progress: newProg, completed: isComp });
    if (schId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', schId), { recorded: true });
    
    const newAbility = newProg > 0 && newTime > 0 ? (((task.estimatedHours || 0) * (newProg / 100)) / newTime) : metrics.globalAbility;
    const newRem = ((task.estimatedHours || 0) * (1 - newProg / 100)) / (newAbility || 0.1);
    const newSlots = currentSlots - (schId ? 1 : 0);
    if (!isComp && wasSafe && newSlots < (newRem - 0.1)) {
      setRevisionAlert({ taskId, message: `効率が落ちたため枠が不足しました。あと ${Math.ceil(newRem - newSlots)}枠 追加してください。` });
    }
  };

  const metrics = useMemo(() => {
    const relevant = tasks.filter(t => (t.timeSpent || 0) > 0);
    let totalEst = 0; let totalAct = 0;
    relevant.forEach(t => {
      totalEst += ((t.estimatedHours || 0) * ((t.progress || 0) / 100));
      totalAct += parseFloat(t.timeSpent || 0);
    });
    const gAbility = totalAct > 0 ? totalEst / totalAct : 1.0;
    const tMetrics = tasks.reduce((acc, t) => {
      let ability = gAbility;
      if ((t.timeSpent || 0) > 0 && (t.progress || 0) > 0) ability = ((t.estimatedHours || 0) * ((t.progress || 0) / 100)) / (t.timeSpent || 1);
      const rem = ((t.estimatedHours || 0) * (1 - (t.progress || 0) / 100)) / (ability || 0.1);
      acc[t.id] = { remainingHours: isFinite(rem) ? rem : 0, ability };
      return acc;
    }, {});
    return { globalAbility: gAbility, taskMetrics: tMetrics, totalRemaining: tasks.filter(t => !t.completed).reduce((s, t) => s + (tMetrics[t.id]?.remainingHours || 0), 0) };
  }, [tasks]);

  const groupedToday = useMemo(() => {
    const today = now.toISOString().split('T')[0];
    const todaySchedules = schedules.filter(s => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups = {};
    todaySchedules.forEach(s => {
      if (!groups[s.taskId]) groups[s.taskId] = { taskId: s.taskId, slots: [], first: s.startTime };
      groups[s.taskId].slots.push(s);
    });
    return Object.values(groups);
  }, [schedules, now]);

  // Drag Finish Logic
  useEffect(() => {
    const handleUp = () => {
      if (dragStartHour !== null && dragEndHour !== null && planningSelection) {
        const start = Math.min(dragStartHour, dragEndHour);
        const end = Math.max(dragStartHour, dragEndHour);
        for (let h = start; h <= end; h++) addSchedule(planningSelection, currentDate, h);
      }
      setDragStartHour(null);
      setDragEndHour(null);
    };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, [dragStartHour, dragEndHour, planningSelection, currentDate, schedules]);

  if (loading) return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white font-bold animate-pulse text-xs tracking-widest uppercase">Initializing...</div>;

  if (!user) return (
    <div className="min-h-screen bg-indigo-800 flex flex-col items-center justify-center p-6 text-white text-center">
      <TargetIcon size={72} className="mb-6 opacity-50" />
      <h1 className="text-4xl font-black mb-2 tracking-tighter">TaskMaster Pro</h1>
      <p className="mb-12 opacity-70 italic font-medium">Plan your potential.</p>
      <div className="w-full max-w-xs space-y-4">
        <button onClick={handleGoogleLogin} className="w-full bg-white text-indigo-900 px-8 py-5 rounded-[28px] font-black shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all"><LogIn size={24} /> Googleでログイン</button>
        <button onClick={handleAnonymousLogin} className="w-full bg-indigo-700/50 text-indigo-100 border border-indigo-500/30 px-8 py-5 rounded-[28px] font-black active:scale-95 transition-all">ログインせずに続ける<span className="block text-[10px] opacity-60 font-medium">（保存されません）</span></button>
      </div>
    </div>
  );

  const selectedTaskForPlanning = tasks.find(t => t.id === planningSelection);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 font-sans selection:bg-indigo-100 overflow-x-hidden">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-20 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-2 font-black"><TargetIcon size={24}/><span className="text-xl tracking-tight">TaskMaster Pro</span></div>
        <div className="flex items-center gap-3">
          <button onClick={() => notificationPermission === 'granted' ? setIsNotifSettingOpen(true) : alert("通知設定から許可してください。")} className={`${notificationPermission === 'granted' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white'} p-2.5 rounded-full transition-all active:scale-90`}>{notificationPermission === 'granted' ? <Bell size={20} /> : <BellOff size={20} />}</button>
          <button onClick={handleLogout} className="bg-white/10 p-2.5 rounded-full hover:bg-white/20 transition-colors"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="pb-36">
        {activeTab === 'dashboard' && (
          <div className="p-4 space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
            <section className="grid grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm text-center">
                <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-tight">実質の残り時間</p>
                <p className="text-2xl font-black text-indigo-600">{metrics.totalRemaining.toFixed(1)}<span className="text-xs ml-1 font-normal">h</span></p>
              </div>
              <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm text-center">
                <p className="text-[10px] text-gray-400 font-black uppercase mb-1 tracking-tight">現在の効率</p>
                <p className="text-2xl font-black text-gray-800">{metrics.globalAbility.toFixed(2)}<span className="text-xs ml-1 font-normal">x</span></p>
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-black text-gray-800 flex items-center gap-2 tracking-tight"><PlayCircle size={18} className="text-indigo-600" /> 今日のTodo</h3>
                <span className="text-[10px] font-bold text-gray-400">{now.toISOString().split('T')[0].replace(/-/g, '/')}</span>
              </div>
              {groupedToday.length === 0 ? (
                <button onClick={() => setActiveTab('planner')} className="w-full bg-white border-2 border-dashed border-gray-100 rounded-[32px] p-16 text-center text-xs text-gray-400">予定なし。計画を立てましょう</button>
              ) : (
                <div className="space-y-3">
                  {groupedToday.map(group => {
                    const task = tasks.find(t => t.id === group.taskId);
                    if (!task) return null;
                    const unrecorded = group.slots.filter(s => !s.recorded);
                    const allDone = unrecorded.length === 0;
                    const totalUnrecorded = schedules.filter(sc => sc.taskId === task.id && !sc.recorded).length;
                    const delta = totalUnrecorded > 0 ? Math.ceil((100 - (task.progress || 0)) / totalUnrecorded) : 0;
                    return (
                      <div key={group.taskId} className={`bg-white rounded-[32px] p-5 border shadow-sm transition-all ${allDone ? 'opacity-40 grayscale' : 'border-gray-100'}`}>
                        <div className="flex justify-between items-center text-sm">
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 mb-2 inline-block font-mono">{group.first}〜</span>
                            <h4 className="font-bold text-gray-900 truncate text-lg tracking-tight leading-tight">{task.title}</h4>
                            <div className="mt-2 pr-6"><ProgressBar value={task.progress || 0} color="bg-indigo-500" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {!allDone ? (
                              <>
                                <button onClick={() => recordWork(unrecorded[0].id, task.id, 1, delta)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg active:scale-90"><ThumbsUp size={22} /></button>
                                <button onClick={() => { setTempProgress(task.progress || 0); setTempTime(task.timeSpent || 0); setSelectedTask(task); }} className="p-3 bg-gray-50 text-gray-400 rounded-xl active:scale-90"><Edit3 size={16} /></button>
                              </>
                            ) : (
                              <div className="bg-green-50 text-green-500 p-4 rounded-2xl"><CheckCircle2 size={28} /></div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto animate-in slide-in-from-bottom duration-500">
            <h2 className="font-black text-2xl text-gray-800 px-2 tracking-tighter">課題リスト</h2>
            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="bg-white p-6 rounded-[32px] border border-gray-100 flex items-center gap-4 shadow-sm">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setTempProgress(task.progress || 0); setTempTime(task.timeSpent || 0); setSelectedTask(task); }}>
                  <h3 className="font-bold text-lg truncate mb-1 text-gray-900">{task.title}</h3>
                  <div className="text-[10px] text-indigo-500 font-black mb-2 flex items-center gap-1"><Clock size={10} /> 締切: {task.deadline?.replace(/-/g, '/')} {task.deadlineTime || "23:59"}</div>
                  <ProgressBar value={task.progress || 0} color="bg-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), {completed: true, progress: 100})} className="p-3 bg-green-50 text-green-600 rounded-full hover:bg-green-100 shadow-sm"><Check size={20} strokeWidth={3} /></button>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id))} className="text-red-300 p-3 bg-red-50 rounded-full hover:bg-red-100"><Trash2 size={20} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'planner' && (
          <div className="flex flex-col h-[calc(100vh-140px)] max-w-5xl mx-auto overflow-hidden bg-white animate-in zoom-in duration-300">
            {/* ヘッダー */}
            <div className="p-4 border-b flex justify-between items-center bg-white shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => {const d=new Date(currentDate);d.setDate(d.getDate()-1);setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={24}/></button>
                <div className="text-center"><h2 className="font-black text-gray-900 tracking-tighter text-lg">{currentDate.replace(/-/g, '/')}</h2></div>
                <button onClick={() => {const d=new Date(currentDate);d.setDate(d.getDate()+1);setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={24}/></button>
              </div>
              {selectedTaskForPlanning && (
                <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-2 shadow-lg animate-pulse">
                  <Edit3 size={12} /> {selectedTaskForPlanning.title}
                </div>
              )}
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* 未計画リスト (幅を広げ、文字を大きく) */}
              <div className="w-32 sm:w-56 bg-gray-50 border-r overflow-y-auto p-2.5 space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center py-2">Tasks</p>
                {tasks.filter(t => !t.completed).map(task => {
                  const rem = metrics.taskMetrics[task.id]?.remainingHours || 0;
                  const slots = schedules.filter(s => s.taskId === task.id && !s.recorded).length;
                  const isSafe = slots >= (rem - 0.1);
                  const isSelected = planningSelection === task.id;
                  return (
                    <div key={task.id} onClick={() => setPlanningSelection(isSelected ? null : task.id)}
                      className={`p-3.5 rounded-[24px] border-2 transition-all cursor-pointer relative shadow-sm ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg scale-105 z-10' : isSafe ? 'bg-white border-green-100 text-green-700' : 'bg-white border-red-100 text-red-700'}`}>
                      <div className="font-black text-xs leading-tight break-words">{task.title}</div>
                      <div className="text-[10px] font-bold opacity-70 mt-2 flex flex-col gap-0.5">
                        <span>残 {rem.toFixed(1)}h</span>
                        <span>確保 {slots}枠</span>
                      </div>
                      {isSelected && <div className="absolute top-1.5 right-1.5 bg-white text-indigo-600 rounded-full p-1 border shadow-sm"><Check size={10} strokeWidth={4} /></div>}
                    </div>
                  );
                })}
              </div>

              {/* タイムライン (文字サイズを大きく調整) */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-5 select-none relative bg-white overflow-x-hidden scroll-smooth">
                {Array.from({length:24},(_,i)=>i).map(h => {
                  const isInRange = dragStartHour !== null && h >= Math.min(dragStartHour, dragEndHour) && h <= Math.max(dragStartHour, dragEndHour);
                  const slot = schedules.find(s => s.date === currentDate && parseInt(s.startTime) === h);
                  const task = slot ? tasks.find(t => t.id === slot.taskId) : null;

                  return (
                    <div key={h} 
                      onMouseDown={() => { if(planningSelection) { setDragStartHour(h); setDragEndHour(h); } }}
                      onMouseEnter={() => { if(dragStartHour !== null) setDragEndHour(h); }}
                      className={`group flex items-center h-16 border-b border-gray-100 relative transition-colors ${isInRange ? 'bg-indigo-50/50' : 'hover:bg-gray-50/30'}`}
                    >
                      <div className="w-12 text-right pr-4">
                        <span className="text-xs sm:text-sm font-black text-gray-300 group-hover:text-indigo-400 font-mono">{String(h).padStart(2, '0')}:00</span>
                      </div>
                      <div className="flex-1 h-full py-2 relative">
                        {isInRange && !slot && <div className="absolute inset-x-1 inset-y-2 bg-indigo-600/10 border-2 border-dashed border-indigo-400 rounded-2xl animate-pulse"></div>}
                        {slot && (
                          <div className={`absolute inset-x-1 inset-y-2 rounded-2xl p-2.5 flex flex-col justify-between shadow-sm border ${slot.recorded ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-white border-indigo-100 text-gray-900 ring-2 ring-indigo-50'}`}>
                            <div className="flex justify-between items-center">
                              <p className="font-black text-xs sm:text-sm truncate leading-tight flex-1 pr-3">{task?.title || '不明'}</p>
                              <button onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', slot.id));}} className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"><X size={16} strokeWidth={3} /></button>
                            </div>
                            <div className="mt-1"><ProgressBar value={task?.progress || 0} color={slot.recorded ? "bg-gray-300" : "bg-indigo-500"} height="h-1" /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto animate-in slide-in-from-bottom duration-500">
            <h2 className="font-black text-2xl text-gray-800 px-2 tracking-tighter">実績ギャラリー</h2>
            {tasks.filter(t => t.completed).length === 0 ? (
              <div className="text-center py-24 bg-white rounded-[40px] border border-dashed border-gray-200 text-gray-300 italic">実績はまだありません</div>
            ) : (
              <div className="space-y-4">
                {tasks.filter(t => t.completed).map(task => (
                  <div key={task.id} className="bg-white p-6 rounded-[40px] border border-gray-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                      <div><h3 className="font-black text-lg text-gray-900">{task.title}</h3><div className="flex items-center gap-2 mt-1 font-bold"><CheckCircle2 className="text-green-500" size={16} /><span className="text-[10px] text-gray-400">実績: {task.timeSpent}h / 予定: {task.estimatedHours}h</span></div></div>
                      <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id))} className="text-red-300 p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all"><Trash2 size={20} /></button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {task.photos?.map((pic, i) => <img key={i} src={pic} className="aspect-square object-cover rounded-3xl cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(pic)} alt="achievement" />)}
                      <label className="aspect-square border-2 border-dashed border-gray-100 rounded-3xl flex items-center justify-center text-gray-300 hover:text-indigo-400 hover:bg-indigo-50 cursor-pointer transition-all"><Plus size={24} /><input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                        const files = Array.from(e.target.files);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onloadend = async () => {
                            const currentT = tasks.find(t=>t.id===task.id);
                            await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { photos: [...(currentT?.photos || []), reader.result] });
                          };
                          reader.readAsDataURL(file);
                        });
                      }} /></label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 丸型の大きな＋ボタン */}
      <nav className="fixed bottom-8 left-6 right-6 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border border-white/20 rounded-[44px] shadow-[0_30px_70px_rgba(0,0,0,0.15)] flex justify-around items-center px-2 py-4 z-30">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'ホーム' },
          { id: 'list', icon: ListTodo, label: '課題' },
          { id: 'add', icon: PlusCircle, label: '', special: true },
          { id: 'planner', icon: CalendarDays, label: '計画' },
          { id: 'completed', icon: CheckCircle2, label: '実績' }
        ].map(tab => (
          <button key={tab.id} onClick={() => tab.special ? setIsAddingTask(true) : setActiveTab(tab.id)} className={`relative flex flex-col items-center transition-all duration-300 px-4 py-1 ${tab.special ? 'bg-indigo-600 text-white w-20 h-20 -mt-16 flex items-center justify-center rounded-full shadow-indigo-300 shadow-2xl active:scale-90 ring-8 ring-white hover:bg-indigo-700' : (activeTab === tab.id ? 'text-indigo-600 scale-110' : 'text-gray-400 hover:text-gray-600')}`}>
            <tab.icon size={tab.special ? 36 : 24} strokeWidth={activeTab === tab.id || tab.special ? 3 : 2} />
            {tab.label && <span className="text-[9px] mt-1 font-black">{tab.label}</span>}
          </button>
        ))}
      </nav>

      {/* 通知設定モーダル */}
      {isNotifSettingOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 space-y-8 animate-in zoom-in duration-300 shadow-2xl">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-black tracking-tighter flex items-center gap-2"><SettingsIcon size={24}/>通知設定</h2><button onClick={() => setIsNotifSettingOpen(false)} className="p-3 bg-gray-50 rounded-full hover:bg-gray-100 transition-colors"><X size={20}/></button></div>
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">期限前リマインド</label>
                <div className="flex flex-wrap gap-2">
                  {notifConfig.deadlineLeadTimes.map((time, idx) => (
                    <div key={idx} className="bg-indigo-50 text-indigo-700 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-black ring-1 ring-indigo-100">
                      {time}時間前
                      <button onClick={() => saveNotifSettings({...notifConfig, deadlineLeadTimes: notifConfig.deadlineLeadTimes.filter((_, i) => i !== idx)})}><Minus size={14} /></button>
                    </div>
                  ))}
                  <button onClick={() => { const h = parseInt(prompt("通知タイミングを追加(時間単位)")); if(!isNaN(h)) saveNotifSettings({...notifConfig, deadlineLeadTimes: [...notifConfig.deadlineLeadTimes, h].sort((a,b)=>a-b)}) }} className="bg-gray-50 text-gray-400 p-2.5 rounded-2xl hover:bg-gray-100"><Plus size={20} /></button>
                </div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center w-full block">まとめ通知の時刻</label><div className="flex items-center gap-3 bg-gray-50 p-5 rounded-[24px]"><Calendar size={20} className="text-indigo-500" /><input type="time" className="flex-1 bg-transparent font-black outline-none text-lg text-center" value={notifConfig.dailySummaryTime} onChange={(e) => saveNotifSettings({...notifConfig, dailySummaryTime: e.target.value})}/></div></div>
              <div className="flex items-center justify-between bg-indigo-50 p-5 rounded-[24px]"><span className="text-sm font-black text-indigo-900">スロット開始時に通知</span><button onClick={() => saveNotifSettings({...notifConfig, enableSlotReminders: !notifConfig.enableSlotReminders})} className={`w-14 h-7 rounded-full transition-all relative ${notifConfig.enableSlotReminders ? 'bg-indigo-600' : 'bg-gray-300'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${notifConfig.enableSlotReminders ? 'left-8' : 'left-1'}`}></div></button></div>
              <button onClick={() => { if(Notification.permission === 'granted') new Notification("通知テスト成功！", {body:"設定は正しく反映されています。"}); else alert("通知が許可されていません。"); }} className="w-full flex items-center justify-center gap-3 py-4 border-2 border-indigo-100 rounded-[24px] text-indigo-600 font-black text-sm hover:bg-indigo-50 transition-all active:scale-95"><SendHorizontal size={20} /> テスト通知を送る</button>
            </div>
            <div className="space-y-3"><button onClick={() => setIsNotifSettingOpen(false)} className="w-full bg-indigo-600 text-white p-5 rounded-[24px] font-black shadow-lg">設定を完了</button>{saveFeedback && <p className="text-center text-[10px] text-green-500 font-black animate-pulse uppercase tracking-widest">Sync Completed ✓</p>}</div>
          </div>
        </div>
      )}

      {isAddingTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-2xl z-[100] flex items-end p-0">
          <div className="bg-white w-full rounded-t-[56px] p-10 space-y-8 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <h2 className="text-3xl font-black tracking-tighter text-gray-900">New Task</h2>
            <form onSubmit={addTask} className="space-y-5">
              <input type="text" placeholder="課題名" className="w-full p-6 bg-gray-50 rounded-[28px] outline-none font-black text-lg ring-2 ring-transparent focus:ring-indigo-500/20 transition-all text-gray-900" value={formTitle} onChange={e=>setFormTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="0.1" placeholder="予定時間(h)" className="w-full p-6 bg-gray-50 rounded-[28px] outline-none font-black text-lg ring-2 ring-transparent focus:ring-indigo-500/20 transition-all text-gray-900" value={formHours} onChange={e=>setFormHours(e.target.value)} />
                <input type="date" className="w-full p-6 bg-gray-50 rounded-[28px] outline-none font-black text-sm ring-2 ring-transparent focus:ring-indigo-500/20 transition-all text-gray-900" value={formDeadline} onChange={e=>setFormDeadline(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-50 rounded-[28px] p-6 flex items-center gap-3"><Clock size={24} className="text-gray-400" /><input type="time" className="bg-transparent font-black outline-none flex-1 text-lg text-gray-900" value={formDeadlineTime} onChange={e=>setFormDeadlineTime(e.target.value)} /></div>
                <button type="button" onClick={() => setFormDeadlineTime("23:59")} className="bg-indigo-50 text-indigo-600 px-6 py-6 rounded-[28px] font-black text-sm active:scale-95 transition-all">23:59</button>
              </div>
              <div className="pt-4 flex flex-col gap-3">
                <button type="submit" className="w-full bg-indigo-600 text-white p-6 rounded-[28px] font-black text-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95">課題を登録</button>
                <button type="button" onClick={()=>setIsAddingTask(false)} className="w-full text-gray-400 py-2 font-black text-sm hover:text-gray-600 text-center">キャンセル</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 space-y-8 animate-in zoom-in duration-300 shadow-2xl">
            <div className="flex justify-between items-center"><h3 className="text-2xl font-black tracking-tight text-gray-900">進捗修正</h3><button onClick={() => setSelectedTask(null)} className="p-3 bg-gray-50 rounded-full hover:bg-gray-100 transition-all"><X size={20}/></button></div>
            <div className="space-y-8">
              <div className="space-y-4"><div className="flex justify-between text-xs font-black"><span className="text-gray-400 uppercase tracking-widest">Progress</span><span className="text-indigo-600 text-lg font-black">{tempProgress}%</span></div><input type="range" className="w-full h-4 bg-gray-100 rounded-full appearance-none accent-indigo-600 cursor-pointer" value={tempProgress} onChange={e => setTempProgress(parseInt(e.target.value))} /></div>
              <div className="space-y-3"><label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">実際の作業時間 (h)</label><input type="number" step="0.1" className="w-full p-6 bg-gray-50 rounded-[24px] outline-none font-black text-xl ring-2 ring-transparent focus:ring-indigo-500/20 transition-all text-gray-900" value={tempTime} onChange={e => setTempTime(parseFloat(e.target.value) || 0)} /></div>
              <button onClick={async () => {
                const isComp = tempProgress >= 100;
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', selectedTask.id), { progress: tempProgress, timeSpent: tempTime, completed: isComp });
                setSelectedTask(null);
              }} className="w-full bg-indigo-600 text-white p-6 rounded-[24px] font-black text-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95">保存する</button>
            </div>
          </div>
        </div>
      )}

      {revisionAlert && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[150] flex items-center justify-center p-6">
          <div className="bg-white w-full max-sm:w-full max-w-sm rounded-[48px] p-10 text-center space-y-8 animate-in zoom-in duration-300 shadow-2xl border-4 border-red-50">
            <div className="w-24 h-24 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50"><AlertTriangle size={48} /></div>
            <div className="space-y-3"><h2 className="text-3xl font-black text-gray-900 tracking-tighter">計画不足</h2><p className="text-sm text-gray-500 font-bold leading-relaxed">{revisionAlert.message}</p></div>
            <button onClick={() => { setActiveTab('planner'); setRevisionAlert(null); }} className="w-full bg-indigo-600 text-white p-6 rounded-[28px] font-black text-lg shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"><RefreshCw size={24} /> 計画を追加する</button>
            <button onClick={() => setRevisionAlert(null)} className="w-full text-gray-400 font-black py-2 text-sm">閉じる</button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-w-full max-h-[80vh] object-contain rounded-[40px] shadow-2xl" alt="Preview" />
          <button className="absolute top-10 right-10 text-white bg-white/10 p-4 rounded-full hover:bg-white/20 transition-all"><X size={36}/></button>
        </div>
      )}
    </div>
  );
};

export default App;
