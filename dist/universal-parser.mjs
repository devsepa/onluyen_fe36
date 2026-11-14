// Universal Document / Image Exam Parser
// Supports: PDF, Images (PNG, JPG, WebP), Word (.docx text), Plain text (.txt)
// Extracts and splits exam questions with options (A, B, C, D) and auto-detects answers

export async function parseExamFile(file, { onProgress = () => {}, aiBase = '' } = {}) {
  const ext = file.name.split('.').pop().toLowerCase();
  
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return await parseImageExam(file, { onProgress, aiBase });
  } else if (ext === 'pdf') {
    return await parsePdfExam(file, { onProgress, aiBase });
  } else if (ext === 'txt') {
    const text = await file.text();
    return await parseTextExam(text, file.name, { onProgress, aiBase });
  } else {
    // Attempt reading as text
    try {
      const text = await file.text();
      return await parseTextExam(text, file.name, { onProgress, aiBase });
    } catch (e) {
      throw new Error(`Định dạng .${ext} chưa được hỗ trợ trực tiếp. Hãy chuyển sang file PDF, ảnh hoặc văn bản.`);
    }
  }
}

// Parse Image exam file
async function parseImageExam(file, { onProgress, aiBase }) {
  onProgress('Đang đọc ảnh đề thi...');
  const base64 = await fileToBase64(file);
  const mimeType = file.type || 'image/jpeg';
  
  // Call backend to OCR and split questions
  onProgress('AI đang phân tích và nhận diện câu hỏi từ ảnh...');
  const res = await fetch(`${aiBase}/v1/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questions: [{
        id: crypto.randomUUID(),
        stem: 'Đọc toàn bộ câu hỏi trắc nghiệm trong ảnh này.',
        options: [{ id: 'A', text: '' }, { id: 'B', text: '' }],
        image: { mimeType, data: base64 },
        explain: true
      }]
    })
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Lỗi AI xử lý ảnh: ${res.status}`);
  }
  
  const data = await res.json();
  const answerObj = data.answers?.[0];
  if (!answerObj) throw new Error('AI không nhận diện được câu hỏi trong ảnh.');
  
  return [{
    id: crypto.randomUUID(),
    stem: answerObj.stem || file.name,
    options: answerObj.optionReasons?.map(o => ({ id: o.id, text: o.text || '' })) || [{ id: 'A', text: '' }, { id: 'B', text: '' }],
    answer: answerObj.answer || '',
    explanation: answerObj.explanation || '',
    verified: !!answerObj.answer,
    sourceName: file.name,
    subject: file.name.replace(/\.[^/.]+$/, "")
  }];
}

// Parse PDF exam file using PDF.js via CDN or text parsing
async function parsePdfExam(file, { onProgress, aiBase }) {
  onProgress('Đang đọc file PDF...');
  
  // Load pdfjs if not loaded
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress(`Đang trích xuất trang ${i} / ${pdf.numPages}...`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += strings.join(' ') + '\n\n';
  }
  
  return await parseTextExam(fullText, file.name, { onProgress, aiBase });
}

// Parse Raw Text & Split into Multiple Choice Questions
export async function parseTextExam(rawText, sourceName, { onProgress = () => {} } = {}) {
  onProgress('Đang phân loại từng câu hỏi và đáp án...');
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\t/g, ' ');
  
  // Regex to split questions (e.g., Câu 1:, Question 1:, 1., 1/, Bài 1:)
  const questionSplits = [...cleaned.matchAll(/(?:^|\n)\s*(?:câu|question|bài|\d+)\s*(\d+)[\s.:/-]+/gi)];
  
  const rawQuestions = [];
  if (questionSplits.length >= 2) {
    for (let i = 0; i < questionSplits.length; i++) {
      const start = questionSplits[i].index;
      const end = questionSplits[i + 1] ? questionSplits[i + 1].index : cleaned.length;
      rawQuestions.push(cleaned.slice(start, end).trim());
    }
  } else {
    // Split by double newlines if no question numbering detected
    const blocks = cleaned.split(/\n\s*\n/).filter(b => b.trim().length > 20);
    rawQuestions.push(...blocks);
  }
  
  const questions = [];
  const subject = sourceName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
  
  for (const block of rawQuestions) {
    const q = parseSingleQuestionBlock(block, sourceName, subject);
    if (q) questions.push(q);
  }
  
  if (!questions.length) {
    throw new Error('Không nhận diện được cấu trúc câu hỏi trắc nghiệm (cần có các đáp án A, B, C, D).');
  }
  
  return questions;
}

function parseSingleQuestionBlock(text, sourceName, subject) {
  // Regex pattern for options: A., B., C., D. or A), B), C), D) or (A), (B), (C), (D)
  const optionMatches = [...text.matchAll(/(?:^|\n|\s)[(［\[]?([A-H])[)］\]:.\-]\s*([^\n\r]+)/gi)];
  
  if (optionMatches.length < 2) return null;
  
  // Find where options start
  const firstOptionIndex = optionMatches[0].index;
  const stem = text.slice(0, firstOptionIndex).replace(/^(?:câu|question|bài)\s*\d+[\s.:/-]+/i, '').trim();
  
  const options = [];
  for (const m of optionMatches) {
    const id = m[1].toUpperCase();
    const optText = m[2].trim();
    if (!options.some(o => o.id === id)) {
      options.push({ id, text: optText });
    }
  }
  
  // Auto-detect answer if provided in text (e.g., Đáp án: A or Answer: B)
  const ansMatch = text.match(/(?:đáp\s*án|answer|chọn|key)\s*[:：\-]?\s*([A-H])/i);
  const answer = ansMatch ? ansMatch[1].toUpperCase() : '';
  
  // Auto-detect explanation if any
  const expMatch = text.match(/(?:giải\s*thích|lời\s*giải|hướng\s*dẫn|explanation)\s*[:：\-]?\s*([^\n]+)/i);
  const explanation = expMatch ? expMatch[1].trim() : '';
  
  return {
    id: crypto.randomUUID(),
    stem: stem || 'Câu hỏi',
    options,
    answer,
    explanation,
    verified: !!answer,
    sourceName,
    subject: subject || 'Tài liệu tải lên'
  };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}
