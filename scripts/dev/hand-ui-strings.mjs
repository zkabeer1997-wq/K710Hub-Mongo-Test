#!/usr/bin/env node
// Hand-written translations for the site chrome (navigation, footer, language and text-size
// controls, short sign-in labels). Machine translation got many of these wrong because the
// labels are single words with no context ("Home" -> "house", "Apply" -> "apply a setting").
//
// Status: hand-authored, NOT yet confirmed by native speakers. Each locale file lists these
// keys under _meta.handAuthored so a reviewer knows what to check.
//
//   node scripts/dev/hand-ui-strings.mjs        writes the strings into i18n/locales/*.json and
//                                              records their English hash in the manifest, so
//                                              `npm run translate` keeps them unless the English
//                                              text changes.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashText } from '../../lib/i18n/catalogTools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KEYS = [
  'translate.working', 'translate.unavailable', 'translate.dismiss',
  'footer.nav.aria', 'footer.tag', 'footer.group.explore', 'footer.group.about', 'footer.group.members',
  'footer.link.home', 'footer.link.guides', 'footer.link.apply', 'footer.link.help', 'footer.link.about',
  'footer.link.timeline', 'footer.link.gallery', 'footer.link.glossary', 'footer.link.lore',
  'footer.link.dashboard', 'footer.link.power', 'footer.link.forms', 'footer.link.tools', 'footer.link.events',
  'footer.donate', 'footer.donate.aria',
  'lang.button.label', 'lang.button.aria', 'lang.picker.title', 'lang.picker.close', 'lang.picker.selected',
  'lang.picker.hint', 'lang.menu.row',
  'chrome.skip', 'chrome.menu', 'chrome.menu.open', 'chrome.menu.close',
  'chrome.nav.home', 'chrome.nav.about', 'chrome.nav.aboutKingdom', 'chrome.nav.timeline', 'chrome.nav.gallery',
  'chrome.nav.glossary', 'chrome.nav.lore', 'chrome.nav.guides', 'chrome.nav.help', 'chrome.nav.members',
  'chrome.nav.dashboard', 'chrome.nav.forms', 'chrome.nav.tools', 'chrome.nav.events', 'chrome.nav.apply',
  'chrome.nav.powerProfile', 'chrome.nav.myForms', 'chrome.nav.donate', 'chrome.nav.mobileLabel',
  'formButton.fill', 'formButton.change', 'formButton.check', 'formButton.closed',
  'easy.label', 'easy.aria',
  'signin.link', 'signin.member.link', 'signin.member.sub', 'signin.apply.title',
  'signin.easy.on', 'signin.easy.off', 'signin.easy.title', 'signin.hero.cta',
  'home.hero.apply', 'home.hero.schedules',
];

// One row per key, in KEYS order: ko, ja, zh, es, fr, tr, hi, ar, tl.
const ROWS = [
  ['번역 중…', '翻訳中…', '正在翻译…', 'Traduciendo…', 'Traduction…', 'Çevriliyor…', 'अनुवाद हो रहा है…', 'جارٍ الترجمة…', 'Isinasalin…'],
  ['지금은 번역을 사용할 수 없습니다. 페이지는 영어로 표시됩니다.', '現在翻訳を利用できません。ページは英語のまま表示されます。', '暂时无法翻译，页面将保持英文。', 'La traducción no está disponible por ahora. La página se mantiene en inglés.', 'La traduction est momentanément indisponible. La page reste en anglais.', 'Çeviri şu anda kullanılamıyor. Sayfa İngilizce kalacak.', 'अनुवाद अभी उपलब्ध नहीं है। पेज अंग्रेज़ी में ही रहेगा।', 'الترجمة غير متاحة حاليًا. ستبقى الصفحة باللغة الإنجليزية.', 'Hindi muna available ang pagsasalin. Mananatiling English ang page.'],
  ['닫기', '閉じる', '关闭', 'Cerrar', 'Fermer', 'Kapat', 'बंद करें', 'إغلاق', 'Isara'],
  ['바닥글', 'フッター', '页脚', 'Pie de página', 'Pied de page', 'Alt bilgi', 'फ़ुटर', 'تذييل الصفحة', 'Footer'],
  ['다국어 Kingshot 왕국.', '多言語の Kingshot キングダム。', '多语言的 Kingshot 王国。', 'Un reino multilingüe de Kingshot.', 'Un royaume Kingshot multilingue.', 'Çok dilli bir Kingshot krallığı.', 'एक बहुभाषी Kingshot किंगडम।', 'مملكة Kingshot متعددة اللغات.', 'Isang multilingual na Kingshot kingdom.'],
  ['둘러보기', '見る', '浏览', 'Explorar', 'Explorer', 'Keşfet', 'देखें', 'استكشف', 'Tingnan'],
  ['소개', '紹介', '关于', 'Acerca de', 'À propos', 'Hakkında', 'परिचय', 'نبذة', 'Tungkol'],
  ['멤버', 'メンバー', '成员', 'Miembros', 'Membres', 'Üyeler', 'सदस्य', 'الأعضاء', 'Mga miyembro'],
  ['홈', 'ホーム', '首页', 'Inicio', 'Accueil', 'Ana sayfa', 'होम', 'الرئيسية', 'Home'],
  ['가이드', 'ガイド', '指南', 'Guías', 'Guides', 'Rehberler', 'गाइड', 'الأدلة', 'Mga gabay'],
  ['가입 신청', '加入申請', '申请加入', 'Solicitar', 'Postuler', 'Başvur', 'आवेदन करें', 'قدّم طلبًا', 'Mag-apply'],
  ['도움말', 'ヘルプ', '帮助', 'Ayuda', 'Aide', 'Yardım', 'मदद', 'المساعدة', 'Tulong'],
  ['소개', '紹介', '关于', 'Acerca de', 'À propos', 'Hakkında', 'परिचय', 'نبذة', 'Tungkol'],
  ['업데이트 일정', 'リリース予定', '更新时间表', 'Calendario de lanzamientos', 'Calendrier des sorties', 'Güncelleme takvimi', 'रिलीज़ टाइमलाइन', 'جدول الإصدارات', 'Release timeline'],
  ['갤러리', 'ギャラリー', '相册', 'Galería', 'Galerie', 'Galeri', 'गैलरी', 'المعرض', 'Gallery'],
  ['용어집', '用語集', '术语表', 'Glosario', 'Glossaire', 'Sözlük', 'शब्दावली', 'المصطلحات', 'Glosaryo'],
  ['710 이야기', '710 ストーリー', '710 故事', 'Historias de 710', 'Histoires de 710', '710 Hikâyeleri', '710 कहानियाँ', 'حكايات 710', '710 Lore'],
  ['대시보드', 'ダッシュボード', '控制面板', 'Panel', 'Tableau de bord', 'Panel', 'डैशबोर्ड', 'لوحة التحكم', 'Dashboard'],
  ['Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile'],
  ['양식', 'フォーム', '表单', 'Formularios', 'Formulaires', 'Formlar', 'फ़ॉर्म', 'النماذج', 'Mga form'],
  ['도구', 'ツール', '工具', 'Herramientas', 'Outils', 'Araçlar', 'टूल', 'الأدوات', 'Mga tool'],
  ['이벤트', 'イベント', '活动', 'Eventos', 'Événements', 'Etkinlikler', 'इवेंट', 'الفعاليات', 'Mga event'],
  ['☕ K710 Hub 후원하기', '☕ K710 Hub に寄付する', '☕ 支持 K710 Hub', '☕ Donar a K710 Hub', '☕ Faire un don à K710 Hub', '☕ K710 Hub’a bağış yap', '☕ K710 Hub को दान दें', '☕ تبرّع لـ K710 Hub', '☕ Mag-donate sa K710 Hub'],
  ['K710 Hub 후원하기 (Ko-fi 후원 페이지가 새 탭에서 열립니다)', 'K710 Hub を支援する(Ko-fi の寄付ページが新しいタブで開きます)', '支持 K710 Hub(在新标签页中打开 Ko-fi 捐赠页面)', 'Apoyar a K710 Hub (abre la página de donaciones de Ko-fi en una pestaña nueva)', 'Soutenir K710 Hub (ouvre la page de don Ko-fi dans un nouvel onglet)', 'K710 Hub’ı destekle (Ko-fi bağış sayfası yeni sekmede açılır)', 'K710 Hub का समर्थन करें (Ko-fi दान पेज नए टैब में खुलेगा)', 'ادعم K710 Hub (تفتح صفحة التبرع في Ko-fi في علامة تبويب جديدة)', 'Suportahan ang K710 Hub (bubukas ang Ko-fi donation page sa bagong tab)'],
  ['언어', '言語', '语言', 'Idioma', 'Langue', 'Dil', 'भाषा', 'اللغة', 'Wika'],
  ['언어: {language}. 언어 바꾸기', '言語: {language}。言語を変更', '语言：{language}。更改语言', 'Idioma: {language}. Cambiar idioma', 'Langue : {language}. Changer de langue', 'Dil: {language}. Dili değiştir', 'भाषा: {language}. भाषा बदलें', 'اللغة: {language}. تغيير اللغة', 'Wika: {language}. Palitan ang wika'],
  ['언어를 선택하세요', '言語を選んでください', '选择语言', 'Elige tu idioma', 'Choisissez votre langue', 'Dilini seç', 'अपनी भाषा चुनें', 'اختر لغتك', 'Piliin ang iyong wika'],
  ['닫기', '閉じる', '关闭', 'Cerrar', 'Fermer', 'Kapat', 'बंद करें', 'إغلاق', 'Isara'],
  ['선택됨', '選択中', '已选择', 'Seleccionado', 'Sélectionnée', 'Seçili', 'चुनी गई', 'مُختارة', 'Napili'],
  ['언어를 누르면 페이지 전체가 바로 바뀝니다.', '言語をタップすると、ページ全体がすぐに切り替わります。', '点按一种语言即可切换，整个页面会立即更改。', 'Toca un idioma para cambiar. Toda la página cambia a la vez.', 'Touchez une langue pour changer. Toute la page change d’un coup.', 'Değiştirmek için bir dile dokun. Sayfanın tamamı hemen değişir.', 'भाषा बदलने के लिए उस पर टैप करें। पूरा पेज एक साथ बदल जाएगा।', 'اضغط على لغة للتبديل. تتغير الصفحة كلها مرة واحدة.', 'I-tap ang isang wika para lumipat. Sabay-sabay na magbabago ang buong page.'],
  ['언어:', '言語:', '语言：', 'Idioma:', 'Langue :', 'Dil:', 'भाषा:', 'اللغة:', 'Wika:'],
  ['본문으로 건너뛰기', '本文へスキップ', '跳到主要内容', 'Saltar al contenido', 'Aller au contenu', 'İçeriğe geç', 'मुख्य सामग्री पर जाएँ', 'انتقل إلى المحتوى', 'Lumaktaw sa nilalaman'],
  ['메뉴', 'メニュー', '菜单', 'Menú', 'Menu', 'Menü', 'मेन्यू', 'القائمة', 'Menu'],
  ['메뉴 열기', 'メニューを開く', '打开菜单', 'Abrir menú', 'Ouvrir le menu', 'Menüyü aç', 'मेन्यू खोलें', 'افتح القائمة', 'Buksan ang menu'],
  ['메뉴 닫기', 'メニューを閉じる', '关闭菜单', 'Cerrar menú', 'Fermer le menu', 'Menüyü kapat', 'मेन्यू बंद करें', 'أغلق القائمة', 'Isara ang menu'],
  ['홈', 'ホーム', '首页', 'Inicio', 'Accueil', 'Ana sayfa', 'होम', 'الرئيسية', 'Home'],
  ['소개', '紹介', '关于', 'Acerca de', 'À propos', 'Hakkında', 'परिचय', 'نبذة', 'Tungkol'],
  ['Kingdom 710 소개', 'Kingdom 710 について', '关于 Kingdom 710', 'Acerca de Kingdom 710', 'À propos de Kingdom 710', 'Kingdom 710 hakkında', 'Kingdom 710 के बारे में', 'عن Kingdom 710', 'Tungkol sa Kingdom 710'],
  ['업데이트 일정', 'リリース予定', '更新时间表', 'Calendario de lanzamientos', 'Calendrier des sorties', 'Güncelleme takvimi', 'रिलीज़ टाइमलाइन', 'جدول الإصدارات', 'Release timeline'],
  ['갤러리', 'ギャラリー', '相册', 'Galería', 'Galerie', 'Galeri', 'गैलरी', 'المعرض', 'Gallery'],
  ['용어집', '用語集', '术语表', 'Glosario', 'Glossaire', 'Sözlük', 'शब्दावली', 'المصطلحات', 'Glosaryo'],
  ['710 이야기', '710 ストーリー', '710 故事', 'Historias de 710', 'Histoires de 710', '710 Hikâyeleri', '710 कहानियाँ', 'حكايات 710', '710 Lore'],
  ['가이드', 'ガイド', '指南', 'Guías', 'Guides', 'Rehberler', 'गाइड', 'الأدلة', 'Mga gabay'],
  ['도움말', 'ヘルプ', '帮助', 'Ayuda', 'Aide', 'Yardım', 'मदद', 'المساعدة', 'Tulong'],
  ['멤버', 'メンバー', '成员', 'Miembros', 'Membres', 'Üyeler', 'सदस्य', 'الأعضاء', 'Mga miyembro'],
  ['대시보드', 'ダッシュボード', '控制面板', 'Panel', 'Tableau de bord', 'Panel', 'डैशबोर्ड', 'لوحة التحكم', 'Dashboard'],
  ['양식', 'フォーム', '表单', 'Formularios', 'Formulaires', 'Formlar', 'फ़ॉर्म', 'النماذج', 'Mga form'],
  ['도구', 'ツール', '工具', 'Herramientas', 'Outils', 'Araçlar', 'टूल', 'الأدوات', 'Mga tool'],
  ['이벤트', 'イベント', '活动', 'Eventos', 'Événements', 'Etkinlikler', 'इवेंट', 'الفعاليات', 'Mga event'],
  ['가입 신청', '加入申請', '申请加入', 'Solicitar', 'Postuler', 'Başvur', 'आवेदन करें', 'قدّم طلبًا', 'Mag-apply'],
  ['Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile', 'Power Profile'],
  ['내 양식', '自分のフォーム', '我的表单', 'Mis formularios', 'Mes formulaires', 'Formlarım', 'मेरे फ़ॉर्म', 'نماذجي', 'Mga form ko'],
  ['후원', '寄付', '捐赠', 'Donar', 'Faire un don', 'Bağış yap', 'दान करें', 'تبرّع', 'Mag-donate'],
  ['모바일 메뉴', 'モバイルメニュー', '手机菜单', 'Menú móvil', 'Menu mobile', 'Mobil menü', 'मोबाइल मेन्यू', 'قائمة الهاتف', 'Mobile menu'],
  ['작성하기', '入力する', '填写', 'Rellenar', 'Remplir', 'Doldur', 'भरें', 'املأ النموذج', 'Sagutan'],
  ['답변 수정', '回答を変更', '修改回答', 'Cambiar respuestas', 'Modifier les réponses', 'Yanıtları değiştir', 'जवाब बदलें', 'غيّر الإجابات', 'Baguhin ang sagot'],
  ['확인 후 저장', '確認して保存', '检查并保存', 'Revisar y guardar', 'Vérifier et enregistrer', 'Kontrol et ve kaydet', 'जाँचें और सेव करें', 'راجع واحفظ', 'Suriin at i-save'],
  ['마감', '受付終了', '已关闭', 'Cerrado', 'Fermé', 'Kapalı', 'बंद', 'مغلق', 'Sarado'],
  ['쉬운 보기', '見やすい表示', '简易视图', 'Vista fácil', 'Affichage simplifié', 'Kolay görünüm', 'आसान व्यू', 'عرض مبسّط', 'Madaling view'],
  ['쉬운 보기: 더 큰 글자와 버튼', '見やすい表示: 大きな文字とボタン', '简易视图：更大的文字和按钮', 'Vista fácil: texto y botones más grandes', 'Affichage simplifié : texte et boutons plus grands', 'Kolay görünüm: daha büyük yazı ve düğmeler', 'आसान व्यू: बड़े अक्षर और बटन', 'عرض مبسّط: نص وأزرار أكبر', 'Madaling view: mas malaking text at button'],
  ['로그인', 'サインイン', '登录', 'Entrar', 'Se connecter', 'Giriş yap', 'साइन इन', 'تسجيل الدخول', 'Mag-sign in'],
  ['멤버 로그인', 'メンバーのサインイン', '成员登录', 'Acceso de miembros', 'Connexion membres', 'Üye girişi', 'सदस्य साइन इन', 'دخول الأعضاء', 'Sign in ng miyembro'],
  ['이미 Kingdom 710에 있는 플레이어용', 'すでに Kingdom 710 にいるプレイヤー向け', '适用于已在 Kingdom 710 的玩家', 'Para jugadores que ya están en Kingdom 710', 'Pour les joueurs déjà dans Kingdom 710', 'Zaten Kingdom 710’da olan oyuncular için', 'उन खिलाड़ियों के लिए जो पहले से Kingdom 710 में हैं', 'للاعبين الموجودين بالفعل في Kingdom 710', 'Para sa mga player na nasa Kingdom 710 na'],
  ['Kingdom 710으로 이전 신청하기', 'Kingdom 710 への移籍を申請する', '申请迁入 Kingdom 710', 'Solicitar el traslado a Kingdom 710', 'Demander un transfert vers Kingdom 710', 'Kingdom 710’a transfer için başvur', 'Kingdom 710 में ट्रांसफ़र के लिए आवेदन करें', 'قدّم طلب الانتقال إلى Kingdom 710', 'Mag-apply na lumipat sa Kingdom 710'],
  ['큰 글자: 켬', '大きな文字: オン', '大字体：开', 'Texto grande: activado', 'Texte agrandi : activé', 'Büyük yazı: açık', 'बड़े अक्षर: चालू', 'نص أكبر: مُفعّل', 'Malaking text: On'],
  ['큰 글자: 끔', '大きな文字: オフ', '大字体：关', 'Texto grande: desactivado', 'Texte agrandi : désactivé', 'Büyük yazı: kapalı', 'बड़े अक्षर: बंद', 'نص أكبر: متوقف', 'Malaking text: Off'],
  ['쉬운 보기: 더 큰 글자와 더 단순한 화면', '見やすい表示: 大きな文字とシンプルな画面', '简易视图：更大的文字，更简洁的页面', 'Vista fácil: texto más grande y páginas más simples', 'Affichage simplifié : texte plus grand et pages plus simples', 'Kolay görünüm: daha büyük yazı ve daha sade sayfalar', 'आसान व्यू: बड़े अक्षर और सरल पेज', 'عرض مبسّط: نص أكبر وصفحات أبسط', 'Madaling view: mas malaking text at mas simpleng page'],
  ['이미 710에 있나요? 로그인', 'すでに 710 のメンバー? サインイン', '已经在 710? 登录', '¿Ya estás en 710? Entra', 'Déjà dans 710 ? Connectez-vous', 'Zaten 710’da mısın? Giriş yap', 'पहले से 710 में हैं? साइन इन करें', 'أنت في 710 بالفعل؟ سجّل الدخول', 'Nasa 710 ka na? Mag-sign in'],
  ['이전 신청하기', '移籍を申請する', '申请迁入', 'Solicitar traslado', 'Demander un transfert', 'Transfer için başvur', 'ट्रांसफ़र के लिए आवेदन करें', 'قدّم طلب الانتقال', 'Mag-apply na lumipat'],
  ['연맹 일정 보기', '同盟のスケジュールを見る', '查看联盟时间表', 'Ver horarios de las alianzas', 'Voir les horaires des alliances', 'İttifak programlarını gör', 'एलायंस का शेड्यूल देखें', 'اعرض جداول التحالفات', 'Tingnan ang schedule ng alliance'],
];
const LANGS = ['ko', 'ja', 'zh', 'es', 'fr', 'tr', 'hi', 'ar', 'tl'];

if (ROWS.length !== KEYS.length) throw new Error(`rows ${ROWS.length} != keys ${KEYS.length}`);
const en = JSON.parse(readFileSync(path.join(ROOT, 'i18n/en.json'), 'utf8'));
const missing = KEYS.filter((k) => !en[k]);
if (missing.length) throw new Error(`missing English keys: ${missing.join(', ')}`);

const manifestFile = path.join(ROOT, 'i18n/translation-manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
LANGS.forEach((lang, col) => {
  const file = path.join(ROOT, `i18n/locales/${lang}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  KEYS.forEach((key, row) => {
    const value = ROWS[row][col];
    const enText = typeof en[key] === 'string' ? en[key] : en[key].text;
    for (const ph of enText.match(/\{\w+\}/g) || []) if (!value.includes(ph)) throw new Error(`${lang} ${key} lost ${ph}`);
    data.strings[key] = value;
    manifest[lang] = manifest[lang] || {};
    manifest[lang][key] = hashText(enText);
  });
  data._meta.handAuthored = KEYS;
  data._meta.handAuthoredStatus = 'hand-authored by Claude, not yet confirmed by a native speaker';
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
});
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${KEYS.length} hand strings x ${LANGS.length} languages`);
