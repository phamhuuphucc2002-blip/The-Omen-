/* Shared validation for server-bound Arcanum records. */

export function validateKnowledge(input = {}) {
  const title = String(input.title || '').trim();
  const content = String(input.content || '').trim();
  if (!title) throw new Error('Knowledge title is required');
  if (!content) throw new Error('Knowledge content is required');
  if (title.length > 300) throw new Error('Knowledge title is too long');
  return { title, content, source: clean(input.source, 1000), categoryId: clean(input.categoryId, 120) || null };
}

export function validateBook(input = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Book title is required');
  return { title, sourceLanguage: clean(input.sourceLanguage, 40) || 'unknown', targetLanguage: clean(input.targetLanguage, 40) || 'vi' };
}

export function validateTranslation(input = {}) {
  const chapter = String(input.chapter || '').trim();
  const originalText = String(input.originalText || '');
  const translatedText = String(input.translatedText || '');
  if (!chapter) throw new Error('Chapter is required');
  if (!originalText.trim()) throw new Error('Original text is required');
  if (!translatedText.trim()) throw new Error('Translated text is required');
  return { chapter, originalText, translatedText };
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}
