import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from './de.json';
import en from './en.json';
import pl from './pl.json';
import fr from './fr.json';
import es from './es.json';
import it from './it.json';
import ro from './ro.json';

const savedLanguage = localStorage.getItem('dragonfly-language') || 'en';

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
    pl: { translation: pl },
    fr: { translation: fr },
    es: { translation: es },
    it: { translation: it },
    ro: { translation: ro },
  },
  lng: savedLanguage,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
