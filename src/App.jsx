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
    <div className={`w-full bg-gray-200 rounded-full ${height} overflow-hidden`}>
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
  
  // Messaging Instance
  const [messaging, setMessaging] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [isNotifSettingOpen, setIsNotifSettingOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  
  // 多機能通知設定 (複数時間設定対応)
  const [notifConfig, setNotifConfig] = useState({
    deadlineLeadTimes: [24], 
    dailySummaryTime: "08:00",
    enableSlotReminders: true
  });

  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [revisionAlert, setRevisionAlert] = useState(null);
  const [planningSelection, setPlanningSelection] = useState(null);

  const [tempProgress, setTempProgress] = useState(0);
  const [tempTime, setTempTime] = useState(0);
  const [dragStartHour, setDragStartHour] = useState(null);
  const [dragEndHour, setDragEndHour] = useState(null);

  // Form States
  const [formTitle, setFormTitle] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formDeadlineTime, setFormDeadlineTime] = useState('23:59');

  // 1. Firebase Auth Initializing & Persistence Fix
  useEffect(() => {
    const initApp = async () => {
      // ログイン状態をブラウザに永続化する設定
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) { console.error("Persistence error", e); }

      // サービスワーカー登録
      if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('/firebase-messaging-sw.js'); } catch (e) {}
      }

      // 通知サポートチェック
      try {
        const supported = await isSupported();
        if (supported) setMessaging(getMessaging(app));
      } catch (e) { console.warn("Messaging not supported."); }

      // 認証の初期化
      const initAuth = async () => {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
              await signInWithCustomToken(auth, __initial_auth_token);
            } catch (tokenErr) {
              console.warn("Custom token mismatch, falling back to existing session or anonymous.");
              if (!auth.currentUser) await signInAnonymously(auth);
            }
          } else if (!auth.currentUser) {
            await signInAnonymously(auth);
          }
        } catch (error) { 
          console.error("Auth init error:", error); 
        }
      };
      
      await initAuth();
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
      return () => unsubscribe();
    };
    initApp();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;
    
    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'notifications');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (!data.deadlineLeadTimes) {
            data.deadlineLeadTimes = data.deadlineLeadHours ? [data.deadlineLeadHours] : [24];
          }
          setNotifConfig(data);
        }
      } catch (e) {}
    };
    loadSettings();

    const unsubTasks = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, photos: [], ...d.data() })));
    }, (err) => console.error("Tasks sync error", err));

    const unsubSch = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Schedules sync error", err));

    return () => { unsubTasks(); unsubSch(); };
  }, [user]);

  // 3. Notification Engine
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const checkNotifications = () => {
      const currentTime = new Date();
      setNow(currentTime);

      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const hourStr = String(currentTime.getHours()).padStart(2, '0');
      const minStr = String(currentTime.getMinutes()).padStart(2, '0');
      const timeStr = `${hourStr}:${minStr}`;
      const todayDateStr = currentTime.toISOString().split('T')[0];

      if (timeStr === notifConfig.dailySummaryTime) {
        const todayTasksCount = schedules.filter(s => s.date === todayDateStr && !s.recorded).length;
        if (todayTasksCount > 0) {
          new Notification("TaskMaster: 今日の予定", { body: `今日は ${todayTasksCount}件 の作業予定があります。`, tag: 'daily-summary' });
        }
      }

      tasks.forEach(task => {
        if (task.completed || !task.deadline) return;
        const tTime = task.deadlineTime || "23:59";
        const deadlineDate = new Date(`${task.deadline}T${tTime}`);
        const diffHours = (deadlineDate - currentTime) / (1000 * 60 * 60);
        
        notifConfig.deadlineLeadTimes.forEach(leadHour => {
          if (diffHours > 0 && diffHours <= leadHour && diffHours > (leadHour - 0.02)) {
            new Notification("締切リマインド", {
              body: `「${task.title}」の締切まであと ${leadHour} 時間です。`,
              tag: `deadline-${task.id}-${leadHour}`
            });
          }
        });
      });

      if (notifConfig.enableSlotReminders && currentTime.getMinutes() === 0) {
        const scheduledNow = schedules.find(s => s.date === todayDateStr && s.startTime === `${hourStr}:00` && !s.recorded);
        if (scheduledNow) {
          const t = tasks.find(x => x.id === scheduledNow.taskId);
          if (t) new Notification("作業開始の時間です", { body: `「${t.title}」を開始しましょう。`, tag: 'slot-start' });
        }
      }
    };

    const timer = setInterval(checkNotifications, 60000);
    return () => clearInterval(timer);
  }, [schedules, tasks, notifConfig]);

  // UI Actions
  const handleLogin = async () => { 
    setAuthErrorMessage('');
    try { 
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider); 
    } catch (e) { 
      if (e.code === 'auth/unauthorized-domain') {
        setAuthErrorMessage(`ドメイン未承認: 「${window.location.hostname}」を追加してください。`);
      } else {
        console.error("Login failed", e);
      }
    } 
  };

  const handleLogout = async () => {
    if (window.confirm("ログアウトしますか？")) {
      await signOut(auth);
      window.location.reload();
    }
  };

  const saveNotifSettings = async (newConfig) => {
    setNotifConfig(newConfig);
    if (user) {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'notifications'), newConfig);
        setSaveFeedback(true);
        setTimeout(() => setSaveFeedback(false), 2000);
      } catch (e) { console.error("Save settings failed", e); }
    }
  };

  const sendTestNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification("通知テスト", { body: "TaskMaster Pro の通知は正常です！" });
    } else {
      alert("通知が許可されていないか、未対応のブラウザです。");
    }
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) return alert("このブラウザは通知に対応していません。");
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') setIsNotifSettingOpen(true);
    } catch (e) { console.error("Permission request error", e); }
  };

  const recordWork = async (schId, taskId, actualH, progressDelta) => {
    if (!user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const currentRem = metrics.taskMetrics[taskId]?.remainingHours || 0;
    const currentSlots = schedules.filter(s => s.taskId === taskId && !s.recorded).length;
    const wasSafe = currentSlots >= (currentRem - 0.1);
    const newTime = (parseFloat(task.timeSpent) || 0) + actualH;
    const newProg = Math.min((task.progress || 0) + progressDelta, 100);
    const isComp = newProg >= 100;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), { timeSpent: newTime, progress: newProg, completed: isComp });
    if (schId) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', schId), { recorded: true });
    
    const newAbility = newProg > 0 && newTime > 0 ? (((task.estimatedHours || 0) * (newProg / 100)) / newTime) : metrics.globalAbility;
    const newRem = ((task.estimatedHours || 0) * (1 - newProg / 100)) / (newAbility || 0.1);
    const newSlots = currentSlots - (schId ? 1 : 0);
    if (!isComp && wasSafe && newSlots < (newRem - 0.1)) { setRevisionAlert({ taskId, message: `効率低下により「${task.title}」の計画が不足しました。あと ${Math.ceil(newRem - newSlots)}枠 追加してください。` }); }
  };

  const metrics = useMemo(() => {
    const relevantTasks = tasks.filter(t => (t.timeSpent || 0) > 0);
    let totalEst = 0; let totalAct = 0;
    relevantTasks.forEach(t => {
      totalEst += ((t.estimatedHours || 0) * ((t.progress || 0) / 100));
      totalAct += parseFloat(t.timeSpent || 0);
    });
    const ability = totalAct > 0 ? totalEst / totalAct : 1.0;
    const taskMetrics = tasks.reduce((acc, t) => {
      const rawRem = (t.estimatedHours || 0) * (1 - (t.progress || 0) / 100);
      let tAbility = ability;
      if ((t.timeSpent || 0) > 0 && (t.progress || 0) > 0) tAbility = ((t.estimatedHours || 0) * ((t.progress || 0) / 100)) / (t.timeSpent || 1);
      const remHours = rawRem / (tAbility || 0.1);
      acc[t.id] = { remainingHours: isFinite(remHours) ? remHours : 0, ability: tAbility };
      return acc;
    }, {});
    return { globalAbility: ability, taskMetrics, totalRemaining: tasks.filter(t => !t.completed).reduce((sum, t) => sum + (taskMetrics[t.id]?.remainingHours || 0), 0) };
  }, [tasks]);

  const groupedTodayTodo = useMemo(() => {
    const today = now.toISOString().split('T')[0];
    const todaySchedules = schedules.filter(s => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups = {};
    todaySchedules.forEach(s => {
      if (!groups[s.taskId]) groups[s.taskId] = { taskId: s.taskId, slots: [], firstStartTime: s.startTime };
      groups[s.taskId].slots.push(s);
    });
    return Object.values(groups);
  }, [schedules, now]);

  const addTask = async (e) => {
    e?.preventDefault();
    if (!user || !formTitle.trim() || !formHours) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), {
        title: formTitle.trim(), 
        estimatedHours: parseFloat(formHours), 
        deadline: formDeadline || new Date().toISOString().split('T')[0],
        deadlineTime: formDeadlineTime || "23:59",
        progress: 0, 
        timeSpent: 0, 
        photos: [], 
        completed: false, 
        createdAt: new Date().toISOString()
      });
      setFormTitle(''); setFormHours(''); setFormDeadline(''); setFormDeadlineTime('23:59');
      setIsAddingTask(false); setActiveTab('list');
    } catch (err) { console.error("Add task failed", err); }
  };

  const addSchedule = async (taskId, date, hour) => {
    if (!user || !taskId) return;
    try {
      if (schedules.some(s => s.date === date && parseInt(s.startTime) === hour)) return;
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'schedules'), { taskId, date, startTime: `${String(hour).padStart(2, '0')}:00`, recorded: false });
    } catch (err) { console.error("Add schedule failed", err); }
  };

  const deleteAllCompleted = async () => {
    if (!user) return;
    if (!window.confirm("実績をすべて削除しますか？")) return;
    for (const t of tasks.filter(t => t.completed)) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', t.id));
    }
  };

  if (loading) return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white font-bold animate-pulse text-xs tracking-widest">CONNECTING...</div>;

  if (!user || user.isAnonymous) return (
    <div className="min-h-screen bg-indigo-800 flex flex-col items-center justify-center p-6 text-white text-center">
      <TargetIcon size={64} className="mb-6 opacity-50" />
      <h1 className="text-4xl font-black mb-2 tracking-tighter">TaskMaster</h1>
      <p className="mb-10 opacity-70 italic">Plan your potential.</p>
      
      {authErrorMessage && <div className="mb-6 bg-red-500/20 border border-red-500/50 p-4 rounded-2xl text-xs text-red-100 flex flex-col items-center gap-2 max-w-sm"><AlertCircle size={20} className="text-red-300" /><p>{authErrorMessage}</p></div>}

      <button onClick={handleLogin} className="bg-white text-indigo-900 px-10 py-5 rounded-[24px] font-black shadow-2xl flex items-center gap-3 active:scale-95 transition-all">
        <LogIn size={24} /> Googleでログイン
      </button>
      
      {user?.isAnonymous && (
        <button onClick={() => setUser({...user, isAnonymous: false})} className="mt-8 text-indigo-200 text-xs underline opacity-50">
          ログインせずに続ける（保存されません）
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 font-sans selection:bg-indigo-100 overflow-x-hidden">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-10 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-2 font-black"><TargetIcon size={24}/><span className="text-xl">TaskMaster Pro</span></div>
        <div className="flex items-center gap-3">
          <button onClick={() => notificationPermission === 'granted' ? setIsNotifSettingOpen(true) : requestPermission()} className={`${notificationPermission === 'granted' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white'} p-2 rounded-full transition-all active:scale-90`}>{notificationPermission === 'granted' ? <Bell size={20} /> : <BellOff size={20} />}</button>
          <button onClick={handleLogout} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="pb-32">
        {activeTab === 'dashboard' && (
          <div className="p-4 space-y-6 max-w-2xl mx-auto animate-in fade-in duration-500">
            <section className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">実質の残り時間</p>
                <p className="text-2xl font-black text-indigo-600">{metrics.totalRemaining.toFixed(1)}<span className="text-xs ml-1">h</span></p>
              </div>
              <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm">
                <p className="text-[10px] text-gray-400 font-black uppercase mb-1">平均効率</p>
                <p className="text-2xl font-black text-gray-800">{metrics.globalAbility.toFixed(2)}<span className="text-xs ml-1">x</span></p>
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 font-black"><PlayCircle size={18} className="text-indigo-600" /> 今日のTodo</h3>
                <span className="text-[10px] font-bold text-gray-400">{now.toISOString().split('T')[0].replace(/-/g, '/')}</span>
              </div>
              {groupedTodayTodo.length === 0 ? (
                <button onClick={() => setActiveTab('planner')} className="w-full bg-white border-2 border-dashed border-gray-100 rounded-[32px] p-12 text-center text-xs text-gray-400 hover:border-indigo-200">予定なし。計画を立てましょう</button>
              ) : (
                <div className="space-y-3">
                  {groupedTodayTodo.map(group => {
                    const task = tasks.find(t => t.id === group.taskId);
                    if (!task) return null;
                    const unrecordedSlots = group.slots.filter(s => !s.recorded);
                    const allRecorded = unrecordedSlots.length === 0;
                    const totalUnrecorded = schedules.filter(sc => sc.taskId === task.id && !sc.recorded).length;
                    const targetDelta = totalUnrecorded > 0 ? Math.ceil((100 - (task.progress || 0)) / totalUnrecorded) : 0;
                    return (
                      <div key={group.taskId} className={`bg-white rounded-[32px] p-5 border shadow-sm transition-all ${allRecorded ? 'opacity-40 grayscale' : 'border-gray-100'}`}>
                        <div className="flex justify-between items-center">
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 mb-2 inline-block">{group.firstStartTime}〜</span>
                            <h4 className="font-bold text-gray-900 truncate text-lg">{task.title}</h4>
                            <div className="mt-2 pr-4"><ProgressBar value={task.progress || 0} color="bg-indigo-500" /></div>
                          </div>
                          <div className="flex flex-col gap-2">
                            {!allRecorded ? (
                              <>
                                <button onClick={() => recordWork(unrecordedSlots[0].id, task.id, 1, targetDelta)} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-lg active:scale-90"><ThumbsUp size={20} /></button>
                                <button onClick={() => { setTempProgress(task.progress || 0); setTempTime(task.timeSpent || 0); setSelectedTask(task); }} className="p-3 bg-gray-50 text-gray-400 rounded-xl active:scale-90"><Edit3 size={16} /></button>
                              </>
                            ) : (
                              <div className="bg-green-50 text-green-500 p-4 rounded-2xl"><CheckCircle2 size={24} /></div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="bg-white p-8 rounded-[40px] shadow-sm text-center border border-gray-100">
              <h2 className="text-gray-400 text-[10px] font-bold uppercase mb-2 tracking-widest">Achievement</h2>
              <div className="text-6xl font-black text-indigo-950 mb-6 tracking-tighter">{Math.round(tasks.length ? (tasks.reduce((s,t)=>s+(t.progress||0),0)/(tasks.length*100))*100 : 0)}%</div>
              <ProgressBar value={tasks.length ? (tasks.reduce((s,t)=>s+(t.progress||0),0)/(tasks.length*100))*100 : 0} />
            </section>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto animate-in slide-in-from-bottom duration-500">
            <h2 className="font-black text-2xl text-gray-800 px-2">課題リスト</h2>
            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="bg-white p-5 rounded-[32px] border border-gray-100 flex items-center gap-4 shadow-sm">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setTempProgress(task.progress || 0); setTempTime(task.timeSpent || 0); setSelectedTask(task); }}>
                  <h3 className="font-bold text-lg truncate mb-1">{task.title}</h3>
                  <div className="text-[10px] text-indigo-500 font-black mb-2 flex items-center gap-1"><Clock size={10} /> 締切: {task.deadline?.replace(/-/g, '/')} {task.deadlineTime || "23:59"}</div>
                  <ProgressBar value={task.progress || 0} color="bg-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), {completed: true, progress: 100})} className="p-3 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors"><Check size={20} /></button>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id))} className="text-red-400 p-3 bg-red-50 rounded-full hover:bg-red-100"><Trash2 size={20} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'planner' && (
          <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto overflow-hidden bg-white animate-in zoom-in duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <button onClick={() => {const d=new Date(currentDate);d.setDate(d.getDate()-1);setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20}/></button>
              <h2 className="font-bold text-gray-800 tracking-tight">{currentDate.replace(/-/g, '/')}</h2>
              <button onClick={() => {const d=new Date(currentDate);d.setDate(d.getDate()+1);setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={20}/></button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-1/3 bg-gray-50 border-r overflow-y-auto p-2 space-y-3">
                {tasks.filter(t => !t.completed).map(task => {
                  const rem = metrics.taskMetrics[task.id]?.remainingHours || 0;
                  const slots = schedules.filter(s => s.taskId === task.id && !s.recorded).length;
                  const isSafe = slots >= (rem - 0.1);
                  return (
                    <div key={task.id} onClick={() => setPlanningSelection(planningSelection === task.id ? null : task.id)}
                      className={`p-2 rounded-xl border text-[10px] transition-all cursor-pointer ${planningSelection === task.id ? 'bg-indigo-600 text-white shadow-md scale-105' : isSafe ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      <div className="font-bold truncate">{task.title}</div>
                      <div className="opacity-70 mt-1 flex justify-between"><span>必要:{rem.toFixed(1)}h</span><span>枠:{slots}</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 overflow-y-auto p-4 select-none relative bg-white">
                {Array.from({length:24},(_,i)=>i).map(h => {
                  const isInDragRange = dragStartHour !== null && dragEndHour !== null && h >= Math.min(dragStartHour, dragEndHour) && h <= Math.max(dragStartHour, dragEndHour);
                  return (
                    <div key={h} onMouseDown={() => { if(planningSelection) { setDragStartHour(h); setDragEndHour(h); } }} onMouseEnter={() => { if(dragStartHour !== null) setDragEndHour(h); }}
                      className={`flex min-h-[56px] border-b border-gray-50 relative group transition-colors ${isInDragRange ? 'bg-indigo-50' : 'hover:bg-indigo-50/30'}`}>
                      <span className="w-8 text-[9px] text-gray-400 pt-2 font-mono">{h}:00</span>
                      <div className="flex-1 relative">
                        {isInDragRange && !schedules.some(s => s.date === currentDate && parseInt(s.startTime) === h) && <div className="absolute inset-x-2 inset-y-1 bg-indigo-600/20 border-2 border-dashed border-indigo-300 rounded-xl z-0"></div>}
                        {schedules.filter(s => s.date === currentDate && parseInt(s.startTime) === h).map(sch => (
                          <div key={sch.id} className="absolute inset-x-2 inset-y-1 bg-indigo-600 text-white rounded-xl p-2 text-[10px] flex justify-between items-center z-10 shadow-sm border border-white/10">
                            <span className="truncate font-bold">{tasks.find(x=>x.id===sch.taskId)?.title || 'Unknown'}</span>
                            <button onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', sch.id));}} className="p-0.5 hover:bg-white/20 rounded"><X size={10}/></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'completed' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <h2 className="font-black text-2xl text-gray-800 px-2">実績ギャラリー</h2>
            {tasks.filter(t => t.completed).length === 0 ? (
              <div className="text-center py-20 bg-white rounded-[32px] border border-dashed border-gray-200 text-gray-300 italic">実績はまだありません</div>
            ) : (
              tasks.filter(t => t.completed).map(task => (
                <div key={task.id} className="bg-white p-5 rounded-[40px] border border-gray-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div><h3 className="font-bold text-lg">{task.title}</h3><div className="flex items-center gap-2 mt-1"><CheckCircle2 className="text-green-500" size={14} /><span className="text-[10px] text-gray-400">実績: {task.timeSpent}h / 予定: {task.estimatedHours}h</span></div></div>
                    <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id))} className="text-red-400 p-2 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={20} /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {task.photos?.map((pic, i) => <img key={i} src={pic} className="aspect-square object-cover rounded-2xl cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(pic)} alt="achievement" />)}
                    <label className="aspect-square border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-gray-300 hover:text-indigo-400 hover:bg-indigo-50 cursor-pointer transition-all"><Camera size={24} /><input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                      const files = Array.from(e.target.files);
                      files.forEach(file => {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id);
                          const currentT = tasks.find(t=>t.id===task.id);
                          await updateDoc(taskRef, { photos: [...(currentT?.photos || []), reader.result] });
                        };
                        reader.readAsDataURL(file);
                      });
                    }} /></label>
                  </div>
                </div>
              ))
            )}
            {tasks.filter(t => t.completed).length > 0 && (
              <button onClick={deleteAllCompleted} className="w-full py-4 text-red-500 font-bold text-sm bg-white rounded-2xl border border-red-100 active:bg-red-50 transition-colors">実績をすべて削除</button>
            )}
          </div>
        )}
      </main>

      {/* 丸型の＋ボタン */}
      <nav className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-white/90 backdrop-blur-xl border border-white/20 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex justify-around items-center px-2 py-3 z-20">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'ホーム' },
          { id: 'list', icon: ListTodo, label: '課題' },
          { id: 'add', icon: PlusCircle, label: '', special: true },
          { id: 'planner', icon: CalendarDays, label: '計画' },
          { id: 'completed', icon: CheckCircle2, label: '実績' }
        ].map(tab => (
          <button key={tab.id} onClick={() => tab.special ? setIsAddingTask(true) : setActiveTab(tab.id)} className={`relative flex flex-col items-center transition-all duration-300 px-3 py-1 ${tab.special ? 'bg-indigo-600 text-white w-20 h-20 -mt-10 flex items-center justify-center rounded-full shadow-indigo-300 shadow-2xl active:scale-90 ring-8 ring-white hover:bg-indigo-700' : (activeTab === tab.id ? 'text-indigo-600 scale-110' : 'text-gray-400 hover:text-gray-600')}`}>
            <tab.icon size={tab.special ? 36 : 22} strokeWidth={activeTab === tab.id || tab.special ? 2.5 : 2} />
            {tab.label && <span className="text-[9px] mt-1 font-bold">{tab.label}</span>}
          </button>
        ))}
      </nav>

      {/* 通知設定モーダル */}
      {isNotifSettingOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 space-y-6 animate-in zoom-in duration-300 shadow-2xl">
            <div className="flex justify-between items-center"><h2 className="text-xl font-black flex items-center gap-2"><SettingsIcon size={20}/>通知設定</h2><button onClick={() => setIsNotifSettingOpen(false)} className="p-2 bg-gray-50 rounded-full"><X size={18}/></button></div>
            
            <div className="space-y-5">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">期限前リマインド（複数設定可）</label>
                <div className="flex flex-wrap gap-2">
                  {notifConfig.deadlineLeadTimes.map((time, idx) => (
                    <div key={idx} className="bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl flex items-center gap-2 text-sm font-black animate-in fade-in">
                      {time}時間前
                      <button onClick={() => {
                        const newTimes = notifConfig.deadlineLeadTimes.filter((_, i) => i !== idx);
                        saveNotifSettings({...notifConfig, deadlineLeadTimes: newTimes});
                      }} className="text-indigo-300 hover:text-indigo-600"><Minus size={14} /></button>
                    </div>
                  ))}
                  <button 
                    onClick={() => {
                      const hourStr = prompt("何時間前に通知しますか？ (半角数値)");
                      const hour = parseInt(hourStr || "");
                      if (!isNaN(hour)) {
                        const newTimes = Array.from(new Set([...notifConfig.deadlineLeadTimes, hour])).sort((a,b)=>a-b);
                        saveNotifSettings({...notifConfig, deadlineLeadTimes: newTimes});
                      }
                    }}
                    className="bg-gray-100 text-gray-500 p-2 rounded-xl hover:bg-gray-200"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">今日のまとめ通知時刻</label>
                <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-2xl">
                  <Calendar size={18} className="text-indigo-500" />
                  <input type="time" className="flex-1 bg-transparent font-bold outline-none" value={notifConfig.dailySummaryTime} onChange={(e) => saveNotifSettings({...notifConfig, dailySummaryTime: e.target.value})}/>
                </div>
              </div>

              <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-2xl">
                <span className="text-sm font-bold text-indigo-900">スロット開始時に通知</span>
                <button 
                  onClick={() => saveNotifSettings({...notifConfig, enableSlotReminders: !notifConfig.enableSlotReminders})}
                  className={`w-12 h-6 rounded-full transition-all relative ${notifConfig.enableSlotReminders ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notifConfig.enableSlotReminders ? 'left-7' : 'left-1'}`}></div>
                </button>
              </div>
              <button onClick={sendTestNotification} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-indigo-100 rounded-2xl text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-colors"><SendHorizontal size={18} /> テスト通知を送る</button>
            </div>
            <div className="space-y-3"><button onClick={() => setIsNotifSettingOpen(false)} className="w-full bg-indigo-600 text-white p-4 rounded-3xl font-black shadow-lg">閉じる</button>{saveFeedback && <p className="text-center text-[10px] text-green-500 font-bold animate-pulse">設定を同期しました ✓</p>}</div>
          </div>
        </div>
      )}

      {/* 課題追加モーダル */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end p-0">
          <div className="bg-white w-full rounded-t-[48px] p-10 space-y-6 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-2xl font-black tracking-tighter">新しい課題を追加</h2>
            <form onSubmit={addTask} className="space-y-4">
              <input type="text" placeholder="課題名" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-transparent focus:ring-indigo-500/20 transition-all" value={formTitle} onChange={e=>setFormTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="0.1" placeholder="予定時間(h)" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-transparent focus:ring-indigo-500/20 transition-all" value={formHours} onChange={e=>setFormHours(e.target.value)} />
                <input type="date" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm ring-2 ring-transparent focus:ring-indigo-500/20 transition-all" value={formDeadline} onChange={e=>setFormDeadline(e.target.value)} />
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-50 rounded-2xl p-4 flex items-center gap-2 border-2 border-transparent focus-within:border-indigo-500/20 transition-all">
                  <Clock size={18} className="text-gray-400" />
                  <input type="time" className="bg-transparent font-bold outline-none flex-1" value={formDeadlineTime} onChange={e=>setFormDeadlineTime(e.target.value)} />
                </div>
                <button type="button" onClick={() => setFormDeadlineTime("23:59")} className="bg-indigo-50 text-indigo-600 px-4 py-4 rounded-2xl font-black text-xs active:scale-95 transition-all">23:59</button>
              </div>

              <button type="submit" className="w-full bg-indigo-600 text-white p-5 rounded-[24px] font-black shadow-lg hover:bg-indigo-700 transition-all">登録する</button>
              <button type="button" onClick={()=>setIsAddingTask(false)} className="w-full text-gray-400 py-2 font-bold text-sm hover:text-gray-600">キャンセル</button>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[32px] p-8 space-y-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start font-black"><h3>進捗修正</h3><button onClick={() => setSelectedTask(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button></div>
            <div className="space-y-6">
              <div className="space-y-3"><div className="flex justify-between text-sm font-bold"><span className="text-gray-500">進捗率</span><span className="text-indigo-600 font-black">{tempProgress}%</span></div><input type="range" className="w-full h-3 bg-gray-100 rounded-full appearance-none accent-indigo-600 cursor-pointer" value={tempProgress} onChange={e => setTempProgress(parseInt(e.target.value))} /></div>
              <div className="space-y-3"><label className="text-[10px] font-bold text-gray-400 ml-1">作業時間 (h)</label><input type="number" step="0.1" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-transparent focus:ring-indigo-500/20 transition-all" value={tempTime} onChange={e => setTempTime(parseFloat(e.target.value) || 0)} /></div>
              <button onClick={async () => {
                const isComp = tempProgress >= 100;
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', selectedTask.id), { progress: tempProgress, timeSpent: tempTime, completed: isComp });
                setSelectedTask(null);
              }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-xl hover:bg-indigo-700 transition-all">保存する</button>
            </div>
          </div>
        </div>
      )}

      {revisionAlert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[70] flex items-center justify-center p-6">
          <div className="bg-white w-full max-sm:w-full max-w-sm rounded-[40px] p-8 text-center space-y-6 animate-in zoom-in duration-300 shadow-2xl border border-red-50">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50 shadow-sm"><AlertTriangle size={40} /></div>
            <div className="space-y-2"><h2 className="text-2xl font-black text-gray-900 tracking-tight">計画不足</h2><p className="text-sm text-gray-500 leading-relaxed font-medium">{revisionAlert.message}</p></div>
            <button onClick={() => { setActiveTab('planner'); setRevisionAlert(null); }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all"><RefreshCw size={20} /> 計画を追加する</button>
            <button onClick={() => setRevisionAlert(null)} className="w-full text-gray-400 font-bold py-2 text-sm hover:text-gray-600">閉じる</button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10" alt="Preview" />
          <button className="absolute top-8 right-8 text-white bg-white/10 p-3 rounded-full hover:bg-white/20 transition-all"><X size={32}/></button>
        </div>
      )}
    </div>
  );
};

export default App;
