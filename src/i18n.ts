export type Locale = 'en' | 'ar'
export const messages = {
  en: {
    title: 'Athan Globe',
    explore: 'The Sound of athan Constantly Echoes Around the Globe', intro: 'Follow the call to prayer around the Earth, from the last 24 hours to this moment.',
    method: 'Calculation method', legend: 'The five prayers', recent: 'Recent Athan', recentWindow: '5 MIN', about: 'About the data',
    aboutText: 'Dots mark calculated prayer starts. Local mosque timetables may differ. Map data from Natural Earth. City data from GeoNames.',
    live: 'Live', replay: 'Replay', paused: 'Paused', expired: 'Schedule ended', loading: 'Loading', statusError: 'Unavailable',
    pause: 'Pause', play: 'Resume', skip: 'Skip to live', replayDay: 'Replay 24h', utc: 'UTC', ago: '−24 hours', now: 'Now',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', reset: 'Reset view', globe: 'Interactive globe of calculated prayer starts',
    interaction: 'Drag to rotate · Scroll or pinch to zoom', empty: 'No prayer starts in the last five minutes.',
    details: 'Selected Athan', close: 'Close city details', today: 'Past 24 hours', schedule: 'Calculated local time',
    estimated: 'Uses a polar latitude approximation.', error: 'Prayer times could not load.', retry: 'Retry', unavailable: 'Globe unavailable. Prayer times are still listed here.',
    fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha',
    activity: 'Activity', cities: 'cities', source: 'Inspired by the worldwide call to prayer',
  },
  ar: {
    title: 'الأذان حول العالم',
    explore: 'صوت الأذان لاينقطع', intro: 'تابع الأذان حول الأرض من الساعات الأربع والعشرين الماضية إلى هذه اللحظة.',
    method: 'طريقة الحساب', legend: 'الصلوات الخمس', recent: 'آخر أوقات الأذان', recentWindow: '٥ دقائق', about: 'عن البيانات',
    aboutText: 'تمثّل النقاط بداية أوقات الصلاة المحسوبة. قد تختلف مواقيت المساجد المحلية. الخرائط من Natural Earth وبيانات المدن من GeoNames.',
    live: 'مباشر', replay: 'إعادة العرض', paused: 'متوقف مؤقتًا', expired: 'انتهت التغطية', loading: 'جارٍ التحميل', statusError: 'غير متاح',
    pause: 'إيقاف مؤقت', play: 'متابعة', skip: 'انتقل إلى البث المباشر', replayDay: 'أعد عرض ٢٤ ساعة', utc: 'UTC', ago: 'قبل ٢٤ ساعة', now: 'الآن',
    zoomIn: 'تكبير', zoomOut: 'تصغير', reset: 'إعادة ضبط العرض', globe: 'كرة أرضية تفاعلية لأوقات الصلاة المحسوبة',
    interaction: 'اسحب للتدوير · مرّر أو استخدم إصبعين للتكبير', empty: 'لا أوقات أذان خلال الدقائق الخمس الماضية.',
    details: 'الأذان المحدد', close: 'إغلاق تفاصيل المدينة', today: 'آخر ٢٤ ساعة', schedule: 'التوقيت المحلي المحسوب',
    estimated: 'حُسب بالتقريب للمناطق القطبية.', error: 'تعذّر تحميل مواقيت الصلاة.', retry: 'أعد المحاولة', unavailable: 'عرض الكرة الأرضية غير متاح. ستجد المواقيت في القائمة.',
    fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء',
    activity: 'الأذان', cities: 'مدينة', source: 'مستوحى من الأذان حول العالم',
  },
}
const names: Record<string, [string, string]> = {
  UmmAlQura: ['Umm al-Qura', 'أم القرى'],
  MuslimWorldLeague: ['Muslim World League', 'رابطة العالم الإسلامي'],
  Egyptian: ['Egyptian General Authority of Survey', 'الهيئة المصرية العامة للمساحة'],
  Karachi: ['University of Islamic Sciences, Karachi', 'جامعة العلوم الإسلامية، كراتشي'],
  Dubai: ['Dubai', 'دبي'],
  Qatar: ['Qatar', 'قطر'],
  Kuwait: ['Kuwait', 'الكويت'],
  MoonsightingCommittee: ['Moonsighting Committee', 'لجنة رؤية الهلال'],
  Singapore: ['Singapore', 'سنغافورة'],
  NorthAmerica: ['ISNA (North America)', 'أمريكا الشمالية (ISNA)'],
  Turkey: ['Diyanet (Türkiye)', 'رئاسة الشؤون الدينية التركية'],
  Tehran: ['Tehran', 'طهران'],
}
export const methodName = (id: string, locale: Locale) => names[id]?.[locale === 'ar' ? 1 : 0] ?? id

const regionNames = new Map<Locale, Intl.DisplayNames>()
export function countryName(code: string | undefined, locale: Locale) {
  if (!code || code === 'ZZ' || !/^[A-Z]{2}$/.test(code)) return undefined
  let formatter = regionNames.get(locale)
  if (!formatter) {
    formatter = new Intl.DisplayNames(locale, { type: 'region', fallback: 'none' })
    regionNames.set(locale, formatter)
  }
  return formatter.of(code)
}

const timeFormats = new Map<string, Intl.DateTimeFormat>()
export function formatTime(at: number, zone: string, locale: Locale, full = false) {
  const key = `${locale}/${zone}/${full}`
  let format = timeFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      ...(full ? { month: 'short', day: 'numeric', year: 'numeric' } : {}),
    })
    timeFormats.set(key, format)
  }
  return format.format(at)
}
