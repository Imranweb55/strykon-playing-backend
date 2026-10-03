const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { loadReportData, GAMES } = require("../utils/reportData");
const { getSettings } = require("../utils/settings");

const LOGO_PATH = path.join(__dirname, "..", "assets", "strykon-logo.png");
const PERIODS = ["daily", "weekly", "monthly"];
const ENTRY_LABEL = { district: "District App", turftown: "Turf Town", onspot: "On-spot" };

const money = (n) => `Rs ${Math.round(n || 0).toLocaleString("en-IN")}`;
const fmtDateTime = (d) =>
  new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

// ---------------------------------------------------------------------------
// Page geometry - every helper below measures from these so nothing ever
// runs past the margins (that was the cause of the uneven, broken layout).
// ---------------------------------------------------------------------------

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 width - left/right margin

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

// settings.logo (a saved data URL) wins over the bundled default logo file;
// settings.academyName replaces the fixed "STRYKON SPORTS ACADEMY" title.
const drawHeader = (doc, data, settings) => {
  const left = doc.page.margins.left;
  const top = doc.y;
  const customLogo = settings.logo?.startsWith("data:image/")
    ? Buffer.from(settings.logo.split(",")[1], "base64")
    : null;
  const hasLogo = Boolean(customLogo) || fs.existsSync(LOGO_PATH);
  const textX = hasLogo ? left + 56 : left;

  if (hasLogo) {
    try {
      doc.image(customLogo || LOGO_PATH, left, top, { width: 44, height: 44 });
    } catch {
      /* logo optional - continue without it */
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#0F172A")
    .text(settings.academyName || "STRYKON SPORTS ACADEMY", textX, top, {
      width: CONTENT_WIDTH - (textX - left),
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#64748B")
    .text("Multi-sport booking report", textX, top + 20);

  doc.y = top + 44 + 12;

  doc
    .moveTo(left, doc.y)
    .lineTo(left + CONTENT_WIDTH, doc.y)
    .strokeColor("#E2E8F0")
    .lineWidth(1)
    .stroke();
  doc.y += 12;

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#1E293B")
    .text(`${data.periodLabel} Report - ${data.gameName}`, left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 4;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#475569")
    .text(`Period: ${data.label}`, left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 2;
  doc.text(`Generated: ${fmtDateTime(new Date())}`, left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 16;
};

const drawSummaryBoxes = (doc, t) => {
  const boxes = [
    { label: "Total Bookings", value: String(t.bookings) },
    { label: "Total Revenue", value: money(t.revenue) },
    { label: "District + Turf Town Advance", value: money(t.advance) },
    { label: "Balance Collected On-spot", value: money(t.balance) },
  ];
  const left = doc.page.margins.left;
  const gap = 10;
  const boxW = (CONTENT_WIDTH - gap * (boxes.length - 1)) / boxes.length;
  const innerW = boxW - 16;
  const boxH = 52;
  const y = doc.y;

  boxes.forEach((b, i) => {
    const x = left + i * (boxW + gap);
    doc.roundedRect(x, y, boxW, boxH, 5).fillAndStroke("#F8FAFC", "#E2E8F0");
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#64748B")
      .text(b.label, x + 8, y + 9, { width: innerW, lineGap: 1 });
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#0F172A")
      .text(b.value, x + 8, y + boxH - 22, { width: innerW });
  });
  doc.y = y + boxH + 18;
};

// Simple two-column "label ....... value" row, drawn with fixed x positions
// on both sides so the values always line up in a straight right-aligned
// column instead of drifting (pdfkit's `continued` text does not keep two
// different alignments in sync, which was the earlier bug).
const drawKeyValueRow = (doc, left, valueColX, valueColW, label, value, opts = {}) => {
  const y = doc.y;
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(9.5)
    .fillColor(opts.dim ? "#64748B" : "#334155")
    .text(label, left, y, { width: valueColX - left - 8 });
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#0F172A")
    .text(value, valueColX, y, { width: valueColW, align: "right" });
  doc.y = Math.max(doc.y, y + 14);
};

const drawPaymentSummary = (doc, t) => {
  const left = doc.page.margins.left;
  const valueColW = 130;
  const valueColX = left + CONTENT_WIDTH - valueColW;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#1E293B")
    .text("Payments Collected", left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 16;

  const rows = [
    { label: "On-spot (all games)", value: money(t.onspot), bold: true },
    { label: "District App - booking total", value: money(t.district), bold: true },
    { label: "of which paid as advance", value: money(t.districtAdvance), dim: true, indent: true },
    { label: "Turf Town - booking total", value: money(t.turftown), bold: true },
    { label: "of which paid as advance", value: money(t.turftownAdvance), dim: true, indent: true },
  ];
  rows.forEach((r) => {
    drawKeyValueRow(
      doc,
      r.indent ? left + 14 : left,
      valueColX,
      valueColW,
      r.label,
      r.value,
      { dim: r.dim, bold: r.bold }
    );
  });
  doc.y += 8;
};

// Column widths sum EXACTLY to CONTENT_WIDTH so nothing overflows the page
// or overlaps the next column - that mismatch was the root cause of the
// crooked, broken-looking table.
const TABLE_COLS = [
  { key: "no", label: "#", width: 20, align: "left" },
  { key: "when", label: "Date & Time", width: 84, align: "left" },
  { key: "name", label: "Customer", width: 76, align: "left" },
  { key: "mobile", label: "Mobile", width: 64, align: "left" },
  { key: "game", label: "Game / Booking", width: 106, align: "left" },
  { key: "source", label: "Entry", width: 55, align: "left" },
  { key: "total", label: "Total", width: 53, align: "right" },
  { key: "adv", label: "Advance", width: 57, align: "right" },
];
const TABLE_WIDTH = TABLE_COLS.reduce((s, c) => s + c.width, 0); // === CONTENT_WIDTH
const CELL_PAD = 4;
const ROW_MIN_H = 14;
const ROW_V_PAD = 6;

const colX = (x0, index) => {
  let x = x0;
  for (let i = 0; i < index; i++) x += TABLE_COLS[i].width;
  return x;
};

const drawTableHeader = (doc, x0, y) => {
  doc.rect(x0, y, TABLE_WIDTH, 18).fill("#F1F5F9");
  doc.font("Helvetica-Bold").fontSize(7.8).fillColor("#334155");
  TABLE_COLS.forEach((c, i) => {
    const x = colX(x0, i);
    doc.text(c.label, x + CELL_PAD, y + 5, {
      width: c.width - CELL_PAD * 2,
      align: c.align,
    });
  });
  return y + 18;
};

const drawBookingsTable = (doc, rows) => {
  const left = doc.page.margins.left;
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#1E293B")
    .text("Customer & Booking Details", left, doc.y, { width: CONTENT_WIDTH });
  doc.y += 14;

  const x0 = left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;
  let y = drawTableHeader(doc, x0, doc.y);

  if (rows.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#94A3B8")
      .text("No bookings in this period.", x0 + CELL_PAD, y + 8, { width: TABLE_WIDTH - CELL_PAD * 2 });
    doc.y = y + 26;
    return;
  }

  rows.forEach((r, i) => {
    const cells = [
      String(i + 1),
      fmtDateTime(r.at),
      r.name,
      r.mobile,
      `${r.gameName}\n${r.detail}`,
      ENTRY_LABEL[r.entrySource] || r.entrySource,
      money(r.total),
      r.advance > 0 ? money(r.advance) : "-",
    ];

    doc.font("Helvetica").fontSize(7.7);
    let rowH = ROW_MIN_H;
    cells.forEach((text, ci) => {
      const w = TABLE_COLS[ci].width - CELL_PAD * 2;
      rowH = Math.max(rowH, doc.heightOfString(String(text), { width: w, lineGap: 1 }) + ROW_V_PAD);
    });

    if (y + rowH > pageBottom) {
      doc.addPage();
      y = drawTableHeader(doc, x0, doc.page.margins.top);
    }

    if (i % 2 === 1) doc.rect(x0, y, TABLE_WIDTH, rowH).fill("#FAFBFC");

    doc.font("Helvetica").fontSize(7.7).fillColor("#334155");
    cells.forEach((text, ci) => {
      const col = TABLE_COLS[ci];
      const x = colX(x0, ci);
      doc.text(String(text), x + CELL_PAD, y + ROW_V_PAD / 2, {
        width: col.width - CELL_PAD * 2,
        align: col.align,
        lineGap: 1,
      });
    });

    y += rowH;
    doc.moveTo(x0, y).lineTo(x0 + TABLE_WIDTH, y).strokeColor("#F1F5F9").lineWidth(0.5).stroke();
  });

  doc.y = y + 10;
};

const drawFooterNote = (doc, cancelledCount) => {
  const left = doc.page.margins.left;
  doc.y += 4;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#94A3B8")
    .text(
      `${cancelledCount} cancelled booking${cancelledCount === 1 ? "" : "s"} in this period are excluded from all totals above.`,
      left,
      doc.y,
      { width: CONTENT_WIDTH }
    );
};

// ---------------------------------------------------------------------------

// GET /api/reports/pdf?period=daily|weekly|monthly&date=YYYY-MM-DD&game=<id>&tz=<offset>
// game omitted or "all" -> overall report across every game.
const downloadReportPdf = async (req, res) => {
  try {
    const period = String(req.query.period || "").toLowerCase();
    if (!PERIODS.includes(period))
      return res.status(400).json({ message: "period must be daily, weekly or monthly" });
    const dateKey = String(req.query.date || "");
    const gameParam = String(req.query.game || "all").toLowerCase();
    const game = gameParam === "all" ? null : gameParam;
    if (game && !GAMES[game])
      return res.status(400).json({ message: "Unknown game" });
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));

    const [data, settings] = await Promise.all([
      loadReportData({ period, dateKey, game, tz }),
      getSettings(),
    ]);
    const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);
    const gameSlug = game || "overall";
    const fileName = `strykon-${gameSlug}-${period}-${data.fromKey}_to_${data.toKey}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    doc.pipe(res);

    drawHeader(doc, { ...data, periodLabel }, settings);
    drawSummaryBoxes(doc, data.totals);
    drawPaymentSummary(doc, data.totals);
    drawBookingsTable(doc, data.rows);
    drawFooterNote(doc, data.cancelledCount);

    // page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#94A3B8")
        .text(
          `Page ${i - range.start + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 10,
          { width: CONTENT_WIDTH, align: "center" }
        );
    }

    doc.end();
  } catch (error) {
    console.error("downloadReportPdf:", error.message);
    if (!res.headersSent) res.status(400).json({ message: error.message || "Could not build report" });
  }
};

module.exports = { downloadReportPdf };
