'use client'
import { useState, useEffect } from "react";

// ── Constants ────────────────────────────────────────────────────
const STORAGE_KEY = "mandarinApp_v4";
const APP_URL = "https://mandarin-app-ten.vercel.app";

const C = {
  bg: "#F7F3EE", card: "#EEEAE3", navy: "#1A1A2E",
  accent: "#E07A5F", teal: "#3D7A8A",
  muted: "#8A8680", border: "#DDD8D0", white: "#FFFFFF",
  amber: "#D4A017", green: "#4CAF50",
};

// ── Storage ──────────────────────────────────────────────────────
async function loadState() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveState(state) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.error("Save failed", e); }
}

// ── Helpers ──────────────────────────────────────────────────────
function getAgeInMonths(dob) {
  const now = new Date();
  const birth = new Date(dob);
  return (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
}

function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const daysSinceSat = day === 6 ? 0 : day + 1;
  const sat = new Date(now);
  sat.setDate(now.getDate() - daysSinceSat);
  return `${sat.getFullYear()}-${String(sat.getMonth()+1).padStart(2,'0')}-${String(sat.getDate()).padStart(2,'0')}`;
}

function isSetupComplete(settings) {
  return settings.userName && settings.partnerName &&
    settings.userEmail && settings.partnerEmail &&
    settings.children.length > 0 && settings.children[0].name && settings.children[0].dob;
}

// ── Default state ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  userName: "", partnerName: "",
  userEmail: "", partnerEmail: "",
  wordsPerWeek: 4,
  children: [{ id: "c1", name: "", dob: "" }],
};

const DEFAULT_STATE = {
  settings: DEFAULT_SETTINGS,
  currentWeekId: null,
  currentWeek: null,
  confirmed: false,
  history: [],
};

// ── AI Generation ────────────────────────────────────────────────
async function generateWords(settings, context = "", lastWeekWords = [], seenSimplified = []) {
  const totalWords = settings.wordsPerWeek || 4;
  const hasContext = context.trim().length > 0;

  const childrenDesc = settings.children
    .filter(c => c.name && c.dob)
    .map(c => {
      const months = getAgeInMonths(c.dob);
      const years = Math.floor(months / 12);
      const rem = months % 12;
      return `${c.name} (${years > 0 ? `${years}y ${rem}m` : `${months} months`} old)`;
    }).join(", ");

  const siblingNote = settings.children.filter(c => c.name).length > 1
    ? `Include sibling dynamics where relevant (${settings.children.filter(c=>c.name).map(c => c.name).join(" and ")} interacting).`
    : "";

  const lastWeekNote = lastWeekWords.length > 0
    ? `Last week's words were: ${lastWeekWords.map(w => `${w.simplified} (${w.english})`).join(", ")}. Naturally carry over any that may not have had time to stick, but avoid words clearly already embedded in the family's vocabulary.`
    : "";

  const excludeNote = seenSimplified.length > 0
    ? `Do NOT generate any of these words (already used this session): ${seenSimplified.join(", ")}.`
    : "";

  const splitNote = hasContext
    ? `Generate ${totalWords} words: EXACTLY 2 related to this week's context ("${context}") and ${totalWords - 2} evergreen everyday words. Do not let the context dominate.`
    : `Generate ${totalWords} evergreen words for daily family life with young children.`;

  const prompt = `You are helping a family build a Mandarin habit in their English-speaking household.
Family: two adults — one fluent Mandarin speaker, one beginner.
Children: ${childrenDesc}.
${siblingNote}
${lastWeekNote}
${excludeNote}

${splitNote}

Rules:
- Practical, high-frequency words usable naturally day-to-day
- DIFFICULTY MIX IS MANDATORY: exactly half the words must be simple and concrete (single syllable, high-frequency — e.g. 吃, 走, 看, 哭, 抱), and exactly half must be more nuanced and conversational (2-3 syllable phrases — e.g. 輕輕, 好了, 一起, 沒關係, 等一下). Do not generate all simple or all complex words. Do NOT mention any person's name anywhere in the output — not in tips, not in sample sentences, not anywhere.
- Each word needs a very specific usage tip (exactly WHEN and HOW to say it during the day — be concrete). NEVER mention any family member's name in the tip — use "you" instead.
- Include a short sample sentence with pinyin and English translation
- Word IDs must be unique strings: "w1", "w2", etc.
- ${totalWords === 1 ? "Generate exactly 1 word." : `Generate exactly ${totalWords} words.`}

Respond ONLY with valid JSON, no markdown:
{
  "theme": "short theme name",
  "words": [
    {
      "id": "w1",
      "simplified": "吃",
      "traditional": "吃",
      "pinyin": "chī",
      "english": "eat",
      "tip": "Say '吃！' the moment you set food in front of Austin.",
      "sampleSentence": "來吃飯！(Lái chī fàn) — Come eat!"
    }
  ]
}`;

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (!data.content) throw new Error("No content: " + JSON.stringify(data));
  const text = data.content.map(b => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── Email ────────────────────────────────────────────────────────
function emailShell(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F3EE;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:24px 16px 48px;">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8A8680;margin-bottom:16px;">Family Mandarin</div>
  ${content}
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #DDD8D0;font-size:12px;color:#8A8680;text-align:center;">加油！Keep going.</div>
</div></body></html>`;
}

function wordCardHtml(word) {
  const showTrad = word.traditional !== word.simplified;
  return `<div style="background:#EEEAE3;border-radius:12px;padding:20px;margin-bottom:12px;border-left:4px solid #E07A5F;">
  <div style="font-size:44px;font-weight:700;line-height:1.1;margin-bottom:4px;font-family:serif;">${word.simplified}${showTrad ? `<span style="font-size:30px;color:#8A8680;margin-left:10px;">${word.traditional}</span>` : ""}</div>
  <div style="font-size:15px;color:#8A8680;margin-bottom:2px;">${word.pinyin}</div>
  <div style="font-size:17px;font-weight:600;color:#1A1A2E;margin-bottom:14px;">${word.english}</div>
  <div style="font-size:12px;color:#8A8680;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">When to use it</div>
  <div style="font-size:14px;color:#1A1A2E;line-height:1.6;margin-bottom:12px;">${word.tip}</div>
  <div style="font-size:12px;color:#8A8680;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Sample sentence</div>
  <div style="font-size:14px;color:#1A1A2E;line-height:1.6;font-family:serif;">${word.sampleSentence}</div>
</div>`;
}

async function sendEmail(to, subject, html) {
  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) console.error("Email error:", data);
    return res.ok;
  } catch (e) { console.error("Email failed", e); return false; }
}

async function sendConfirmationEmail(settings, week) {
  const wordsHtml = week.words.map(wordCardHtml).join("");
  const html = emailShell(`
    <h1 style="font-size:26px;font-weight:700;color:#1A1A2E;margin:0 0 4px;">This week's words 🈶</h1>
    <p style="font-size:15px;color:#8A8680;margin:0 0 6px;">Theme: <strong style="color:#1A1A2E;">${week.theme}</strong></p>
    ${week.context ? `<p style="font-size:13px;color:#8A8680;font-style:italic;margin:0 0 20px;">"${week.context}"</p>` : '<div style="margin-bottom:20px;"></div>'}
    ${wordsHtml}
    <a href="${APP_URL}" style="display:block;text-align:center;background:#1A1A2E;color:#fff;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;font-size:15px;margin-top:24px;">Open app →</a>
  `);
  const results = await Promise.all([
    settings.userEmail ? sendEmail(settings.userEmail, `🈶 This week's Mandarin — ${week.theme}`, html) : Promise.resolve(true),
    settings.partnerEmail ? sendEmail(settings.partnerEmail, `🈶 This week's Mandarin — ${week.theme}`, html) : Promise.resolve(true),
  ]);
  return results.every(Boolean);
}

async function sendMidweekEmail(settings, week) {
  const wordsHtml = week.words.map(wordCardHtml).join("");
  const html = emailShell(`
    <h1 style="font-size:26px;font-weight:700;color:#1A1A2E;margin:0 0 4px;">Midweek reminder 今日</h1>
    <p style="font-size:15px;color:#8A8680;margin:0 0 20px;">Here are this week's words — keep working them in.</p>
    ${wordsHtml}
    <a href="${APP_URL}" style="display:block;text-align:center;background:#1A1A2E;color:#fff;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;font-size:15px;margin-top:24px;">Open app →</a>
  `);
  await Promise.all([
    settings.userEmail ? sendEmail(settings.userEmail, `今日 · Midweek Mandarin reminder`, html) : Promise.resolve(),
    settings.partnerEmail ? sendEmail(settings.partnerEmail, `今日 · Midweek Mandarin reminder`, html) : Promise.resolve(),
  ]);
}

async function sendShareEmail(toEmail, fromName) {
  const html = emailShell(`
    <h1 style="font-size:26px;font-weight:700;color:#1A1A2E;margin:0 0 12px;">你好！</h1>
    <p style="font-size:15px;color:#1A1A2E;line-height:1.6;margin:0 0 16px;">${fromName} thought you might like this — it's a little app we use to bring Mandarin into our family's daily life.</p>
    <p style="font-size:15px;color:#1A1A2E;line-height:1.6;margin:0 0 16px;">Each week it generates words themed around what's actually happening in your family — your kids' ages, milestones, sibling dynamics. Each word comes with a specific tip for when to say it during the day, so it becomes a habit rather than homework.</p>
    <p style="font-size:15px;color:#1A1A2E;line-height:1.6;margin:0 0 24px;">You get a weekly email with the words, and a midweek nudge to keep using them. That's it.</p>
    <a href="${APP_URL}" style="display:block;text-align:center;background:#1A1A2E;color:#fff;text-decoration:none;padding:14px;border-radius:12px;font-weight:600;font-size:15px;">Try it →</a>
  `);
  await sendEmail(toEmail, `${fromName} wants to share something with you 🈶`, html);
}

// ── App ──────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("week");
  const [appState, setAppState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadState().then(saved => {
      if (saved) {
        const weekId = getCurrentWeekStart();
        if (saved.currentWeekId !== weekId) {
          const newHistory = [...(saved.history || [])];
          if (saved.currentWeek && saved.confirmed) {
            newHistory.unshift({ weekId: saved.currentWeekId, ...saved.currentWeek });
          }
          const newState = { ...saved, history: newHistory, currentWeekId: weekId, currentWeek: null, confirmed: false };
          setAppState(newState);
          saveState(newState);
        } else {
          setAppState(saved);
        }
      } else {
        setAppState({ ...DEFAULT_STATE, currentWeekId: getCurrentWeekStart() });
      }
      setLoading(false);
    });
  }, []);

  async function updateState(updates) {
    const newState = { ...appState, ...updates };
    setAppState(newState);
    await saveState(newState);
    return newState;
  }

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <div style={{ color: C.muted }}>Loading…</div>
    </div>
  );

  // Show onboarding if setup not complete
  if (!isSetupComplete(appState.settings)) {
    return <OnboardingScreen appState={appState} onComplete={async (settings) => {
      await updateState({ settings });
    }} />;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "Inter, sans-serif", color: C.navy, paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ padding: "48px 24px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Family Mandarin</div>
        <div style={{ fontSize: 26, fontFamily: "Noto Serif TC, serif", fontWeight: 700 }}>
          {tab === "week" && "本週"}{tab === "history" && "記錄"}{tab === "settings" && "設定"}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          {tab === "week" && "This week"}{tab === "history" && "History"}{tab === "settings" && "Settings"}
        </div>
      </div>
      <div style={{ padding: "24px 20px" }}>
        {tab === "week" && <WeekScreen appState={appState} onUpdateState={updateState} />}
        {tab === "history" && <HistoryScreen appState={appState} />}
        {tab === "settings" && <SettingsScreen appState={appState} onUpdateState={updateState} />}
      </div>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ── Onboarding ───────────────────────────────────────────────────
function OnboardingScreen({ appState, onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(JSON.parse(JSON.stringify(appState.settings)));
  const [error, setError] = useState("");

  function updateChild(id, field, value) {
    setForm(prev => ({ ...prev, children: prev.children.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  }

  function addChild() {
    setForm(prev => ({ ...prev, children: [...prev.children, { id: `c${Date.now()}`, name: "", dob: "" }] }));
  }

  function removeChild(id) {
    setForm(prev => ({ ...prev, children: prev.children.filter(c => c.id !== id) }));
  }

  async function handleNext() {
    setError("");
    if (step === 0 && (!form.userName || !form.partnerName)) { setError("Please fill in both names."); return; }
    if (step === 1 && form.children.some(c => !c.name || !c.dob)) { setError("Please fill in all children's details."); return; }
    if (step === 2 && (!form.userEmail || !form.partnerEmail)) { setError("Please fill in both email addresses."); return; }
    if (step < 2) { setStep(step + 1); return; }
    await onComplete(form);
  }

  const steps = [
    {
      title: "Welcome 你好",
      subtitle: "Let's set up your family profile.",
      content: (
        <div>
          <InputField label="Your name" value={form.userName} onChange={v => setForm(p => ({ ...p, userName: v }))} placeholder="e.g. Liz" />
          <InputField label="Partner's name" value={form.partnerName} onChange={v => setForm(p => ({ ...p, partnerName: v }))} placeholder="e.g. Rich" />
        </div>
      ),
    },
    {
      title: "Your children",
      subtitle: "We'll tailor words to their ages and dynamics.",
      content: (
        <div>
          {form.children.map((child, i) => (
            <div key={child.id} style={{ background: C.card, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.muted }}>Child {i + 1}</div>
                {form.children.length > 1 && (
                  <button onClick={() => removeChild(child.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Remove</button>
                )}
              </div>
              <input placeholder="Name" value={child.name} onChange={e => updateChild(child.id, "name", e.target.value)}
                style={{ width: "100%", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, outline: "none", fontSize: 15, color: C.navy, fontFamily: "Inter, sans-serif", paddingBottom: 8, marginBottom: 8 }} />
              <input type="date" value={child.dob} onChange={e => updateChild(child.id, "dob", e.target.value)}
                style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, color: C.muted, fontFamily: "Inter, sans-serif" }} />
            </div>
          ))}
          <button onClick={addChild} style={{ width: "100%", padding: "12px 0", background: "none", border: `1.5px dashed ${C.border}`, borderRadius: 12, color: C.teal, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            + Add another child
          </button>
        </div>
      ),
    },
    {
      title: "Email reminders",
      subtitle: "You'll each get a weekly word email and a midweek nudge.",
      content: (
        <div>
          <InputField label="Your email" value={form.userEmail} onChange={v => setForm(p => ({ ...p, userEmail: v }))} placeholder="you@email.com" type="email" />
          <InputField label="Partner's email" value={form.partnerEmail} onChange={v => setForm(p => ({ ...p, partnerEmail: v }))} placeholder="partner@email.com" type="email" />
        </div>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "Inter, sans-serif", color: C.navy, padding: "60px 24px 40px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
        Step {step + 1} of {steps.length}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? C.navy : C.border }} />
        ))}
      </div>
      <h1 style={{ fontFamily: "Noto Serif TC, serif", fontSize: 28, fontWeight: 700, margin: "0 0 8px" }}>{current.title}</h1>
      <p style={{ fontSize: 15, color: C.muted, margin: "0 0 28px", lineHeight: 1.6 }}>{current.subtitle}</p>
      {current.content}
      {error && <div style={{ color: C.accent, fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} style={{ padding: "14px 20px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "none", color: C.muted, fontSize: 15, cursor: "pointer" }}>
            Back
          </button>
        )}
        <button onClick={handleNext} style={{ ...btnStyle(C.navy), flex: 1 }}>
          {step === steps.length - 1 ? "Get started →" : "Next →"}
        </button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</div>
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 15, color: C.navy, fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

// ── Week Screen ──────────────────────────────────────────────────
function WeekScreen({ appState, onUpdateState }) {
  const [step, setStep] = useState(appState.currentWeek ? "words" : "start");
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [swappingId, setSwappingId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  // Track all simplified characters seen this session to avoid swap repeats
  const [seenWords, setSeenWords] = useState(() =>
    appState.currentWeek ? appState.currentWeek.words.map(w => w.simplified) : []
  );

  async function handleGenerate() {
    setGenerating(true);
    setConfirmError("");
    try {
      const lastWeekWords = appState.history?.[0]?.words || [];
      const result = await generateWords(appState.settings, context, lastWeekWords, seenWords);
      const words = result.words.map(w => ({ ...w, status: "active" }));
      const newSeen = [...seenWords, ...words.map(w => w.simplified)];
      setSeenWords(newSeen);
      const newWeek = { theme: result.theme, context, words };
      await onUpdateState({ currentWeek: newWeek, confirmed: false });
      setStep("words");
    } catch (e) {
      console.error(e);
    }
    setGenerating(false);
  }

  async function handleSwap(wordId) {
    setSwappingId(wordId);
    try {
      const result = await generateWords(
        { ...appState.settings, wordsPerWeek: 1 },
        context,
        appState.history?.[0]?.words || [],
        seenWords
      );
      const newWord = { ...result.words[0], id: wordId, status: "active" };
      setSeenWords(prev => [...prev, newWord.simplified]);
      const newWords = appState.currentWeek.words.map(w => w.id === wordId ? newWord : w);
      await onUpdateState({ currentWeek: { ...appState.currentWeek, words: newWords } });
    } catch (e) { console.error(e); }
    setSwappingId(null);
  }

  async function handleConfirm() {
    if (!appState.settings.userEmail || !appState.settings.partnerEmail) {
      setConfirmError("Please add both email addresses in Settings before confirming.");
      return;
    }
    setConfirming(true);
    setConfirmError("");
    const ok = await sendConfirmationEmail(appState.settings, appState.currentWeek);
    await onUpdateState({ confirmed: true });
    if (!ok) setConfirmError("Words confirmed but email failed to send. Try resending from Settings.");
    else setConfirmError("✓ Email sent — check your spam folder if you don't see it.");
    setConfirming(false);
  }

  if (step === "start") {
    return (
      <div style={{ textAlign: "center", paddingTop: 40 }}>
        <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 64, lineHeight: 1, marginBottom: 16 }}>你好</div>
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>Ready for this week's words?</div>
        <button onClick={() => setStep("context")} style={btnStyle(C.navy)}>Get this week's words →</button>
      </div>
    );
  }

  if (step === "context") {
    return (
      <div>
        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Anything special this week?</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 20, lineHeight: 1.6 }}>
          A holiday, a milestone, something the kids are into. Optional — leave blank for everyday words.
        </div>
        <textarea value={context} onChange={e => setContext(e.target.value)}
          placeholder="e.g. Going to Croatia, Austin just started walking…"
          rows={4}
          style={{ width: "100%", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: C.navy, fontFamily: "Inter, sans-serif", resize: "none", outline: "none", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={handleGenerate} disabled={generating} style={{ ...btnStyle(C.navy), flex: 1, opacity: generating ? 0.6 : 1 }}>
            {generating ? "Generating…" : "Generate words →"}
          </button>
          <button onClick={() => setStep("start")} style={{ background: "none", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", fontSize: 14, cursor: "pointer" }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const { currentWeek, confirmed } = appState;
  if (!currentWeek) return null;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>This week's theme</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{currentWeek.theme}</div>
        {currentWeek.context && <div style={{ fontSize: 13, color: C.muted, marginTop: 4, fontStyle: "italic" }}>"{currentWeek.context}"</div>}
        {confirmed && <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 6 }}>✓ Confirmed — email sent to both of you</div>}
      </div>

      {currentWeek.words.map(word => {
        const isExpanded = expandedId === word.id;
        const isSwapping = swappingId === word.id;
        const showTrad = word.traditional !== word.simplified;
        return (
          <div key={word.id} style={{ background: C.card, borderRadius: 14, marginBottom: 10, borderLeft: `3px solid ${C.accent}`, overflow: "hidden" }}>
            <div
              onClick={() => !confirmed && !swappingId ? null : setExpandedId(isExpanded ? null : word.id)}
              style={{ padding: "16px 18px", cursor: "pointer" }}
              onClick={() => setExpandedId(isExpanded ? null : word.id)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 38, fontWeight: 700, lineHeight: 1.1, marginBottom: 4 }}>
                    {word.simplified}
                    {showTrad && <span style={{ fontSize: 26, color: C.muted, marginLeft: 8 }}>{word.traditional}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 2 }}>{word.pinyin}</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{word.english}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  {!confirmed && (
                    <button onClick={e => { e.stopPropagation(); handleSwap(word.id); }} disabled={!!swappingId}
                      style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.muted, cursor: "pointer" }}>
                      {isSwapping ? "…" : "Swap"}
                    </button>
                  )}
                  <div style={{ fontSize: 18, color: C.muted }}>{isExpanded ? "−" : "+"}</div>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ paddingTop: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>When to use it</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>{word.tip}</div>
                  <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>Sample sentence</div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, fontFamily: "Noto Serif TC, serif" }}>{word.sampleSentence}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!confirmed && (
        <>
          {confirmError && <div style={{ color: C.accent, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>{confirmError}</div>}
          <button onClick={handleConfirm} disabled={confirming} style={{ ...btnStyle(C.navy), width: "100%", marginTop: 8, opacity: confirming ? 0.6 : 1 }}>
            {confirming ? "Sending…" : "Confirm This Week's Words →"}
          </button>
          <button onClick={() => { setStep("context"); setContext(currentWeek.context || ""); }}
            style={{ width: "100%", background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", marginTop: 12, textDecoration: "underline" }}>
            Start over with different context
          </button>
        </>
      )}
    </div>
  );
}

// ── History Screen ───────────────────────────────────────────────
function HistoryScreen({ appState }) {
  const { history } = appState;
  const [openWeek, setOpenWeek] = useState(null);

  if (!history || history.length === 0) {
    return <EmptyState message="No history yet — confirm your first week's words to start building it." />;
  }

  return (
    <div>
      {history.map((week, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <button onClick={() => setOpenWeek(openWeek === i ? null : i)}
            style={{ width: "100%", background: C.card, border: "none", borderRadius: 14, padding: "16px 18px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.navy }}>{week.theme}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{week.weekId} · {week.words?.length || 0} words</div>
            </div>
            <div style={{ color: C.muted, fontSize: 18 }}>{openWeek === i ? "−" : "+"}</div>
          </button>
          {openWeek === i && (
            <div style={{ padding: "8px 4px 0" }}>
              {week.words?.map((w, j) => (
                <div key={j} style={{ background: C.card, borderRadius: 10, padding: "12px 16px", marginBottom: 8, borderLeft: `3px solid ${C.accent}` }}>
                  <div style={{ fontFamily: "Noto Serif TC, serif", fontSize: 28, fontWeight: 700, marginBottom: 2 }}>{w.simplified}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{w.pinyin} · {w.english}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Settings Screen ──────────────────────────────────────────────
function SettingsScreen({ appState, onUpdateState }) {
  const [form, setForm] = useState(JSON.parse(JSON.stringify(appState.settings)));
  const [saved, setSaved] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [emailStatus, setEmailStatus] = useState("");

  const emailsFilled = appState.settings.userEmail && appState.settings.partnerEmail;

  function handleChange(path, value) {
    const keys = path.split(".");
    setForm(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      let ref = next;
      for (let i = 0; i < keys.length - 1; i++) ref = ref[keys[i]];
      ref[keys[keys.length - 1]] = value;
      return next;
    });
  }

  function addChild() {
    setForm(prev => ({ ...prev, children: [...prev.children, { id: `c${Date.now()}`, name: "", dob: "" }] }));
  }

  function removeChild(id) {
    setForm(prev => ({ ...prev, children: prev.children.filter(c => c.id !== id) }));
  }

  function updateChild(id, field, value) {
    setForm(prev => ({ ...prev, children: prev.children.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  }

  async function handleSave() {
    await onUpdateState({ settings: form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleShare() {
    if (!shareEmail) return;
    setShareStatus("Sending…");
    await sendShareEmail(shareEmail, form.userName);
    setShareStatus("Sent! ✓");
    setShareEmail("");
    setTimeout(() => setShareStatus(""), 3000);
  }

  return (
    <div>
      <SettingsSection title="Your family">
        <SettingsField label="Your name" value={form.userName} onChange={v => handleChange("userName", v)} />
        <SettingsField label="Partner's name" value={form.partnerName} onChange={v => handleChange("partnerName", v)} />
      </SettingsSection>

      <SettingsSection title="Children">
        {form.children.map((child, i) => (
          <div key={child.id} style={{ borderBottom: `1px solid ${C.border}`, padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: C.muted }}>Child {i + 1}</div>
              {form.children.length > 1 && (
                <button onClick={() => removeChild(child.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>Remove</button>
              )}
            </div>
            <input placeholder="Name" value={child.name} onChange={e => updateChild(child.id, "name", e.target.value)}
              style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 15, color: C.navy, fontFamily: "Inter, sans-serif", marginBottom: 6 }} />
            <input type="date" value={child.dob} onChange={e => updateChild(child.id, "dob", e.target.value)}
              style={{ width: "100%", background: "none", border: "none", outline: "none", fontSize: 14, color: C.muted, fontFamily: "Inter, sans-serif" }} />
          </div>
        ))}
        <button onClick={addChild} style={{ width: "100%", padding: "12px 0", background: "none", border: "none", color: C.teal, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          + Add child
        </button>
      </SettingsSection>

      <SettingsSection title="Words per week">
        <div style={{ padding: "12px 16px", display: "flex", gap: 8 }}>
          {[4, 6, 8].map(n => (
            <button key={n} onClick={() => handleChange("wordsPerWeek", n)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              border: `1.5px solid ${form.wordsPerWeek === n ? C.navy : C.border}`,
              background: form.wordsPerWeek === n ? C.navy : "transparent",
              color: form.wordsPerWeek === n ? C.white : C.muted,
              fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}>{n}</button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Emails">
        <SettingsField label="Your email" value={form.userEmail} type="email" placeholder="you@email.com" onChange={v => handleChange("userEmail", v)} />
        <SettingsField label="Partner's email" value={form.partnerEmail} type="email" placeholder="partner@email.com" onChange={v => handleChange("partnerEmail", v)} />
        <div style={{ fontSize: 12, color: C.muted, padding: "8px 16px 12px", lineHeight: 1.5 }}>
          Weekly confirmation email + midweek reminder (Wed 7am)
        </div>
      </SettingsSection>

      <button onClick={handleSave} style={{ ...btnStyle(saved ? C.green : C.navy), width: "100%", marginBottom: 24 }}>
        {saved ? "Saved ✓" : "Save settings"}
      </button>

      {appState.currentWeek && appState.confirmed && (
        <SettingsSection title="Send now">
          {!emailsFilled && (
            <div style={{ padding: "12px 16px", fontSize: 13, color: C.accent }}>
              Add both email addresses above and save first.
            </div>
          )}
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, opacity: emailsFilled ? 1 : 0.4, pointerEvents: emailsFilled ? "auto" : "none" }}>
            <button onClick={async () => { setEmailStatus("Sending…"); await sendConfirmationEmail(appState.settings, appState.currentWeek); setEmailStatus("Sent ✓ — check spam if you don't see it"); setTimeout(() => setEmailStatus(""), 4000); }}
              style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.navy, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Resend this week's words
            </button>
            <button onClick={async () => { setEmailStatus("Sending…"); await sendMidweekEmail(appState.settings, appState.currentWeek); setEmailStatus("Sent ✓ — check spam if you don't see it"); setTimeout(() => setEmailStatus(""), 4000); }}
              style={{ padding: "10px 0", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "none", color: C.navy, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              Send midweek reminder now
            </button>
            {emailStatus && <div style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>{emailStatus}</div>}
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Share with a friend">
        <div style={{ padding: "12px 16px" }}>
          <InputField type="email" label="Friend's email" value={shareEmail} onChange={setShareEmail} placeholder="friend@email.com" />
          <button onClick={handleShare} style={{ ...btnStyle(C.teal), width: "100%" }}>Send invite</button>
          {shareStatus && <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginTop: 8 }}>{shareStatus}</div>}
        </div>
      </SettingsSection>

      {/* Reset — testing only */}
      <div style={{ textAlign: "center", marginTop: 16, paddingBottom: 8 }}>
        <button onClick={() => {
          if (window.confirm("Reset this week's words? This can't be undone.")) {
            const saved = JSON.parse(localStorage.getItem("mandarinApp_v4") || "{}");
            const reset = { ...saved, currentWeek: null, confirmed: false };
            localStorage.setItem("mandarinApp_v4", JSON.stringify(reset));
            window.location.reload();
          }
        }} style={{ background: "none", border: "none", color: C.border, fontSize: 11, cursor: "pointer", textDecoration: "underline", letterSpacing: 0.5 }}>
          reset this week
        </button>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.muted, marginBottom: 12 }}>{title}</div>
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

function BottomNav({ tab, setTab }) {
  const items = [
    { id: "week", label: "本週", sub: "This week" },
    { id: "history", label: "記錄", sub: "History" },
    { id: "settings", label: "設定", sub: "Settings" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: C.white, borderTop: `1px solid ${C.border}`, display: "flex" }}>
      {items.map(item => (
        <button key={item.id} onClick={() => setTab(item.id)}
          style={{ flex: 1, padding: "10px 0 14px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
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

function btnStyle(bg) {
  return { background: bg, color: "#fff", border: "none", borderRadius: 12, padding: "14px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" };
}
