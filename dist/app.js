import {setupLibraryManager} from './library-manager.mjs';
import {createLibraryMedia} from './library-media.mjs';
import {createStudySelection} from './study-selection.mjs';
import {createTelemetry} from './telemetry.mjs';
import {setupQuality} from './quality-ui.mjs';
import {createBankTracker} from './library-data.mjs';
import {fitSlideImage,disposeSlideFitting} from './slide-fit.mjs';
import {createExplanationQueue} from './explanation-queue.mjs';
import {explanationKey,normalizeExplanation,hasNoteExplanation,hasSpeakerNoteExplanation,upcomingExplanationQuestions} from './explanation-data.mjs?v=20261114-cache-exp';
import {renderQuizFeedback} from './quiz-feedback.mjs?v=20261114-sound-footer-2';
import {setupVersionUpdates} from './version-updates.mjs';
import { askConfirm } from "./confirm-dialog.mjs";
import { practiceSubjects, subjectKey } from "./subjects.mjs";
import { nextUnanswered, explanationFromResult } from "./study-flow.mjs";
import {
  shuffle,
  grade,
  answerQuestion,
  optionState,
  cleanQuestion,
  normalizeAnswer,
  isCorrect,
  confirmQuestion,
  updateQuestionContent,
} from "./core.mjs?v=20261113-background-publish-1";
import { setupResources } from "./resources-ui.js?v=multi-bank-1";
import {mergeQuestionBanks,bankQuestionKey} from './bank-merge.mjs';
import { presentationIdFromLink } from "./resources.mjs";
import { validateBank } from "./banks.mjs?v=20261113-background-publish-1";
import { setupAccount } from "./account-ui.js?v=20261113-background-publish-1";
import { AI_API_BASE } from "./site-config.mjs?v=20261113-background-publish-1";
import {
  solveBatch,
  applyAiResults,
  readyForPractice,
  verifyOrSolveWithDirectGemini,
  blobToBase64,
} from "./ai.mjs?v=study-speed-1";
import { createSlideImageStore } from "./slide-images.mjs?v=20261113-background-publish-1";
import { setupSlidePreview } from "./slide-preview.mjs?v=20261113-background-publish-1";
import {
  setupSharedDecks,
  deckRequest,
  sharedImagePath,
} from "./shared-decks.mjs?v=merge-practice-1";
import { fitQuizScreen } from "./quiz-screen.mjs?v=study-speed-1";
import { createQuizSound } from "./quiz-sound.mjs?v=20261114-sound-footer-2";
import { setupSidebar } from "./sidebar.mjs";

const $ = (id) => document.getElementById(id);
const quizAccountControl=document.querySelector('.account-control'),accountHome=document.querySelector('.top-actions');
const quizSound = createQuizSound();
setupSidebar();
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
let bank = read("sot-bank", []),
  history = read("sot-history", []),
  session = read("sot-session", null),
  sourceSummary = read("sot-source", "");
let libraryManager=null,libraryProfile=null,libraryGeneration=0;
let quality=null;
const telemetry=createTelemetry({base:AI_API_BASE});
const studySelection=createStudySelection(localStorage,history,session);
let selectionStrategy=read('sot-selection-strategy','unseen');
if(!['unseen','random'].includes(selectionStrategy))selectionStrategy='unseen';
const libraryMedia=createLibraryMedia();
let libraryTracker;
let pendingImportBank = null,
  importedQuestionKeys = new Map();
const originalStorage = new Map([
  ["sot-bank", JSON.stringify(bank)],
  ["sot-history", JSON.stringify(history)],
  ["sot-session", JSON.stringify(session)],
]);
bank = bank
  .filter((q) => q.sourceId || presentationIdFromLink(q.url))
  .map((q) =>
    cleanQuestion({
      ...q,
      sourceId: q.sourceId || presentationIdFromLink(q.url),
    }),
  );
history = history.map((r) => ({
  ...r,
  questions: r.questions.map(cleanQuestion),
}));
if (session)
  session = { ...session, questions: session.questions.map(cleanQuestion) };
if (
  session?.questions.some((q) => !q.sourceId && !presentationIdFromLink(q.url))
)
  session = null;
let view = "shared",
  lastResult = null,
  preferredMode = "study",
  preferredSubject = read("sot-practice-subject") || "",
  page = 1,
  editing = null,
  resultFilter = "all";
libraryTracker=createBankTracker(bank);bank=libraryTracker.stamp(bank);
const pageSize = 10;
const pageInfo = {
  shared: [
    "Kho đề & Ôn luyện",
    "Kho đề & Ôn luyện",
    "",
  ],
  sources: [
    "Tài liệu của tôi",
    "Tài liệu của tôi",
    "Chọn tài liệu và nhập câu hỏi từ slide.",
  ],
  library: [
    "Ngân hàng câu hỏi",
    "Ngân hàng câu hỏi",
    "Đáp án rõ ràng trong ghi chú được dùng ngay. Chỉ cần kiểm tra câu thiếu đáp án.",
  ],
  practice: [
    "Kho đề & Ôn luyện",
    "Thiết lập buổi học",
    "Lựa chọn chế độ, số lượng câu hỏi và bắt đầu phiên học.",
  ],
  history: [
    "Lịch sử & Kết quả",
    "Lịch sử & Kết quả",
    "Xem các bài đã nộp và mở lại kết quả chi tiết.",
  ],
  result: [
    "Lịch sử & Kết quả",
    "Kết quả bài làm",
    "Đối chiếu đáp án và chọn những câu cần ôn lại.",
  ],
};
const notices = new Map();
function renderNotice() {
  const text = notices.get(view) || "";
  $("message").textContent = text;
  $("message").hidden = !text;
}
function message(text, scope = view) {
  notices.set(scope, text);
  if (scope === view) renderNotice();
}
function write(key, value) {
  try {
    if(key==='sot-bank')libraryTracker?.stamp(value);
    localStorage.setItem(key, JSON.stringify(value));
    if(key==='sot-bank'){libraryGeneration++;libraryManager?.changed()}
    return true;
  } catch {
    message(
      "Không thể lưu dữ liệu. Hãy kiểm tra dung lượng lưu trữ trên trình duyệt.",
    );
    return false;
  }
}
function sources() {
  return [
    ...new Map(
      bank.map((q) => [q.sourceId, q.sourceName || "Tài liệu đã nhập"]),
    ).entries(),
  ];
}
function sourceReference(q, compact = false) {
  const slide = Number.isInteger(q.slide) && q.slide > 0 ? q.slide : null;
  const link = presentationIdFromLink(q.url) ? q.url : null;
  if (compact) {
    const zoomBtn =
      q.extraction === "ocr" || q.url || q.sharedDeck
        ? `<button type="button" class="secondary source-image-check" data-preview-slide="${esc(q.id)}">Phóng to ảnh gốc 🔍</button>`
        : "";
    return `<div class="source-reference source-reference-compact" data-slide="${slide || ""}">${zoomBtn}<div class="source-location"><strong>${slide ? `Slide ${slide}` : "Chưa có số slide"}</strong>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${slide ? "slide " + slide : "tài liệu"} gốc trong tab mới">Mở slide ↗</a>` : ""}</div></div>`;
  }
  return `<div class="source-reference" data-slide="${slide || ""}"><div><span class="source-label">NGUỒN CÂU HỎI</span><span class="source-document">${esc(q.sourceName || "Tài liệu đã nhập")}</span></div><div class="source-location"><strong>${slide ? `Slide gốc ${slide}` : "Chưa có số slide"}</strong>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${slide ? "slide " + slide : "tài liệu"} gốc trong tab mới">Mở slide ↗</a>` : ""}</div></div>`;
}
function refreshStats() {
  $("total").textContent = bank.length;
  $("ready").textContent = bank.filter(readyForPractice).length;
  if ($("navQuestionCount")) $("navQuestionCount").textContent = bank.length;
  if ($("accountQuestionCount")) $("accountQuestionCount").textContent = bank.length;
}
function aiBadge(q) {
  return q.answerSource === "gemini"
    ? '<span class="tag ai-answer-label">✦ Đáp án AI gợi ý</span>'
    : "";
}
function hasAiInput(q) {
  return !!q.url || hasAiText(q);
}
function hasAiText(q) {
  return (
    q.stem?.trim() &&
    q.options.length >= 2 &&
    q.options.every((o) => typeof o.text === "string" && o.text.trim())
  );
}
async function questionBlob(q, options = {}) {
  const started=performance.now();try{
  try{const local=await libraryMedia.forQuestion(q);if(local)return local}catch{}

  return await (q.sharedDeck
    ? (
        await deckRequest(AI_API_BASE, sharedImagePath(q), {
          signal: options.signal,
        })
      ).blob()
    : resources.slideBlob(q, options));
  }catch(error){if(!['AbortError','TimeoutError'].includes(error.name))telemetry.record('image_error');throw error}finally{telemetry.record('image_ms',performance.now()-started)}
}

async function questionImage(q) {
  return URL.createObjectURL(await questionBlob(q));
}
const slideImages = createSlideImageStore(questionImage, { limit: 300 });
window.addEventListener("pagehide", () => slideImages.clear());
async function preloadSlideImage(q) {
  if (!q?.url && !q?.sharedDeck) return;
  try {
    const url = await slideImages.get(q);
    if (!url) return;
    const img = new Image();
    img.src = url;
    if (img.decode) await img.decode().catch(() => {});
  } catch {}
}
let preloadingSession = null;
function startSessionPreload(questions) {
  if (!Array.isArray(questions) || !questions.length) return;
  preloadingSession = questions;
  let idx = 0;
  async function next() {
    if (preloadingSession !== questions || idx >= Math.min(6, questions.length))
      return;
    const q = questions[idx++];
    await preloadSlideImage(q);
    setTimeout(next, 40);
  }
  next();
}
function displayContent(q) {
  if (q.content) return q.content;
  if (q.options && q.options.some((o) => o.text && o.text.trim())) {
    const hasOptionsInStem =
      /(?:^|\n)[ \t]*(?:[•●▪][ \t]*)?(?:[（(][A-H][）)]|[［\[][A-H][］\]]|[A-H][.)．）：:])/m.test(
        q.stem,
      );
    if (hasOptionsInStem) return q.stem;
    return (
      q.stem +
      "\n\n" +
      q.options
        .filter((o) => o.text)
        .map((o) => o.id + ". " + o.text)
        .join("\n")
    );
  }
  return q.stem;
}
function saveBank() {
  bank = bank.map(cleanQuestion);
  write("sot-bank", bank);
  refreshStats();
  renderLibrary();
}
function empty(
  title,
  description,
  target = "sources",
  label = "Chọn tài liệu →",
) {
  return `<div class="empty"><span class="empty-icon">▱</span><h2>${esc(title)}</h2><p>${esc(description)}</p><button data-view="${target}">${esc(label)}</button></div>`;
}
function switchView(next, mode) {
  clearTimeout(window._autoAdvanceTimer);
  if (!pageInfo[next]) return;
  if ((next === "sources" || next === "library") && !resources?.active?.()) {
    message("Hãy đăng nhập Google ở góc phải để nạp tài liệu và quản lý câu hỏi.");
    next = "shared";
    setTimeout(() => $("accountButton")?.click(), 300);
  }
  if (
    session &&
    !session.done &&
    next !== "practice"
  )
    return message(session.mode === "study" ? "Hãy bấm 'Kết thúc' để hoàn thành buổi ôn trước khi rời giao diện này." : "Hãy nộp bài thi thử trước khi mở tài liệu hoặc kết quả.");
  if (mode) preferredMode = mode;
  if (next === "result" && !lastResult) next = "history";
  view = next;
  if(next!=='practice')accountHome.append(quizAccountControl);
  renderNotice();
  if (view !== "practice") {preloadingSession = null;explanationQueue.cancel();}
  document.body.classList.toggle(
    "quiz-active",
    view === "practice" && !!session && !session.done,
  );
  for (const id of Object.keys(pageInfo)) $(id).hidden = id !== view;
  const activeNav = view === "result" ? "history" : (view === "practice" ? "shared" : view);
  document.querySelectorAll("[data-view].nav").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeNav);
    if (button.dataset.view === activeNav)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const [crumb, title, description] = pageInfo[view];
  $("breadcrumb").textContent = crumb;
  $("pageTitle").textContent = title;
  $("pageDescription").textContent = description;
  $("pageDescription").hidden = !description;
  $("pageHeading").hidden = view === "practice" && !!session && !session.done;
  document.body.classList.toggle(
    "exam-active",
    !!session && !session.done && session.mode !== "study",
  );
  refreshStats();
  if (view === "shared") shared.load();
  if (view === "library") renderLibrary();
  if (view === "practice") renderPractice();
  if (view === "history") renderHistory();
  if (view === "result") renderResult(lastResult);
}
document.addEventListener("click", (event) => {
  const target = event.target;
  const clickable = target.closest("button, .nav, a, .choice-pill, input[type='checkbox'], input[type='radio'], #themeToggle");
  if (clickable) {
    if (clickable.classList.contains("choice-pill")) {
      quizSound.select();
    } else if (clickable.closest(".quiz-navigation, .nav-btn, .quiz-answer-next") || clickable.dataset.index !== undefined) {
      quizSound.nav();
    } else if (clickable.type === "checkbox" || clickable.type === "radio" || clickable.id === "themeToggle") {
      quizSound.toggle();
    } else {
      quizSound.click();
    }
  }

  const action = event.target.closest("[data-view]");
  if (action) {
    event.preventDefault();
    switchView(action.dataset.view, action.dataset.mode);
  }
});
const account = setupAccount({
  onConnect: (options) => {
    if (session && !session.done && (session.mode!=='study'||options.switchAccount))
      return message("Hoàn thành bài đang làm trước khi đổi tài khoản Google.");
    resources.connect(options);
  },
  onDisconnect: () => {
    aiController?.abort();
    shared.pause();
    libraryManager?.pause();
    explanationQueue.cancel();
    slideImages.clear();
    resources.disconnect();
  },
});
const resources = setupResources({
  onAccountChange: (profile) => {
    account.update(profile);
    libraryProfile=profile;setTimeout(()=>{libraryManager?.account(profile);quality?.setProfile(profile)},0);
    $("sourceAccessNotice").hidden = !!profile;
    $("sourceControls").hidden = !profile;
    if (!profile && (view === "sources" || view === "library")) {
      switchView("shared");
    }
    setTimeout(()=>{if(profile){scheduleAutoAi();}explanationQueue.resume();primeStudyExplanations();},0);
  },
  onAccountError: (text) => message(text),
  message: (text) => message(text, "sources"),
  hasActiveSession: () => !!session && !session.done,
  onImport: (result) => {
    if (aiRunning || (session && !session.done)) {
      message(
        "Dừng AI và hoàn thành bài đang làm trước khi thêm câu hỏi.",
        "sources",
      );
      return false;
    }
    const merged = mergeQuestionBanks(bank,result.questions);
    if (!write("sot-bank", merged)) return false;
    bank = merged;
    pendingImportBank = bank;
    importedQuestionKeys = new Map(result.sources.map(source=>[source.id,new Set(result.questions.filter(q=>q.sourceId===source.id).map(bankQuestionKey))]));
    sourceSummary = sources().map(([,name])=>name).join(" · ");
    write("sot-source", sourceSummary);
    page = 1;
    refreshStats();
    if (view === "library") renderLibrary();
    $("openImportedBank").hidden = false;
    $("openImportedBank").textContent =
      `Kiểm tra ${bank.length} câu hỏi đã nhập →`;
    scheduleAutoAi();
    return true;
  },
  onDeferredQuestion: (question, { limit }) => {
    if (bank !== pendingImportBank) return false;
    const keys=importedQuestionKeys.get(question.sourceId);
    if(!keys)return false;
    const count=()=>[...importedQuestionKeys.values()].reduce((total,items)=>total+items.size,0);
    const key=bankQuestionKey(question);
    if(keys.has(key)||keys.size>=limit)return {count:count()};
    const merged = mergeQuestionBanks(bank,[cleanQuestion(question)]);
    if (!write("sot-bank", merged)) return false;
    keys.add(key);
    bank = merged;
    pendingImportBank = bank;
    refreshStats();
    if (view === "library") renderLibrary();
    $("openImportedBank").textContent =
      `Kiểm tra ${bank.length} câu hỏi đã nhập →`;
    return { count: count() };
  },
});
const shared = setupSharedDecks({
  base: AI_API_BASE,
  getBank: () => bank,
  getToken: () => resources.apiToken(),
  getBlob: questionBlob,
  canChange: () => {
    if (aiRunning || (session && !session.done)) {
      message(
        "Dừng AI và hoàn thành bài đang làm trước khi đổi hoặc đăng bộ đề.",
      );
      return false;
    }
    return true;
  },
  onUseLocal: () => switchView("practice"),
  onUse: (deck) => {
    const questions = deck.questions.map(cleanQuestion);
    const merged=mergeQuestionBanks(bank,questions);
    if (!write("sot-bank", merged)) return;
    bank = merged;
    sourceSummary = sources().map(([,name])=>name).join(" · ");
    write("sot-source", sourceSummary);
    page = 1;
    refreshStats();
    const key = (questions[0] ? subjectKey(questions[0]) : "") ||
      questionSubject({ sourceName: deck.title }) ||
      (deck.id ? `shared-${deck.id}` : "");
    if (key) {
      preferredSubject = key;
      write("sot-practice-subject", key);
    }
    switchView("practice");
    if ($("practiceSource") && key) {
      $("practiceSource").value = key;
      $("practiceSource").dispatchEvent(new Event("change"));
    }
  },
});
setupSlidePreview({
  getQuestion: (id) =>
    bank.find((q) => q.id === id) ||
    session?.questions.find((q) => q.id === id) ||
    lastResult?.questions.find((q) => q.id === id),
  getImage: questionImage,
});

function filteredQuestions() {
  const term = $("search").value.trim().toLowerCase(),
    source = $("sourceFilter").value;
  return bank.filter(
    (q) =>
      (!source || q.sourceId === source) &&
      (!$("unverified").checked || !q.verified) &&
      q.stem.toLowerCase().includes(term),
  );
}
async function showQuestionImage(container, q) {
  if (!container?.isConnected || (!q.url && !q.sharedDeck && !q.mediaId)) return;
  const text = container.parentElement?.querySelector(".question-title");
  text?.classList.add("collapsed-text");
  const existing = container.querySelector("img");
  if (
    existing &&
    existing.dataset.previewSlide === q.id &&
    existing.complete &&
    existing.naturalWidth > 0
  )
    return;
  const loading = document.createElement("div");
  loading.className = "slide-media-loading";
  loading.textContent = "Đang tải ảnh slide gốc…";
  container.append(loading);
  try {
    const url = await slideImages.get(q);
    if (!container.isConnected) return;
    const image = document.createElement("img");
    image.alt = "Slide " + q.slide;
    image.className = container.classList.contains("library-slide-media")
      ? "library-slide-img"
      : "slide-media-img";
    image.dataset.previewSlide = q.id;
    image.title = "Bấm để phóng to ảnh gốc";
    const displayImage = () => {
      if (container.isConnected) {
        if(container.firstElementChild!==image)container.replaceChildren(image);
        fitSlideImage(container,image);
        text?.classList.add("collapsed-text");
      }
    };
    image.onload = displayImage;
    image.onerror = () => {
      slideImages.invalidate(
        q.mediaId?`local:${q.mediaId}`:q.sharedDeck ? `shared:${q.sharedDeck}:${q.sharedIndex}` : q.url,
      );
      showSlideError(container, q);
    };
    image.src = url;
    if (image.complete && image.naturalWidth > 0) {
      displayImage();
    } else if (image.decode) {
      image
        .decode()
        .then(displayImage)
        .catch(() => {});
    }
  } catch {
    if (container.isConnected) showSlideError(container, q);
  }
}
function showSlideError(container, q) {
  container.innerHTML = q.sharedDeck
    ? "<p>Chưa tải được ảnh từ kho chung. Kiểm tra kết nối rồi thử lại; bộ đề có thể đã được người đăng gỡ.</p>"
    : "<p>Chưa tải được ảnh slide gốc. Bạn cần đăng nhập tài khoản Google để tải ảnh từ tài liệu này (phiên đăng nhập có thể đã hết hạn).</p>";
  container.classList.add("slide-load-error");
  const retry = document.createElement("button");
  retry.className = "secondary";
  retry.type = "button";
  retry.textContent = "Thử tải lại ảnh";
  retry.onclick = () => {
    container.classList.remove("slide-load-error");
    showQuestionImage(container, q);
  };
  container.append(retry);
  if (!q.sharedDeck) {
    const loginBtn = document.createElement("button");
    loginBtn.className = "primary";
    loginBtn.type = "button";
    loginBtn.textContent = "Đăng nhập Google";
    loginBtn.onclick = () => $("accountButton")?.click();
    container.append(loginBtn);
  }
  const link = document.createElement("a");
  link.href = q.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Mở slide gốc ↗";
  if (q.url) container.append(link);
}
async function loadLibrarySlideImages(qs) {
  for (const q of qs) {
    const container = document.querySelector(
      '.library-slide-media[data-lib-slide="' + CSS.escape(q.id) + '"]',
    );
    if (!container?.isConnected) continue;
    await showQuestionImage(container, q);
  }
}
function renderLibrary() {
  libraryManager?.render();
  refreshStats();
  $("source").textContent = bank.length
    ? sourceSummary || `${sources().length} tài liệu đã nhập`
    : "Bắt đầu từ tài liệu Google Slides của bạn.";
  const chosen = $("sourceFilter").value;
  $("sourceFilter").innerHTML =
    '<option value="">Tất cả tài liệu</option>' +
    sources()
      .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`)
      .join("");
  if (sources().some(([id]) => id === chosen)) $("sourceFilter").value = chosen;
  const all = filteredQuestions(),
    pages = Math.max(1, Math.ceil(all.length / pageSize));
  page = Math.max(1, Math.min(page, pages));
  const qs = all.slice((page - 1) * pageSize, page * pageSize);
  $("questionCount").textContent =
    `${all.length} câu hỏi${all.length ? ` · Hiển thị ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, all.length)}` : ""}`;
  $("exportBank").disabled = !bank.length;
  $("verifyPage").disabled = !qs.some((q) => q.answer && !q.verified);
  $("clear").disabled = !bank.length || aiRunning;
  renderAi();
  $("questions").innerHTML = qs.length
    ? qs
        .map(
          (q, i) =>
            `<article class="card question-card"><div class="question-top"><div class="question-source">CÂU ${(page - 1) * pageSize + i + 1} · ${esc(q.sourceName || "Tài liệu đã nhập")}<br><a href="${esc(q.url)}" target="_blank" rel="noopener">Slide ${q.slide} ↗</a> ${q.extraction === "ocr" ? " · Nhận dạng từ ảnh" : ""}</div><span class="tag ${q.verified ? "ok" : ""}">${q.answerSource === "gemini" ? "✦ Đáp án AI gợi ý" : q.verified ? (q.answerSource === "speaker-notes" ? "✓ Đáp án từ ghi chú" : "✓ Đáp án đã xác nhận") : "Chờ kiểm tra"}</span></div>${sourceReference(q)}<div class="library-slide-media" data-lib-slide="${esc(q.id)}"></div><div class="question-title ${q.url || q.sharedDeck ? "collapsed-text" : ""}">${esc(displayContent(q))}</div><div class="choice-pills choice-pills-sm">${q.options.map((o) => `<span class="choice-pill static-pill ${q.answer.includes(o.id) ? "correct" : ""}">${esc(o.id)}</span>`).join("")}<span class="pill-answer-label">Đáp án: <strong>${esc(q.answer || "Chưa có")}</strong></span></div>${(q.answerSource === "gemini" || q.explanationSource === "gemini") && q.explanation ? `<details class="note-explanation"><summary>Giải thích AI · cần kiểm tra</summary><p>${esc(q.explanation)}</p></details>` : ""}${q.explanation && q.answerSource !== "gemini" && q.explanationSource !== "gemini" ? `<details class="note-explanation"><summary>Ghi chú / Giải thích</summary><p>${esc(q.explanation)}</p></details>` : ""}${q.aiStatus === "uncertain" ? `<p class="muted">AI chưa xác định: ${esc(q.aiReason)}</p>` : ""}<div class="question-bottom"><label>Đáp án đúng<input data-answer="${esc(q.id)}" aria-label="Đáp án đúng của câu ${(page - 1) * pageSize + i + 1}" value="${esc(q.answer)}" placeholder="A, AD, ACE…" maxlength="24" autocomplete="off"></label><div class="row"><button class="${q.verified ? "secondary" : ""}" data-verify="${esc(q.id)}">${q.verified ? "Bỏ xác nhận" : "✓ Xác nhận"}</button>${q.extraction === "ocr" ? `<button class="secondary" data-preview-slide="${esc(q.id)}">Đối chiếu ảnh gốc</button>` : ""}<button class="secondary" data-report-question="${esc(q.id)}">Báo lỗi</button><button class="secondary" data-edit="${esc(q.id)}">Sửa câu hỏi</button><button class="text-button danger" data-delete="${esc(q.id)}">Xóa</button></div></div></article>`,
        )
        .join("")
    : empty(
        bank.length
          ? "Không có câu hỏi phù hợp"
          : "Ngân hàng đang chờ tài liệu",
        bank.length
          ? "Thử từ khóa khác hoặc bỏ bộ lọc để xem thêm câu hỏi."
          : "Nhập bộ slide của bạn. Các câu hỏi nhận diện được sẽ xuất hiện ở đây để kiểm tra.",
      );
  $("pagination").innerHTML = all.length
    ? `<button class="secondary" data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>← Trước</button><span>Trang ${page} / ${pages}</span><button class="secondary" data-page="${page + 1}" ${page === pages ? "disabled" : ""}>Sau →</button>`
    : "";
  setTimeout(() => loadLibrarySlideImages(qs), 0);
}
for (const id of ["search", "sourceFilter", "unverified"])
  $(id).addEventListener(id === "search" ? "input" : "change", () => {
    page = 1;
    renderLibrary();
  });
$("pagination").onclick = (e) => {
  const target = e.target.closest("[data-page]");
  if (target) {
    page = Number(target.dataset.page);
    renderLibrary();
    $("library").scrollIntoView({ behavior: "smooth", block: "start" });
  }
};
$("questions").onchange = (e) => {
  const q = bank.find((q) => q.id === e.target.dataset.answer);
  if (q) {
    const value = normalizeAnswer(e.target.value, q.options);
    if (e.target.value.trim() && !value) {
      e.target.value = q.answer;
      return message(
        "Nhập các chữ cái đáp án có trong câu, ví dụ AD hoặc ACE.",
      );
    }
    if(q.answer!==value&&(q.explanationSource==='gemini'||q.answerSource==='gemini')){q.explanation='';q.explanationSource=null}
    q.answer = value;
    q.answerSource = "manual";
    q.aiStatus = null;
    q.verified = false;
    saveBank();
  }
};
$("questions").onclick = async (e) => {
  const toggleBtn = e.target.closest("[data-toggle-text]");
  if (toggleBtn) {
    const t = toggleBtn
      .closest(".question-card")
      ?.querySelector(".question-title");
    if (t) t.classList.toggle("collapsed-text");
    return;
  }
  const button = e.target.closest("button");
  if (!button) return;
  const id =
      button.dataset.verify || button.dataset.edit || button.dataset.delete,
    q = bank.find((q) => q.id === id);
  if (!q) return;
  if (button.dataset.edit) return editQuestion(q);
  if (button.dataset.verify) {
    if (!q.answer) return message("Chọn đáp án đúng trước khi xác nhận.");
    q.verified = !q.verified;
  }
  if (button.dataset.delete) {
    if (!await askConfirm("Xóa câu hỏi này khỏi ngân hàng?", { title: "Xóa câu hỏi", danger: true, okText: "Xóa" })) return;
    bank = bank.filter((q) => q.id !== id);
  }
  saveBank();
};
$("verifyPage").onclick = async () => {
  const qs = filteredQuestions()
    .slice((page - 1) * pageSize, page * pageSize)
    .filter((q) => q.answer && !q.verified);
  if (!qs.length) return;
  if (
    await askConfirm(
      `Bạn đã kiểm tra nội dung và đáp án của ${qs.length} câu trong trang này? Xác nhận để đưa các câu này vào đề luyện.`,
      { title: "Xác nhận trang câu hỏi", okText: "Xác nhận" }
    )
  ) {
    qs.forEach((q) => (q.verified = true));
    saveBank();
  }
};
const notesButton = document.createElement("button");
notesButton.className = "secondary";
notesButton.textContent = "Lấy đáp án từ ghi chú";
$("verifyPage").before(notesButton);
let aiRunning = false,
  aiController = null;
let autoAi = true,
  autoAiTimer;
try {
  autoAi = localStorage.getItem("sot-ai-auto") !== "false";
} catch {}
const aiPanel = document.createElement("section");
aiPanel.className = "card ai-panel";
aiPanel.setAttribute("aria-label", "Bổ sung đáp án bằng AI");
aiPanel.innerHTML =
  '<div><span class="overline">TRỢ LÝ HỌC TẬP</span><h3>Tự động bổ sung đáp án</h3><p>Câu thiếu đáp án được gửi cho Gemini sau khi nhập. Đáp án AI có thể dùng để ôn và được ghi rõ là gợi ý; bạn vẫn có thể sửa hoặc xác nhận.</p></div><label class="check-label"><input id="aiAuto" type="checkbox"> Tự động xử lý câu thiếu đáp án bằng AI</label><div class="ai-actions"><button id="aiStart">✦ Thử lại các câu còn thiếu</button><button id="aiStop" class="secondary" hidden>Dừng xử lý</button><button id="aiAccept" class="secondary" hidden>Xác nhận đề xuất AI</button></div><p id="aiAvailability"></p><div id="aiProgress" role="status" aria-live="polite"></div><progress id="aiBar" max="1" value="0" hidden></progress>';
$("library").insertBefore(
  aiPanel,
  $("library").querySelector(".library-toolbar"),
);
const sourceAi = document.createElement("label");
sourceAi.className = "check-label source-auto-ai";
sourceAi.innerHTML =
  '<input id="sourceAutoAI" type="checkbox"> Dùng Gemini kiểm tra ảnh chưa rõ có phải câu hỏi và gợi ý đáp án còn thiếu. Giữ nguyên đáp án trong ghi chú; có thể tắt bất cứ lúc nào.';
$("sourceControls").querySelector(".import-options").after(sourceAi);
function setAutoAi(value) {
  autoAi = value;
  try {
    localStorage.setItem("sot-ai-auto", String(value));
  } catch {}
  $("aiAuto").checked = value;
  $("sourceAutoAI").checked = value;
  if (value) scheduleAutoAi();
  else {
    clearTimeout(autoAiTimer);
    aiController?.abort();
  }
}
$("aiAuto").checked = autoAi;
$("sourceAutoAI").checked = autoAi;
$("aiAuto").onchange = (e) => setAutoAi(e.target.checked);
$("sourceAutoAI").onchange = (e) => setAutoAi(e.target.checked);
function scheduleAutoAi() {
  clearTimeout(autoAiTimer);
  autoAiTimer = setTimeout(() => {
    if (!autoAi || aiRunning || !AI_API_BASE || (session && !session.done))
      return;
    if (resources.isBusy()) {
      autoAiTimer = setTimeout(scheduleAutoAi, 500);
      return;
    }
    const missing = bank.filter((q) => !q.answer && hasAiInput(q));
    if (!missing.length) return;
    try {
      resources.apiToken();
    } catch {
      return;
    }
    const signature =
      "ai-retry-v2:" +
      JSON.stringify(missing.map((q) => [q.id, questionAutoKey(q)]));
    try {
      if (sessionStorage.getItem("sot-ai-auto-attempt") === signature) return;
      sessionStorage.setItem("sot-ai-auto-attempt", signature);
    } catch {}
    runAi({ automatic: true });
  }, 250);
}
function questionAutoKey(q) {
  return q.stem + "\n" + q.options.map((o) => o.id + o.text).join("\n");
}
function renderAi() {
  const missing = bank.filter((q) => !q.answer).length,
    proposed = bank.filter(
      (q) => q.answerSource === "gemini" && q.answer && !q.verified,
    ).length,
    incomplete = bank.filter((q) => !q.answer && !hasAiInput(q)).length;
  $("aiStart").disabled = aiRunning || missing === incomplete || !AI_API_BASE;
  $("aiStart").hidden = aiRunning;
  $("aiStop").hidden = !aiRunning;
  $("aiAccept").hidden = !proposed;
  $("aiAccept").disabled = aiRunning;
  $("aiAvailability").textContent = AI_API_BASE
    ? `${missing} câu thiếu đáp án · ${proposed} đáp án AI gợi ý có thể dùng. ${incomplete ? `${incomplete} câu chưa có ảnh hoặc nội dung đầy đủ. ` : ""}Đọc từng ảnh slide gốc; lưu kết quả sau mỗi câu. AI có thể sai.`
    : "Tính năng AI đang được chuẩn bị. Bạn vẫn có thể lấy đáp án từ ghi chú và ôn luyện bình thường.";
}
$("aiStop").onclick = () => {
  setAutoAi(false);
  $("aiProgress").textContent = "Đang dừng. Các đáp án đã lưu vẫn được giữ.";
};
$("aiAccept").onclick = async () => {
  if (session && !session.done)
    return message(
      "Hoàn thành bài đang làm trước khi cập nhật đáp án.",
      "library",
    );
  const proposed = bank.filter(
    (q) => q.answerSource === "gemini" && q.answer && !q.verified,
  );
  if (
    !proposed.length ||
    !await askConfirm(
      `Dùng ${proposed.length} đáp án AI đề xuất cho ôn luyện và thi thử? AI có thể sai. Hãy kiểm tra các câu quan trọng trước khi xác nhận.`,
      { title: "Xác nhận đáp án AI", okText: "Đồng ý" }
    )
  )
    return;
  proposed.forEach((q) => (q.verified = true));
  saveBank();
  message(
    `Đã cho phép dùng ${proposed.length} đề xuất AI. Nguồn đáp án AI vẫn được ghi rõ.`,
    "library",
  );
};
async function runAi({ automatic = false } = {}) {
  if (session && !session.done)
    return message(
      "Hoàn thành bài đang làm trước khi bổ sung đáp án.",
      "library",
    );
  if (aiRunning || !AI_API_BASE) return;
  let pending = structuredClone(bank.filter((q) => !q.answer));
  if (!pending.length) return;
  let token;
  try {
    token = resources.apiToken();
  } catch (error) {
    return message(error.message, "library");
  }
  aiRunning = true;
  aiController = new AbortController();
  let done = 0,
    applied = 0,
    uncertain = 0,
    fromNotes = 0,
    removed = 0;
  renderLibrary();
  $("aiBar").hidden = false;
  $("aiBar").max = pending.length;
  $("aiBar").value = 0;
  try {
    {
      $("aiProgress").textContent =
        "Đang kiểm tra ghi chú trước; chỉ gửi câu còn thiếu cho AI…";
      try {
        const result = await resources.readAnswers(pending);
        if (aiController.signal.aborted)
          throw new DOMException("Stopped", "AbortError");
        for (const update of result.updates) {
          const q = bank.find((q) => q.id === update.id),
            original = pending.find((q) => q.id === update.id);
          if (
            q &&
            !q.answer &&
            original &&
            questionAutoKey(q) === questionAutoKey(original)
          ) {
            q.answer = update.answer;
            q.explanation = update.explanation;
            q.explanationSource = 'speaker-notes';
            q.verified = true;
            q.answerSource = "speaker-notes";
            fromNotes++;
          }
        }
      } catch (error) {
        if (error.name === "AbortError") throw error;
      }
      if (fromNotes && !write("sot-bank", bank))
        throw Error("Không lưu được đáp án từ ghi chú.");
      pending = pending.filter((q) => {
        const current = bank.find((current) => current.id === q.id);
        return current && !current.answer;
      });
      refreshStats();
      renderLibrary();
      $("aiBar").max = pending.length || 1;
      if (!pending.length) {
        $("aiProgress").textContent =
          `Đã lấy ${fromNotes} đáp án từ ghi chú; không cần gọi AI.`;
        return;
      }
    }
    const incomplete = pending.filter((q) => !hasAiInput(q)).length;
    pending = pending.filter(hasAiInput);
    if (!pending.length) {
      $("aiProgress").textContent =
        "Chưa đọc được đầy đủ lựa chọn. Hãy đối chiếu ảnh hoặc sửa đề; không gửi dữ liệu thiếu cho AI.";
      return;
    }
    $("aiBar").max = pending.length;
    while (done < pending.length) {
      if (aiController.signal.aborted)
        throw new DOMException("Stopped", "AbortError");
      const batch = pending.slice(done, done + 1).filter((q) => {
        const current = bank.find((current) => current.id === q.id);
        return current && !current.answer;
      });
      $("aiProgress").textContent =
        `Đang xử lý ${done + 1}–${Math.min(done + 1, pending.length)} / ${pending.length} câu…`;
      if (batch.length) {
        try {
          for (const q of batch) {
            if (q.url) {
              const blob = await questionBlob(q);
              if (aiController.signal.aborted)
                throw new DOMException("Stopped", "AbortError");
              if (blob.size > 2100000) throw Error("Slide image exceeds 2 MB.");
              q.image = { mimeType: blob.type, data: await blobToBase64(blob) };
            }
          }
          const result = await solveBatch(
            AI_API_BASE,
            batch,
            resources.apiToken(),
            { signal: aiController.signal },
          );
          const before = bank.length,
            counts = applyAiResults(bank, batch, result.answers, result.model);
          removed += before - bank.length;
          applied += counts.applied;
          uncertain += counts.uncertain;
        } catch (error) {
          if (error.code !== "AI_IMAGE_INVALID") throw error;
          for (const submitted of batch) {
            const q = bank.find((q) => q.id === submitted.id);
            if (
              q &&
              !q.answer &&
              questionAutoKey(q) === questionAutoKey(submitted)
            ) {
              q.aiStatus = "uncertain";
              q.aiReason =
                "Ảnh slide chưa đọc được. Tải lại ảnh và thử AI sau.";
              uncertain++;
            }
          }
        }
        if (!write("sot-bank", bank))
          throw Error(
            "Không lưu được kết quả. Hãy xuất ngân hàng và kiểm tra dung lượng trình duyệt trước khi tiếp tục.",
          );
      }
      done = Math.min(done + 1, pending.length);
      $("aiBar").value = done;
      refreshStats();
      renderLibrary();
    }
    $("aiProgress").textContent =
      `Đã lấy ${fromNotes} đáp án từ ghi chú và lưu ${applied} đáp án AI gợi ý, có thể ôn luyện ngay. ${uncertain} câu AI chưa xác định được vẫn để trống. Đã loại ${removed} slide không phải câu hỏi.${incomplete ? ` ${incomplete} câu thiếu lựa chọn chưa gửi AI.` : ""}`;
  } catch (error) {
    $("aiProgress").textContent =
      error.name === "AbortError"
        ? `Đã dừng và giữ ${applied} đề xuất. Bấm AI bổ sung đáp án để tiếp tục các câu còn thiếu.`
        : `${error.message} Đã giữ ${applied} đề xuất; có thể tiếp tục sau.`;
  } finally {
    aiRunning = false;
    aiController = null;
    renderLibrary();
  }
}
$("aiStart").onclick = () => runAi();
notesButton.onclick = async () => {
  if (aiRunning)
    return message("Dừng AI trước khi đọc lại ghi chú.", "library");
  if (session && !session.done)
    return message("Hoàn thành bài đang làm trước khi cập nhật đáp án.");
  const snapshot = bank;
  notesButton.disabled = true;
  notesButton.textContent = "Đang đọc ghi chú…";
  try {
    const { updates, failures, unresolved } =
      await resources.readAnswers(snapshot);
    if (bank !== snapshot || (session && !session.done))
      return message("Ngân hàng hoặc bài làm đã thay đổi. Hãy lấy lại đáp án.");
    for (const update of updates) {
      const q = bank.find((q) => q.id === update.id);
      if (q && (!q.verified || q.answer === update.answer)) {
        q.answer = update.answer;
        q.explanation = update.explanation;
        q.explanationSource = 'speaker-notes';
        q.verified = true;
        q.answerSource = "speaker-notes";
      }
    }
    const details = [
      ["missingSlide", "Không khớp slide gốc"],
      ["empty", "Google chưa trả nội dung ghi chú"],
      ["unmatched", "Ghi chú chưa khớp lựa chọn đáp án"],
    ]
      .filter(([key]) => unresolved[key].length)
      .map(
        ([key, label]) =>
          `${label}: ${unresolved[key].length} câu (slide ${unresolved[key].slice(0, 10).join(", ")}${unresolved[key].length > 10 ? ", …" : ""}).`,
      )
      .join(" ");
    saveBank();
    message(
      `${updates.length ? `Đã cập nhật đáp án/giải thích cho ${updates.length} câu từ ghi chú.` : "Không tìm thấy đáp án mới hoặc giải thích cần bổ sung trong ghi chú."} Hiện có ${bank.filter(readyForPractice).length}/${bank.length} câu sẵn sàng ôn luyện. Không quét lại ảnh. ${details}${failures.length ? " Một số tài liệu không đọc được: " + failures.join("; ") : ""}`,
    );
  } catch (error) {
    message(error.message);
  } finally {
    notesButton.disabled = false;
    notesButton.textContent = "Lấy đáp án từ ghi chú";
    scheduleAutoAi();
  }
};
$("clear").onclick = async () => {
  if (
    await askConfirm(
      "Xóa ngân hàng câu hỏi trên thiết bị này? Lịch sử bài làm vẫn được giữ.",
      { title: "Xóa ngân hàng câu hỏi", danger: true, okText: "Xóa tất cả" }
    )
  ) {
    bank = [];
    sourceSummary = "";
    write("sot-source", "");
    saveBank();
  }
};
function editQuestion(q) {
  editing = q.id;
  $("editFields").innerHTML =
    `<label>Nội dung câu hỏi (nguyên cụm)<textarea name="stem" rows="7" required>${esc(displayContent(q))}</textarea></label><label>Đáp án đúng<input name="answer" value="${esc(q.answer)}" placeholder="A, AD, ACE…" maxlength="24" autocomplete="off"></label><label>Giải thích (tùy chọn)<textarea name="explanation" rows="3">${esc(q.explanation || "")}</textarea></label>`;
  $("editQuestion").showModal();
}
for (const id of ["closeEdit", "cancelEdit"])
  $(id).onclick = () => $("editQuestion").close();
$("editForm").onsubmit = (e) => {
  e.preventDefault();
  const q = bank.find((q) => q.id === editing);
  if (!q) return;
  const fields = new FormData(e.target),
    stem = String(fields.get("stem") || "").trim(),
    explanation = String(fields.get("explanation") || "").trim();
  if (!stem) return message("Nội dung câu hỏi không được để trống.");
  let updated;
  try {
    updated = updateQuestionContent(q, stem);
  } catch (error) {
    return message(error.message);
  }
  const correct = normalizeAnswer(fields.get("answer"), updated.options);
  if (String(fields.get("answer")).trim() && !correct)
    return message("Đáp án phải là các chữ cái hợp lệ, ví dụ AD hoặc ACE.");
  Object.assign(q, updated);
  q.explanation = explanation;
  q.explanationSource = explanation?'manual':null;
  q.answer = correct;
  q.answerSource = "manual";
  q.aiStatus = null;
  q.verified = false;
  saveBank();
  $("editQuestion").close();
};

$("exportBank").onclick = () => {
  if (!bank.length) return;
  const data = {
    format: "slide-on-thi/v1",
    exportedAt: new Date().toISOString(),
    questions: bank.map(
      ({
        id,
        stem,
        content,
        options,
        answer,
        verified,
        sourceId,
        sourceName,
        sharedDeck,
        sharedIndex,
        sourceVersion,
        slide,
        url,
        extraction,
        explanation,
        explanationSource,
        answerSource,
        aiStatus,
        aiReason,
        aiModel,
      }) => ({
        id,
        stem,
        content,
        options,
        answer,
        verified,
        sourceId,
        sourceName,
        sharedDeck,
        sharedIndex,
        sourceVersion,
        slide,
        url,
        extraction,
        explanation,
        explanationSource,
        answerSource,
        aiStatus,
        aiReason,
        aiModel,
      }),
    ),
  };
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = "slide-on-thi-ngan-hang.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
for (const id of ["importBank"]) $(id).onclick = () => $("bankFile").click();
$("bankFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (aiRunning) throw Error("Dừng AI trước khi thêm câu hỏi.");
    if (session && !session.done)
      throw Error("Hãy hoàn thành bài đang làm trước khi nhập bộ câu hỏi.");
    if (file.size > 10 * 1024 * 1024) throw Error("File lớn hơn 10 MB.");
    const imported = validateBank(JSON.parse(await file.text()));
    const merged=mergeQuestionBanks(bank,imported),added=merged.length-bank.length;
    if (!write("sot-bank", merged)) return;
    bank = merged;
    sourceSummary = sources()
      .map(([, name]) => name)
      .join(" · ");
    write("sot-source", sourceSummary);
    lastResult = null;
    page = 1;
    switchView("library");
    message(
      `Đã thêm ${added} câu mới; các môn đã lưu vẫn được giữ. Thư viện hiện có ${bank.length} câu. Chọn mã môn ở Ôn luyện & Thi thử để học.`,
    );
  } catch (error) {
    message(
      error instanceof SyntaxError
        ? "File JSON không đọc được. Hãy dùng file xuất từ Slide Ôn Thi."
        : error.message,
    );
  } finally {
    e.target.value = "";
  }
};

function renderPractice() {
  if (session && !session.done) return renderQuiz();
  const eligible = bank.filter(readyForPractice),
    n = eligible.length;
  const subjects = practiceSubjects(eligible);

  let currentSubject = "";
  if (preferredSubject && subjects.some((s) => s.key === preferredSubject)) {
    currentSubject = preferredSubject;
  } else if (subjects.length > 0) {
    currentSubject = subjects[0].key;
    preferredSubject = currentSubject;
    write("sot-practice-subject", preferredSubject);
  }

  const allPool = (subj = $("practiceSource") ? $("practiceSource").value : currentSubject) =>
    eligible.filter(
      (q) => !subj || subjectKey(q) === subj,
    );

  const pool = subj => selectionStrategy==='unseen'?studySelection.remaining(allPool(subj)):allPool(subj);
  const initialPool = pool(currentSubject);
  const initialPoolCount = initialPool.length;
  const initialCount = Math.min(20, initialPoolCount) || 1;
  const selectionSummary=()=>{const all=allPool(),remaining=studySelection.remaining(all).length;return remaining?`Còn ${remaining}/${all.length} câu chưa bốc trong vòng này. Câu được tính đã bốc khi bắt đầu buổi học, kể cả khi chưa trả lời.`:'Bạn đã bốc hết các câu trong nhóm này. Bắt đầu vòng mới để ôn tiếp hoặc chọn ngẫu nhiên toàn bộ.'};

  $("practice").innerHTML = `
<div class="setup-container-v2">
  <div class="setup-nav-bar">
    <button type="button" class="btn-back-to-shared" id="backToSharedBtn">
      <span class="back-icon">←</span>
      <span>Quay lại Kho đề & Ôn luyện</span>
    </button>
  </div>
  <div class="setup-grid-v2">
    <!-- LEFT COLUMN: Controller Card -->
    <div class="setup-card-v2 controller-card">
      <div class="setup-card-header">
        <span class="setup-badge">⚡ THIẾT LẬP BUỔI HỌC</span>
        <h2 class="setup-title">Cấu hình chế độ</h2>
        <p class="setup-subtitle">Chọn phương thức học và số lượng câu hỏi phù hợp với mục tiêu hôm nay.</p>
      </div>

      <!-- Segmented Mode Switcher -->
      <div class="segmented-mode-picker" role="radiogroup" aria-label="Chế độ học">
        <label class="mode-segment ${preferredMode === "study" ? "active" : ""}">
          <input type="radio" name="mode" value="study" ${preferredMode === "study" ? "checked" : ""} class="sr-only">
          <span class="segment-icon">🎯</span>
          <span class="segment-body">
            <b class="segment-title">Ôn luyện tự do</b>
            <small class="segment-desc">Biết đúng/sai & lời giải ngay, không giới hạn giờ</small>
          </span>
        </label>
        <label class="mode-segment ${preferredMode === "exam" ? "active" : ""}">
          <input type="radio" name="mode" value="exam" ${preferredMode === "exam" ? "checked" : ""} class="sr-only">
          <span class="segment-icon">⏱️</span>
          <span class="segment-body">
            <b class="segment-title">Thi thử tính giờ</b>
            <small class="segment-desc">Đếm ngược, tự nộp khi hết giờ & chấm điểm</small>
          </span>
        </label>
      </div>

      <div class="setup-form-body">
        <!-- Subject Selection -->
        <div class="form-group-v2">
          <div class="form-label-row">
            <label class="form-label-v2" for="practiceSource">Mã môn / Nguồn đề</label>
            <span class="label-hint" id="availableQuestionsCount">${initialPoolCount} câu sẵn sàng</span>
          </div>
          <div class="select-wrapper-v2">
            <select id="practiceSource" class="select-control-v2">
              ${subjects.map(({key,label,count})=>`<option value="${esc(key)}" ${key === currentSubject ? "selected" : ""}>${esc(label)} (${count} câu)</option>`).join("")}
              ${subjects.length > 1 ? `<option value="" ${currentSubject === "" ? "selected" : ""}>Tất cả môn (${n} câu sẵn sàng)</option>` : ""}
            </select>
          </div>
        </div>

        <!-- Question Count Selection with Range Slider & Presets -->
        <div class="form-group-v2">
          <label class="form-label-v2" for="selectionStrategy">Cách chọn câu hỏi</label>
          <select id="selectionStrategy" class="select-control-v2"><option value="unseen" ${selectionStrategy==='unseen'?'selected':''}>Ưu tiên câu chưa làm · không trùng trong vòng</option><option value="random" ${selectionStrategy==='random'?'selected':''}>Ngẫu nhiên toàn bộ · có thể gặp lại câu cũ</option></select>
          <p id="selectionSummary" class="selection-summary">${selectionSummary()}</p>
          <button type="button" id="resetSelection" class="secondary selection-reset" ${studySelection.remaining(allPool()).length?'hidden':''}>Bắt đầu vòng mới cho nhóm câu này</button>
        </div>
        <div class="form-group-v2">
          <div class="form-label-row">
            <label class="form-label-v2" for="count">Số câu làm bài</label>
            <span class="count-display-badge"><span id="countDisplayVal">${initialCount}</span> câu</span>
          </div>
          <div class="slider-row-v2">
            <input type="range" id="countSlider" class="range-slider-v2" min="1" max="${initialPoolCount || 1}" value="${initialCount}">
            <input id="count" type="number" class="number-input-v2" min="1" max="${initialPoolCount || 1}" value="${initialCount}">
          </div>
          <div class="count-presets-v2">
            <button type="button" class="preset-pill-v2" data-preset="10">10 câu</button>
            <button type="button" class="preset-pill-v2" data-preset="20">20 câu</button>
            <button type="button" class="preset-pill-v2" data-preset="50">50 câu</button>
            <button type="button" class="preset-pill-v2" data-preset="max">Tất cả (${initialPoolCount})</button>
          </div>
        </div>

        <!-- Exam Minutes Selection -->
        <div id="timeSetting" class="form-group-v2" ${preferredMode === "study" ? "hidden" : ""}>
          <div class="form-label-row">
            <label class="form-label-v2" for="minutes">Thời gian làm bài</label>
            <span class="count-display-badge"><span id="minutesDisplayVal">20</span> phút</span>
          </div>
          <div class="slider-row-v2">
            <input type="range" id="minutesSlider" class="range-slider-v2" min="5" max="120" step="5" value="20">
            <input id="minutes" type="number" class="number-input-v2" min="1" max="180" value="20">
          </div>
          <div class="time-presets-v2">
            <button type="button" class="preset-pill-v2 time-pill" data-minutes="15">15 phút</button>
            <button type="button" class="preset-pill-v2 time-pill" data-minutes="30">30 phút</button>
            <button type="button" class="preset-pill-v2 time-pill" data-minutes="45">45 phút</button>
            <button type="button" class="preset-pill-v2 time-pill" data-minutes="60">60 phút</button>
          </div>
        </div>

        <!-- Action Button -->
        <button id="start" class="hero-start-btn" ${!initialPoolCount ? "disabled" : ""}>
          <span class="btn-text">${preferredMode === "study" ? "Bắt đầu ôn luyện" : "Bắt đầu thi thử"}</span>
          <span class="btn-arrow">→</span>
        </button>
        ${!n ? '<p class="no-questions-notice">Chưa có câu hỏi có đáp án trong ngân hàng. <a href="#" data-view="library">Kiểm tra ngân hàng câu hỏi →</a></p>' : ""}
      </div>
    </div>

    <!-- RIGHT COLUMN: Session Preview Dashboard -->
    <div class="setup-card-v2 preview-card">
      <div class="preview-card-header">
        <span class="setup-badge secondary">📊 TỔNG QUAN PHIÊN HỌC</span>
        <h3 class="preview-subject-name" id="previewSubjectName">Tất cả môn học</h3>
        <p class="preview-subject-desc" id="previewSubjectDesc">Sử dụng kho câu hỏi tổng hợp từ các slide đã nhập.</p>
      </div>

      <!-- Quick Metrics Grid -->
      <div class="preview-metrics-grid">
        <div class="preview-metric-box">
          <span class="metric-icon">📝</span>
          <span class="metric-val" id="previewQuestionsCount">${initialCount}</span>
          <span class="metric-lbl">Số câu làm</span>
        </div>
        <div class="preview-metric-box">
          <span class="metric-icon">⏱️</span>
          <span class="metric-val" id="previewEstimatedTime">~${initialCount} phút</span>
          <span class="metric-lbl">Thời lượng</span>
        </div>
        <div class="preview-metric-box">
          <span class="metric-icon">📦</span>
          <span class="metric-val" id="previewPoolCount">${initialPoolCount}</span>
          <span class="metric-lbl">Kho câu sẵn</span>
        </div>
      </div>

      <!-- Mode Features Checklist -->
      <div class="preview-features-box">
        <h4 class="features-box-title" id="previewFeaturesTitle">${preferredMode === "study" ? "Đặc quyền chế độ Ôn luyện" : "Quy chế phòng Thi thử"}</h4>
        <ul class="features-list" id="previewFeaturesList">
          ${preferredMode === "study" ? `
            <li><span class="chk-icon">✓</span> <span>Biết kết quả đúng/sai ngay lập tức khi bấm chọn</span></li>
            <li><span class="chk-icon">✓</span> <span>Kèm slide bài giảng gốc đối chiếu trực quan</span></li>
            <li><span class="chk-icon">✓</span> <span>Xem giải thích chi tiết có sẵn không cần chờ</span></li>
            <li><span class="chk-icon">✓</span> <span>Không giới hạn thời gian, tự do lướt qua lại các câu</span></li>
          ` : `
            <li><span class="chk-icon">⏱️</span> <span>Đồng hồ đếm ngược chính xác theo thời gian thực</span></li>
            <li><span class="chk-icon">🔒</span> <span>Tự động thu bài và khóa đáp án khi hết giờ</span></li>
            <li><span class="chk-icon">📊</span> <span>Bảng tổng kết điểm số, tỷ lệ đúng/sai và phân tích</span></li>
            <li><span class="chk-icon">💾</span> <span>Lưu kết quả vào Lịch sử để xem lại bất cứ lúc nào</span></li>
          `}
        </ul>
      </div>

      <!-- Tip card -->
      <div class="preview-tip-card">
        <div class="tip-icon">💡</div>
        <div class="tip-body">
          <strong class="tip-title">Mẹo học tập hiệu quả</strong>
          <p id="previewTipText">${preferredMode === "study" ? "Nên ôn theo từng nhóm 20 câu để nắm vững kiến thức từ slide trước khi thử sức thi thử tính giờ." : "Phân bổ thời gian hợp lý: hãy đánh dấu cờ các câu khó để quay lại sau và không bỏ sót câu nào."}</p>
        </div>
      </div>
    </div>
  </div>
</div>`;


  const updateDashboard = () => {
    const questions = pool();
    const count = Math.min(Number($("count").value) || 1, questions.length || 1);
    const mins = Number($("minutes")?.value) || 20;

    if ($("countDisplayVal")) $("countDisplayVal").textContent = count;
    if ($("previewQuestionsCount")) $("previewQuestionsCount").textContent = count;
    if ($("previewPoolCount")) $("previewPoolCount").textContent = questions.length;
    if ($("availableQuestionsCount")) $("availableQuestionsCount").textContent = `${questions.length} câu sẵn sàng`;

    if ($("previewEstimatedTime")) {
      $("previewEstimatedTime").textContent = preferredMode === "study" ? `~${Math.ceil(count * 1)} phút` : `${mins} phút`;
    }
    if ($("minutesDisplayVal")) $("minutesDisplayVal").textContent = mins;

    const sourceEl = $("practiceSource");
    const selectedOpt = sourceEl && sourceEl.selectedIndex >= 0 ? sourceEl.options[sourceEl.selectedIndex] : null;
    if ($("previewSubjectName")) $("previewSubjectName").textContent = (sourceEl?.value && selectedOpt) ? selectedOpt.text.replace(/\s*\(\d+\s*câu\)$/, "") : "Tất cả môn học";
    if ($("previewSubjectDesc")) {
      $("previewSubjectDesc").textContent = (sourceEl?.value && selectedOpt) ? `Kho câu hỏi dành riêng cho môn ${selectedOpt.text}.` : "Sử dụng kho câu hỏi tổng hợp từ các slide đã nhập.";
    }

    if ($("previewFeaturesTitle")) $("previewFeaturesTitle").textContent = preferredMode === "study" ? "Đặc quyền chế độ Ôn luyện" : "Quy chế phòng Thi thử";
    if ($("previewFeaturesList")) {
      $("previewFeaturesList").innerHTML = preferredMode === "study" ? `
        <li><span class="chk-icon">✓</span> <span>Biết kết quả đúng/sai ngay lập tức khi bấm chọn</span></li>
        <li><span class="chk-icon">✓</span> <span>Kèm slide bài giảng gốc đối chiếu trực quan</span></li>
        <li><span class="chk-icon">✓</span> <span>Xem giải thích chi tiết có sẵn không cần chờ</span></li>
        <li><span class="chk-icon">✓</span> <span>Không giới hạn thời gian, tự do lướt qua lại các câu</span></li>
      ` : `
        <li><span class="chk-icon">⏱️</span> <span>Đồng hồ đếm ngược chính xác theo thời gian thực</span></li>
        <li><span class="chk-icon">🔒</span> <span>Tự động thu bài và khóa đáp án khi hết giờ</span></li>
        <li><span class="chk-icon">📊</span> <span>Bảng tổng kết điểm số, tỷ lệ đúng/sai và phân tích</span></li>
        <li><span class="chk-icon">💾</span> <span>Lưu kết quả vào Lịch sử để xem lại bất cứ lúc nào</span></li>
      `;
    }
    if ($("previewTipText")) {
      $("previewTipText").textContent = preferredMode === "study" ? "Nên ôn theo từng nhóm 20 câu để nắm vững kiến thức từ slide trước khi thử sức thi thử tính giờ." : "Phân bổ thời gian hợp lý: hãy đánh dấu cờ các câu khó để quay lại sau và không bỏ sót câu nào.";
    }
  };

  // Slider & Number input sync
  $("selectionStrategy").onchange=()=>{selectionStrategy=$("selectionStrategy").value;write('sot-selection-strategy',selectionStrategy);renderPractice()};
  $("resetSelection").onclick=async()=>{if(await askConfirm('Bắt đầu vòng mới cho môn / nguồn đang chọn? Các môn khác giữ nguyên tiến độ.',{title:'Ôn vòng tiếp theo',okText:'Bắt đầu vòng mới'})){try{studySelection.reset(allPool());renderPractice()}catch{message('Không lưu được tiến độ. Hãy kiểm tra dung lượng trình duyệt.')}}};
  $("countSlider").oninput = (e) => {
    $("count").value = e.target.value;
    updateDashboard();
  };
  $("count").oninput = (e) => {
    const questions = pool();
    const val = Math.min(Math.max(1, Number(e.target.value) || 1), questions.length || 1);
    $("countSlider").value = val;
    updateDashboard();
  };
  if ($("minutesSlider")) {
    $("minutesSlider").oninput = (e) => {
      $("minutes").value = e.target.value;
      updateDashboard();
    };
  }
  if ($("minutes")) {
    $("minutes").oninput = (e) => {
      if ($("minutesSlider")) $("minutesSlider").value = e.target.value;
      updateDashboard();
    };
  }

  // Count Preset Pills
  $("practice").querySelectorAll(".count-presets-v2 .preset-pill-v2").forEach(btn => {
    btn.onclick = () => {
      const poolCount = pool().length;
      const val = btn.dataset.preset === "max" ? poolCount : Math.min(Number(btn.dataset.preset), poolCount);
      const safeVal = Math.max(1, val || 1);
      $("count").value = safeVal;
      $("countSlider").value = safeVal;
      updateDashboard();
    };
  });

  // Time Preset Pills
  $("practice").querySelectorAll(".time-presets-v2 .time-pill").forEach(btn => {
    btn.onclick = () => {
      const val = Number(btn.dataset.minutes) || 20;
      if ($("minutes")) $("minutes").value = val;
      if ($("minutesSlider")) $("minutesSlider").value = val;
      updateDashboard();
    };
  });

  const backBtn = $("backToSharedBtn");
  if (backBtn) {
    backBtn.onclick = () => switchView("shared");
  }

  // Subject change
  $("practiceSource").onchange = () => {
    currentSubject = $("practiceSource").value;
    preferredSubject = currentSubject;
    write("sot-practice-subject", preferredSubject);
    const count = pool().length;
    $("selectionSummary").textContent = selectionSummary();
    $("resetSelection").hidden = !!studySelection.remaining(allPool()).length;
    $("count").max = count || 1;
    $("countSlider").max = count || 1;
    const currentVal = Number($("count").value);
    const newVal = Math.min(currentVal || 20, count) || 1;
    $("count").value = newVal;
    $("countSlider").value = newVal;
    $("start").disabled = !count;
    const maxPill = $("practice").querySelector('[data-preset="max"]');
    if (maxPill) maxPill.textContent = `Tất cả (${count})`;
    updateDashboard();
  };

  // Mode radio change
  document.querySelectorAll("[name=mode]").forEach(input => {
    input.onchange = () => {
      preferredMode = input.value;
      document.querySelectorAll(".mode-segment").forEach(seg => {
        const inp = seg.querySelector("input[name=mode]");
        if (inp.checked) seg.classList.add("active");
        else seg.classList.remove("active");
      });
      $("timeSetting").hidden = preferredMode === "study";
      const startBtn = $("start");
      const btnText = startBtn.querySelector(".btn-text");
      if (btnText) btnText.textContent = preferredMode === "study" ? "Bắt đầu ôn luyện" : "Bắt đầu thi thử";
      updateDashboard();
    };
  });

  $("start").onclick = () => {
    const questions = pool(),
      count = Number($("count").value),
      mins = Number($("minutes").value);
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > questions.length ||
      (preferredMode === "exam" &&
        (!Number.isInteger(mins) || mins < 1 || mins > 180))
    )
      return message("Kiểm tra lại số câu và thời gian.");
    session = {
      mode: preferredMode,
      questions: studySelection.select(questions,count,selectionStrategy)
        .map((q) => ({ ...q, options: [...q.options] })),
      answers: {},
      flags: [],
      current: 0,
      started: Date.now(),
      deadline: preferredMode === "exam" ? Date.now() + mins * 60000 : null,
      done: false,
    };
    let undo;
    try{undo=studySelection.commit(session.questions)}catch{session=null;return message("Không lưu được tiến độ bốc câu. Hãy kiểm tra dung lượng trình duyệt.")}
    if(!write("sot-session", session)){try{undo()}catch{}session=null;return}
    message("");
    renderQuiz();
    startSessionPreload(session.questions);
  };
  updateDashboard();
}
function noteExplanation(q) {
  return q.explanation
    ? `<div class="note-explanation"><b>${q.answerSource === "gemini" || q.explanationSource === "gemini" ? "Giải thích AI · cần kiểm tra" : "Giải thích từ ghi chú"}</b><p>${esc(q.explanation)}</p></div>`
    : "";
}
async function loadQuizSlideImage(q) {
  const container = document.querySelector(
    '.slide-media-container[data-slide-q="' + CSS.escape(q.id) + '"]',
  );
  await showQuestionImage(container, q);
}
function navItemClass(session, item, index, study) {
  const isCurrent = session.current === index,
    isFlagged = session.flags.includes(item.id),
    ans = session.answers[item.id],
    isAnswered = !!ans;
  const classes = [];
  if (isCurrent) classes.push("current");
  if (study) {
    if (isAnswered) {
      classes.push(isCorrect(item, ans) ? "status-correct" : "status-wrong");
      if (isFlagged) classes.push("flagged-answered");
    } else if (isFlagged) {
      classes.push("status-flagged");
    }
  } else {
    if (isAnswered) {
      classes.push("status-answered");
      if (isFlagged) classes.push("flagged-answered");
    } else if (isFlagged) {
      classes.push("status-flagged");
    }
  }
  return classes.join(" ");
}
let autoAdvance=read('sot-auto-advance',true),prefetchEnabled=read('sot-explanation-prefetch',true),readingExplanation=null;
const generatedExplanationKeys=new Set(),localExplanationHits=new Set();
const explanationQueue=createExplanationQueue({storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},load:async(q,{signal})=>{
 if(!AI_API_BASE)throw Error('Giải thích AI đang được chuẩn bị. Hãy thử lại sau.');
 let token=null;try{token=resources.apiToken()}catch{token=null;}
 const started=performance.now();generatedExplanationKeys.add(explanationKey(q));
 const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(95000)]),submitted=structuredClone(q);
 try{
  if(q.url||q.sharedDeck){const blob=await questionBlob(q,{signal:requestSignal});if(blob.size>2100000)throw Error('Ảnh slide quá lớn để gửi AI.');submitted.image={mimeType:blob.type,data:await blobToBase64(blob)}}
  const result=await solveBatch(AI_API_BASE,[submitted],token,{signal:requestSignal,purpose:'explanation'});
  telemetry.record('ai_ms',performance.now()-started);telemetry.record(result.answers[0].reused?'shared_hit':'shared_miss');
  return normalizeExplanation(q,result.answers[0]);
 }catch(error){if(error.name!=='AbortError')telemetry.record('ai_error');if(error.name==='TimeoutError')throw Error('AI phản hồi chậm. Bạn có thể tiếp tục làm bài hoặc bấm Thử lại.');throw error}
},onChange:(question,state)=>{
 if(state.status==='ready'){
  const key=explanationKey(question),apply=q=>{if(explanationKey(q)!==key)return false;if(hasSpeakerNoteExplanation(q))return false;const details={...state.details,key};if(q.explanation===state.details.reason&&q.explanationSource==='gemini'&&JSON.stringify(q.explanationDetails)===JSON.stringify(details))return false;q.explanation=state.details.reason;q.explanationSource='gemini';q.explanationDetails=details;return true};
  let bankChanged=false;for(const q of bank)bankChanged=apply(q)||bankChanged;if(bankChanged)write('sot-bank',bank);
  let sessionChanged=false;for(const q of session?.questions||[])sessionChanged=apply(q)||sessionChanged;if(sessionChanged)write('sot-session',session);
 }
 if(view==='practice'&&session&&!session.done&&session.mode==='study'&&explanationKey(session.questions[session.current])===explanationKey(question)){
  refreshQuizState();if(state.status==='ready')scheduleStudyAdvance();
 }
}});
function invalidateSharedExplanation(question){const key=explanationKey(question);explanationQueue.invalidate(question);for(const q of [...bank,...(session?.questions||[])])if(explanationKey(q)===key){delete q.explanationDetails;if(q.explanationSource==='gemini'){q.explanation='';delete q.explanationSource}}write('sot-bank',bank);if(session)write('sot-session',session);if(view==='practice'&&session?.mode==='study')refreshQuizState()}
function readExplanation(){clearTimeout(window._autoAdvanceTimer);if(session)readingExplanation=explanationKey(session.questions[session.current])}
function feedbackState(q){if(hasSpeakerNoteExplanation(q))return {status:'note'};const cached=explanationQueue.state(q);if(cached.status==='ready'){quality?.checkFresh(q,cached.details,invalidateSharedExplanation);const key=explanationKey(q);if(!generatedExplanationKeys.has(key)&&!localExplanationHits.has(key)){localExplanationHits.add(key);telemetry.record('local_hit')}return cached;}if(cached.status==='idle'){explanationQueue.request(q,{priority:true});return {status:'queued'};}return cached;}
function drawStudyFeedback(){
 if(!session||session.done||view!=='practice')return;
 const q=session.questions[session.current];
 const _fb=renderQuizFeedback({root:$('practice'),session,question:q,isCorrect,state:feedbackState(q),onRead:readExplanation,onRetry:question=>explanationQueue.request(question,{retry:true,priority:true})});if(_fb&&session.answers[q.id])renderAiTutor(_fb,q,()=>typeof token!=='undefined'?token:null);
}
function setExplanationPrefetch(value){prefetchEnabled=value;write('sot-explanation-prefetch',value);for(const input of document.querySelectorAll('.study-prefetch-toggle input'))input.checked=value;if(!value)explanationQueue.cancel();primeStudyExplanations()}
function primeStudyExplanations(){if(!session||session.done||session.mode!=='study'||view!=='practice')return;const q=session.questions[session.current];const targets=prefetchEnabled?upcomingExplanationQuestions(session,3):session.answers[q.id]?[q]:[];const needed=targets.filter(q=>!hasSpeakerNoteExplanation(q));explanationQueue.retain(needed);for(const question of needed)explanationQueue.request(question,{priority:question.id===q.id&&!!session.answers[q.id]});}

function refreshQuizState(){
 if(!session||session.done||view!=='practice')return;
 const root=$('practice'),q=session.questions[session.current],study=session.mode==='study',answer=session.answers[q.id];
 if(root.dataset.questionId!==q.id)return;
 for(const button of root.querySelectorAll('.choice-pill[data-o]')){button.className='choice-pill '+optionState(session,q,button.dataset.o);button.setAttribute('aria-pressed',String((answer||session.drafts?.[q.id]||'').includes(button.dataset.o)));button.disabled=study&&!!answer}
 let check=$('checkMultiple');
 if(study&&q.answer.length>1&&!answer){if(!check){check=document.createElement('button');check.id='checkMultiple';check.className='multi-check';check.textContent='Kiểm tra đáp án (Enter)';root.querySelector('.quiz-answer-row').after(check)}check.disabled=!session.drafts?.[q.id]}
 else check?.remove();
 for(const button of root.querySelectorAll('.quiz-navigation [data-index]')){const index=Number(button.dataset.index),question=session.questions[index];button.className=navItemClass(session,question,index,study);if(index===session.current)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current')}
 const count=Object.keys(session.answers).length,pct=Math.round(count/session.questions.length*100),track=root.querySelector('.quiz-progress-track');track.title='Tiến độ: '+count+'/'+session.questions.length+' ('+pct+'%)';track.firstElementChild.style.width=pct+'%';
 drawStudyFeedback();updateTimer();
}
function scheduleStudyAdvance(){
 clearTimeout(window._autoAdvanceTimer);
 const active=session,current=active?.current,q=active?.questions[current];
 if(!autoAdvance||!active||active.done||active.mode!=='study'||!active.answers[q.id]||nextUnanswered(active)<0||readingExplanation===explanationKey(q))return;
 if(['queued','loading','error'].includes(feedbackState(q).status))return;
 window._autoAdvanceTimer=setTimeout(()=>{
  if(session!==active||session.done||view!=='practice'||session.current!==current||!autoAdvance||document.querySelector('dialog[open]')||readingExplanation===explanationKey(q))return;
  const next=nextUnanswered(session);if(next<0)return;session.current=next;write('sot-session',session);renderQuiz();
 },5000);
}
function renderQuiz() {
  disposeSlideFitting($('practice'));
  accountHome.append(quizAccountControl);
  readingExplanation=null;
  const study = session.mode === "study",
    qs = session.questions;
  session.current = Math.max(0, Math.min(session.current || 0, qs.length - 1));
  const q = qs[session.current],
    answered = session.answers[q.id],
    multiple = q.answer.length > 1;
  const answeredCount = Object.keys(session.answers).length;
  const pct = Math.round((answeredCount / qs.length) * 100);
  const legendContent = study
    ? `<span><i class="legend-box correct"></i> Đúng</span><span><i class="legend-box wrong"></i> Sai</span><span><i class="legend-box flagged"></i> Xem lại</span>`
    : `<span><i class="legend-box answered"></i> Đã làm</span><span><i class="legend-box flagged"></i> Xem lại</span>`;
  document.body.classList.toggle("exam-active", !study);
  pageHeading.hidden = true;
  const slide = Number.isInteger(q.slide) && q.slide > 0 ? q.slide : null;
  const link = presentationIdFromLink(q.url) ? q.url : null;
  const zoomBtn =
    q.extraction === "ocr" || q.url || q.sharedDeck
      ? `<button type="button" class="secondary source-image-check" data-preview-slide="${esc(q.id)}" title="Phóng to ảnh gốc (Z)">Phóng to ảnh gốc 🔍</button>`
      : "";
  $("practice").innerHTML =
    `<div class="quiz-head"><div><span class="overline">${study ? "ÔN LUYỆN" : "THI THỬ"} · ${qs.length} CÂU HỎI</span><h2>${study ? "Ôn luyện" : "Thi thử"}</h2><small id="progress"></small></div><div class="quiz-clock" ${study ? 'hidden style="display:none !important;"' : ""}><small>${study ? "Thời gian đã học" : "Thời gian còn lại"}</small><div class="timer" id="timer"></div></div><div class="quiz-head-actions"><button type="button" class="secondary quiz-toggle-map-btn" id="toggleMapBtn" title="Ẩn/Hiện danh sách câu hỏi">▤ Danh sách câu</button><button id="submit">${study ? "Kết thúc" : "Nộp bài"} ↗</button></div></div><div class="quiz-layout"><div><article class="card quiz-question"><div class="quiz-progress-track" title="Tiến độ: ${answeredCount}/${qs.length} (${pct}%)"><div class="quiz-progress-bar" style="width:${pct}%"></div><span class="quiz-progress-pct" style="opacity:${pct>5?1:0}">${pct}%</span></div><div class="question-top"><div class="question-top-left"><button type="button" class="secondary nav-btn" data-index="${session.current - 1}" ${!session.current ? "disabled" : ""}>← Trước</button><span class="question-counter">CÂU ${session.current + 1} / ${qs.length}</span>${slide ? `<span class="slide-num-tag">Slide ${slide}</span>` : ""}${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" class="slide-open-link" title="Mở slide trong tab mới">Mở slide ↗</a>` : ""}${aiBadge(q)}</div><div class="question-top-right">${zoomBtn}<label class="check-label"><input type="checkbox" id="flagCurrent" ${session.flags.includes(q.id) ? "checked" : ""}> Đánh dấu xem lại</label></div></div>${multiple ? '<p class="multi-hint">Chọn tất cả đáp án đúng.' + (study ? " Bấm Kiểm tra sau khi chọn xong." : " Có thể thay đổi lựa chọn trước khi nộp bài.") + "</p>" : ""}<div class="slide-media-container" data-slide-q="${esc(q.id)}"></div><div class="question-title ${q.url || q.sharedDeck ? "collapsed-text" : ""}">${esc(displayContent(q))}</div><div class="quiz-answer-row"><div class="choice-pills">${q.options.map((o, i) => `<button class="choice-pill ${optionState(session, q, o.id)}" data-q="${esc(q.id)}" data-o="${o.id}" aria-pressed="${(answered || session.drafts?.[q.id] || "").includes(o.id)}" ${study && answered ? "disabled" : ""}>${esc(o.id)}</button>`).join("")}</div><button type="button" class="nav-btn next-btn quiz-answer-next" data-index="${session.current + 1}" ${session.current === qs.length - 1 ? "disabled" : ""} aria-label="Câu tiếp theo"><span class="next-label-full">Câu tiếp theo →</span><span class="next-label-short">Tiếp →</span></button></div>${study && multiple && !answered ? `<button id="checkMultiple" class="multi-check" ${!session.drafts?.[q.id] ? "disabled" : ""}>Kiểm tra đáp án (Enter)</button>` : ""}${study && answered ? `<div class="feedback ${isCorrect(q, answered) ? "right" : "incorrect"}" role="status">${isCorrect(q, answered) ? "✓ Chính xác. Bạn đã nắm được câu này!" : "✕ Chưa đúng. Cùng ghi nhớ đáp án nhé."}<br>Đáp án đúng: <strong>${esc(q.answer)}</strong>${noteExplanation(q)}</div>` : ""}</article></div><aside class="card"><h3>Danh sách câu hỏi</h3><p>${study ? "Câu một đáp án chấm ngay; câu nhiều đáp án chấm khi bấm Kiểm tra." : "Bạn có thể quay lại và thay đổi đáp án."}</p><div class="quiz-navigation">${qs.map((item, i) => `<button data-index="${i}" class="${navItemClass(session, item, i, study)}" aria-label="Đến câu ${i + 1}" ${session.current === i ? 'aria-current="step"' : ""}>${i + 1}</button>`).join("")}</div><div class="quiz-legend-custom">${legendContent}</div></aside></div>`;
  $('practice').dataset.questionId=q.id;
  fitQuizScreen({
    root: $("practice"),
    session,
    question: q,
    isCorrect,
    navItemClass,
    sound: quizSound,
    autoAdvance,
    prefetchEnabled,onPrefetchChange:setExplanationPrefetch,
    onAutoAdvance: (value) => {
      autoAdvance = value;
      write("sot-auto-advance", value);
      if (value) scheduleStudyAdvance();
      else clearTimeout(window._autoAdvanceTimer);
    },
  });
  drawStudyFeedback();
  primeStudyExplanations();
  versionUpdates.mount($('practice').querySelector('.quiz-head-actions'),{compact:true});
  // Fade-slide transition
  const _fadeCard=$('practice').querySelector('.quiz-question');
  if(_fadeCard){_fadeCard.classList.remove('quiz-question-fade');void _fadeCard.offsetWidth;_fadeCard.classList.add('quiz-question-fade');}
  if(study)$('practice').querySelector('.quiz-head-actions').append(quizAccountControl);
  $("flagCurrent").onchange = (e) => {
    session.flags = e.target.checked
      ? [...new Set([...session.flags, q.id])]
      : session.flags.filter((id) => id !== q.id);
    write("sot-session", session);
    refreshQuizState();
  };
  $("submit").onclick = async () => {
    if (
      await askConfirm(
        `${study ? "Kết thúc buổi học" : "Nộp bài thi"}? Bạn đã trả lời ${Object.keys(session.answers).length}/${qs.length} câu.`,
        { title: study ? "Kết thúc buổi học" : "Nộp bài thi", okText: study ? "Kết thúc" : "Nộp bài" }
      )
    )
      finish();
  };
  updateTimer();
  setTimeout(() => {
    loadQuizSlideImage(q);
    preloadSlideImage(qs[session.current + 1]);
    preloadSlideImage(qs[session.current + 2]);
    preloadSlideImage(qs[session.current + 3]);
    if (session.current > 0) preloadSlideImage(qs[session.current - 1]);
  }, 0);
}
$('practice').onclick = (e) => {
 if(e.target.closest('#checkMultiple')&&session&&!session.done){const q=session.questions[session.current];if(confirmQuestion(session,q.id)){quizSound.play(isCorrect(q,session.answers[q.id]));write('sot-session',session);refreshQuizState();primeStudyExplanations();scheduleStudyAdvance()}return}

  const toggleBtn = e.target.closest("[data-toggle-text]");
  if (toggleBtn) {
    const t = toggleBtn
      .closest(".quiz-question")
      ?.querySelector(".question-title");
    if (t) t.classList.toggle("collapsed-text");
    return;
  }
  const indexButton = e.target.closest("[data-index]");
  if (indexButton && session && !session.done) {
    if (session.mode !== "study" && Date.now() >= session.deadline)
      return finish();
    clearTimeout(window._autoAdvanceTimer);
    session.current = Number(indexButton.dataset.index);
    write("sot-session", session);
    renderQuiz();
    return;
  }
  const answer = e.target.closest("[data-q]");
  if (answer && session && !session.done) {
    clearTimeout(window._autoAdvanceTimer);
    if (answerQuestion(session, answer.dataset.q, answer.dataset.o)) {
      const currentQ = session.questions.find((q) => q.id === answer.dataset.q);
      const correct = isCorrect(currentQ, session.answers[answer.dataset.q]);
      if (session.mode === "study" && session.answers[answer.dataset.q])
        quizSound.play(correct);
      write("sot-session", session);
      refreshQuizState();
      primeStudyExplanations();
      if (session.mode === "study" && session.answers[currentQ.id])
        scheduleStudyAdvance();
    } else updateTimer();
  }
};
window.addEventListener("keydown", (e) => {
  if (
    !session ||
    session.done ||
    !document.body.classList.contains("quiz-active")
  )
    return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
  if (document.querySelector("dialog[open]")) {
    if (e.key === "Escape" || e.key === "z" || e.key === "Z") {
      document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      e.preventDefault();
    }
    return;
  }
  const key = e.key.toUpperCase();
  if (e.key === "ArrowLeft") {
    if (session.current > 0) {
      e.preventDefault();
      clearTimeout(window._autoAdvanceTimer);
      session.current--;
      write("sot-session", session);
      renderQuiz();
    }
    return;
  }
  if (e.key === "ArrowRight") {
    if (session.current < session.questions.length - 1) {
      e.preventDefault();
      clearTimeout(window._autoAdvanceTimer);
      session.current++;
      write("sot-session", session);
      renderQuiz();
    }
    return;
  }
  if (key === "F") {
    e.preventDefault();
    const flagEl = $("flagCurrent");
    if (flagEl) {
      flagEl.checked = !flagEl.checked;
      flagEl.dispatchEvent(new Event("change"));
    }
    return;
  }
  if (key === "E") {
    const expBtn = document.querySelector(".feedback-inline-exp");
    if (expBtn) {
      e.preventDefault();
      expBtn.focus();
    }
    return;
  }
  if (key === "Z") {
    const zoomBtn = document.querySelector(".source-image-check");
    if (zoomBtn) {
      e.preventDefault();
      zoomBtn.click();
    }
    return;
  }
  if (e.key === "Enter") {
    const checkBtn = $("checkMultiple");
    if (checkBtn && !checkBtn.disabled) {
      e.preventDefault();
      checkBtn.click();
      return;
    }
    const q = session.questions[session.current];
    if (
      session.answers[q.id] &&
      session.current < session.questions.length - 1
    ) {
      e.preventDefault();
      clearTimeout(window._autoAdvanceTimer);
      session.current++;
      write("sot-session", session);
      renderQuiz();
      return;
    }
  }
  const q = session.questions[session.current];
  const option = q.options.find((o) => o.id.toUpperCase() === key);
  if (option) {
    e.preventDefault();
    const btn = document.querySelector(`.choice-pill[data-o="${option.id}"]`);
    if (btn && !btn.disabled) btn.click();
  }
});
let touchStartX = 0,
  touchStartY = 0;
window.addEventListener(
  "touchstart",
  (e) => {
    if (
      !session ||
      session.done ||
      !document.body.classList.contains("quiz-active")
    )
      return;
    const touch = e.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  },
  { passive: true },
);
window.addEventListener(
  "touchend",
  (e) => {
    if (
      !session ||
      session.done ||
      !document.body.classList.contains("quiz-active")
    )
      return;
    if (document.querySelector("dialog[open]")) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (Math.abs(dx) > 55 && Math.abs(dy) < 45) {
      if (dx < 0 && session.current < session.questions.length - 1) {
        clearTimeout(window._autoAdvanceTimer);
        session.current++;
        write("sot-session", session);
        quizSound.nav();
        renderQuiz();
      } else if (dx > 0 && session.current > 0) {
        clearTimeout(window._autoAdvanceTimer);
        session.current--;
        write("sot-session", session);
        quizSound.nav();
        renderQuiz();
      }
    }
  },
  { passive: true },
);
function updateTimer() {
  if (!session || session.done) return;
  const study = session.mode === "study",
    seconds = study
      ? Math.max(0, Math.floor((Date.now() - session.started) / 1000))
      : Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000));
  if ($("timer") && !study)
    $("timer").textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  if ($("progress"))
    $("progress").textContent =
      `${Object.keys(session.answers).length}/${session.questions.length} câu đã trả lời${study ? " · Đúng " + grade(session.questions, session.answers) + " câu" : ""}`;
  if (!study && !seconds) finish();
}
function finish() {
  if (!session || session.done) return;
  explanationQueue.cancel();
  session.done = true;
  lastResult = {
    ...session,
    id: crypto.randomUUID(),
    finished: Date.now(),
    correct: grade(session.questions, session.answers),
  };
  history.unshift(lastResult);
  history = history.slice(0, 50);
  write("sot-history", history);
  write("sot-session", null);
  session = null;
  resultFilter = "all";
  quizSound.celebrate();
  switchView("result");
  message("Đã lưu kết quả buổi học trên thiết bị này.");
}
function renderResult(r) {
  const total = r.questions.length,
    wrong = r.questions.filter(
      (q) => r.answers[q.id] && !isCorrect(q, r.answers[q.id]),
    ).length,
    unanswered = r.questions.filter((q) => !r.answers[q.id]).length;
  const elapsed = Math.max(
    0,
    Math.ceil(
      ((r.mode === "study" ? r.finished : Math.min(r.finished, r.deadline)) -
        r.started) /
        60000,
    ),
  );
  const visible = r.questions.filter(
    (q) =>
      resultFilter === "all" ||
      (resultFilter === "wrong"
        ? !isCorrect(q, r.answers[q.id])
        : !r.answers[q.id]),
  );
  $("result").innerHTML =
    `<div class="card result-overview"><div class="score-ring" style="--score:${(r.correct / total) * 100}%"><div><strong class="score-number">${((r.correct / total) * 10).toFixed(1)}</strong><small>TRÊN 10 ĐIỂM</small></div></div><div class="result-details"><span class="overline">${r.mode === "study" ? "ÔN LUYỆN" : "THI THỬ"} · ĐÃ HOÀN THÀNH</span><h2>${r.correct}/${total} câu trả lời đúng</h2><p>${elapsed} phút học tập · ${new Date(r.finished).toLocaleString("vi-VN")}</p><div class="result-breakdown"><div class="correct-stat">Trả lời đúng<strong>${r.correct}</strong></div><div class="wrong-stat">Trả lời sai<strong>${wrong}</strong></div><div>Chưa trả lời<strong>${unanswered}</strong></div></div><div class="row"><button id="again">Tạo đề mới →</button><button id="retry" class="secondary" ${r.correct === total ? "disabled" : ""}>Luyện lại câu sai</button><button data-view="history" class="text-button">Xem lịch sử ↗</button><button id="deleteSingleResult" class="text-button danger" style="margin-left:auto">Xóa bài này</button></div></div></div><div class="section-heading"><div><span class="overline">HIỂU LẠI TỪNG CÂU</span><h2>Xem lại bài làm</h2></div></div><div class="result-filters">${[
      ["all", "Tất cả (" + total + ")"],
      ["wrong", "Cần ôn lại (" + (wrong + unanswered) + ")"],
      ["unanswered", "Chưa trả lời (" + unanswered + ")"],
    ]
      .map(
        ([id, label]) =>
          `<button class="secondary ${resultFilter === id ? "active" : ""}" data-result-filter="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div>${visible.length ? visible.map((q) => `<article class="card question-card"><div class="question-top"><span>CÂU ${r.questions.indexOf(q) + 1}</span><span class="tag ${isCorrect(q, r.answers[q.id]) ? "ok" : ""}">${isCorrect(q, r.answers[q.id]) ? "✓ Đúng" : r.answers[q.id] ? "Sai" : "Chưa trả lời"}</span></div>${sourceReference(q)}${aiBadge(q)}<div class="library-slide-media" data-lib-slide="${esc(q.id)}"></div><div class="question-title ${q.url || q.sharedDeck ? "collapsed-text" : ""}">${esc(displayContent(q))}</div><div class="choice-pills choice-pills-result">${q.options.map((o, i) => `<div class="choice-pill ${q.answer.includes(o.id) ? "correct" : (r.answers[q.id] || "").includes(o.id) ? "wrong" : ""}">${esc(o.id)}</div>`).join("")}</div><div class="result-answer-row"><span>Đáp án đúng: <strong class="badge-answer ok">${esc(q.answer)}</strong></span><span>Bạn chọn: <strong class="badge-answer ${isCorrect(q, r.answers[q.id]) ? "ok" : r.answers[q.id] ? "danger" : "muted"}">${esc(r.answers[q.id] || "Chưa trả lời")}</strong></span></div>${noteExplanation(q)}<button class="secondary" data-report-question="${esc(q.id)}">Báo lỗi câu hỏi</button></article>`).join("") : empty("Không có câu hỏi trong nhóm này", "Thử chọn Tất cả để xem toàn bộ bài làm.", "history", "Về lịch sử →")}`;
  setTimeout(() => loadLibrarySlideImages(visible), 0);
  $("again").onclick = () => {
    lastResult = null;
    switchView("practice");
  };
  const delSingleBtn = $("deleteSingleResult");
  if (delSingleBtn) {
    delSingleBtn.onclick = async () => {
      if (await askConfirm(`Xóa kết quả bài làm này khỏi lịch sử?`, { title: "Xóa kết quả", danger: true, okText: "Xóa" })) {
        history = history.filter((item) => item.id !== r.id);
        write("sot-history", history);
        lastResult = null;
        switchView("history");
      }
    };
  }
  $("retry").onclick = () => {
    const qs = r.questions.filter((q) => !isCorrect(q, r.answers[q.id]));
    if (!qs.length) return;
    session = {
      mode: "study",
      questions: shuffle(qs),
      answers: {},
      flags: [],
      current: 0,
      started: Date.now(),
      deadline: null,
      done: false,
    };
    write("sot-session", session);
    switchView("practice");
    startSessionPreload(session.questions);
  };
  document.querySelectorAll("[data-result-filter]").forEach(
    (button) =>
      (button.onclick = () => {
        resultFilter = button.dataset.resultFilter;
        renderResult(r);
      }),
  );
}
function renderHistory() {
  const average = history.length
    ? history.reduce(
        (sum, r) => sum + (r.correct / r.questions.length) * 10,
        0,
      ) / history.length
    : 0;
  $("history").innerHTML =
    `<div class="section-heading"><div><span class="overline">HÀNH TRÌNH CỦA BẠN</span><h2>${history.length} bài đã hoàn thành</h2><p>${history.length ? `Điểm trung bình ${average.toFixed(1)}/10 · Lưu tối đa 50 bài gần nhất trên thiết bị này.` : "Những bài bạn hoàn thành sẽ được lưu tại đây."}</p></div><div class="row history-top-actions">${history.length ? `<button type="button" class="btn-clear-history-all" id="clearAllHistory">🗑️ Xóa toàn bộ lịch sử</button>` : ""}<button class="btn-new-quiz-action" data-view="practice">Luyện một đề mới →</button></div></div>` +
    (history.length
      ? `<div class="history-list">${history.map((r) => {
          const scoreNum = (r.correct / r.questions.length) * 10;
          const scoreStr = scoreNum.toFixed(1);
          const scoreClass = scoreNum >= 8 ? "score-high" : (scoreNum >= 5 ? "score-mid" : "score-low");
          const percent = Math.round((r.correct / r.questions.length) * 100);
          return `<article class="card history-item"><div class="history-score ${scoreClass}"><span class="score-val">${scoreStr}</span><span class="score-scale">/10</span></div><div class="history-info"><div class="history-info-header"><span class="tag ${r.mode === "study" ? "ok" : ""}">${r.mode === "study" ? "ÔN LUYỆN" : "THI THỬ"}</span><span class="history-time-stamp">${new Date(r.finished).toLocaleString("vi-VN")}</span></div><h3 class="history-item-title">Đúng ${r.correct}/${r.questions.length} câu hỏi <span class="history-percent">(${percent}%)</span></h3></div><div class="row history-actions"><button class="btn-review-result" data-result="${esc(r.id)}">Xem bài làm ↗</button><button class="history-delete-btn" data-delete-result="${esc(r.id)}" title="Xóa kết quả này" aria-label="Xóa kết quả này">🗑️</button></div></article>`;
        }).join("")}</div>`
      : empty(
          "Buổi học đầu tiên đang chờ bạn",
          "Hãy bắt đầu với một đề ngắn. Kết quả sẽ giúp bạn biết mình đã vững phần nào.",
          "practice",
          "Bắt đầu luyện tập →",
        ));
}
$("history").onclick = async (e) => {
  const clearBtn = e.target.closest("#clearAllHistory");
  if (clearBtn) {
    if (!history.length) return;
    if (await askConfirm(`Xóa toàn bộ ${history.length} bài đã làm trong lịch sử? Dữ liệu này không thể khôi phục.`, {
      title: "Xóa toàn bộ lịch sử",
      danger: true,
      okText: "Xóa hết"
    })) {
      history = [];
      write("sot-history", history);
      renderHistory();
    }
    return;
  }
  const deleteBtn = e.target.closest("[data-delete-result]");
  if (deleteBtn) {
    const id = deleteBtn.dataset.deleteResult;
    const target = history.find((r) => r.id === id);
    if (!target) return;
    if (await askConfirm(`Xóa kết quả bài làm lúc ${new Date(target.finished).toLocaleTimeString("vi-VN")} ngày ${new Date(target.finished).toLocaleDateString("vi-VN")} (Đúng ${target.correct}/${target.questions.length})?`, {
      title: "Xóa kết quả bài làm",
      danger: true,
      okText: "Xóa"
    })) {
      history = history.filter((r) => r.id !== id);
      write("sot-history", history);
      renderHistory();
    }
    return;
  }
  const id = e.target.closest("[data-result]")?.dataset.result;
  if (!id) return;
  if (session && !session.done)
    return message("Hoàn thành bài đang làm trước khi mở kết quả khác.");
  lastResult = history.find((r) => r.id === id);
  resultFilter = "all";
  switchView("result");
};
for (const [key, value] of [
  ["sot-bank", bank],
  ["sot-history", history],
  ["sot-session", session],
])
  if (originalStorage.get(key) !== JSON.stringify(value)) write(key, value);
libraryManager=setupLibraryManager({base:AI_API_BASE,getBank:()=>bank,getGeneration:()=>libraryGeneration,getToken:()=>resources.apiToken(),getBlob:questionBlob,getDetails:q=>hasSpeakerNoteExplanation(q)?null:explanationQueue.state(q).details,media:libraryMedia,
 setBank:questions=>{if(!write('sot-bank',questions))return false;bank=questions;sourceSummary=sources().map(([,name])=>name).join(' · ');write('sot-source',sourceSummary);refreshStats();if(view==='library')renderLibrary();else if(view==='practice'&&(!session||session.done))renderPractice();return true},
 canChange:()=>{if(aiRunning||resources.isBusy()||session&&!session.done){message('Hoàn thành bài đang làm và đợi nhập tài liệu hoặc AI xong trước khi thay đổi thư viện.','library');return false}return true},
 onPractice:key=>{if(key){preferredSubject=key;write('sot-practice-subject',key)}switchView('practice');if($('practiceSource')&&key){$('practiceSource').value=key;$('practiceSource').dispatchEvent(new Event('change'))}}
});libraryManager.account(libraryProfile);
quality=setupQuality({base:AI_API_BASE,getToken:()=>resources.apiToken(),getQuestion:id=>(view==='result'?lastResult?.questions:view==='practice'?session?.questions:bank)?.find(q=>q.id===id),getDetails:q=>explanationQueue.state(q).details||q.explanationDetails,onRead:readExplanation});quality.setProfile(libraryProfile);
window.addEventListener('focus',()=>{if(view==='practice'&&session?.mode==='study')refreshQuizState()});
const versionUpdates=setupVersionUpdates({beforeUpdate:async()=>{if(resources.isBusy()||shared.isPublishing()||aiRunning||libraryManager?.isBusy()){message('Hãy đợi nhập tài liệu, AI hoặc đăng bộ đề hoàn tất trước khi cập nhật trang.');return false}if(session&&!session.done){if(!write('sot-session',session))return false;return askConfirm('Cập nhật trang? Bài đang làm đã được lưu và sẽ tiếp tục sau khi tải lại.',{title:'Có phiên bản mới',okText:'Cập nhật'})}return true}});
setTimeout(scheduleAutoAi, 0);
setInterval(updateTimer, 1000);
document.addEventListener("visibilitychange", updateTimer);
refreshStats();
switchView(session && !session.done ? "practice" : view);
if (session && !session.done) startSessionPreload(session.questions);
// Theme toggle
const themeToggle = document.getElementById('themeToggle');
function applyThemeMode(mode){
 document.documentElement.setAttribute('data-theme',mode);
 localStorage.setItem('sot-theme',mode);
 const icon=document.getElementById('themeIcon');
 if(icon)icon.textContent=mode==='dark'?'☀️':'🌙';
}
const initialTheme=localStorage.getItem('sot-theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
applyThemeMode(initialTheme);
themeToggle?.addEventListener('click',()=>{
 const current=document.documentElement.getAttribute('data-theme')||'light';
 applyThemeMode(current==='dark'?'light':'dark');
});
// Sound toggle
(function(){
 const btn=document.getElementById('soundToggle');
 if(!btn)return;
 btn.textContent=quizSound.enabled?'🔊':'🔇';
 btn.addEventListener('click',()=>{
  const on=quizSound.toggleSound();
  btn.textContent=on?'🔊':'🔇';
  btn.title=on?'Tắt âm thanh':'Bật âm thanh';
 });
})();


// Mini AI Tutor - Hoi them AI
async function askAiFollowup(question, userQuery, token) {
 const context = [
  question.text || '',
  question.options ? question.options.map(o => o.id + ': ' + (o.text||'')).join('; ') : '',
  'Đáp án đúng: ' + question.answer,
  question.explanation ? 'Giải thích: ' + question.explanation : ''
 ].filter(Boolean).join('\n');
 const prompt = `Câu hỏi: ${context}\n\nHọc viên hỏi: ${userQuery}\n\nHãy trả lời ngắn gọn, dễ hiểu bằng tiếng Việt như một gia sư thân thiện.`;
 const headers = {'Content-Type':'application/json'};
 if(token) headers['Authorization'] = 'Bearer ' + token;
 const base = (typeof AI_API_BASE !== 'undefined') ? AI_API_BASE : '';
 if(!base) return 'Chưa cấu hình AI API.';
 try {
  const resp = await fetch(base + '/followup', {
   method: 'POST',
   headers,
   body: JSON.stringify({prompt, model:'gemini-2.5-flash'})
  });
  if(!resp.ok) throw new Error('API lỗi ' + resp.status);
  const data = await resp.json();
  return data.text || data.answer || data.response || JSON.stringify(data);
 } catch(e) {
  return 'Lỗi kết nối AI: ' + e.message;
 }
}

function renderAiTutor(feedbackEl, question, getToken) {
 if(!feedbackEl) return;
 if(feedbackEl.querySelector('.ai-tutor-widget')) return; // already added
 const widget = document.createElement('div');
 widget.className = 'ai-tutor-widget';
 widget.innerHTML = `<button type="button" class="ai-tutor-toggle-btn">💬 Hỏi thêm AI về câu này</button><div class="ai-tutor-panel" hidden><div class="ai-tutor-chat"></div><div class="ai-tutor-input-row"><input type="text" class="ai-tutor-input" placeholder="Nhập câu hỏi của bạn..." maxlength="200"><button type="button" class="ai-tutor-send">Gửi</button></div></div>`;
 feedbackEl.append(widget);
 const toggleBtn = widget.querySelector('.ai-tutor-toggle-btn');
 const panel = widget.querySelector('.ai-tutor-panel');
 const chat = widget.querySelector('.ai-tutor-chat');
 const input = widget.querySelector('.ai-tutor-input');
 const sendBtn = widget.querySelector('.ai-tutor-send');
 toggleBtn.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  if(!panel.hidden) { input.focus(); quizSound.pop(); }
 });
 async function sendMsg() {
  const q = input.value.trim();
  if(!q) return;
  input.value = '';
  sendBtn.disabled = true;
  const userBubble = document.createElement('div');
  userBubble.className = 'ai-tutor-bubble user';
  userBubble.textContent = q;
  chat.append(userBubble);
  const aiBubble = document.createElement('div');
  aiBubble.className = 'ai-tutor-bubble ai loading';
  aiBubble.textContent = '⏳ Đang hỏi AI…';
  chat.append(aiBubble);
  chat.scrollTop = chat.scrollHeight;
  const token = getToken ? getToken() : null;
  const ans = await askAiFollowup(question, q, token);
  aiBubble.className = 'ai-tutor-bubble ai';
  aiBubble.textContent = ans;
  chat.scrollTop = chat.scrollHeight;
  sendBtn.disabled = false;
  input.focus();
  quizSound.pop();
 }
 sendBtn.addEventListener('click', sendMsg);
 input.addEventListener('keydown', e => { if(e.key === 'Enter') sendMsg(); });
}

window.addEventListener("beforeunload", (e) => {
  if (session && !session.done) {
    e.preventDefault();
    e.returnValue = "";
  }
});
