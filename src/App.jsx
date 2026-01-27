import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot
} from 'firebase/firestore';
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
  LogIn
} from 'lucide-react';

/**
 * ==========================================
 * あなたのFirebaseプロジェクト設定（修正済み）
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
const APP_ID = 'task-master-v1';

// --- UI共通コンポーネント ---
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
  
  const [revisionAlert, setRevisionAlert] = useState(null);
  const [planningSelection, setPlanningSelection] = useState(null);

  // ポップアップ用の一時ステート（バグ防止）
  const [tempProgress, setTempProgress] = useState(0);
  const [tempTime, setTempTime] = useState(0);

  // ドラッグ選択用のステート
  const [dragStartHour, setDragStartHour] = useState(null);
  const [dragEndHour, setDragEndHour] = useState(null);

  const [formTitle, setFormTitle] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  // 1. 認証監視
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // 2. リアルタイムデータ同期
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setSchedules([]);
      return;
    }
    const unsubTasks = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks'), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, photos: [], ...d.data() })));
    });
    const unsubSch = onSnapshot(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'schedules'), (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubTasks(); unsubSch(); };
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ドラッグ終了検知
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragStartHour !== null) {
        const start = Math.min(dragStartHour, dragEndHour);
        const end = Math.max(dragStartHour, dragEndHour);
        for (let h = start; h <= end; h++) {
          addSchedule(planningSelection, currentDate, h);
        }
        setDragStartHour(null);
        setDragEndHour(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragStartHour, dragEndHour, planningSelection, currentDate, schedules]);

  // 効率分析エンジン
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
      if ((t.timeSpent || 0) > 0 && (t.progress || 0) > 0) {
        tAbility = ((t.estimatedHours || 0) * ((t.progress || 0) / 100)) / (t.timeSpent || 1);
      }
      const remHours = rawRem / (tAbility || 0.1);
      acc[t.id] = { remainingHours: isFinite(remHours) ? remHours : 0, ability: tAbility };
      return acc;
    }, {});

    const totalRemaining = tasks.filter(t => !t.completed).reduce((sum, t) => sum + (taskMetrics[t.id]?.remainingHours || 0), 0);
    return { globalAbility: ability, taskMetrics, totalRemaining };
  }, [tasks]);

  // ホーム表示用のまとめロジック
  const groupedTodayTodo = useMemo(() => {
    const today = now.toISOString().split('T')[0];
    const todaySchedules = schedules.filter(s => s.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const groups = {};
    todaySchedules.forEach(s => {
      if (!groups[s.taskId]) {
        groups[s.taskId] = { taskId: s.taskId, slots: [], firstStartTime: s.startTime };
      }
      groups[s.taskId].slots.push(s);
    });
    return Object.values(groups);
  }, [schedules, now]);

  const handleLogin = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { console.error(e); }
  };

  const addTask = async (e) => {
    e?.preventDefault();
    if (!user || !formTitle.trim() || !formHours) return;
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks'), {
        title: formTitle.trim(),
        estimatedHours: parseFloat(formHours),
        deadline: formDeadline || new Date().toISOString().split('T')[0],
        progress: 0, timeSpent: 0, photos: [], completed: false, createdAt: new Date().toISOString()
      });
      setFormTitle(''); setFormHours(''); setFormDeadline('');
      setIsAddingTask(false); setActiveTab('list');
    } catch (err) { console.error(err); }
  };

  const addSchedule = async (taskId, date, hour) => {
    if (!user || !taskId) return;
    try {
      const exists = schedules.some(s => s.date === date && parseInt(s.startTime) === hour);
      if (exists) return;
      await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'schedules'), {
        taskId, date, startTime: `${String(hour).padStart(2, '0')}:00`, recorded: false
      });
    } catch (err) { console.error(err); }
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

    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', taskId), {
      timeSpent: newTime, progress: newProg, completed: isComp
    });
    if (schId) await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'schedules', schId), { recorded: true });
    
    const newRawRem = (task.estimatedHours || 0) * (1 - newProg / 100);
    const newAbility = newProg > 0 && newTime > 0 ? ((task.estimatedHours || 0) * (newProg / 100)) / newTime : metrics.globalAbility;
    const newRem = newRawRem / (newAbility || 0.1);
    const newSlots = currentSlots - (schId ? 1 : 0);
    if (!isComp && wasSafe && newSlots < (newRem - 0.1)) {
      setRevisionAlert({ taskId, message: `効率が落ちたため「${task.title}」の計画が不足しました。あと ${Math.ceil(newRem - newSlots)}枠 追加してください。` });
    }
  };

  if (loading) return <div className="min-h-screen bg-indigo-900 flex items-center justify-center text-white font-bold">Connecting...</div>;

  if (!user) return (
    <div className="min-h-screen bg-indigo-800 flex flex-col items-center justify-center p-6 text-white text-center">
      <TargetIcon size={64} className="mb-6 opacity-50" />
      <h1 className="text-4xl font-black mb-2 tracking-tighter">TaskMaster</h1>
      <p className="mb-10 opacity-70 italic">Plan your potential.</p>
      <button onClick={handleLogin} className="bg-white text-indigo-900 px-10 py-5 rounded-[24px] font-black shadow-2xl flex items-center gap-3 active:scale-95 transition-all">
        <LogIn size={24} /> Googleでログイン
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 font-sans selection:bg-indigo-100 overflow-x-hidden">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-10 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-2 font-black"><TargetIcon size={24}/><span className="text-xl">TaskMaster Pro</span></div>
        <button onClick={() => signOut(auth)} className="bg-white/10 p-2 rounded-full"><LogOut size={20}/></button>
      </header>

      <main className="pb-32">
        {activeTab === 'dashboard' && (
          <div className="p-4 space-y-6 max-w-2xl mx-auto">
            <section className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 font-black"><PlayCircle size={18} className="text-indigo-600" /> 今日のTodo</h3>
                <span className="text-[10px] font-bold text-gray-400">{now.toISOString().split('T')[0].replace(/-/g, '/')}</span>
              </div>
              {groupedTodayTodo.length === 0 ? (
                <button onClick={() => setActiveTab('planner')} className="w-full bg-white border-2 border-dashed border-gray-100 rounded-[32px] p-12 text-center text-xs text-gray-400">予定なし。計画を立てましょう</button>
              ) : (
                <div className="space-y-3">
                  {groupedTodayTodo.map(group => {
                    const task = tasks.find(t => t.id === group.taskId);
                    if (!task) return null;
                    const unrecordedSlots = group.slots.filter(s => !s.recorded);
                    const allRecorded = unrecordedSlots.length === 0;
                    const totalUnrecordedInApp = schedules.filter(sc => sc.taskId === task.id && !sc.recorded).length;
                    const targetDelta = totalUnrecordedInApp > 0 ? Math.ceil((100 - (task.progress || 0)) / totalUnrecordedInApp) : 0;
                    return (
                      <div key={group.taskId} className={`bg-white rounded-[32px] p-5 border shadow-sm transition-all ${allRecorded ? 'opacity-40 grayscale border-gray-100' : 'border-gray-100'}`}>
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
              <h2 className="text-gray-400 text-[10px] font-bold uppercase mb-2 tracking-widest">Global Achievement</h2>
              <div className="text-6xl font-black text-indigo-950 mb-6">{Math.round(tasks.length ? (tasks.reduce((s,t)=>s+(t.progress||0),0)/(tasks.length*100))*100 : 0)}%</div>
              <ProgressBar value={tasks.length ? (tasks.reduce((s,t)=>s+(t.progress||0),0)/(tasks.length*100))*100 : 0} />
            </section>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto">
            <h2 className="font-black text-2xl text-gray-800 px-2">課題リスト</h2>
            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="bg-white p-5 rounded-[32px] border border-gray-100 flex items-center gap-4 shadow-sm">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setTempProgress(task.progress || 0); setTempTime(task.timeSpent || 0); setSelectedTask(task); }}>
                  <h3 className="font-bold text-lg truncate mb-1">{task.title}</h3>
                  <div className="text-[10px] text-indigo-500 font-black mb-2">締切: {task.deadline?.replace(/-/g, '/')}</div>
                  <ProgressBar value={task.progress || 0} color="bg-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', task.id), {completed: true, progress: 100})} className="p-3 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors"><Check size={20} /></button>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', task.id))} className="text-red-400 p-3 bg-red-50 rounded-full hover:bg-red-100"><Trash2 size={20} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'planner' && (
          <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto overflow-hidden bg-white">
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
                      className={`p-2 rounded-xl border text-[10px] transition-all cursor-pointer ${planningSelection === task.id ? 'bg-indigo-600 text-white shadow-md' : isSafe ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      <div className="font-bold truncate">{task.title}</div>
                      <div className="opacity-70 mt-1 flex justify-between"><span>必要:{rem.toFixed(1)}h</span><span>枠:{slots}</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 overflow-y-auto p-4 select-none relative bg-white">
                {Array.from({length:15},(_,i)=>i+8).map(h => {
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
                            <button onMouseDown={(e)=>e.stopPropagation()} onClick={(e)=>{e.stopPropagation();deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'schedules', sch.id));}} className="p-0.5 hover:bg-white/20 rounded"><X size={10}/></button>
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
            <div className="flex justify-between items-center px-2">
              <h2 className="font-black text-2xl text-gray-800">実績ギャラリー</h2>
              {tasks.filter(t => t.completed).length > 0 && <button onClick={() => { if(window.confirm("一括削除しますか？")) deleteAllCompleted(); }} className="bg-red-50 text-red-500 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1"><Trash2 size={12} /> 一括削除</button>}
            </div>
            {tasks.filter(t => t.completed).map(task => (
              <div key={task.id} className="bg-white p-5 rounded-[40px] border border-gray-100 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div><h3 className="font-bold text-lg">{task.title}</h3><div className="flex items-center gap-2 mt-1"><CheckCircle2 className="text-green-500" size={14} /><span className="text-[10px] text-gray-400">実績: {task.timeSpent}h / 予定: {task.estimatedHours}h</span></div></div>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', task.id))} className="text-red-400 p-2"><Trash2 size={20} /></button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {task.photos?.map((pic, i) => <img key={i} src={pic} className="aspect-square object-cover rounded-2xl cursor-pointer" onClick={() => setPreviewImage(pic)} alt="achievement" />)}
                  <label className="aspect-square border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-gray-300 hover:text-indigo-400 cursor-pointer"><Camera size={24} /><input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                    const files = Array.from(e.target.files);
                    files.forEach(file => {
                      const reader = new FileReader();
                      reader.onloadend = async () => {
                        const taskRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', task.id);
                        const currentT = tasks.find(t=>t.id===task.id);
                        await updateDoc(taskRef, { photos: [...(currentT?.photos || []), reader.result] });
                      };
                      reader.readAsDataURL(file);
                    });
                  }} /></label>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* モバイル向けフローティングドック */}
      <nav className="fixed bottom-6 left-4 right-4 max-w-md mx-auto bg-white/90 backdrop-blur-xl border border-white/20 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] flex justify-around items-center px-2 py-3 z-20">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'ホーム' },
          { id: 'list', icon: ListTodo, label: '課題' },
          { id: 'add', icon: PlusCircle, label: '', special: true },
          { id: 'planner', icon: CalendarDays, label: '計画' },
          { id: 'completed', icon: CheckCircle2, label: '実績' }
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => tab.special ? setIsAddingTask(true) : setActiveTab(tab.id)}
            className={`relative flex flex-col items-center transition-all duration-300 px-3 py-1 ${
              tab.special 
                ? 'bg-indigo-600 text-white p-4 rounded-2xl shadow-indigo-200 shadow-lg -mt-12 active:scale-90' 
                : (activeTab === tab.id ? 'text-indigo-600 scale-110' : 'text-gray-400')
            }`}
          >
            <tab.icon size={tab.special ? 28 : 22} strokeWidth={activeTab === tab.id || tab.special ? 2.5 : 2} />
            {tab.label && <span className="text-[9px] mt-1 font-bold">{tab.label}</span>}
          </button>
        ))}
      </nav>

      {/* 各種モーダル */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end p-0">
          <div className="bg-white w-full rounded-t-[48px] p-10 space-y-6 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-2xl font-black">新しい課題を追加</h2>
            <form onSubmit={addTask} className="space-y-4">
              <input type="text" placeholder="課題名" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold" value={formTitle} onChange={e=>setFormTitle(e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" step="0.1" placeholder="予定時間(h)" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold" value={formHours} onChange={e=>setFormHours(e.target.value)} />
                <input type="date" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold text-sm" value={formDeadline} onChange={e=>setFormDeadline(e.target.value)} />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white p-5 rounded-[24px] font-black shadow-lg">登録する</button>
              <button type="button" onClick={()=>setIsAddingTask(false)} className="w-full text-gray-400 py-2 font-bold text-sm">キャンセル</button>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[32px] p-8 space-y-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-start font-black"><h3>進捗修正</h3><button onClick={() => setSelectedTask(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button></div>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-bold"><span className="text-gray-500">進捗率</span><span className="text-indigo-600 font-black">{tempProgress}%</span></div>
                <input type="range" className="w-full h-3 bg-gray-100 rounded-full appearance-none accent-indigo-600 cursor-pointer" value={tempProgress} onChange={e => setTempProgress(parseInt(e.target.value))} />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400">作業時間 (h)</label>
                <input type="number" step="0.1" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-transparent focus:ring-indigo-500/20 transition-all" value={tempTime} onChange={e => setTempTime(parseFloat(e.target.value) || 0)} />
              </div>
              <button onClick={async () => {
                const isComp = tempProgress >= 100;
                await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'tasks', selectedTask.id), { progress: tempProgress, timeSpent: tempTime, completed: isComp });
                setSelectedTask(null);
              }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-xl">保存する</button>
            </div>
          </div>
        </div>
      )}

      {revisionAlert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[70] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center space-y-6 animate-in zoom-in duration-300 shadow-2xl border border-red-50">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50"><AlertTriangle size={40} /></div>
            <div className="space-y-2"><h2 className="text-2xl font-black text-gray-900 tracking-tight">計画不足</h2><p className="text-sm text-gray-500 leading-relaxed font-medium">{revisionAlert.message}</p></div>
            <button onClick={() => { setActiveTab('planner'); setRevisionAlert(null); }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-xl flex items-center justify-center gap-2"><RefreshCw size={20} /> 計画を追加する</button>
            <button onClick={() => setRevisionAlert(null)} className="w-full text-gray-400 font-bold py-2 text-sm">閉じる</button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-w-full max-h-full object-contain rounded-xl" alt="Preview" />
          <button className="absolute top-8 right-8 text-white"><X size={32}/></button>
        </div>
      )}
    </div>
  );
};

export default App;