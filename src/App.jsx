import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged,
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  PlusCircle, 
  ListTodo, 
  CheckCircle2, 
  Calendar, 
  Camera, 
  Clock, 
  AlertCircle,
  ChevronRight,
  X,
  TrendingUp,
  ChevronLeft,
  CalendarDays,
  Trash2,
  Check,
  Info,
  History as HistoryIcon,
  Target as TargetIcon,
  ThumbsUp,
  ThumbsDown,
  Timer as TimerIcon,
  PlayCircle,
  Edit3,
  AlertTriangle,
  RefreshCw,
  LogOut,
  LogIn
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'task-master-v3-stable';

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
  // --- Auth State ---
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- App State ---
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

  // Form States
  const [formTitle, setFormTitle] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  // --- Auth logic ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); } catch(e) {}
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); } catch (e) { await signInAnonymously(auth); }
  };

  // --- Firestore Sync ---
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setSchedules([]);
      return;
    }
    const tasksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tasks');
    const schedulesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'schedules');

    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, photos: [], ...d.data() })));
    });
    const unsubSch = onSnapshot(schedulesRef, (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubTasks(); unsubSch(); };
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // --- Metrics Engine ---
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

  // --- Actions ---
  const addTask = async (e) => {
    e?.preventDefault();
    if (!user || !formTitle.trim() || !formHours) return;
    try {
      const hours = parseFloat(formHours);
      if (isNaN(hours)) return;
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'tasks'), {
        title: formTitle.trim(),
        estimatedHours: hours,
        deadline: formDeadline || new Date().toISOString().split('T')[0],
        progress: 0,
        timeSpent: 0,
        photos: [],
        completed: false,
        createdAt: new Date().toISOString()
      });
      setFormTitle(''); setFormHours(''); setFormDeadline('');
      setIsAddingTask(false);
      setActiveTab('list');
    } catch (err) { console.error(err); }
  };

  const addSchedule = async (taskId, date, hour) => {
    if (!user || !taskId) return;
    try {
      const schRef = collection(db, 'artifacts', appId, 'users', user.uid, 'schedules');
      await addDoc(schRef, {
        taskId,
        date,
        startTime: `${String(hour).padStart(2, '0')}:00`,
        recorded: false
      });
      setPlanningSelection(null); 
    } catch (err) { console.error("Add schedule error:", err); }
  };

  const recordWork = async (schId, taskId, actualH, progressDelta) => {
    if (!user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const taskMetric = metrics.taskMetrics[taskId] || { remainingHours: 0 };
    const currentRem = taskMetric.remainingHours;
    const currentSlots = schedules.filter(s => s.taskId === taskId && !s.recorded).length;
    const wasSafe = currentSlots >= (currentRem - 0.1);

    const newTime = (parseFloat(task.timeSpent) || 0) + actualH;
    const newProg = Math.min((task.progress || 0) + progressDelta, 100);
    const isComp = newProg >= 100;

    const newRawRem = (task.estimatedHours || 0) * (1 - newProg / 100);
    const newAbility = newProg > 0 && newTime > 0 ? ((task.estimatedHours || 0) * (newProg / 100)) / newTime : metrics.globalAbility;
    const newRem = newRawRem / (newAbility || 0.1);
    const newSlots = currentSlots - (schId ? 1 : 0);

    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), {
      timeSpent: newTime, progress: newProg, completed: isComp
    });
    if (schId) {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', schId), { recorded: true });
    }

    if (!isComp && wasSafe && newSlots < (newRem - 0.1)) {
      setRevisionAlert({ taskId, message: `ペースが落ちたため「${task.title}」の計画が不足しました。あと ${Math.ceil(newRem - newSlots)}枠 追加してください。` });
    }
  };

  const deleteTask = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', id));
      const related = schedules.filter(s => s.taskId === id);
      for (const s of related) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', s.id));
      }
    } catch (err) { console.error(err); }
  };

  const deleteAllCompletedTasks = async () => {
    if (!user) return;
    const completedOnes = tasks.filter(t => t.completed);
    if (completedOnes.length === 0) return;
    
    // 一括削除実行
    for (const task of completedOnes) {
      await deleteTask(task.id);
    }
  };

  // --- Sub-Views ---
  const HomeView = () => {
    const today = now.toISOString().split('T')[0];
    const todaySch = schedules.filter(s => s.date === today).sort((a,b) => a.startTime.localeCompare(b.startTime));
    const overallProg = tasks.length ? (tasks.reduce((s, t) => s + (t.progress || 0), 0) / (tasks.length * 100)) * 100 : 0;

    return (
      <div className="p-4 space-y-6 max-w-2xl mx-auto pb-32">
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><PlayCircle size={18} className="text-indigo-600" /> 今日のプラン</h3>
            <span className="text-[10px] font-bold text-gray-400">{today.replace(/-/g, '/')}</span>
          </div>
          {todaySch.length === 0 ? (
            <button onClick={() => setActiveTab('planner')} className="w-full bg-white border-2 border-dashed border-gray-100 rounded-3xl p-10 text-center">
              <Calendar size={32} className="mx-auto mb-2 text-gray-200" />
              <p className="text-xs text-gray-400">予定がありません。計画を立てましょう</p>
            </button>
          ) : (
            <div className="space-y-3">
              {todaySch.map(s => {
                const task = tasks.find(t => t.id === s.taskId);
                if (!task) return null;
                const remainingSlotsForTask = schedules.filter(sc => sc.taskId === task.id && !sc.recorded).length;
                const targetDelta = remainingSlotsForTask > 0 ? Math.ceil((100 - (task.progress || 0)) / remainingSlotsForTask) : 0;
                const startHour = parseInt(s.startTime);
                const isPast = startHour < now.getHours();
                const isNow = startHour === now.getHours();

                return (
                  <div key={s.id} className={`bg-white rounded-[24px] p-4 border transition-all ${s.recorded ? 'opacity-40' : (isNow ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-md' : 'border-gray-100 shadow-sm')}`}>
                    <div className="flex justify-between items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isNow ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{s.startTime}</span>
                          {!s.recorded && <span className="text-[10px] text-indigo-600 font-bold">ノルマ: +{targetDelta}%</span>}
                        </div>
                        <h4 className="font-bold text-gray-900 truncate">{task.title}</h4>
                      </div>
                      <div className="flex gap-2 ml-2">
                        {!s.recorded && (isPast || isNow) && (
                          <button onClick={() => recordWork(s.id, task.id, 1, targetDelta)} className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg active:scale-90"><ThumbsUp size={16} /></button>
                        )}
                        {!s.recorded && <button onClick={() => setSelectedTask(task)} className="p-3 bg-white border border-gray-200 text-gray-400 rounded-xl active:scale-90"><Edit3 size={16} /></button>}
                        {s.recorded && <CheckCircle2 className="text-green-500" size={24} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 text-center">
          <h2 className="text-gray-400 text-[10px] font-bold uppercase mb-2 tracking-widest">Global Progress</h2>
          <div className="text-5xl font-black text-indigo-950 mb-4">{Math.round(overallProg)}%</div>
          <ProgressBar value={overallProg} height="h-3" />
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-[24px] border border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">実質必要残り</p>
            <p className="text-2xl font-black text-indigo-600">{metrics.totalRemaining.toFixed(1)}<span className="text-xs ml-1">h</span></p>
          </div>
          <div className="bg-white p-5 rounded-[24px] border border-gray-100">
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">平均効率</p>
            <p className="text-2xl font-black text-gray-800">{metrics.globalAbility.toFixed(2)}<span className="text-xs ml-1">x</span></p>
          </div>
        </section>
      </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-indigo-900 flex items-center justify-center p-6 text-white text-center">
      <div className="space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-400 border-t-white rounded-full animate-spin mx-auto"></div>
        <p className="text-[10px] font-bold tracking-widest uppercase opacity-60">Syncing with Task Cloud...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 to-indigo-900 flex items-center justify-center p-6 text-white text-center">
      <div className="max-w-sm w-full space-y-10">
        <div className="bg-white/20 p-8 rounded-[48px] inline-block shadow-2xl backdrop-blur-md"><TargetIcon size={80} /></div>
        <div className="space-y-2">
          <h1 className="text-5xl font-black tracking-tighter">TaskMaster</h1>
          <p className="text-indigo-200 text-sm">AI分析で「本当に終わる計画」を作る</p>
        </div>
        <button onClick={handleGoogleLogin} className="w-full bg-white text-indigo-900 p-5 rounded-[24px] font-black flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-all">
          <LogIn size={24} /> Googleアカウントでログイン
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-950 font-sans selection:bg-indigo-100 overflow-x-hidden">
      <header className="bg-indigo-700 text-white p-5 sticky top-0 z-10 shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-2 font-black"><TargetIcon size={24}/><span className="text-xl">TaskMaster Pro</span></div>
        <button onClick={() => signOut(auth)} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors"><LogOut size={20}/></button>
      </header>

      <main className="pb-32">
        {activeTab === 'dashboard' && <HomeView />}
        {activeTab === 'list' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
            <h2 className="font-bold text-gray-800 px-1">未完了の課題</h2>
            {tasks.filter(t => !t.completed).map(task => (
              <div key={task.id} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTask(task)}>
                  <h3 className="font-bold text-gray-900 truncate mb-1">{task.title}</h3>
                  <div className="flex gap-4 text-[10px] text-gray-400 mb-2 font-medium">
                    <span>実績: {task.timeSpent || 0}h</span>
                    <span className="text-indigo-500">進捗: {task.progress || 0}%</span>
                  </div>
                  <ProgressBar value={task.progress || 0} color="bg-indigo-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), {completed: true, progress: 100})} className="p-2.5 bg-green-50 text-green-600 rounded-full hover:bg-green-100 transition-colors"><Check size={20} /></button>
                  <button onClick={() => deleteTask(task.id)} className="p-2.5 bg-red-50 text-red-400 rounded-full hover:bg-red-100 transition-colors"><Trash2 size={20} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'planner' && (
          <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto overflow-hidden bg-white">
            <div className="p-4 border-b space-y-3">
              <div className="flex justify-between items-center">
                <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 bg-gray-50 rounded-full"><ChevronLeft size={20}/></button>
                <h2 className="font-bold text-gray-800">{currentDate.replace(/-/g, '/')}</h2>
                <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(d.toISOString().split('T')[0]);}} className="p-2 bg-gray-50 rounded-full"><ChevronRight size={20}/></button>
              </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div className="w-1/3 bg-gray-50 border-r overflow-y-auto p-2 space-y-3">
                {tasks.filter(t => !t.completed).map(task => {
                  const rem = metrics.taskMetrics[task.id]?.remainingHours || 0;
                  const slots = schedules.filter(s => s.taskId === task.id && !s.recorded).length;
                  const isSafe = slots >= (rem - 0.1);
                  return (
                    <div key={task.id} onClick={() => setPlanningSelection(planningSelection === task.id ? null : task.id)}
                      className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${planningSelection === task.id ? 'bg-indigo-600 text-white shadow-xl' : isSafe ? 'bg-green-50 text-green-900 border-green-100' : 'bg-red-50 text-red-900 border-red-100'}`}>
                      <div className="font-bold truncate text-[10px] mb-1">{task.title}</div>
                      <div className="text-[8px] opacity-70 flex justify-between"><span>必要:{rem.toFixed(1)}h</span><span>枠:{slots}</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 overflow-y-auto p-4 select-none">
                {Array.from({length: 15}, (_, i) => i + 8).map(h => (
                  <div key={h} onClick={() => planningSelection && addSchedule(planningSelection, currentDate, h)}
                    className="flex min-h-[56px] border-b border-gray-50 relative group transition-colors hover:bg-indigo-50/30">
                    <span className="w-10 text-[9px] text-gray-400 pt-2 font-mono">{h}:00</span>
                    <div className="flex-1">
                      {schedules.filter(s => s.date === currentDate && parseInt(s.startTime) === h).map(sch => {
                        const t = tasks.find(x => x.id === sch.taskId);
                        return (
                          <div key={sch.id} className="absolute inset-x-10 inset-y-1 bg-indigo-600 text-white rounded-xl p-2 text-[10px] flex justify-between items-center z-10 border border-white/10 shadow-md">
                            <span className="truncate font-bold">{t?.title || 'Unknown'}</span>
                            <button onClick={(e) => {e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', sch.id));}} className="p-0.5 hover:bg-white/20 rounded"><X size={10}/></button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'completed' && (
          <div className="p-4 space-y-4 max-w-2xl mx-auto pb-24">
            <div className="flex justify-between items-center px-1">
              <h2 className="font-bold text-gray-800">実績ギャラリー</h2>
              {tasks.filter(t => t.completed).length > 0 && (
                <button 
                  onClick={() => {
                    if (window.confirm("完了済みの課題をすべて削除しますか？")) {
                      deleteAllCompletedTasks();
                    }
                  }}
                  className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full flex items-center gap-1 active:scale-95 transition-transform"
                >
                  <Trash2 size={12} /> 一括削除
                </button>
              )}
            </div>
            
            {tasks.filter(t => t.completed).length === 0 ? (
              <div className="text-center py-20 text-gray-300 italic">まだ完了した課題はありません</div>
            ) : (
              tasks.filter(t => t.completed).map(task => (
                <div key={task.id} className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm relative group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0 pr-10">
                      <h3 className="font-bold text-gray-900 truncate text-lg">{task.title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <CheckCircle2 className="text-green-500" size={14} />
                        <span className="text-[10px] text-gray-400 font-medium">実績: {task.timeSpent}h / 予定: {task.estimatedHours}h</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => deleteTask(task.id)} 
                        className="p-2.5 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors shadow-sm"
                        title="この実績を削除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2">
                    {task.photos?.map((pic, i) => (
                      <img 
                        key={i} 
                        src={pic} 
                        className="aspect-square object-cover rounded-2xl shadow-inner cursor-pointer hover:opacity-90 transition-opacity" 
                        onClick={() => setPreviewImage(pic)} 
                        alt={`実績写真 ${i+1}`}
                      />
                    ))}
                    <label className="aspect-square border-2 border-dashed border-gray-100 rounded-2xl flex items-center justify-center text-gray-300 hover:text-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer">
                      <Camera size={24} />
                      <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                        const files = Array.from(e.target.files);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onloadend = async () => {
                            const taskRef = doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id);
                            // タスクの最新状態を取得してから更新
                            const currentTask = tasks.find(t => t.id === task.id);
                            const updatedPhotos = [...(currentTask?.photos || []), reader.result];
                            await updateDoc(taskRef, { photos: updatedPhotos });
                          };
                          reader.readAsDataURL(file);
                        });
                      }} />
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* モバイル向けフローティングナビゲーション */}
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
                ? 'bg-indigo-600 text-white p-4 rounded-2xl shadow-indigo-200 shadow-lg -mt-12 active:scale-90 hover:bg-indigo-700' 
                : (activeTab === tab.id ? 'text-indigo-600 scale-110' : 'text-gray-400 hover:text-gray-600')
            }`}
          >
            <tab.icon size={tab.special ? 28 : 22} strokeWidth={activeTab === tab.id || tab.special ? 2.5 : 2} />
            {tab.label && (
              <span className={`text-[9px] mt-1 font-bold ${activeTab === tab.id ? 'opacity-100' : 'opacity-70'}`}>
                {tab.label}
              </span>
            )}
            {!tab.special && activeTab === tab.id && (
              <span className="absolute -bottom-1 w-1 h-1 bg-indigo-600 rounded-full animate-pulse"></span>
            )}
          </button>
        ))}
      </nav>

      {/* モーダル類 */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end p-0">
          <div className="bg-white w-full rounded-t-[48px] p-8 space-y-6 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center font-black"><h2>課題を新規作成</h2><button onClick={() => setIsAddingTask(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-100"><X size={20}/></button></div>
            <form onSubmit={addTask} className="space-y-5">
              <div><label className="text-[10px] font-bold text-gray-400 ml-1">課題タイトル</label>
              <input type="text" className="w-full p-4 mt-1 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-gray-100 focus:ring-indigo-500" placeholder="例：期末レポート" value={formTitle} onChange={e => setFormTitle(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[10px] font-bold text-gray-400 ml-1">推定時間 (h)</label>
                <input type="number" step="0.1" className="w-full p-4 mt-1 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-gray-100 focus:ring-indigo-500" value={formHours} onChange={e => setFormHours(e.target.value)} /></div>
                <div><label className="text-[10px] font-bold text-gray-400 ml-1">締め切り</label>
                <input type="date" className="w-full p-4 mt-1 bg-gray-50 rounded-2xl outline-none font-bold text-sm ring-2 ring-gray-100 focus:ring-indigo-500" value={formDeadline} onChange={e => setFormDeadline(e.target.value)} /></div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-lg hover:bg-indigo-700 transition-colors">登録する</button>
            </form>
          </div>
        </div>
      )}

      {selectedTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-end p-0">
          <div className="bg-white w-full rounded-t-[40px] p-8 space-y-6 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-start font-black"><h3>進捗・時間の詳細修正</h3><button onClick={() => setSelectedTask(null)} className="p-2 bg-gray-100 rounded-full"><X size={20}/></button></div>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-bold"><span className="text-gray-500">現在の進捗率</span><span className="text-indigo-600 font-black">{selectedTask.progress || 0}%</span></div>
                <input type="range" className="w-full h-3 bg-gray-100 rounded-full appearance-none accent-indigo-600 cursor-pointer" value={selectedTask.progress || 0} onChange={e => setTasks(prev => prev.map(t => t.id === selectedTask.id ? {...t, progress: parseInt(e.target.value)} : t))} />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-gray-400 ml-1">累積作業時間 (h)</label>
                <input type="number" step="0.1" className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold ring-2 ring-gray-100 focus:ring-indigo-500" value={selectedTask.timeSpent || 0} onChange={e => setTasks(prev => prev.map(t => t.id === selectedTask.id ? {...t, timeSpent: parseFloat(e.target.value) || 0} : t))} />
              </div>
              <button onClick={async () => {
                const updated = tasks.find(t => t.id === selectedTask.id);
                if (!updated) return;
                await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', selectedTask.id), { progress: updated.progress, timeSpent: updated.timeSpent, completed: updated.progress >= 100 });
                const todayStr = now.toISOString().split('T')[0];
                const todaySch = schedules.find(s => s.taskId === selectedTask.id && s.date === todayStr && !s.recorded);
                if (todaySch) await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'schedules', todaySch.id), { recorded: true });
                setSelectedTask(null);
              }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black shadow-xl hover:bg-indigo-700 transition-colors">保存する</button>
            </div>
          </div>
        </div>
      )}

      {revisionAlert && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[70] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center space-y-6 animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto ring-8 ring-red-50 shadow-sm"><AlertTriangle size={40} /></div>
            <div className="space-y-2"><h2 className="text-2xl font-black text-gray-900">計画不足</h2><p className="text-sm text-gray-500 leading-relaxed font-medium">{revisionAlert.message}</p></div>
            <button onClick={() => { setActiveTab('planner'); setRevisionAlert(null); }} className="w-full bg-indigo-600 text-white p-5 rounded-3xl font-black flex items-center justify-center gap-2 shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"><RefreshCw size={20} /> 計画を追加する</button>
            <button onClick={() => setRevisionAlert(null)} className="w-full text-gray-400 font-bold py-2 text-sm hover:text-gray-600">閉じる</button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 animate-in fade-in" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" alt="拡大画像" />
          <button className="absolute top-8 right-8 text-white bg-white/10 p-3 rounded-full hover:bg-white/20 transition-colors"><X size={32}/></button>
        </div>
      )}
    </div>
  );
};

export default App;