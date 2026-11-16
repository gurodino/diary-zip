import React, { useState, useEffect, useCallback, useMemo } from 'react';

interface SummaryData { title: string; one_line_summary: string; three_line_summary: string[]; ai_emoji: string; ai_score: number; ai_comment: string; gratitude: string | null; reflection: string | null; reminders: string[]; tags?: string[]; source?: 'ai' | 'fallback'; }
interface CalendarEntry { id: number; date_key: string; is_locked: boolean; ai_emoji: string; ai_score: number; }
interface SearchEntry { id: number; date_key: string; time_label: string; is_locked: boolean; ai_emoji: string; ai_score: number; user_emoji: string; title: string; tags: string[]; }
interface DiaryDetail { id: number; date_key: string; time_label: string; content: string; user_emoji: string; user_score: number; is_locked: boolean; ai_emoji: string; ai_score: number; ai_result: SummaryData | null; }
interface InsightData { averageScore: number; averageUserScore: number; topEmoji: string; totalDiaries: number; emojiCounts: { emoji: string; count: number }[]; }
interface UserSettings { has_secondary_password?: boolean; require_on_login?: boolean; require_on_diary?: boolean; }
interface StreakData { streak: number; wrote_today: boolean; longest_streak: number; streak_freezes: number; freeze_used_yesterday?: boolean; }
interface TodoItem { id: number; diary_id: number | null; task_text: string; is_completed: boolean; date_key: string; }
type Tab = 'write' | 'calendar' | 'checklist' | 'insight' | 'settings';
type ThemeMode = 'system' | 'light' | 'dark';
class ApiError extends Error { status: number; code?: string; constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; } }

const API_BASE = 'https://diary-zip-api.onrender.com';
const EMOJI_LIST = ['😆', '😃', '😐', '😢', '😡', '😱'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DRAFT_KEY = 'diary_draft';
const CHECKLIST_KEY = 'diary_checklist_status';
const MAX_LENGTH = 5000;
const pad = (n: number) => String(n).padStart(2, '0');
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatDateKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`; };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';
const sanitizeSettings = (raw: unknown): UserSettings => { const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; return { has_secondary_password: Boolean(s.has_secondary_password), require_on_login: Boolean(s.require_on_login), require_on_diary: Boolean(s.require_on_diary) }; };
const readToken = (): string | null => { const token = localStorage.getItem('token'); if (token && token.split('.').length === 3) return token; localStorage.removeItem('token'); localStorage.removeItem('settings'); return null; };
const readSettings = (): UserSettings => { try { return sanitizeSettings(JSON.parse(localStorage.getItem('settings') || '{}')); } catch { return {}; } };
const unlockHeaders = (token: string | null): Record<string, string> => token ? { 'X-Unlock-Token': token } : {};

const colors = { bg: 'var(--bg)', card: 'var(--card)', primary: 'var(--primary)', primarySoft: 'var(--primary-soft)', primaryDisabled: 'var(--primary-disabled)', textMain: 'var(--text)', textBody: 'var(--text-body)', textSub: 'var(--text-sub)', inputBg: 'var(--input-bg)', border: 'var(--border)', danger: 'var(--danger)' };
const cardStyle: React.CSSProperties = { backgroundColor: colors.card, borderRadius: '24px', padding: '24px', marginBottom: '16px', boxShadow: 'var(--shadow)' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '16px', borderRadius: '12px', border: `1px solid ${colors.border}`, backgroundColor: colors.inputBg, fontSize: '16px', color: colors.textMain };
const primaryBtn: React.CSSProperties = { width: '100%', padding: '16px', background: colors.primary, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' };
const ghostBtn: React.CSSProperties = { background: 'none', border: 'none', color: colors.textSub, cursor: 'pointer', fontWeight: 600, fontSize: '14px' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.55)', zIndex: 500, display: 'flex', justifyContent: 'center', alignItems: 'flex-end' };
const sheetStyle: React.CSSProperties = { width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto', backgroundColor: colors.card, color: colors.textMain, borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' };
const checkboxStyle: React.CSSProperties = { width: '20px', height: '20px', marginRight: '12px', accentColor: 'var(--primary)' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '8px', fontWeight: 600 };

const readChecklistStatus = (): Record<string, boolean> => { try { const value = JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } };
const writeChecklistStatus = (status: Record<string, boolean>) => localStorage.setItem(CHECKLIST_KEY, JSON.stringify(status));

function AnalysisCard({ data, checklistStatus, onToggleReminder }: { data: SummaryData; checklistStatus: Record<string, boolean>; onToggleReminder: (key: string) => void }) {
  const lines = Array.isArray(data.three_line_summary) ? data.three_line_summary : [];
  const reminders = Array.isArray(data.reminders) ? data.reminders : [];
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return <div>
    <h3 style={{ margin: '0 0 8px', color: colors.primary }}>{data.title}</h3>
    <p style={{ margin: '0 0 12px', fontSize: '17px', fontWeight: 600 }}>{data.one_line_summary}</p>
    {tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>{tags.map((tag, i) => <span key={i} style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', backgroundColor: colors.inputBg, color: colors.primary }}>#{tag}</span>)}</div>}
    <div style={{ backgroundColor: colors.primarySoft, padding: '16px', borderRadius: '16px', marginBottom: '20px' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>🤖 AI 코멘트 {data.ai_emoji} (AI 평가: {data.ai_score}점)</p>
      <p style={{ margin: 0, lineHeight: 1.6, color: colors.textBody }}>{data.ai_comment}</p>
    </div>
    {lines.length > 0 && <><h4 style={{ margin: '0 0 12px' }}>📝 핵심 3줄 요약</h4><ol style={{ margin: 0, paddingLeft: '20px', color: colors.textBody, lineHeight: 1.7 }}>{lines.map((line, index) => <li key={index}>{line}</li>)}</ol></>}
    {(data.gratitude || data.reflection || reminders.length > 0) && <div style={{ marginTop: '20px', display: 'grid', gap: '10px' }}>
      {data.gratitude && <div style={{ backgroundColor: colors.inputBg, borderRadius: '12px', padding: '12px 16px' }}><strong>🙏 감사한 일</strong><p style={{ margin: '4px 0 0', color: colors.textBody }}>{data.gratitude}</p></div>}
      {data.reflection && <div style={{ backgroundColor: colors.inputBg, borderRadius: '12px', padding: '12px 16px' }}><strong>🪞 돌아볼 점</strong><p style={{ margin: '4px 0 0', color: colors.textBody }}>{data.reflection}</p></div>}
      {reminders.length > 0 && <div style={{ backgroundColor: colors.inputBg, borderRadius: '12px', padding: '12px 16px' }}><strong>✅ 오늘 할 일</strong><div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>{reminders.map((reminder, index) => { const key = `${data.title}:${reminder}:${index}`; const checked = Boolean(checklistStatus[key]); return <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', color: checked ? colors.textSub : colors.textBody, textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.5 }}><input type="checkbox" checked={checked} onChange={() => onToggleReminder(key)} style={{ ...checkboxStyle, flex: '0 0 auto', marginTop: '2px' }} /> <span>{reminder}</span></label>; })}</div></div>}
    </div>}
    {data.source === 'fallback' && <p style={{ margin: '16px 0 0', fontSize: '12px', color: colors.textSub }}>※ AI가 연결되어 있지 않아 일기 본문만 저장하고 간단 요약으로 대체했어요.</p>}
  </div>;
}

function App() {
  const [token, setToken] = useState<string | null>(readToken);
  const [settings, setSettings] = useState<UserSettings>(readSettings);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [aiConnected, setAiConnected] = useState<boolean | null>(null);
  const [serverWaking, setServerWaking] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<Tab>('write');
  const [theme, setTheme] = useState<ThemeMode>(() => { const saved = localStorage.getItem('theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; });
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isAppUnlocked, setIsAppUnlocked] = useState(() => { const saved = readSettings(); return !(saved.require_on_login && saved.has_secondary_password); });
  const [unlockToken, setUnlockToken] = useState<string | null>(null);
  const [pendingDiaryId, setPendingDiaryId] = useState<number | null>(null);
  const [lockInput, setLockInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const [secCurrent, setSecCurrent] = useState('');
  const [secNew, setSecNew] = useState('');
  const [secRemove, setSecRemove] = useState(false);
  const [secSaving, setSecSaving] = useState(false);
  const [content, setContent] = useState(() => localStorage.getItem(DRAFT_KEY) || '');
  const [userEmoji, setUserEmoji] = useState('😐');
  const [userScore, setUserScore] = useState(50);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SummaryData | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [monthData, setMonthData] = useState<CalendarEntry[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [detail, setDetail] = useState<DiaryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editEmoji, setEditEmoji] = useState('😐');
  const [editScore, setEditScore] = useState(50);
  const [editLocked, setEditLocked] = useState(false);
  const [editReanalyze, setEditReanalyze] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [dayEntries, setDayEntries] = useState<CalendarEntry[] | null>(null);
  const [checklistStatus, setChecklistStatus] = useState<Record<string, boolean>>(readChecklistStatus);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoading, setTodosLoading] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchEmoji, setSearchEmoji] = useState('');
  const [searchResults, setSearchResults] = useState<SearchEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const todayKey = toDateKey(new Date());

  useEffect(() => { const root = document.documentElement; if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); }, [theme]);
  useEffect(() => { const timer = setTimeout(() => { if (content) localStorage.setItem(DRAFT_KEY, content); else localStorage.removeItem(DRAFT_KEY); }, 400); return () => clearTimeout(timer); }, [content]);
  useEffect(() => { writeChecklistStatus(checklistStatus); }, [checklistStatus]);
  const toggleChecklist = useCallback((key: string) => setChecklistStatus(previous => ({ ...previous, [key]: !previous[key] })), []);
  const clearSession = useCallback(() => { localStorage.removeItem('token'); localStorage.removeItem('settings'); setToken(null); setSettings({}); setStreakData(null); setInsightData(null); setTodos([]); setSearchResults(null); setActiveTab('write'); setResult(null); setDetail(null); setIsEditing(false); setDayEntries(null); setPendingDiaryId(null); setUnlockToken(null); setIsAppUnlocked(true); setLockInput(''); setLockError(''); setSecCurrent(''); setSecNew(''); setSecRemove(false); }, []);
  const applySettings = useCallback((raw: unknown) => { const next = sanitizeSettings(raw); setSettings(next); localStorage.setItem('settings', JSON.stringify(next)); return next; }, []);

  const authFetch = useCallback(async (path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && data.code === 'AUTH_REQUIRED') clearSession();
      throw new ApiError(data.error || data.message || '요청 처리 중 오류가 발생했습니다.', res.status, data.code);
    }
    return data;
  }, [token, clearSession]);

  const checkAiHealth = useCallback(() => {
    setServerWaking(true);
    fetch(`${API_BASE}/health`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setAiConnected(Boolean(data && data.ai_configured));
        setServerWaking(false);
      })
      .catch(() => {
        setAiConnected(false);
        setServerWaking(false);
      });
  }, []);

  const refreshStreak = useCallback(() => {
    if (!token) return;
    authFetch('/api/diaries/streak')
      .then((data) => {
        if (typeof data.streak === 'number') {
          setStreakData({
            streak: data.streak,
            wrote_today: Boolean(data.wrote_today),
            longest_streak: Number(data.longest_streak) || data.streak,
            streak_freezes: Number(data.streak_freezes) || 0,
            freeze_used_yesterday: Boolean(data.freeze_used_yesterday)
          });
        }
      })
      .catch(() => {});
  }, [token, authFetch]);

  const loadTodos = useCallback(() => {
    if (!token) return;
    setTodosLoading(true);
    authFetch('/api/todos')
      .then((data) => setTodos(Array.isArray(data.data) ? data.data : []))
      .catch(() => setTodos([]))
      .finally(() => setTodosLoading(false));
  }, [token, authFetch]);

  useEffect(() => { checkAiHealth(); }, [checkAiHealth]);

  useEffect(() => {
    if (!token) return;
    authFetch('/api/settings').then(data => { if (data.settings) applySettings(data.settings); }).catch(() => {});
    refreshStreak();
  }, [token, authFetch, applySettings, refreshStreak]);

  useEffect(() => {
    if (token && activeTab === 'checklist') loadTodos();
  }, [token, activeTab, loadTodos]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    setAuthLoading(true);
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: loginId, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
      if (isLoginMode) {
        localStorage.setItem('token', data.token);
        const next = applySettings(data.settings);
        setToken(data.token);
        setAuthMessage('');
        setPassword('');
        setIsAppUnlocked(!(next.require_on_login && next.has_secondary_password));
      } else {
        setAuthMessage('회원가입 완료! 로그인해주세요.');
        setIsLoginMode(true);
        setLoginId('');
        setPassword('');
      }
    } catch (error) {
      setAuthMessage(errorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    clearSession();
    setContent('');
    localStorage.removeItem(DRAFT_KEY);
  };

  const handleSaveSettings = async () => { if (secSaving) return; if (secNew && secNew.length < 4) { alert('2차 비밀번호는 4자 이상으로 설정해주세요.'); return; } const willHave = secRemove ? false : Boolean(settings.has_secondary_password || secNew); if (!willHave && (settings.require_on_login || settings.require_on_diary)) { alert('잠금 옵션을 사용하려면 2차 비밀번호를 먼저 설정해주세요.'); return; } if (settings.has_secondary_password && !secCurrent) { alert('설정을 바꾸려면 현재 2차 비밀번호를 입력해주세요.'); return; } setSecSaving(true); try { const data = await authFetch('/api/settings', { method: 'POST', body: JSON.stringify({ require_on_login: Boolean(settings.require_on_login), require_on_diary: Boolean(settings.require_on_diary), current_secondary_password: secCurrent || undefined, new_secondary_password: secRemove ? undefined : secNew || undefined, remove_secondary_password: secRemove }) }); applySettings(data.settings); setSecCurrent(''); setSecNew(''); setSecRemove(false); setUnlockToken(null); alert('보안 설정이 성공적으로 저장되었습니다!'); } catch (error) { alert(`설정 저장 중 오류가 발생했습니다.\n${errorMessage(error)}`); } finally { setSecSaving(false); } };

  const openDiary = async (id: number, tokenForUnlock: string | null = unlockToken) => {
    setDayEntries(null);
    setDetail(null);
    setIsEditing(false);
    setDetailLoading(true);
    try {
      const data = await authFetch(`/api/diaries/${id}`, {}, unlockHeaders(tokenForUnlock));
      setDetail(data.data);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNLOCK_REQUIRED') {
        setUnlockToken(null);
        setLockInput('');
        setLockError('');
        setPendingDiaryId(id);
      } else alert(errorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const requestOpenDiary = (entry: { id: number; is_locked: boolean }) => {
    if (entry.is_locked && settings.require_on_diary && settings.has_secondary_password && !unlockToken) {
      setDayEntries(null);
      setLockInput('');
      setLockError('');
      setPendingDiaryId(entry.id);
    } else openDiary(entry.id);
  };

  const handleDayClick = (entries: CalendarEntry[]) => { if (!entries.length) return; if (entries.length === 1) requestOpenDiary(entries[0]); else setDayEntries(entries); };
  const handleUnlock = async () => { if (!lockInput || lockLoading) return; setLockLoading(true); try { const data = await authFetch('/api/auth/verify-lock', { method: 'POST', body: JSON.stringify({ secondary_password: lockInput }) }); const newUnlock: string | null = data.unlock_token || null; setUnlockToken(newUnlock); setLockInput(''); setLockError(''); if (!isAppUnlocked) setIsAppUnlocked(true); if (pendingDiaryId !== null) { const id = pendingDiaryId; setPendingDiaryId(null); await openDiary(id, newUnlock); } } catch (error) { setLockError(errorMessage(error)); } finally { setLockLoading(false); } };

  const startEditDiary = () => {
    if (!detail) return;
    setEditContent(detail.content);
    setEditEmoji(detail.user_emoji);
    setEditScore(detail.user_score);
    setEditLocked(detail.is_locked);
    setEditReanalyze(false);
    setIsEditing(true);
  };

  const handleUpdateDiary = async () => {
    if (!detail || !editContent.trim() || editSaving) return;
    setEditSaving(true);
    try {
      const res = await authFetch(`/api/diaries/${detail.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent, user_emoji: editEmoji, user_score: editScore, is_locked: editLocked, reanalyze: editReanalyze })
      }, unlockHeaders(unlockToken));
      setDetail(res.data);
      setIsEditing(false);
      setInsightData(null);
      setMonthData(prev => prev.map(item => item.id === detail.id ? { ...item, is_locked: res.data.is_locked, ai_emoji: res.data.ai_emoji, ai_score: res.data.ai_score } : item));
      if (editReanalyze) loadTodos();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteDiary = async (id: number) => {
    if (!window.confirm('이 일기를 삭제할까요? 삭제하면 되돌릴 수 없어요.')) return;
    try {
      await authFetch(`/api/diaries/${id}`, { method: 'DELETE' }, unlockHeaders(unlockToken));
      setDetail(null);
      setIsEditing(false);
      setInsightData(null);
      setMonthData(previous => previous.filter(diary => diary.id !== id));
      if (searchResults) setSearchResults(prev => prev ? prev.filter(item => item.id !== id) : null);
      refreshStreak();
      loadTodos();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNLOCK_REQUIRED') {
        setUnlockToken(null);
        setDetail(null);
        alert('잠금 해제 시간이 지났어요. 일기를 다시 열어 주세요.');
      } else alert(errorMessage(error));
    }
  };

  const handleDiarySubmit = async () => {
    if (!content.trim() || isLoading) return;
    setIsLoading(true);
    try {
      const data = await authFetch('/api/diaries', { method: 'POST', body: JSON.stringify({ content, user_emoji: userEmoji, user_score: userScore, is_locked: isLocked }) });
      setResult(data.ai_result);
      setInsightData(null);
      if (data.ai_connection_failed) setAiConnected(false);
      else setAiConnected(true);
      if (data.streak) setStreakData(data.streak);
      else refreshStreak();
      setContent('');
      localStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() && !searchEmoji) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (searchEmoji) params.set('emoji', searchEmoji);
      const res = await authFetch(`/api/diaries/search?${params.toString()}`, {}, unlockHeaders(unlockToken));
      setSearchResults(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim()) return;
    try {
      const res = await authFetch('/api/todos', { method: 'POST', body: JSON.stringify({ task_text: newTodoText }) });
      if (res.data) setTodos(prev => [res.data, ...prev]);
      setNewTodoText('');
    } catch (error) {
      alert(errorMessage(error));
    }
  };

  const handleToggleTodo = async (id: number) => {
    try {
      const res = await authFetch(`/api/todos/${id}`, { method: 'PATCH' });
      if (res.data) setTodos(prev => prev.map(t => t.id === id ? { ...t, is_completed: res.data.is_completed } : t));
    } catch (error) {
      alert(errorMessage(error));
    }
  };

  const handleDeleteTodo = async (id: number) => {
    try {
      await authFetch(`/api/todos/${id}`, { method: 'DELETE' });
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      alert(errorMessage(error));
    }
  };

  const changeMonth = (delta: number) => { const date = new Date(viewYear, viewMonth - 1 + delta, 1); setViewYear(date.getFullYear()); setViewMonth(date.getMonth() + 1); };
  const goToday = () => { const date = new Date(); setViewYear(date.getFullYear()); setViewMonth(date.getMonth() + 1); };
  useEffect(() => { if (!token || activeTab !== 'calendar') return; let cancelled = false; setCalendarLoading(true); authFetch(`/api/calendar/month?year=${viewYear}&month=${viewMonth}`).then(data => { if (!cancelled) setMonthData(data.data || []); }).catch(error => { if (!cancelled) { console.error(error); setMonthData([]); } }).finally(() => { if (!cancelled) setCalendarLoading(false); }); return () => { cancelled = true; }; }, [activeTab, token, viewYear, viewMonth, authFetch]);
  useEffect(() => { if (!token || activeTab !== 'insight') return; let cancelled = false; setInsightLoading(true); authFetch(`/api/calendar/insight?year=${viewYear}&month=${viewMonth}`).then(data => { if (!cancelled) setInsightData(data.data || null); }).catch(error => { if (!cancelled) { console.error(error); setInsightData(null); } }).finally(() => { if (!cancelled) setInsightLoading(false); }); return () => { cancelled = true; }; }, [activeTab, token, viewYear, viewMonth, authFetch]);
  const calendarCells = useMemo(() => { const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); const daysInMonth = new Date(viewYear, viewMonth, 0).getDate(); const byDate: Record<string, CalendarEntry[]> = {}; monthData.forEach(entry => { if (!byDate[entry.date_key]) byDate[entry.date_key] = []; byDate[entry.date_key].push(entry); }); const cells: ({ day: number; key: string; entries: CalendarEntry[] } | null)[] = []; for (let i = 0; i < firstDay; i++) cells.push(null); for (let day = 1; day <= daysInMonth; day += 1) { const key = `${viewYear}-${pad(viewMonth)}-${pad(day)}`; const entries = byDate[key] || []; cells.push({ day, key, entries }); } return cells; }, [viewYear, viewMonth, monthData]);
  const renderMonthNav = () => <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}><button type="button" onClick={() => changeMonth(-1)} style={{ ...ghostBtn, fontSize: '20px', padding: '4px 12px' }} aria-label="이전 달">‹</button><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><strong style={{ fontSize: '18px' }}>{viewYear}년 {viewMonth}월</strong><button type="button" onClick={goToday} style={{ ...ghostBtn, fontSize: '12px', border: `1px solid ${colors.border}`, borderRadius: '999px', padding: '4px 10px' }}>오늘</button></div><button type="button" onClick={() => changeMonth(1)} style={{ ...ghostBtn, fontSize: '20px', padding: '4px 12px' }} aria-label="다음 달">›</button></div>;
  const showLockModal = !isAppUnlocked || pendingDiaryId !== null;
  const maxEmojiCount = insightData?.emojiCounts?.length ? insightData.emojiCounts[0].count : 1;

  const isStreakActive = Boolean(streakData && streakData.wrote_today && streakData.streak > 0);
  const isStreakAtRisk = Boolean(streakData && !streakData.wrote_today && streakData.streak > 0);

  return <div style={{ backgroundColor: colors.bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', color: colors.textMain }}>
    <style>{`input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; background: transparent; } input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 24px; width: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.25); cursor: pointer; margin-top: -8px; } input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 8px; cursor: pointer; background: var(--border); border-radius: 4px; } input:focus, textarea:focus { outline: none; border-color: var(--primary); } textarea::placeholder, input::placeholder { color: var(--text-sub); } .emoji-btn { transition: transform .2s ease; } .emoji-btn:active { transform: scale(.9); }`}</style>
    <div style={{ width: '100%', maxWidth: '480px', position: 'relative', paddingBottom: '100px' }}>
      {!token ? <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 8px', color: colors.textMain }}>반가워요! <br /> Diary.zip 입니다.</h1>
        <p style={{ color: colors.textSub, margin: '0 0 24px' }}>나만의 AI 다이어리를 시작해보세요.</p>
        {serverWaking && <div style={{ padding: '12px 16px', borderRadius: '14px', backgroundColor: colors.primarySoft, color: colors.primary, fontSize: '13px', fontWeight: 600, marginBottom: '20px' }}>⏳ 서버를 깨우는 중이에요... (무료 서버 첫 접속 시 최대 50초 소요)</div>}
        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input type="text" autoComplete="username" placeholder="아이디를 입력해주세요" value={loginId} onChange={event => setLoginId(event.target.value)} required style={{ ...inputStyle, padding: '18px 20px', borderRadius: '16px' }} />
          <input type="password" autoComplete={isLoginMode ? 'current-password' : 'new-password'} placeholder={isLoginMode ? '비밀번호를 입력해주세요' : '비밀번호 (4자 이상)'} value={password} onChange={event => setPassword(event.target.value)} required minLength={isLoginMode ? undefined : 4} style={{ ...inputStyle, padding: '18px 20px', borderRadius: '16px' }} />
          <button type="submit" disabled={authLoading} style={{ ...primaryBtn, padding: '18px', borderRadius: '16px', marginTop: '8px', background: authLoading ? colors.primaryDisabled : colors.primary }}>{authLoading ? '잠시만요... (서버가 깨어나는 중일 수 있어요)' : isLoginMode ? '시작하기' : '가입하기'}</button>
        </form>
        <p style={{ color: colors.danger, textAlign: 'center', marginTop: '16px', fontWeight: 500 }}>{authMessage}</p>
        <button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setAuthMessage(''); setLoginId(''); setPassword(''); }} style={{ ...ghostBtn, marginTop: '20px', fontSize: '15px', fontWeight: 500 }}>{isLoginMode ? '계정이 없으신가요? 간편 가입하기' : '이미 계정이 있으신가요? 로그인'}</button>
      </div> : <>
        {showLockModal && <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(16, 19, 24, .95)', zIndex: 999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px' }}><div style={{ width: '100%', maxWidth: '400px', backgroundColor: colors.card, color: colors.textMain, borderRadius: '24px', padding: '32px 24px', textAlign: 'center' }}><h2 style={{ margin: '0 0 8px', fontSize: '22px' }}>🔒 잠금 해제</h2><p style={{ color: colors.textSub, margin: '0 0 24px' }}>{!isAppUnlocked ? '앱을 사용하려면 2차 비밀번호를 입력하세요.' : '비밀 일기를 보려면 2차 비밀번호를 입력하세요.'}</p><input type="password" autoFocus value={lockInput} onChange={event => setLockInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') handleUnlock(); }} placeholder="비밀번호 입력" style={{ ...inputStyle, fontSize: '18px', textAlign: 'center', marginBottom: '16px' }} />{lockError && <p style={{ color: colors.danger, margin: '0 0 16px', fontSize: '14px', fontWeight: 600 }}>{lockError}</p>}<div style={{ display: 'flex', gap: '12px' }}>{isAppUnlocked && pendingDiaryId !== null ? <button type="button" onClick={() => { setPendingDiaryId(null); setLockInput(''); setLockError(''); }} style={{ ...primaryBtn, flex: 1, background: colors.inputBg, color: colors.textSub }}>취소</button> : <button type="button" onClick={handleLogout} style={{ ...primaryBtn, flex: 1, background: colors.inputBg, color: colors.textSub }}>로그아웃</button>}<button type="button" onClick={handleUnlock} disabled={lockLoading} style={{ ...primaryBtn, flex: 1, background: lockLoading ? colors.primaryDisabled : colors.primary }}>{lockLoading ? '확인 중...' : '확인'}</button></div></div></div>}
        {dayEntries && <div style={overlayStyle} onClick={() => setDayEntries(null)}><div style={sheetStyle} onClick={event => event.stopPropagation()}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><strong style={{ fontSize: '18px' }}>{formatDateKey(dayEntries[0].date_key)}</strong><button type="button" onClick={() => setDayEntries(null)} style={ghostBtn}>닫기</button></div><div style={{ display: 'grid', gap: '10px' }}>{dayEntries.map((entry, index) => <button key={entry.id} type="button" onClick={() => requestOpenDiary(entry)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '14px', border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.textMain, cursor: 'pointer', fontSize: '15px', textAlign: 'left' }}><span style={{ fontSize: '24px' }}>{entry.is_locked ? '🔒' : entry.ai_emoji}</span><span style={{ flex: 1, fontWeight: 600 }}>{dayEntries.length - index}번째 기록</span>{!entry.is_locked && <span style={{ color: colors.primary, fontWeight: 700 }}>{entry.ai_score}점</span>}</button>)}</div></div></div>}

        {(detail || detailLoading) && <div style={overlayStyle} onClick={() => { if (!detailLoading && !editSaving) { setDetail(null); setIsEditing(false); } }}><div style={sheetStyle} onClick={event => event.stopPropagation()}>{detailLoading || !detail ? <p style={{ textAlign: 'center', color: colors.textSub, padding: '40px 0' }}>일기를 불러오는 중이에요...</p> : isEditing ? <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <strong style={{ fontSize: '18px' }}>✏️ 일기 수정하기</strong>
            <button type="button" onClick={() => setIsEditing(false)} style={ghostBtn}>취소</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.8rem', marginBottom: '16px' }}>
            {EMOJI_LIST.map(emoji => <button key={emoji} type="button" onClick={() => setEditEmoji(emoji)} style={{ cursor: 'pointer', opacity: editEmoji === emoji ? 1 : .25, border: 0, background: 'none', fontSize: 'inherit' }}>{emoji}</button>)}
          </div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '8px' }}><span>내 기분 점수</span><span style={{ color: colors.primary }}>{editScore}점</span></div>
            <input type="range" min="1" max="100" value={editScore} onChange={e => setEditScore(Number(e.target.value))} />
          </div>
          <textarea value={editContent} maxLength={MAX_LENGTH} onChange={e => setEditContent(e.target.value)} style={{ ...inputStyle, height: '180px', resize: 'none', marginBottom: '12px', lineHeight: 1.6 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={editLocked} onChange={e => setEditLocked(e.target.checked)} style={checkboxStyle} />
            <span>🔒 비밀 일기로 잠그기</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={editReanalyze} onChange={e => setEditReanalyze(e.target.checked)} style={checkboxStyle} />
            <span>🤖 수정된 내용으로 AI 분석 다시 받기</span>
          </label>
          <button type="button" onClick={handleUpdateDiary} disabled={editSaving || !editContent.trim()} style={{ ...primaryBtn, background: editSaving ? colors.primaryDisabled : colors.primary }}>{editSaving ? '저장 중...' : '수정 완료'}</button>
        </div> : <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800 }}>{formatDateKey(detail.date_key)}</div>
              <div style={{ fontSize: '13px', color: colors.textSub, marginTop: '4px' }}>{detail.time_label} 작성 · 내 기분 {detail.user_emoji} {detail.user_score}점{detail.is_locked ? ' · 🔒 비밀 일기' : ''}</div>
            </div>
            <button type="button" onClick={() => setDetail(null)} style={ghostBtn}>닫기</button>
          </div>
          <div style={{ backgroundColor: colors.inputBg, borderRadius: '16px', padding: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.7, marginBottom: '20px', color: colors.textBody }}>{detail.content}</div>
          {detail.ai_result ? <AnalysisCard data={detail.ai_result} checklistStatus={checklistStatus} onToggleReminder={toggleChecklist} /> : <p style={{ color: colors.textSub, fontSize: '14px' }}>이 일기는 AI 요약 저장 기능 이전에 작성되어 요약이 없어요. (AI 평가 {detail.ai_emoji} {detail.ai_score}점)</p>}
          <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
            <button type="button" onClick={startEditDiary} style={{ ...primaryBtn, flex: 1, background: colors.inputBg, color: colors.textMain, border: `1px solid ${colors.border}` }}>수정하기</button>
            <button type="button" onClick={() => handleDeleteDiary(detail.id)} style={{ ...primaryBtn, flex: 1, background: 'transparent', color: colors.danger, border: `1px solid ${colors.border}` }}>삭제하기</button>
          </div>
        </>}</div></div>}

        <div style={{ padding: '24px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: colors.bg, zIndex: 10 }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/favicon.svg" alt="" width="28" height="28" style={{ borderRadius: '7px', display: 'block' }} />
            Diary.zip
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {streakData && (
              <button type="button" onClick={() => setActiveTab('write')} title={`연속 ${streakData.streak}일 · 보호권 ${streakData.streak_freezes}개`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: isStreakActive ? '1px solid rgba(255, 138, 0, 0.35)' : isStreakAtRisk ? '1px dashed #ff9600' : `1px solid ${colors.border}`, backgroundColor: isStreakActive ? 'rgba(255, 138, 0, 0.14)' : isStreakAtRisk ? 'rgba(255, 150, 0, 0.08)' : colors.inputBg, color: isStreakActive ? '#ff7a00' : isStreakAtRisk ? '#e68600' : colors.textSub }}>
                <span style={{ filter: streakData.streak === 0 ? 'grayscale(100%)' : 'none' }}>{isStreakAtRisk ? '⏳' : '🔥'}</span>
                <span>{streakData.streak}일</span>
                {streakData.streak_freezes > 0 && <span style={{ fontSize: '11px', color: '#38bdf8', marginLeft: '2px' }}>❄️{streakData.streak_freezes}</span>}
              </button>
            )}
            <button type="button" onClick={handleLogout} style={ghostBtn}>로그아웃</button>
          </div>
        </div>

        <div style={{ padding: '0 24px' }}>
          {activeTab === 'write' && <div>
            {aiConnected === false && (
              <div role="status" aria-live="polite" style={{ ...cardStyle, padding: '12px 16px', backgroundColor: 'rgba(255, 150, 0, 0.12)', border: '1px solid rgba(255, 150, 0, 0.35)', color: '#b45309', fontSize: '13px', fontWeight: 600 }}>
                ⚠️ AI가 연결되어 있지 않아 AI 분석 없이 일기만 저장됩니다.
              </div>
            )}
            {streakData && (
              <div style={{ ...cardStyle, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: isStreakActive ? '1.5px solid rgba(255, 138, 0, 0.4)' : isStreakAtRisk ? '1.5px dashed rgba(255, 150, 0, 0.5)' : `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '26px', filter: streakData.streak === 0 ? 'grayscale(100%)' : 'none' }}>{isStreakAtRisk ? '⏳' : '🔥'}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '15px', color: isStreakActive ? '#ff7a00' : colors.textMain }}>{streakData.streak > 0 ? `${streakData.streak}일 연속 작성 중!` : '연속 작성 0일째'}</div>
                    <div style={{ fontSize: '12px', color: colors.textSub, marginTop: '2px' }}>{streakData.freeze_used_yesterday ? '❄️ 보호권이 어제 기록을 방어했어요! 오늘 써서 이어가세요.' : isStreakActive ? '오늘의 불꽃을 지켰어요! 7일마다 ❄️ 보호권 지급' : isStreakAtRisk ? `오늘 일기를 쓰면 ${streakData.streak + 1}일 연속 달성이에요!` : '오늘 첫 일기를 쓰고 연속 불꽃을 켜보세요!'}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8' }}>❄️ 보호권 {streakData.streak_freezes}개</div>
                  {streakData.longest_streak > 0 && <div style={{ fontSize: '11px', color: colors.textSub, marginTop: '2px' }}>최장 {streakData.longest_streak}일</div>}
                </div>
              </div>
            )}
            <div style={cardStyle}><p style={{ margin: '0 0 16px', fontWeight: 700, fontSize: '18px' }}>오늘의 기분은 어땠나요?</p><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2rem' }}>{EMOJI_LIST.map(emoji => <button key={emoji} type="button" aria-label={`기분 ${emoji}`} className="emoji-btn" onClick={() => setUserEmoji(emoji)} style={{ cursor: 'pointer', opacity: userEmoji === emoji ? 1 : .25, filter: userEmoji === emoji ? 'none' : 'grayscale(100%)', border: 0, background: 'none', fontSize: 'inherit', padding: 0 }}>{emoji}</button>)}</div></div>
            <div style={cardStyle}><p style={{ margin: '0 0 20px', fontWeight: 700, fontSize: '18px', display: 'flex', justifyContent: 'space-between' }}><span>오늘 하루 점수</span><span style={{ color: colors.primary }}>{userScore}점</span></p><input type="range" min="1" max="100" value={userScore} onChange={event => setUserScore(Number(event.target.value))} /></div>
            <div style={{ ...cardStyle, padding: '16px 24px' }}><label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={isLocked} onChange={event => setIsLocked(event.target.checked)} style={checkboxStyle} />{isLocked ? '🔒 나만 보는 비밀 일기로 저장할게요' : '🔓 달력에 기분이 공개돼요'}</label></div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              {aiConnected === false && <div style={{ padding: '12px 20px', backgroundColor: 'rgba(255, 150, 0, 0.12)', borderBottom: `1px solid ${colors.border}`, fontSize: '13px', fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: '8px' }}><span>⚠️</span><span>AI가 연결되어 있지 않아 AI 분석 없이 일기만 작성됩니다.</span></div>}
              <textarea value={content} maxLength={MAX_LENGTH} onChange={event => setContent(event.target.value)} placeholder={aiConnected === false ? 'AI가 연결되어 있지 않아 일기 본문만 저장됩니다. 오늘 하루를 자유롭게 적어주세요.' : '오늘 하루 있었던 일을 편하게 적어주세요.'} style={{ width: '100%', height: '220px', padding: '24px', border: 'none', fontSize: '16px', lineHeight: 1.6, resize: 'none', backgroundColor: colors.card, color: colors.textMain, display: 'block' }} disabled={isLoading} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 24px 14px', fontSize: '12px', color: colors.textSub }}><span>{content ? '💾 자동 임시저장 중' : ''}</span><span>{content.length} / {MAX_LENGTH}자</span></div>
            </div>
            <button type="button" onClick={handleDiarySubmit} disabled={isLoading || !content.trim()} style={{ ...primaryBtn, padding: '18px', borderRadius: '16px', background: isLoading || !content.trim() ? colors.primaryDisabled : colors.primary, boxShadow: '0 4px 14px rgba(49, 130, 246, .3)' }}>{isLoading ? (aiConnected === false ? '일기를 저장하고 있어요...' : 'AI가 다이어리를 분석하고 있어요...') : (aiConnected === false ? '일기 저장하기 (AI 미연결 · 일기만 작성)' : '일기 저장하고 AI 분석 받기')}</button>
            {result && <div style={{ ...cardStyle, marginTop: '24px', border: `2px solid ${colors.primary}` }}><AnalysisCard data={result} checklistStatus={checklistStatus} onToggleReminder={toggleChecklist} /></div>}
          </div>}

          {activeTab === 'calendar' && <div>
            <div style={{ ...cardStyle, padding: '16px 20px' }}>
              <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input type="text" placeholder="일기 내용·제목·태그 검색" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, padding: '10px 14px', fontSize: '14px' }} />
                <button type="submit" style={{ ...primaryBtn, width: 'auto', padding: '10px 16px', fontSize: '14px' }}>검색</button>
              </form>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: colors.textSub }}>감정 필터:</span>
                {EMOJI_LIST.map(em => <button key={em} type="button" onClick={() => { const next = searchEmoji === em ? '' : em; setSearchEmoji(next); if (!next && !searchQuery.trim()) setSearchResults(null); else { setSearchLoading(true); const params = new URLSearchParams(); if (searchQuery.trim()) params.set('q', searchQuery.trim()); if (next) params.set('emoji', next); authFetch(`/api/diaries/search?${params.toString()}`, {}, unlockHeaders(unlockToken)).then(res => setSearchResults(Array.isArray(res.data) ? res.data : [])).finally(() => setSearchLoading(false)); } }} style={{ border: searchEmoji === em ? `1.5px solid ${colors.primary}` : `1px solid ${colors.border}`, background: searchEmoji === em ? colors.primarySoft : colors.inputBg, borderRadius: '999px', padding: '4px 9px', cursor: 'pointer', fontSize: '14px' }}>{em}</button>)}
                {searchResults !== null && <button type="button" onClick={() => { setSearchQuery(''); setSearchEmoji(''); setSearchResults(null); }} style={{ ...ghostBtn, fontSize: '12px', marginLeft: 'auto' }}>초기화</button>}
              </div>
            </div>
            {searchResults !== null ? <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px', fontSize: '16px' }}>🔍 검색 결과 ({searchResults.length}건)</h3>
              {searchLoading ? <p style={{ color: colors.textSub, textAlign: 'center' }}>검색 중...</p> : searchResults.length === 0 ? <p style={{ color: colors.textSub, textAlign: 'center' }}>일치하는 일기가 없어요.</p> : <div style={{ display: 'grid', gap: '10px' }}>
                {searchResults.map(item => <button key={item.id} type="button" onClick={() => requestOpenDiary(item)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', border: `1px solid ${colors.border}`, background: colors.inputBg, color: colors.textMain, cursor: 'pointer', textAlign: 'left' }}><span style={{ fontSize: '22px' }}>{item.is_locked ? '🔒' : item.ai_emoji}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div><div style={{ fontSize: '12px', color: colors.textSub, marginTop: '2px' }}>{item.date_key} · {item.tags.map(t => `#${t}`).join(' ')}</div></div>{!item.is_locked && <span style={{ color: colors.primary, fontWeight: 700, fontSize: '13px' }}>{item.ai_score}점</span>}</button>)}
              </div>}
            </div> : <div style={cardStyle}>{renderMonthNav()}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '6px' }}>{WEEKDAYS.map((weekday, index) => <div key={weekday} style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: index === 0 ? colors.danger : colors.textSub }}>{weekday}</div>)}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', opacity: calendarLoading ? .4 : 1 }}>{calendarCells.map((cell, index) => { if (!cell) return <div key={`empty-${index}`} />; const first = cell.entries[0]; const hasEntry = cell.entries.length > 0; return <button key={cell.key} type="button" onClick={() => handleDayClick(cell.entries)} disabled={!hasEntry} style={{ minHeight: '64px', border: cell.key === todayKey ? `2px solid ${colors.primary}` : '2px solid transparent', background: hasEntry ? colors.inputBg : 'transparent', borderRadius: '12px', padding: '6px 0', cursor: hasEntry ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', color: colors.textMain }}><span style={{ fontSize: '11px', fontWeight: 600, color: index % 7 === 0 ? colors.danger : colors.textSub }}>{cell.day}</span>{hasEntry && <><span style={{ fontSize: '20px', lineHeight: 1.1 }}>{first.is_locked ? '🔒' : first.ai_emoji}</span><span style={{ fontSize: '10px', fontWeight: 700, color: colors.primary }}>{first.is_locked ? '' : `${first.ai_score}점`}{cell.entries.length > 1 ? ` +${cell.entries.length - 1}` : ''}</span></>}</button>; })}</div>{!calendarLoading && monthData.length === 0 && <p style={{ color: colors.textSub, textAlign: 'center', padding: '24px 0 0', margin: 0 }}>이 달에 작성된 일기가 없어요.</p>}</div>}
          </div>}

          {activeTab === 'checklist' && <div><div style={{ ...cardStyle, padding: '16px 24px 0' }}>{renderMonthNav()}</div><div style={cardStyle}><h3 style={{ margin: '0 0 16px' }}>✅ 통합 할 일 체크리스트</h3><p style={{ margin: '0 0 18px', color: colors.textSub, fontSize: '14px', lineHeight: 1.5 }}>AI가 일기에서 추출한 할 일과 직접 추가한 할 일이 동기화됩니다.</p><form onSubmit={handleAddTodo} style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}><input type="text" placeholder="새 할 일 직접 추가하기..." value={newTodoText} onChange={e => setNewTodoText(e.target.value)} style={{ ...inputStyle, padding: '12px 14px', fontSize: '14px' }} /><button type="submit" style={{ ...primaryBtn, width: 'auto', padding: '12px 18px', fontSize: '14px' }}>추가</button></form>{todosLoading ? <p style={{ textAlign: 'center', color: colors.textSub }}>불러오는 중...</p> : todos.length === 0 ? <p style={{ margin: 0, padding: '18px', borderRadius: '14px', background: colors.inputBg, color: colors.textSub, textAlign: 'center' }}>등록된 할 일이 없어요.</p> : <div style={{ display: 'grid', gap: '10px' }}>{todos.map(todo => <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '14px', backgroundColor: colors.inputBg }}><input type="checkbox" checked={todo.is_completed} onChange={() => handleToggleTodo(todo.id)} style={{ ...checkboxStyle, marginRight: 0, flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '14px', fontWeight: 600, color: todo.is_completed ? colors.textSub : colors.textMain, textDecoration: todo.is_completed ? 'line-through' : 'none', wordBreak: 'break-word' }}>{todo.task_text}</div>{todo.date_key && <div style={{ fontSize: '11px', color: colors.textSub, marginTop: '2px' }}>{todo.date_key}{todo.diary_id ? ' · AI 추출' : ''}</div>}</div><button type="button" onClick={() => handleDeleteTodo(todo.id)} style={{ ...ghostBtn, color: colors.danger, fontSize: '12px', padding: '4px 8px' }}>삭제</button></div>)}</div>}</div></div>}

          {activeTab === 'insight' && <div>
            <div style={{ ...cardStyle, padding: '16px 24px 0' }}>{renderMonthNav()}</div>
            {streakData && <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '20px 16px', textAlign: 'center' }}><div><div style={{ fontSize: '22px', fontWeight: 800, color: '#ff7a00' }}>🔥 {streakData.streak}일</div><div style={{ fontSize: '12px', color: colors.textSub, marginTop: '4px' }}>현재 연속</div></div><div style={{ width: '1px', height: '36px', backgroundColor: colors.border }} /><div><div style={{ fontSize: '22px', fontWeight: 800, color: colors.primary }}>🏆 {streakData.longest_streak}일</div><div style={{ fontSize: '12px', color: colors.textSub, marginTop: '4px' }}>역대 최장</div></div><div style={{ width: '1px', height: '36px', backgroundColor: colors.border }} /><div><div style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>❄️ {streakData.streak_freezes}개</div><div style={{ fontSize: '12px', color: colors.textSub, marginTop: '4px' }}>보호권</div></div></div>}
            {insightLoading ? <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 24px', color: colors.textSub }}>통계를 불러오는 중이에요...</div> : insightData && insightData.totalDiaries > 0 ? <><div style={{ ...cardStyle, textAlign: 'center', padding: '32px 24px' }}><p style={{ fontSize: '16px', margin: '0 0 32px', color: colors.textSub }}>이 달에는 총 <strong style={{ color: colors.textMain }}>{insightData.totalDiaries}개</strong>의 기록이 모였어요.</p><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ flex: 1 }}><div style={{ fontSize: '48px', marginBottom: '12px' }}>{insightData.topEmoji}</div><div style={{ fontWeight: 700 }}>주로 느낀 감정</div></div><div style={{ width: '1px', height: '60px', backgroundColor: colors.border }} /><div style={{ flex: 1 }}><div style={{ fontSize: '36px', fontWeight: 800, color: colors.primary, marginBottom: '12px' }}>{insightData.averageScore}<span style={{ fontSize: '20px' }}>점</span></div><div style={{ fontWeight: 700 }}>평균 AI 점수</div></div></div><p style={{ margin: '24px 0 0', fontSize: '14px', color: colors.textSub }}>내가 매긴 평균 점수는 <strong style={{ color: colors.textMain }}>{insightData.averageUserScore}점</strong>{insightData.averageUserScore < insightData.averageScore ? '이에요. 생각보다 괜찮은 한 달을 보내고 있어요!' : insightData.averageUserScore > insightData.averageScore ? '이에요. 스스로에게 후한 편이네요 😊' : '으로 AI와 같아요.'}</p></div>{insightData.emojiCounts?.length > 0 && <div style={cardStyle}><h4 style={{ margin: '0 0 16px' }}>감정 분포</h4><div style={{ display: 'grid', gap: '10px' }}>{insightData.emojiCounts.map(item => <div key={item.emoji} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ fontSize: '22px', width: '28px', textAlign: 'center' }}>{item.emoji}</span><div style={{ flex: 1, height: '10px', backgroundColor: colors.inputBg, borderRadius: '5px', overflow: 'hidden' }}><div style={{ width: `${Math.round((item.count / maxEmojiCount) * 100)}%`, height: '100%', backgroundColor: colors.primary, borderRadius: '5px' }} /></div><span style={{ fontSize: '13px', fontWeight: 700, color: colors.textSub, width: '32px', textAlign: 'right' }}>{item.count}회</span></div>)}</div></div>}</> : <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 24px', color: colors.textSub }}>이 달에 작성된 일기가 없어요.</div>}
          </div>}

          {activeTab === 'settings' && <div><h3 style={{ margin: '0 0 16px 4px', fontSize: '20px' }}>화면 설정 🎨</h3><div style={cardStyle}><label style={{ display: 'block', marginBottom: '12px', fontWeight: 600 }}>테마</label><div style={{ display: 'flex', gap: '8px' }}>{([['system', '시스템'], ['light', '라이트'], ['dark', '다크']] as [ThemeMode, string][]).map(([mode, label]) => <button key={mode} type="button" onClick={() => setTheme(mode)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${theme === mode ? colors.primary : colors.border}`, background: theme === mode ? colors.primarySoft : colors.inputBg, color: theme === mode ? colors.primary : colors.textMain, fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}>{label}</button>)}</div></div><h3 style={{ margin: '24px 0 16px 4px', fontSize: '20px' }}>보안 설정 ⚙️</h3><div style={cardStyle}><p style={{ margin: '0 0 20px', fontSize: '14px', color: colors.textSub, lineHeight: 1.5 }}>{settings.has_secondary_password ? '🔐 2차 비밀번호가 설정되어 있어요. 비밀번호는 서버에 암호화(해시)된 형태로만 저장돼요.' : '아직 2차 비밀번호가 없어요. 설정하면 앱 잠금과 비밀 일기 잠금을 사용할 수 있어요.'}</p>{settings.has_secondary_password && <div style={{ marginBottom: '20px' }}><label style={labelStyle}>현재 2차 비밀번호</label><input type="password" autoComplete="current-password" placeholder="설정을 바꾸려면 입력하세요" value={secCurrent} onChange={event => setSecCurrent(event.target.value)} style={inputStyle} /></div>}{!secRemove && <div style={{ marginBottom: '20px' }}><label style={labelStyle}>{settings.has_secondary_password ? '새 2차 비밀번호 (바꿀 때만 입력)' : '2차 비밀번호 설정'}</label><input type="password" autoComplete="new-password" placeholder="4자 이상" value={secNew} onChange={event => setSecNew(event.target.value)} style={inputStyle} /></div>}<div style={{ marginBottom: '16px' }}><label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={settings.require_on_login || false} disabled={secRemove} onChange={event => setSettings({ ...settings, require_on_login: event.target.checked })} style={checkboxStyle} />앱 켤 때마다 2차 비밀번호 요구</label></div><div style={{ marginBottom: '16px' }}><label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={settings.require_on_diary || false} disabled={secRemove} onChange={event => setSettings({ ...settings, require_on_diary: event.target.checked })} style={checkboxStyle} />비밀 일기(🔒) 열 때 2차 비밀번호 요구</label></div>{settings.has_secondary_password && <div style={{ marginBottom: '16px' }}><label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: 600, color: colors.danger }}><input type="checkbox" checked={secRemove} onChange={event => { setSecRemove(event.target.checked); if (event.target.checked) { setSecNew(''); setSettings({ ...settings, require_on_login: false, require_on_diary: false }); } }} style={checkboxStyle} />2차 비밀번호 삭제 (잠금 옵션도 함께 꺼져요)</label></div>}<button type="button" onClick={handleSaveSettings} disabled={secSaving} style={{ ...primaryBtn, marginTop: '8px', background: secSaving ? colors.primaryDisabled : colors.primary }}>{secSaving ? '저장 중...' : '설정 저장하기'}</button></div></div>}
        </div>
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: 'var(--nav-bg)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-around', padding: '12px 0 calc(12px + env(safe-area-inset-bottom, 12px))', zIndex: 100 }}>{([{ id: 'write', icon: '✍️', label: '작성' }, { id: 'calendar', icon: '📅', label: '달력' }, { id: 'checklist', icon: '✅', label: '할 일' }, { id: 'insight', icon: '📊', label: '통계' }, { id: 'settings', icon: '⚙️', label: '설정' }] as { id: Tab; icon: string; label: string }[]).map(tab => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '60px' }}><span style={{ fontSize: '20px', filter: activeTab === tab.id ? 'none' : 'grayscale(100%) opacity(.5)' }}>{tab.icon}</span><span style={{ fontSize: '11px', fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? colors.textMain : colors.textSub }}>{tab.label}</span></button>)}</div>
      </>}
    </div>
  </div>;
}

export default App;