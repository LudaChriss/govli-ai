/**
 * Govli AI FOIA Module - Language Selector
 * AI-10: Frontend language selection and i18n support
 */

// Global i18n state
window.Govli = window.Govli || {};
window.Govli.currentLanguage = localStorage.getItem('govli_language') || 'en';
window.Govli.translations = {};

/**
 * Supported languages
 */
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español (Spanish)' },
  { code: 'zh', name: '中文 (Chinese)' },
  { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
  { code: 'fr', name: 'Français (French)' },
  { code: 'ar', name: 'العربية (Arabic)' },
  { code: 'tl', name: 'Filipino (Tagalog)' },
  { code: 'ko', name: '한국어 (Korean)' },
  { code: 'ru', name: 'Русский (Russian)' },
  { code: 'pt', name: 'Português (Portuguese)' }
];

/**
 * Load translations for a language
 */
async function loadTranslations(languageCode) {
  try {
    const response = await fetch(`/i18n/${languageCode}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load translations for ${languageCode}`);
    }
    const translations = await response.json();
    window.Govli.translations[languageCode] = translations;
    return translations;
  } catch (error) {
    console.error('Error loading translations:', error);
    // Fallback to English if translation fails
    if (languageCode !== 'en') {
      return loadTranslations('en');
    }
    return {};
  }
}

/**
 * Get translated string by key path (e.g., "foia.title")
 */
function t(keyPath, params = {}) {
  const lang = window.Govli.currentLanguage;
  const translations = window.Govli.translations[lang] || {};

  // Navigate nested object using key path
  const keys = keyPath.split('.');
  let value = translations;
  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) break;
  }

  // If translation not found, try English fallback
  if (value === undefined && lang !== 'en') {
    const enTranslations = window.Govli.translations['en'] || {};
    value = keys.reduce((obj, key) => obj?.[key], enTranslations);
  }

  // If still not found, return key path
  if (value === undefined) {
    return keyPath;
  }

  // Replace parameters in string (e.g., {{min}}, {{max}})
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  return value;
}

/**
 * Update all translatable elements on the page
 */
function updatePageTranslations() {
  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = t(key);
  });

  // Update elements with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = t(key);
  });

  // Update elements with data-i18n-title attribute
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.title = t(key);
  });

  // Update HTML lang attribute
  document.documentElement.lang = window.Govli.currentLanguage;

  // Add RTL support for Arabic
  if (window.Govli.currentLanguage === 'ar') {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
}

/**
 * Change language
 */
async function changeLanguage(languageCode) {
  // Validate language code
  if (!SUPPORTED_LANGUAGES.find(l => l.code === languageCode)) {
    console.error(`Unsupported language: ${languageCode}`);
    return;
  }

  // Load translations if not already loaded
  if (!window.Govli.translations[languageCode]) {
    await loadTranslations(languageCode);
  }

  // Update current language
  window.Govli.currentLanguage = languageCode;
  localStorage.setItem('govli_language', languageCode);

  // Update all translations on the page
  updatePageTranslations();

  // Dispatch custom event for other components to react
  window.dispatchEvent(new CustomEvent('languageChanged', {
    detail: { language: languageCode }
  }));
}

/**
 * Create and render language selector dropdown
 */
function createLanguageSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container not found: ${containerId}`);
    return;
  }

  const selector = document.createElement('div');
  selector.className = 'language-selector';
  selector.innerHTML = `
    <label for="languageSelect" class="language-selector-label">
      <span data-i18n="common.select_language">Select Language</span>
    </label>
    <select id="languageSelect" class="language-selector-dropdown">
      ${SUPPORTED_LANGUAGES.map(lang => `
        <option value="${lang.code}" ${lang.code === window.Govli.currentLanguage ? 'selected' : ''}>
          ${lang.name}
        </option>
      `).join('')}
    </select>
  `;

  container.appendChild(selector);

  // Add change event listener
  const dropdown = selector.querySelector('#languageSelect');
  dropdown.addEventListener('change', async (e) => {
    await changeLanguage(e.target.value);
  });

  // Update initial translation
  updatePageTranslations();
}

/**
 * Initialize language selector and load initial translations
 */
async function initializeLanguageSelector() {
  // Load current language translations
  await loadTranslations(window.Govli.currentLanguage);

  // Load English as fallback
  if (window.Govli.currentLanguage !== 'en') {
    await loadTranslations('en');
  }

  // Update page translations
  updatePageTranslations();

  // Look for language selector containers and create selectors
  document.querySelectorAll('.language-selector-container').forEach(container => {
    createLanguageSelector(container.id);
  });
}

/**
 * Translate form data before submission
 */
async function translateFormField(text, sourceLanguage = null) {
  try {
    const response = await fetch('/ai/translate/request-intake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: text,
        source_language: sourceLanguage,
        target_language: 'en'
      })
    });

    if (!response.ok) {
      throw new Error('Translation failed');
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Error translating field:', error);
    return null;
  }
}

/**
 * Add translation button to a form field
 */
function addTranslationButton(fieldId, buttonText = null) {
  const field = document.getElementById(fieldId);
  if (!field) {
    console.error(`Field not found: ${fieldId}`);
    return;
  }

  const container = document.createElement('div');
  container.className = 'translation-button-container';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'translation-button';
  button.innerHTML = buttonText || t('translation.translate_request');
  button.addEventListener('click', async () => {
    const text = field.value;
    if (!text) return;

    button.disabled = true;
    button.innerHTML = t('common.loading');

    const result = await translateFormField(text);

    if (result) {
      // Show translation result
      const resultDiv = document.createElement('div');
      resultDiv.className = 'translation-result';
      resultDiv.innerHTML = `
        <div class="translation-result-header">
          <strong>${t('translation.translated_to')} ${t('language_code')}</strong>
          <span class="translation-confidence">${t('translation.confidence')}: ${(result.confidence * 100).toFixed(0)}%</span>
        </div>
        <div class="translation-result-text">${result.translated_text}</div>
        ${result.needs_professional_review ? `<div class="translation-warning">${t('translation.needs_review')}</div>` : ''}
        ${result.translation_notes ? `<div class="translation-notes">${result.translation_notes}</div>` : ''}
      `;

      container.appendChild(resultDiv);
    }

    button.disabled = false;
    button.innerHTML = buttonText || t('translation.translate_request');
  });

  field.parentNode.insertBefore(container, field.nextSibling);
  container.appendChild(button);
}

// Export functions to global scope
window.Govli.t = t;
window.Govli.changeLanguage = changeLanguage;
window.Govli.loadTranslations = loadTranslations;
window.Govli.updatePageTranslations = updatePageTranslations;
window.Govli.translateFormField = translateFormField;
window.Govli.addTranslationButton = addTranslationButton;
window.Govli.SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLanguageSelector);
} else {
  initializeLanguageSelector();
}
