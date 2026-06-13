import { useState, useEffect } from "react";

// ── Storage helpers ──────────────────────────────────────────────
const STORAGE_KEY = "mandarinApp_v2";

async function loadState() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}

async function saveState(state) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.error("Save failed", e); }
}

// ── EmailJS ──────────────────────────────────────────────────────
const EMAILJS_SERVICE_ID = "service_39ky8mj";
const EMAILJS_PUBLIC_KEY = "ps2g8AOw9DP8q4Z38";
const TEMPLATE_WEEKLY = "template_0tgdwgn";
const TEMPLATE_DAILY = "template_ei8go9n";
const TEMPLATE_REVIEW = null;

async function sendEmail(templateId, params) {
  if (!templateId) return;
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: params,
      }),
    });
  } catch (e) { console.error("Email failed", e); }
}

function formatWordsForEmail(words) {
  return words.map(w => `${w.simplified} (${w.pinyin}) — ${w.english}\n${w.tip}`).join("\n\n");
}

async function sendWeeklyEmail(settings, week) {
  const lizWords = week.words.filter(w => w.assignedTo === "liz");
  const richWords = week.words.filter(w => w.assignedTo === "rich");
  if (settings.lizEmail) {
    await sendEmail(TEMPLATE_WEEKLY, {
      to_email: settings.lizEmail, to_name: settings.lizName,
      partner_name: settings.richName, theme: week.theme,
      my_words: formatWordsForEmail(lizWords), partner_words: formatWordsForEmail(richWords),
    });
  }
  if (settings.richEmail) {
    await sendEmail(TEMPLATE_WEEKLY, {
      to_email: settings.richEmail, to_name: settings.richName,
      partner_name: settings.lizName, theme: week.theme,
      my_words: formatWordsForEmail(richWords), partner_words: formatWordsForEmail(lizWords),
    });
  }
}

async function sendDailyEmail(settings, week) {
  const lizWords = week.words.filter(w => w.assignedTo === "liz");
  const richWords = week.words.filter(w => w.assignedTo === "rich");
  if (settings.lizEmail) {
    await sendEmail(TEMPLATE_DAILY, {
      to_email: settings.lizEmail, to_name: settings.lizName,
      partner_name: settings.richName,
      my_words: formatWordsForEmail(lizWords), partner_words: formatWordsForEmail(richWords),
    });
  }
  if (settings.richEmail) {
    await sendEmail(TEMPLATE_DAILY, {
      to_email: settings.richEmail, to_name: settings.richName,
      partner_name: settings.lizName,
      my_words: formatWordsForEmail(richWords), partner_words: formatWordsForEmail(lizWords),
    });
  }
}

// ── Default settings ─────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  lizEmail: "", richEmail: "",
  lizName: "Liz", richName: "Rich",
  wordsPerPerson: 4,
  children: [
    { id: "c1", name: "Austin", dob: "2024-10-29" },
    { id: "c2", name: "Cassius", dob: "2026-02-14" },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────
function getAgeInMonths(dob) {
  const now = new Date();
  const birth = new Date(dob);
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

function getWeekId() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 6 ? 0 : day + 1;
  const sat = new Date(now);
  sat.setDate(now.getDate() - diff);
  return sat.toISOString().slice(0, 10);
}

// ── AI word generation ───────────────────────────────────────────
async function generateWords(settings, weeklyContext = "") {
  const wordsEach = settings.wordsPerPerson || 4;
  const totalWords = wordsEach * 2;

  const childrenDesc = settings.children.map(c => {
    const months = getAgeInMonths(c.dob);
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    const ageStr = years > 0 ? `${years}y ${remMonths}m` : `${months} months`;
    return `${c.name} (${ageStr} old)`;
  }).join(", ");

  const siblingNote = settings.children.length > 1
    ? `Include sibling dynamics where relevant (${settings.children.map(c => c.name).join(" and ")} interacting).`
    : "";

  const oldestChild = settings.children.reduce((a, b) =>
    getAgeInMonths(a.dob) > getAgeInMonths(b.dob) ? a : b
  );
  const oldestMonths = getAgeInMonths(oldestChild.dob);

  const hasContext = weeklyContext && weeklyContext.trim().length > 0;

  const splitInstruction = hasContext
    ? `Generate exactly ${totalWords} words split as follows:
- EXACTLY 2 words inspired by this week's context: "${weeklyContext}". Usable specifically in that setting this week.
- The remaining ${totalWords - 2} words must be evergreen — practical words for daily life with a ${oldestMonths}-month-old that will remain useful beyond this week.
Only 2 words should relate to the context. Do not let it dominate.`
    : `Generate exactly ${totalWords} evergreen Mandarin words for daily life with a ${oldestMonths}-month-old and siblings. All should remain useful week after week.`;

  const prompt = `You are helping a family introduce Mandarin into their English-speaking household as a daily habit.
The family: ${settings.lizName} (fluent Mandarin speaker), ${settings.richName} (beginner Mandarin learner).
Children: ${childrenDesc}.
${siblingNote}

${splitInstruction}

Rules for all words:
- Usable naturally in an English-speaking household
- Assign ${wordsEach} words to "liz" (slightly more nuanced/conversational) and ${wordsEach} to "rich" (concrete, simple, easy for a beginner)
- For each word include a very specific, practical usage tip — tell them exactly WHEN to say it during their day
- Word IDs must be unique strings like "w1", "w2" etc.

Respond ONLY with valid JSON, no markdown, no explanation:
{
  "theme": "short theme name",
  "words": [
    {
      "id": "w1",
      "simplified": "吃",
      "traditional": "吃",
      "pinyin": "chī",
      "english": "eat",
      "assignedTo": "rich",
      "tip": "Say this when you put the bowl in front of them — '吃！' before they dig in.",
      "sampleSentence": "來吃飯！(Lái chī fàn) — Come eat!"
    }
  ]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content.map(b => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Colours ──────────────────────────────────────────────────────
const C = {
  bg: "#F7F3EE", card: "#EEEAE3", navy: "#1A1A2E",
  liz: "#E07A5F", rich: "#3D7A8A", amber: "#D4A017",
  muted: "#8A8680", border: "#DDD8D0", white: "#FFFFFF",
};
const ownerColor = (owner) => owner === "liz" ? C.liz : C.rich;

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("week");
  const [appState, setAppState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [viewer, setViewer] = useState("liz");
  // Generation flow state
  const [showContextPrompt, setShowContextPrompt] = useState(false);
  const [weeklyContext, setWeeklyContext] = useState("");
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  useEffect(() => {
    loadState().then(saved => {
      if (saved) {
        if (saved.currentWeekId !== getWeekId()) {
          handleNewWeek(saved);
        } else {
          setAppState(saved);
          setLoading(false);
        }
      } else {
        setAppState({
          settings: DEFAULT_SETTINGS,
          currentWeekId: null,
          currentWeek: null,
          history: { stuck: [], forfeited: [] },
        });
        setLoading(false);
      }
    });
  }, []);

  async function handleNewWeek(state) {
    const newHistory = { ...state.history };
    if (state.currentWeek) {
      state.currentWeek.words.forEach(w => {
        if (w.status === "stuck") newHistory.stuck.push({ ...w, weekId: state.currentWeekId });
        if (w.status === "forfeited") newHistory.forfeited.push({ ...w, weekId: state.currentWeekId });
      });
    }
    const newState = { ...state, history: newHistory, currentWeekId: getWeekId(), currentWeek: null };
    setAppState(newState);
    await saveState(newState);
    setLoading(false);
  }

  async function doGenerate(context) {
    setGenerating(true);
    setShowContextPrompt(false);
    setShowRegenerateConfirm(false);
    try {
      const currentSettings = appState.settings;
      const result = await generateWords(currentSettings, context);
      const carried = appState.currentWeek?.words.filter(w => w.status === "pending") || [];
      let words = result.words.map(w => ({ ...w, status: "pending" }));
      if (carried.length > 0 && !appState.currentWeek) {
        const carryCount = Math.min(carried.length, currentSettings.wordsPerPerson);
        words = [...carried.slice(0, carryCount), ...words.slice(0, words.length - carryCount)];
      }
      const newWeek = { theme: result.theme, words, weeklyContext: context, generatedAt: new Date().toISOString() };
      setAppState(prev => {
        const newState = { ...prev, currentWeek: newWeek, currentWeekId: getWeekId() };
        saveState(newState);
        return newState;
      });
      await sendWeeklyEmail(currentSettings, newWeek);
    } catch (e) {
      console.error("Generation failed", e);
      alert("Something went wrong generating words. Please try again.");
    }
    setGenerating(false);
    setWeeklyContext("");
  }

  async function updateWordStatus(wordId, status) {
    const newWords = appState.currentWeek.words.map(w => w.id === wordId ? { ...w, status } : w);
    const newState = { ...appState, currentWeek: { ...appState.currentWeek, words: newWords } };
    setAppState(newState);
    await saveState(newState);
  }

  async function updateSettings(newSettings) {
    const newState = { ...appState, settings: newSettings };
    setAppState(newState);
    await saveState(newState);
  }

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "Inter, sans-serif", color: C.muted, fontSize: 15 }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "Inter, sans-serif", color: C.navy, paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "48px 24px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Family Mandarin</div>
          <div style={{ fontSize: 26, fontFamily: "Noto Serif TC, serif", fontWeight: 700, color: C.navy }}>
            {tab === "week" && "本週"}{tab === "review" && "回顧"}{tab === "history" && "記錄"}{tab === "settings" && "設定"}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {tab === "week" && "This week"}{tab === "review" && "Weekly review"}{tab === "history" && "History"}{tab === "settings" && "Settings"}
          </div>
        </div>
        {/* Regenerate button — only on week tab when words exist */}
        {tab === "week" && appState.currentWeek && !showContextPrompt && (
          <button
            onClick={() => setShowRegenerateConfirm(true)}
            style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", paddingBottom: 4 }}
          >
            Regenerate
          </button>
        )}
      </div>

      {/* Regenerate confirm banner */}
      {showRegenerateConfirm && (
        <div style={{ background: "#FFF8F0", borderBottom: `1px solid ${C.border}`, padding: "12px 20px", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, fontSize: 13, color: C.navy, lineHeight: 1.4 }}>This will replace this week's words. Continue?</div>
          <button onClick={() => { setShowRegenerateConfirm(false); setShowContextPrompt(true); }}
            style={{ background: C.navy, color: C.white, border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Yes
          </button>
          <button onClick={() => setShowRegenerateConfirm(false)}
            style={{ background: "none", color: C.muted, border: "none", fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{ padding: "24px 20px" }}>
        {tab === "week" && (
          <WeekScreen
            appState={appState}
            generating={generating}
            showContextPrompt={showContextPrompt}
            weeklyContext={weeklyContext}
            onContextChange={setWeeklyContext}
            onStartGenerate={() => setShowContextPrompt(true)}
            onConfirmGenerate={() => doGenerate(weeklyContext)}
            onCancelContext={() => { setShowContextPrompt(false); setWeeklyContext(""); }}
            onSelectWord={setSelectedWord}
            selectedWord={selectedWord}
            onCloseWord={() => setSelectedWord(null)}
          />
        )}
        {tab === "review" && (
          <ReviewScreen appState={appState} viewer={viewer} onSetViewer={setViewer} onUpdateStatus={updateWordStatus} />
        )}
        {tab === "history" && <HistoryScreen appState={appState} />}
        {tab === "settings" && <SettingsScreen appState={appState} onSave={updateSettings} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ── Week Screen ──────────────────────────────────────────────────
function WeekScreen({ appState, generating, showContextPrompt, weeklyContext, onContextChange, onStartGenerate, onConfirmGenerate, onCancelContext, onSelectWord, selectedWord, onCloseWord }) {
  const { currentWeek, settings } = appState;

  if (selectedWord) return <WordDetail word={selectedWord} settings={settings} onClose={onCloseWord} />;

  // Context prompt step
  if (showContextPrompt) {
    return (
      <div style={{ paddingTop: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Anything special this week?</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
          Optionally tell us what's happening — a holiday, a milestone, something Austin is into. The words will be tailored around it.
        </div>
        <textarea
          value={weeklyContext}
          onChange={e => onContextChange(e.target.value)}
          placeholder="e.g. We're going on holiday to France, Austin just started walking…"
          rows={4}
          style={{
            width: "100%", background: C.card, border: `1.5px solid ${C.border}`,
            borderRadius: 12, padding: "12px 14px", fontSize: 14, color: C.navy,
            fontFamily: "Inter, sans-serif", resize: "none", outline: "none", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={onConfirmGenerate}
            style={{ flex: 1, background: C.navy, color: C.white, border: "none", borderRadius: 12, padding: "14px 0", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {generating ? "Generating…" : "Get this week's words →"}
          </button>
          <button
            onClick={onCancelContext}
            style={{ background: "none", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 14, cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Generating spinner
  if (generating) {
    return (
      <div style={{ textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 48, fontFamily: "Noto Serif TC, serif", marginBottom: 16 }}>⋯</div>
        <div style={{ fontSize: 15, color: C.muted }}>Finding your words for the week…</div>
      </div>
    );
  }

  // No words yet
  if (!currentWeek) {
    return (
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontSize: 56, fontFamily: "Noto Serif TC, serif", marginBottom: 16, lineHeight: 1 }}>你好</div>
        <div style={{ fontSize: 15, color: C.muted, marginBottom: 32, lineHeight: 1.6 }}>
          Ready to start this week?<br />Your words are waiting.
        </div>
        <button
          onClick={onStartGenerate}
          style={{ background: C.navy, color: C.white, border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
        >
          Get this week's words →
        </button>
      </div>
    );
  }

  const lizWords = currentWeek.words.filter(w => w.assignedTo === "liz");
  const richWords = currentWeek.words.filter(w => w.assignedTo === "rich");

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>This week's theme</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{currentWeek.theme}</div>
        {currentWeek.weeklyContext && (
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4, fontStyle: "italic" }}>"{currentWeek.weeklyContext}"</div>
        )}
      </div>
      <OwnerSection label={settings.lizName} words={lizWords} color={C.liz} onSelect={onSelectWord} />
      <OwnerSection label={settings.richName} words={richWords} color={C.rich} onSelect={onSelectWord} />
    </div>
  );
}

function OwnerSection({ label, words, color, onSelect }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color }}>{label}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {words.map(w => <WordCard key={w.id} word={w} color={color} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function WordCard({ word, color, onSelect }) {
  const statusIcon = word.status === "stuck" ? "✓" : word.status === "forfeited" ? "✕" : null;
  return (
    <div onClick={() => onSelect(word)} style={{ background: C.card, borderRadius: 14, padding: "16px 18px", cursor: "pointer", position: "relative", borderLeft: `3px solid ${color}` }}>
      {statusIcon && (
        <div style={{ position: "absolute", top: 12, right: 14, fontSize: 12, fontWeight: 700, color: word.status === "stuck" ? C.amber : C.muted }}>{statusIcon}</div>
      )}
      <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 38, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>
        {word.simplified}
        {word.traditional !== word.simplified && (
          <span style={{ fontSize: 28, color: C.muted, marginLeft: 10 }}>{word.traditional}</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{word.pinyin}</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{word.english}</div>
    </div>
  );
}

// ── Word Detail ──────────────────────────────────────────────────
function WordDetail({ word, settings, onClose }) {
  const color = ownerColor(word.assignedTo);
  const ownerName = word.assignedTo === "liz" ? settings.lizName : settings.richName;
  return (
    <div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 24 }}>← Back</button>
      <div style={{ textAlign: "center", padding: "24px 0 20px", borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
        <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 72, fontWeight: 700, lineHeight: 1, marginBottom: 8 }}>{word.simplified}</div>
        {word.traditional !== word.simplified && (
          <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 48, color: C.muted, marginBottom: 8 }}>{word.traditional}</div>
        )}
        <div style={{ fontSize: 20, color: C.muted, marginBottom: 6 }}>{word.pinyin}</div>
        <div style={{ fontSize: 22, fontWeight: 600 }}>{word.english}</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: color + "18", borderRadius: 20, padding: "4px 12px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 12, color, fontWeight: 600 }}>{ownerName}'s word</span>
        </div>
      </div>
      <DetailBlock label="When to use it" content={word.tip} />
      <DetailBlock label="Sample sentence" content={word.sampleSentence} isChinese />
    </div>
  );
}

function DetailBlock({ label, content, isChinese }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ background: C.card, borderRadius: 12, padding: "14px 16px", fontSize: isChinese ? 17 : 15, fontFamily: isChinese ? "Noto Serif TC, serif" : "Inter, sans-serif", lineHeight: 1.6, color: C.navy }}>
        {content}
      </div>
    </div>
  );
}

// ── Review Screen ────────────────────────────────────────────────
function ReviewScreen({ appState, viewer, onSetViewer, onUpdateStatus }) {
  const { currentWeek, settings } = appState;
  if (!currentWeek) return <EmptyState message="No words to review yet. Generate this week's words first." />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Reviewing as:</div>
        <div style={{ display: "flex", gap: 8 }}>
          {["liz", "rich"].map(v => (
            <button key={v} onClick={() => onSetViewer(v)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
              background: viewer === v ? (v === "liz" ? C.liz : C.rich) : C.card,
              color: viewer === v ? C.white : C.navy, fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>
              {v === "liz" ? settings.lizName : settings.richName}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>You can only update your own words.</div>
      {currentWeek.words.map(word => {
        const isOwner = word.assignedTo === viewer;
        const color = ownerColor(word.assignedTo);
        const ownerName = word.assignedTo === "liz" ? settings.lizName : settings.richName;
        return (
          <div key={word.id} style={{ background: C.card, borderRadius: 14, padding: "16px 18px", marginBottom: 12, borderLeft: `3px solid ${color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{word.simplified}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{word.pinyin} · {word.english}</div>
              </div>
              <div style={{ fontSize: 11, color, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{ownerName}</div>
            </div>
            {isOwner ? (
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { status: "stuck", label: "Stuck ✓", activeColor: C.amber },
                  { status: "pending", label: "Not yet", activeColor: C.muted },
                  { status: "forfeited", label: "Forfeit", activeColor: "#999" },
                ].map(({ status, label, activeColor }) => (
                  <button key={status} onClick={() => onUpdateStatus(word.id, status)} style={{
                    flex: 1, padding: "8px 4px", borderRadius: 8,
                    border: `1.5px solid ${word.status === status ? activeColor : C.border}`,
                    background: word.status === status ? activeColor + "18" : "transparent",
                    color: word.status === status ? activeColor : C.muted,
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>{label}</button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.muted, fontStyle: "italic" }}>
                {word.status === "stuck" ? "✓ Marked as stuck" : word.status === "forfeited" ? "Forfeited this week" : "Not yet reviewed"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── History Screen ───────────────────────────────────────────────
function HistoryScreen({ appState }) {
  const { history } = appState;
  const [tab, setTab] = useState("stuck");
  const words = tab === "stuck" ? history.stuck : history.forfeited;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["stuck", "forfeited"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
            background: tab === t ? C.navy : C.card,
            color: tab === t ? C.white : C.muted,
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>
            {t === "stuck" ? `Stuck (${history.stuck.length})` : `Forfeited (${history.forfeited.length})`}
          </button>
        ))}
      </div>
      {words.length === 0 ? (
        <EmptyState message={tab === "stuck" ? "No stuck words yet — keep going!" : "Nothing forfeited yet."} />
      ) : (
        words.map((w, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", marginBottom: 10, borderLeft: `3px solid ${ownerColor(w.assignedTo)}` }}>
            <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 30, fontWeight: 700, marginBottom: 4 }}>{w.simplified}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{w.pinyin} · {w.english}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Settings Screen ──────────────────────────────────────────────
function SettingsScreen({ appState, onSave }) {
  const [form, setForm] = useState(JSON.parse(JSON.stringify(appState.settings)));
  const [saved, setSaved] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");

  function handleChange(path, value) {
    const keys = path.split(".");
    setForm(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let ref = next;
      for (let i = 0; i < keys.length - 1; i++) { ref = ref[keys[i]]; }
      ref[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function addChild() {
    setForm(prev => ({
      ...prev,
      children: [...prev.children, { id: `c${Date.now()}`, name: "", dob: "" }],
    }));
  }

  function removeChild(id) {
    setForm(prev => ({ ...prev, children: prev.children.filter(c => c.id !== id) }));
  }

  function updateChild(id, field, value) {
    setForm(prev => ({
      ...prev,
      children: prev.children.map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  }

  async function handleSave() {
    await onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <SettingsSection title="Partners">
        <SettingsField label="Your name" value={form.lizName} onChange={v => handleChange("lizName", v)} />
        <SettingsField label="Partner's name" value={form.richName} onChange={v => handleChange("richName", v)} />
      </SettingsSection>

      <SettingsSection title="Children">
        {form.children.map((child, i) => (
          <div key={child.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.muted }}>Child {i + 1}</div>
              {form.children.length > 1 && (
                <button onClick={() => removeChild(child.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Remove</button>
              )}
            </div>
            <input
              placeholder="Name"
              value={child.name}
              onChange={e => updateChild(child.id, "name", e.target.value)}
              style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 15, color: C.navy, fontFamily: "Inter, sans-serif", marginBottom: 6 }}
            />
            <input
              type="date"
              value={child.dob}
              onChange={e => updateChild(child.id, "dob", e.target.value)}
              style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, color: C.muted, fontFamily: "Inter, sans-serif" }}
            />
          </div>
        ))}
        <button onClick={addChild} style={{ width: "100%", padding: "12px 0", background: "none", border: "none", color: C.rich, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          + Add child
        </button>
      </SettingsSection>

      <SettingsSection title="Words per person">
        <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
          {[2, 3, 4].map(n => (
            <button key={n} onClick={() => handleChange("wordsPerPerson", n)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              border: `1.5px solid ${form.wordsPerPerson === n ? C.navy : C.border}`,
              background: form.wordsPerPerson === n ? C.navy : "transparent",
              color: form.wordsPerPerson === n ? C.white : C.muted,
              fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.muted, padding: "0 16px 12px" }}>Words assigned to each person per week</div>
      </SettingsSection>

      <SettingsSection title="Email reminders">
        <SettingsField label="Your email" value={form.lizEmail} type="email" placeholder="you@email.com" onChange={v => handleChange("lizEmail", v)} />
        <SettingsField label="Partner's email" value={form.richEmail} type="email" placeholder="rich@email.com" onChange={v => handleChange("richEmail", v)} />
        <div style={{ fontSize: 13, color: C.muted, padding: "8px 16px 12px", lineHeight: 1.5 }}>
          Daily reminders at 7am · Weekly review prompt Friday at 8pm
        </div>
      </SettingsSection>

      {appState.currentWeek && (
        <SettingsSection title="Send now">
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={async () => { setEmailStatus("sending…"); await sendWeeklyEmail(appState.settings, appState.currentWeek); setEmailStatus("Weekly email sent ✓"); setTimeout(() => setEmailStatus(""), 3000); }}
              style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.navy, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Resend this week's words
            </button>
            <button onClick={async () => { setEmailStatus("sending…"); await sendDailyEmail(appState.settings, appState.currentWeek); setEmailStatus("Daily reminder sent ✓"); setTimeout(() => setEmailStatus(""), 3000); }}
              style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.navy, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Send today's reminder now
            </button>
            {emailStatus && <div style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>{emailStatus}</div>}
          </div>
        </SettingsSection>
      )}

      <button onClick={handleSave} style={{
        width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
        background: saved ? "#4CAF50" : C.navy, color: C.white,
        fontWeight: 600, fontSize: 15, cursor: "pointer", marginTop: 8, transition: "background 0.3s",
      }}>
        {saved ? "Saved ✓" : "Save settings"}
      </button>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 14 }}>{title}</div>
      <div style={{ background: C.card, borderRadius: 14, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

function SettingsField({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 15, color: C.navy, fontFamily: "Inter, sans-serif" }} />
    </div>
  );
}

// ── Bottom Nav ───────────────────────────────────────────────────
function BottomNav({ tab, setTab }) {
  const items = [
    { id: "week", label: "本週", sub: "This week" },
    { id: "review", label: "回顧", sub: "Review" },
    { id: "history", label: "記錄", sub: "History" },
    { id: "settings", label: "設定", sub: "Settings" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: C.white, borderTop: `1px solid ${C.border}`, display: "flex" }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)} style={{ flex: 1, padding: "10px 0 14px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <span style={{ fontFamily: "Noto Serif TC, serif", fontSize: 16, fontWeight: 700, color: tab === item.id ? C.navy : C.muted }}>{item.label}</span>
          <span style={{ fontSize: 9, letterSpacing: 0.5, color: tab === item.id ? C.navy : C.muted, textTransform: "uppercase" }}>{item.sub}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ message }) {
  return <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted, fontSize: 15, lineHeight: 1.6 }}>{message}</div>;
}
