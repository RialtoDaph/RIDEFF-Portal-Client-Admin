// Builds messages/{de,en,id}.json from the designer's string table
// (rideff_portal_handoff/design/rideff-portal-i18n.js).
//
// German is canonical. EN and ID are copied from the table, never written here.
// Three kinds of entries:
//   'key': 'DE literal'                → looked up in the table
//   'key': { de, en, id, from }        → ICU version of a table row; `from` must exist in the table
//   'key': { de, missing: true }       → prototype copy with no translation yet (falls back to DE)
//   'key': { de, proposed: true }      → not in the prototype at all; proposed DE copy, needs the owner's OK
// Rows whose ID column only repeats the English text are treated as untranslated.
// Run: node scripts/i18n/build-messages.mjs  → writes messages/*.json and messages/MISSING.md

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const src = fs.readFileSync(path.join(root, 'rideff_portal_handoff/design/rideff-portal-i18n.js'), 'utf8');
const win = {};
vm.runInNewContext(src.split('(function(){')[0], { window: win });
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const TABLE = new Map(win.RIDEFF_V7_I18N.map(([de, en, id]) => [norm(de), { en, id }]));
const idUntranslated = (row, de) => row.id === row.en && row.en !== de && /[a-z]/.test(row.en);

/** @type {Record<string, string | {de:string,en?:string,id?:string,from?:string,missing?:boolean}>} */
const M = {
  // ── shared ───────────────────────────────────────────────
  'common.ai': 'KI',
  'common.send': '↵ SENDEN',
  'common.undo': 'RÜCKGÄNGIG',
  'common.close': 'Schließen',
  'common.escClose': 'ESC SCHLIESSEN',
  'common.xClose': '× SCHLIESSEN',
  'common.back': '← ZURÜCK',
  'common.included': 'inklusive',
  'common.copy': 'Kopieren',
  'common.copied': 'Kopiert ✓',
  'common.portal': { de: 'PORTAL', en: 'PORTAL', id: 'PORTAL', from: 'Ihr Angebot' }, // brand label, kept as is
  'common.esc': { de: 'ESC', en: 'ESC', id: 'ESC', from: 'ESC SCHLIESSEN' },
  'time.yesterday': 'gestern',
  'time.now': 'jetzt',
  'time.months': { de: '{count, plural, one {# Monat} other {# Monate}}', en: '{count, plural, one {# month} other {# months}}', id: '{count} bulan', from: '12 Monate' },
  'money.perMonth': { de: '{amount} / Monat', en: '{amount} / month', id: '{amount} / bulan', from: '€249 / Monat' },
  'money.netNote': 'Preise netto, zzgl. 19 % MwSt.',
  'money.netNoteUpper': 'PREISE NETTO, ZZGL. 19 % MWST.',

  // ── auth ─────────────────────────────────────────────────
  'auth.title': 'Willkommen zurück.',
  'auth.lead': 'Wir schicken Ihnen einen Code per E-Mail. Kein Passwort nötig.',
  'auth.email': 'E-MAIL',
  'auth.emailPlaceholder': 'ihre@email.de',
  'auth.sendCode': 'Code senden →',
  'auth.codeSentTo': 'CODE GESENDET AN',
  'auth.code': '6-STELLIGER CODE',
  'auth.signIn': 'Anmelden →',
  'auth.otherEmail': 'Andere E-Mail',
  'auth.errEmail': 'BITTE EINE GÜLTIGE E-MAIL EINGEBEN.',
  'auth.errCode': 'DER CODE HAT 6 ZIFFERN.',
  'auth.footer': 'GESCHÜTZT · DATEN IN DER EU',
  // Not in the prototype. Proposed wording, waiting for the owner's OK.
  'auth.errCodeWrong': { de: 'DER CODE STIMMT NICHT ODER IST ABGELAUFEN.', proposed: true },
  'auth.errRateLimit': { de: 'ZU VIELE VERSUCHE. BITTE KURZ WARTEN.', proposed: true },
  'auth.mfa.challengeLabel': { de: '6-STELLIGER CODE', en: '6-DIGIT CODE', id: 'KODE 6 DIGIT', from: '6-STELLIGER CODE' },

  // ── profile menu ─────────────────────────────────────────
  'profile.label': 'Profil',
  'profile.language': 'SPRACHE',
  'profile.signOut': 'Abmelden',

  // ── navigation ───────────────────────────────────────────
  'nav.project': 'PROJEKT',
  'nav.files': 'DATEIEN',
  'nav.invoices': 'RECHNUNGEN',
  'nav.offer': 'ANGEBOT',
  'nav.search': '⌘K SUCHEN',
  'nav.clients': 'KUNDEN',
  'nav.inbox': 'INBOX',
  'nav.pipeline': 'PIPELINE',
  'nav.templates': 'VORLAGEN',
  'nav.aiSearch': 'Wer zahlt noch nicht?',

  // ── phases & tags ────────────────────────────────────────
  'phase.1': 'ERSTGESPRÄCH',
  'phase.2': { de: 'ANALYSE', en: 'ANALYSIS', id: 'ANALISIS', from: 'ANALYSE ✓' },
  'phase.3': { de: 'BAUEN', en: 'BUILD', id: 'BANGUN', from: '03 BAUEN' },
  'phase.4': { de: 'TESTEN', missing: true },
  'phase.5': { de: 'LIVE', missing: true },
  'phase.lead': 'LEAD',
  'phaseName.3': { de: 'Bauen', en: 'Build', id: 'Bangun', from: 'Phase 03 · Bauen · live in 11 Tagen' },
  'phaseName.1': { de: 'Erstgespräch', missing: true },
  'phaseName.2': { de: 'Analyse', missing: true },
  'phaseName.4': { de: 'Testen', missing: true },
  'phaseName.5': { de: 'Live', missing: true },
  'tag.wunsch': 'WUNSCH',
  'tag.zahlung': 'ZAHLUNG',
  'tag.datei': 'DATEI',
  'tag.freigabe': 'FREIGABE',
  'tag.update': 'UPDATE',
  'tag.rechnung': 'RECHNUNG',
  'tag.start': 'START',
  'tag.testlauf': 'TESTLAUF',
  'tag.frage': 'FRAGE',
  'tag.angebot': 'ANGEBOT',
  'tag.erinnerung': 'ERINNERUNG',
  'tag.vertrag': 'VERTRAG',
  'tag.build': { de: 'BUILD', missing: true },
  'tag.ticket': { de: 'TICKET', missing: true },
  'tag.analyse': { de: 'ANALYSE', en: 'ANALYSIS', id: 'ANALISIS', from: 'ANALYSE ✓' },
  'tag.anfrage': { de: 'ANFRAGE', missing: true },

  // ── client: Projekt ──────────────────────────────────────
  'project.status': 'STATUS',
  'project.inProgress': '● IN ARBEIT',
  'project.phaseLine': { de: 'Phase {num} · {phase} · live in {days} Tagen', en: 'Phase {num} · {phase} · live in {days} days', id: 'Fase {num} · {phase} · live dalam {days} hari', from: 'Phase 03 · Bauen · live in 11 Tagen' },
  'project.approval.waiting': { de: '{title} wartet auf Sie.', en: '{title} is waiting for you.', id: '{title} menunggu Anda.', from: 'Startseite, Entwurf 2 wartet auf Sie.' },
  'project.approval.deadline': { de: 'FRIST {deadline} · DANN BLEIBT LIVE AM {golive}', en: 'DUE {deadline} · THEN LAUNCH STAYS {golive}', id: 'TENGGAT {deadline} · LIVE TETAP {golive}', from: 'FRIST FR 17.10 · DANN BLEIBT LIVE AM 24.10' },
  'project.approval.view': '↵ ANSEHEN',
  'project.approval.change': 'E ÄNDERN',
  'project.change.title': { de: 'ÄNDERUNG AN {title}', en: 'CHANGE TO {title}', id: 'PERUBAHAN {title}', from: 'ÄNDERUNG AN STARTSEITE, ENTWURF 2' },
  'project.change.placeholder': 'Was soll anders sein? Zum Beispiel: Öffnungszeiten weiter oben.',
  'project.change.cancel': 'ESC ABBRECHEN',
  'project.change.send': '⌘↵ SENDEN',
  'project.approved.title': { de: '{title} freigegeben. Danke!', en: '{title} approved. Thank you!', id: '{title} disetujui. Terima kasih!', from: 'Startseite freigegeben. Danke!' },
  'project.approved.sub': { de: 'LIVE BLEIBT AM {golive} · NÄCHSTER SCHRITT: {next}', en: 'LAUNCH STAYS {golive} · NEXT: {next}', id: 'LIVE TETAP {golive} · BERIKUTNYA: {next}', from: 'LIVE BLEIBT AM 24.10 · NÄCHSTER SCHRITT: TESTLAUF DO' },
  'project.changeSent.title': 'Änderung ist bei Rialto.',
  'project.changeSent.sub': { de: 'ENTWURF {n} KOMMT BIS {date}', en: 'DRAFT {n} BY {date}', id: 'DRAF {n} PALING LAMBAT {date}', from: 'ENTWURF 3 KOMMT BIS MI 15.10' },
  'project.log': 'LOG',
  'log.fileUploaded': { de: '{file} hochgeladen', en: '{file} uploaded', id: '{file} diunggah', from: 'schichten-herbst.xlsx hochgeladen' },
  'log.itemApproved': { de: '{title} freigegeben', en: '{title} approved', id: '{title} disetujui', from: 'Startseite, Entwurf 2 freigegeben' },
  'log.paid': { de: '{month} · {amount} · bezahlt', en: '{month} · {amount} · paid', id: '{month} · {amount} · lunas', from: 'Oktober · €249 · bezahlt' },
  'log.changeRequested': { de: 'Änderung {title}: {text}', en: '{title} change: {text}', from: 'Änderung Startseite:' },
  'project.phaseLineShort': { de: 'Phase {num} · {phase}', en: 'Phase {num} · {phase}', id: 'Fase {num} · {phase}', from: 'Phase 03 · Bauen · live in 11 Tagen' },
  'preview.newIn': { de: 'NEU IN ENTWURF {n}', en: 'NEW IN DRAFT {n}', id: 'BARU DI DRAF {n}', from: 'NEU IN ENTWURF 2' },
  'meeting.next': 'NÄCHSTER TERMIN',
  'meeting.linkBefore': 'LINK KOMMT 10 MIN VORHER',
  'package.title': 'PAKET',
  'package.paid': 'BEZAHLT ✓',
  'chat.title': 'FRAGEN SIE RIALTO',
  'chat.you': 'SIE',
  'chat.typing': 'RIALTO SCHREIBT…',
  'chat.placeholder': 'Nachricht schreiben…',
  'preview.desktop': 'DESKTOP',
  'preview.mobile': 'HANDY',
  'preview.approve': '↵ JA, FREIGEBEN',
  'preview.requestChange': 'E ÄNDERUNG WÜNSCHEN',

  // ── client: Dateien ──────────────────────────────────────
  'files.title': 'Dateien',
  'files.count': { de: '{count} DATEIEN · VON IHNEN UND RIALTO', en: '{count} FILES · FROM YOU AND RIALTO', id: '{count} FILE · DARI ANDA DAN RIALTO', from: 'DATEIEN · VON IHNEN UND RIALTO' },
  'files.name': 'NAME',
  'files.from': 'VON',
  'files.date': 'DATUM',
  'files.size': 'GRÖSSE',
  'files.you': 'Sie',
  'files.upload': '↑ HOCHLADEN',
  // Not in the prototype. Proposed wording, waiting for the owner's OK.
  'files.uploadFailed': { de: 'HOCHLADEN FEHLGESCHLAGEN. BITTE NOCH EINMAL VERSUCHEN.', proposed: true },
  'files.tooLarge': { de: 'DATEI ZU GROSS · MAX. 50 MB', proposed: true },

  // ── client: Rechnungen ───────────────────────────────────
  'invoices.title': 'Rechnungen',
  'invoices.allPaid': 'ALLES BEZAHLT ✓',
  'invoices.nOpen': { de: '{count} OFFEN', en: '{count} OPEN', id: '{count} TERBUKA', from: '1 OFFEN' },
  'invoices.nr': 'NR.',
  'invoices.item': 'POSTEN',
  'invoices.date': 'DATUM',
  'invoices.status': 'STATUS',
  'invoices.amount': 'BETRAG',
  'invoices.pay': 'BEZAHLEN',
  'invoices.pdf': '↓ PDF',
  'invoiceStatus.open': 'OFFEN',
  'invoiceStatus.paid': 'BEZAHLT',
  'invoiceStatus.announced': 'ANGEKÜNDIGT',
  'invoiceStatus.overdue': 'ÜBERFÄLLIG',
  'invoiceStatus.reminded': 'ERINNERT',

  // ── client: Angebot ──────────────────────────────────────
  'offer.title': 'Ihr Angebot',
  'offer.docLabel': { de: 'ANGEBOT {nr}', en: 'QUOTE {nr}', id: 'PENAWARAN {nr}', from: 'ANGEBOT' },
  'offer.headline': { de: '{package} für {org}', missing: true },
  'offer.service': 'LEISTUNG',
  'offer.amount': 'BETRAG',
  'offer.group.internal.title': 'Internes System mit KI',
  'offer.group.internal.1': 'Aufgaben & Checklisten',
  'offer.group.internal.2': 'Abläufe (SOPs) mit KI',
  'offer.group.internal.3': 'Lager & Bestand',
  'offer.group.internal.4': 'Inhaber-Cockpit',
  'offer.group.internal.5': 'Branchenpaket',
  'offer.group.teamApp.title': 'Team-App',
  'offer.group.teamApp.1': 'Aufgaben und Checklisten fürs Team',
  'offer.group.teamApp.2': 'Abläufe immer dabei, auch am Handy',
  'offer.group.web.title': 'Website oder Online-Shop',
  'offer.group.web.1': 'Von uns gebaut, live gestellt und betreut',
  'offer.group.web.2': 'Entwürfe prüfen und freigeben im Portal',
  'offer.group.ops.title': 'Betrieb & Technik',
  'offer.group.ops.1': 'Hosting in der EU',
  'offer.group.ops.2': 'Eigene Domain inklusive',
  'offer.group.ops.3': 'SSL-Verschlüsselung',
  'offer.group.ops.4': 'Backups und Updates',
  'offer.group.ops.5': 'Support über das Portal',
  'offer.setupOnce': 'Setup (einmalig)',
  'offer.monthlyRow': { de: '{package} (monatlich)', en: '{package} (monthly)', id: '{package} (bulanan)', from: 'Growth (monatlich)' },
  'offer.term': 'Laufzeit',
  'offer.chip.eu': 'DATEN IN DER EU',
  'offer.chip.built': 'GEBAUT, LIVE, BETREUT',
  'offer.chip.portal': 'ALLES IM PORTAL',
  'offer.panel.title': 'Passt das Angebot so?',
  'offer.panel.package': 'PAKET',
  'offer.panel.setup': { de: 'SETUP', missing: true },
  'offer.panel.monthly': 'MONATLICH',
  'offer.panel.term': 'LAUFZEIT',
  'offer.panel.hosting': 'HOSTING & DOMAIN',
  'offer.agb': { de: 'Ich habe die <agb>AGB</agb> gelesen und akzeptiere sie.', en: 'I have read the <agb>terms</agb> and accept them.', id: 'Saya sudah membaca <agb>syarat dan ketentuan</agb> dan menyetujuinya.', from: 'Ich habe die' },
  'offer.agbAria': { de: 'AGB akzeptieren', missing: true },
  'offer.approve': '↵ JA, FREIGEBEN',
  'offer.legal': 'MIT DER FREIGABE KOMMT DER VERTRAG ZUSTANDE · ZEIT UND IP WERDEN GESPEICHERT',
  'offer.done.title': 'Angebot freigegeben. Danke!',
  'offer.done.sub': { de: 'FREIGEGEBEN {at} · IP GESPEICHERT', missing: true },
  'offer.done.toInvoices': '→ ZU RECHNUNGEN',

  // ── client: Bezahlen ─────────────────────────────────────
  'pay.invoice': { de: 'RECHNUNG {nr}', en: 'INVOICE {nr}', id: 'TAGIHAN {nr}', from: 'RECHNUNG' },
  'pay.netVat': { de: '{net} NETTO + 19 % MWST.', missing: true },
  'pay.monthlySuffix': { de: ' · MONATLICH', en: ' · MONTHLY', id: ' · BULANAN', from: 'MONATLICH' },
  'pay.stripe': 'Karte, SEPA-Lastschrift oder Klarna',
  'pay.stripeSub': 'ÜBER STRIPE · SICHER',
  'pay.bank': 'Überweisung',
  'pay.bankSub': 'STATUS BESTÄTIGT RIALTO MANUELL',
  'pay.recipient': 'EMPFÄNGER',
  'pay.iban': { de: 'IBAN', en: 'IBAN', id: 'IBAN', from: 'EMPFÄNGER' },
  'pay.reference': 'VERWENDUNGSZWECK',
  'pay.toStripe': 'Weiter zu Stripe →',
  'pay.transferred': 'ICH HABE ÜBERWIESEN',
  'pay.redirecting': 'LEITET ZU STRIPE WEITER…',
  'pay.paid.title': 'Bezahlt. Danke!',
  'pay.paid.sub': 'BELEG PER E-MAIL',
  'pay.bankDone.title': 'Danke! Wir prüfen den Zahlungseingang.',
  'pay.bankDone.sub': 'ÜBERWEISUNG ANGEKÜNDIGT',

  // ── admin: Kunden ────────────────────────────────────────
  'kpi.mrr': { de: 'MRR', en: 'MRR', id: 'MRR', from: 'KUNDEN' },
  'kpi.mrrTrend': { de: '▲ {pct} · 12 MON.', en: '▲ {pct} · 12 MO.', id: '▲ {pct} · 12 BLN', from: '▲ 13,8 % · 12 MON.' },
  'kpi.clients': 'KUNDEN',
  'kpi.inBuild': { de: '{count} IM AUFBAU', en: '{count} IN BUILD', id: '{count} SEDANG DIBANGUN', from: '2 IM AUFBAU' },
  'kpi.approvals': 'FREIGABEN',
  'kpi.maxDays': { de: 'MAX {count} TAGE', en: 'MAX {count} DAYS', id: 'MAKS {count} HARI', from: 'MAX 4 TAGE' },
  'kpi.open': 'OFFEN',
  'kpi.overdue': { de: '{count} ÜBERFÄLLIG', en: '{count} OVERDUE', id: '{count} JATUH TEMPO', from: '1 ÜBERFÄLLIG' },
  'kpi.reminded': 'ERINNERT',
  'kpi.leads': 'LEADS',
  'kpi.thisWeek': 'DIESE WOCHE',
  'clients.colNum': { de: '#', en: '#', id: '#', from: 'KUNDE' },
  'clients.colClient': 'KUNDE',
  'clients.colPhase': 'PHASE',
  'clients.colNext': 'NÄCHSTER SCHRITT',
  'clients.hint': 'J/K NAVIGIEREN · ↵ ÖFFNEN ·',
  'clients.filterAction': { de: 'F NUR MIT AKTION', en: 'F ACTION NEEDED ONLY', id: 'F HANYA PERLU TINDAKAN', from: 'NUR MIT AKTION' },
  'clients.filterAll': { de: 'F ALLE ZEIGEN', en: 'F SHOW ALL', id: 'F TAMPILKAN SEMUA', from: 'ALLE ZEIGEN' },
  'clients.add': '+ KUNDE ANLEGEN',
  'clients.since': { de: 'Kunde seit {month}', en: 'Client since {month}', from: 'Kunde seit Sep 2026' },
  'clients.liveSince': { de: 'Live seit {month}', en: 'Live since {month}', from: 'Live seit Apr 2026' },
  'clients.requestFrom': { de: 'Anfrage vom {date}', en: 'Request from {date}', from: 'Anfrage vom 07.10' },
  'detail.back': '← ALLE KUNDEN · ESC',
  'detail.prev': { de: 'K ↑', en: 'K ↑', id: 'K ↑', from: 'KUNDE' },
  'detail.next': { de: 'J ↓', en: 'J ↓', id: 'J ↓', from: 'KUNDE' },
  'detail.contact': 'KONTAKT',
  'detail.activity': 'AKTIVITÄT',
  'detail.viewAsClient': 'ALS KUNDE ANSEHEN →',
  'detail.sendReminder': 'ERINNERUNG SENDEN',
  'queue.header': { de: 'KI · HEUTE ENTSCHEIDEN · {count} OFFEN', en: 'AI · DECIDE TODAY · {count} OPEN', id: 'AI · PUTUSKAN HARI INI · {count} TERBUKA', from: 'KI · HEUTE ENTSCHEIDEN ·' },
  'queue.offerWaiting': { de: '{org} wartet seit {days} Tagen auf ein Angebot. Entwurf ist fertig.', en: '{org} has waited {days} days for a quote. Draft is ready.', id: '{org} menunggu penawaran {days} hari. Draf sudah siap.', from: 'Laden Mitte wartet seit 6 Tagen auf ein Angebot. Entwurf ist fertig.' },
  'queue.invoiceOpen': { de: '{org}: Rechnung {month} {days} Tage offen.', en: '{org}: {month} invoice open {days} days.', id: '{org}: tagihan {month} terbuka {days} hari.', from: 'Praxis Dr. Koch: Rechnung September 12 Tage offen.' },
  'queue.offerAccepted': { de: '{org} hat das Angebot freigegeben. Setup-Rechnung ist raus.', en: '{org} approved the quote. The setup invoice has been sent.', id: '{org} menyetujui penawaran. Tagihan setup sudah dikirim.', from: 'Laden Mitte hat das Angebot freigegeben. Setup-Rechnung ist raus.' },
  'queue.changeRequested': { de: '{org} wünscht eine Änderung: „{text}“', en: '{org} requests a change: “{text}”', from: 'Café Linde wünscht eine Änderung: „' },
  'queue.reviewSend': '↵ PRÜFEN & SENDEN',
  'queue.later': 'S SPÄTER',
  'queue.sendReminder': 'ERINNERUNG SENDEN',
  'queue.offerSent': '✓ ANGEBOT GESENDET',
  'queue.reminderSent': '✓ ERINNERUNG GESENDET',
  'queue.backTomorrow': '↻ MORGEN WIEDER',
  'queue.addClient': 'KUNDE ANLEGEN →',
  'queue.introCalls': 'Erstgespräche',

  // ── admin: Pipeline ──────────────────────────────────────
  'pipeline.lead': 'LEAD',
  'pipeline.stage': 'STUFE',
  'pipeline.next': 'NÄCHSTER SCHRITT',
  'pipeline.potential': 'POTENZIAL',
  'leadStage.intro_call': 'ERSTGESPRÄCH',
  'leadStage.analysis_done': 'ANALYSE ✓',
  'leadStage.offer_sent': 'ANGEBOT ✓',
  'leadStage.accepted': 'FREIGEGEBEN ✓',
  'leadNext.sendOffer': 'Angebot senden',
  'leadNext.awaitReply': 'Antwort abwarten',
  'leadNext.addClient': 'Kunde anlegen',

  // ── admin: Rechnungen ────────────────────────────────────
  'adminInvoices.count': { de: '{count} RECHNUNGEN', en: '{count} INVOICES', id: '{count} TAGIHAN', from: 'RECHNUNGEN' },
  'adminInvoices.month': 'MONAT',
  'adminInvoices.subscription': { de: 'ABO', missing: true },
  'adminInvoices.remind': 'ERINNERUNG SENDEN',
  'adminInvoices.markPaid': 'ALS BEZAHLT ✓',
  'adminInvoices.create': '+ RECHNUNG ERSTELLEN',
  'adminInvoices.once': 'Einmalig',
  'adminInvoices.monthly': 'Monatlich',
  'adminInvoices.client': 'KUNDE',
  'adminInvoices.item': 'POSTEN',
  'adminInvoices.itemPlaceholder': { de: 'z. B. Setup Growth', missing: true },
  'adminInvoices.amountNet': 'BETRAG NETTO (€)',
  'adminInvoices.net': 'Netto',
  'adminInvoices.vat': 'MwSt. 19 %',
  'adminInvoices.total': 'Gesamt',
  'adminInvoices.methods': 'ZAHLUNGSARTEN',
  'adminInvoices.methodStripe': 'Stripe: Karte, SEPA, Klarna',
  'adminInvoices.methodBank': 'Überweisung',
  'adminInvoices.aboNote': 'ABO: STRIPE BUCHT MONATLICH, BIS GEKÜNDIGT',
  'adminInvoices.createSend': 'ERSTELLEN & SENDEN',
  'adminInvoices.sentTo': { de: '{nr} an {org} gesendet', missing: true },
  'adminInvoices.reminderSentTo': { de: 'Erinnerung an {org} gesendet', missing: true },

  // ── admin: Neuer Kunde ───────────────────────────────────
  'newClient.title': 'Neuer Kunde',
  'newClient.sub': 'ZUGANG FÜRS PORTAL',
  'newClient.company': 'FIRMA',
  'newClient.contact': 'ANSPRECHPARTNER',
  'newClient.email': 'E-MAIL',
  'newClient.city': 'ORT (OPTIONAL)',
  'newClient.package': 'PAKET',
  'newClient.roleNote': 'ROLLE DES KONTAKTS: INHABER (ALLES, BEZAHLEN, FREIGEBEN)',
  'newClient.sendWelcome': 'Willkommens-Mail senden',
  'newClient.submit': 'ANLEGEN & EINLADEN →',
  'newClient.preview': 'VORSCHAU DER E-MAIL',
  'newClient.from': { de: 'VON {email}', en: 'FROM {email}', id: 'DARI {email}', from: 'VON' },
  'newClient.to': { de: 'AN {email}', missing: true },
  'newClient.subject': { de: 'BETREFF {subject}', missing: true },
  'newClient.done.title': { de: '{org} ist angelegt.', missing: true },
  'newClient.done.sent': { de: 'EINLADUNG GESENDET AN {email}', missing: true },
  'newClient.done.notSent': { de: 'ZUGANG ANGELEGT · KEINE MAIL GESENDET', missing: true },
  'newClient.done.open': 'KUNDE ÖFFNEN →',
  'newClient.done.more': 'WEITEREN KUNDEN ANLEGEN',

  // ── admin: Inbox ─────────────────────────────────────────
  'inbox.title': 'Inbox',
  'inbox.tab': { de: 'INBOX {count}', en: 'INBOX {count}', id: 'KOTAK MASUK {count}', from: 'INBOX' },
  'inbox.open': { de: '{count} OFFEN', en: '{count} OPEN', id: '{count} TERBUKA', from: '1 OFFEN' },
  'inbox.perItem': 'THREAD PRO ELEMENT',
  'inbox.element': 'ELEMENT',
  'inbox.context': 'KONTEXT',
  'inbox.placeholder': 'Antwort schreiben…',
  'inbox.openClient': 'KUNDE ÖFFNEN →',
  'inbox.allDone': 'Alles beantwortet.',
  'inbox.sendNext': '⌘↵ SENDEN & WEITER',
  'inbox.message': 'NACHRICHT',
  'inbox.perMonthUpper': { de: '{amount} / MONAT', en: '{amount} / MONTH', id: '{amount} / BULAN', from: '€249 / Monat' },

  // ── admin: Vorlagen ──────────────────────────────────────
  'templates.vars': 'VARIABLEN WERDEN BEIM SENDEN ERSETZT',
  'templateKind.angebot': 'ANGEBOT',
  'templateKind.freigabe': 'FREIGABE',
  'templateKind.erinnerung': 'ERINNERUNG',
  'templateKind.start': 'START',

  // ── ⌘K palette ───────────────────────────────────────────
  'palette.placeholder': 'Springen zu… oder KI fragen',
  'palette.kindClient': 'KUNDE',
  'palette.kindAdmin': { de: 'ADMIN', en: 'ADMIN', id: 'ADMIN', from: 'Als Admin' },
  'palette.kindOpenClient': 'KUNDE ÖFFNEN',
  'palette.clients': 'Kunden',
  'palette.pipeline': 'Pipeline',
  'palette.templates': 'Vorlagen',
  'palette.openApprovals': 'Nur offene Freigaben',
  'palette.whoNotPaid': 'Rechnungen · wer zahlt noch nicht?',
  'palette.orgProject': { de: '{org} · Projekt', en: '{org} · Project', id: '{org} · Proyek', from: 'Café Linde · Projekt' },
  'palette.orgFiles': { de: '{org} · Dateien', en: '{org} · Files', id: '{org} · File', from: 'Café Linde · Dateien' },
  'palette.orgInvoices': { de: '{org} · Rechnungen', en: '{org} · Invoices', id: '{org} · Tagihan', from: 'Café Linde · Rechnungen' },
  'palette.orgDetails': { de: '{org} · Details', en: '{org} · Details', from: '· Details' },
  'palette.ai': { de: 'Ich suche in Kunden, Rechnungen und Nachrichten nach „{q}“…', en: 'Searching clients, invoices and messages for “{q}”…', from: 'Ich suche in Kunden, Rechnungen und Nachrichten nach „' },
};

const out = { de: {}, en: {}, id: {} };
const missing = { en: [], id: [] };
const proposed = [];
const errors = [];
const set = (obj, key, val) => {
  const parts = key.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof o[p] === 'string') errors.push(`key ${key} collides with a leaf`);
    o = o[p] ??= {};
  }
  o[parts.at(-1)] = val;
};

for (const [key, v] of Object.entries(M)) {
  if (typeof v === 'string') {
    const row = TABLE.get(norm(v));
    if (!row) { errors.push(`not in table: ${key} = ${v}`); continue; }
    set(out.de, key, v);
    set(out.en, key, row.en);
    if (idUntranslated(row, v)) missing.id.push([key, v]);
    else set(out.id, key, row.id);
    continue;
  }
  set(out.de, key, v.de);
  if (v.proposed) { proposed.push([key, v.de]); missing.en.push([key, v.de]); missing.id.push([key, v.de]); continue; }
  if (v.missing) { missing.en.push([key, v.de]); missing.id.push([key, v.de]); continue; }
  if (!TABLE.has(norm(v.from))) errors.push(`source row not in table: ${key} ← ${v.from}`);
  for (const l of ['en', 'id']) {
    if (v[l] != null) set(out[l], key, v[l]);
    else missing[l].push([key, v.de]);
  }
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const dir = path.join(root, 'messages');
fs.mkdirSync(dir, { recursive: true });
for (const l of ['de', 'en', 'id']) fs.writeFileSync(path.join(dir, `${l}.json`), JSON.stringify(out[l], null, 2) + '\n');
const md = ['# Missing translations', '', 'Generated by `scripts/i18n/build-messages.mjs`. These keys fall back to German until the owner supplies copy.', ''];
md.push(`## Proposed German copy, not in the prototype (${proposed.length})`, '', '| Key | Proposed German |', '|---|---|');
for (const [k, de] of proposed) md.push(`| \`${k}\` | ${de} |`);
md.push('');
for (const l of ['en', 'id']) {
  md.push(`## ${l.toUpperCase()} (${missing[l].length})`, '', '| Key | German |', '|---|---|');
  for (const [k, de] of missing[l]) md.push(`| \`${k}\` | ${de.replace(/\|/g, '\\|')} |`);
  md.push('');
}
fs.writeFileSync(path.join(dir, 'MISSING.md'), md.join('\n'));
console.log(`keys: ${Object.keys(M).length} · missing en: ${missing.en.length} · missing id: ${missing.id.length}`);
