const PDFDocument = require('pdfkit');
const prisma = require('../config/prisma');
const { failure } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

// ── POST /api/v1/documents/generate/prescription ─────────────────────────────
const generatePrescription = async (req, res) => {
  const { formulationId } = req.body;
  if (!formulationId) return failure(res, 'VALIDATION_ERROR', 'formulationId required', 400);

  const id = parseId(formulationId);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid formulationId', 400);

  try {
    const formulation = await prisma.formulation.findFirst({
      where: { id, elderly: { organizationId: BigInt(req.user.organizationId) } },
      include: {
        elderly: { select: { firstName: true, lastName: true, citizenId: true, age: true, weight: true } },
        items:   { include: { ingredient: { select: { nameEn: true, nameTh: true, unit: true } } }, orderBy: { sortOrder: 'asc' } },
        approvedByUser: { select: { fullName: true } },
      },
    });

    if (!formulation) return failure(res, 'NOT_FOUND', 'Formulation not found', 404);
    if (formulation.status !== 'APPROVED') return failure(res, 'FORBIDDEN', 'Formulation must be approved first', 403);

    const patientName = `${formulation.elderly.firstName ?? ''} ${formulation.elderly.lastName ?? ''}`.trim();
    const doctor      = formulation.approvedByUser?.fullName ?? 'แพทย์ผู้รักษา';
    const now         = new Date();
    const dateStr     = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="prescription-${formulationId}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 70, right: 70 } });
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('DIGITAL PRESCRIPTION', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('ชื่นใจ AI Care Platform', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.5);

    // Patient info
    doc.fontSize(11).font('Helvetica-Bold').text('ข้อมูลคนไข้');
    doc.font('Helvetica').fontSize(10);
    doc.text(`ชื่อ: ${patientName}`);
    doc.text(`เลขบัตรประชาชน: ${formulation.elderly.citizenId ?? '—'}`);
    doc.text(`อายุ: ${formulation.elderly.age ?? '—'} ปี`);
    doc.text(`น้ำหนัก: ${formulation.elderly.weight ? Number(formulation.elderly.weight) : '—'} กก.`);
    doc.moveDown(0.5);

    // Prescription info
    doc.fontSize(11).font('Helvetica-Bold').text('ข้อมูลใบสั่งยา');
    doc.font('Helvetica').fontSize(10);
    doc.text(`รหัสสูตร: ${formulationId}`);
    doc.text(`ชื่อสูตร: ${formulation.formulaName ?? '—'}`);
    doc.text(`รอบการผลิต: ${formulation.version ?? 1}`);
    doc.text(`วันที่ออกใบสั่ง: ${dateStr}`);
    doc.text(`อนุมัติโดย: ${doctor}`);
    doc.moveDown(0.5);

    // Ingredients table
    doc.fontSize(11).font('Helvetica-Bold').text('รายการวัตถุดิบ');
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const col = [70, 230, 340, 440];
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('ชื่อสาร', col[0], tableTop);
    doc.text('ปริมาณ (mg)', col[1], tableTop);
    doc.text('ความถี่', col[2], tableTop);
    doc.text('ระยะเวลา', col[3], tableTop);
    doc.moveDown(0.3);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);
    for (const item of formulation.items) {
      const y = doc.y;
      const name = item.ingredient?.nameEn ?? item.ingredient?.nameTh ?? '—';
      doc.text(name, col[0], y, { width: 150 });
      doc.text(`${item.doseMg} ${item.ingredient?.unit ?? 'mg'}`, col[1], y);
      doc.text(item.frequency ?? '—', col[2], y);
      doc.text(`${item.durationDays ?? 90} วัน`, col[3], y);
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.5);

    // Notes
    if (formulation.doctorNotes) {
      doc.fontSize(10).font('Helvetica-Bold').text('หมายเหตุแพทย์:');
      doc.font('Helvetica').fontSize(10).text(formulation.doctorNotes);
      doc.moveDown(0.5);
    }

    // Signature area
    doc.moveDown(2);
    doc.fontSize(10).text('ลายเซ็นแพทย์: _________________________', { align: 'right' });
    doc.moveDown(0.3);
    doc.text(`(${doctor})`, { align: 'right' });
    doc.text(`วันที่: ${dateStr}`, { align: 'right' });

    // Footer
    doc.fontSize(8).fillColor('gray')
      .text('เอกสารนี้ถูกสร้างโดยระบบ ชื่นใจ AI Care Platform — ห้ามแก้ไข', { align: 'center' });

    doc.end();

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'EXPORT',
      tableName: 'formulations', recordId: id, req,
    });
  } catch (err) {
    console.error('[PdfGeneratorController.generatePrescription]', err);
    if (!res.headersSent) failure(res, 'INTERNAL_ERROR', 'PDF generation failed', 500);
  }
};

// ── POST /api/v1/documents/generate/invoice ───────────────────────────────────
const generateInvoice = async (req, res) => {
  const { subscriptionId } = req.body;
  if (!subscriptionId) return failure(res, 'VALIDATION_ERROR', 'subscriptionId required', 400);

  const id = parseId(subscriptionId);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid subscriptionId', 400);

  try {
    const sub = await prisma.patientSubscription.findFirst({
      where: { id, elderly: { organizationId: BigInt(req.user.organizationId) } },
      include: {
        elderly:      { select: { firstName: true, lastName: true, citizenId: true } },
        organization: { select: { name: true, slug: true } },
      },
    });

    if (!sub) return failure(res, 'NOT_FOUND', 'Subscription not found', 404);

    const patientName = `${sub.elderly.firstName ?? ''} ${sub.elderly.lastName ?? ''}`.trim();
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const invoiceNo = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${subscriptionId.slice(-6)}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${subscriptionId}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 60, left: 70, right: 70 } });
    doc.pipe(res);

    // Header
    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE / ใบกำกับภาษี', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(sub.organization?.name ?? 'ชื่นใจ AI Care Platform', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.5);

    // Invoice info
    doc.fontSize(10).font('Helvetica');
    doc.text(`เลขที่ใบกำกับ: ${invoiceNo}`, { align: 'right' });
    doc.text(`วันที่: ${dateStr}`, { align: 'right' });
    doc.moveDown(0.5);

    // Customer info
    doc.fontSize(11).font('Helvetica-Bold').text('ข้อมูลลูกค้า');
    doc.font('Helvetica').fontSize(10);
    doc.text(`ชื่อ: ${patientName}`);
    doc.text(`เลขบัตรประชาชน: ${sub.elderly.citizenId ?? '—'}`);
    doc.moveDown(0.5);

    // Line items table
    doc.fontSize(11).font('Helvetica-Bold').text('รายการ');
    doc.moveDown(0.3);
    const tableTop = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('รายการ', 70, tableTop);
    doc.text('ระยะเวลา', 280, tableTop);
    doc.text('จำนวนเงิน', 430, tableTop, { width: 95, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(10);
    const price = sub.priceThb ? Number(sub.priceThb) : 0;
    const vat   = Math.round(price * 0.07 * 100) / 100;
    const total = Math.round((price + vat) * 100) / 100;

    doc.text(`${sub.planName ?? 'Personalized Supplement'} — รอบที่ ${sub.cycleNumber ?? 1}`, 70, doc.y);
    doc.text(`${sub.cycleDays ?? 90} วัน`, 280, doc.y);
    doc.text(`${price.toFixed(2)} บาท`, 430, doc.y, { width: 95, align: 'right' });
    doc.moveDown(0.5);
    doc.moveTo(70, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.3);

    // Totals
    doc.text('ยอดก่อนภาษี:', 350);
    doc.text(`${price.toFixed(2)} บาท`, 430, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
    doc.moveDown(0.3);
    doc.text('ภาษีมูลค่าเพิ่ม 7%:', 350);
    doc.text(`${vat.toFixed(2)} บาท`, 430, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(350, doc.y).lineTo(525, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold');
    doc.text('รวมทั้งสิ้น:', 350);
    doc.text(`${total.toFixed(2)} บาท`, 430, doc.y - doc.currentLineHeight(), { width: 95, align: 'right' });

    doc.moveDown(3);
    doc.fontSize(8).font('Helvetica').fillColor('gray')
      .text('เอกสารนี้ถูกสร้างโดยระบบ ชื่นใจ AI Care Platform — ใช้เป็นหลักฐานทางภาษีได้', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[PdfGeneratorController.generateInvoice]', err);
    if (!res.headersSent) failure(res, 'INTERNAL_ERROR', 'Invoice generation failed', 500);
  }
};

module.exports = { generatePrescription, generateInvoice };
