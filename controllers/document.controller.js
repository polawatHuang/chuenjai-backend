const path    = require('path');
const fs      = require('fs');
const prisma  = require('../config/prisma');
const { success, failure, paginated } = require('../utils/response');
const { createAuditLog } = require('../utils/audit');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function parseId(str) {
  if (!str || !/^\d+$/.test(String(str))) return null;
  return BigInt(str);
}

function serializeDoc(d) {
  return {
    id:           d.id.toString(),
    organizationId: d.organizationId.toString(),
    elderlyId:    d.elderlyId?.toString() ?? null,
    elderlyName:  d.elderly ? `${d.elderly.firstName ?? ''} ${d.elderly.lastName ?? ''}`.trim() : null,
    documentType: d.documentType,
    fileName:     d.fileName,
    fileSizeBytes:d.fileSizeBytes,
    mimeType:     d.mimeType,
    storageKey:   d.storageKey,
    ocrStatus:    d.ocrStatus,
    ocrResultId:  d.ocrResultId?.toString() ?? null,
    uploadedBy:   d.uploadedBy?.toString() ?? null,
    isDeleted:    d.isDeleted,
    createdAt:    d.createdAt,
  };
}

// ── GET /api/v1/documents ─────────────────────────────────────────────────────
const list = async (req, res) => {
  const { elderlyId, documentType, ocrStatus, page = '1', limit = '20' } = req.query;
  const orgId = BigInt(req.user.organizationId);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, parseInt(limit, 10) || 20);
  const skip = (pageNum - 1) * limitNum;

  const where = {
    organizationId: orgId,
    isDeleted: false,
    ...(elderlyId    ? { elderlyId: BigInt(elderlyId) } : {}),
    ...(documentType ? { documentType }                 : {}),
    ...(ocrStatus    ? { ocrStatus }                    : {}),
  };

  try {
    const [items, total] = await prisma.$transaction([
      prisma.medicalDocument.findMany({
        where, skip, take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: { elderly: { select: { firstName: true, lastName: true } } },
      }),
      prisma.medicalDocument.count({ where }),
    ]);
    return paginated(res, items.map(serializeDoc), { page: pageNum, limit: limitNum, total });
  } catch (err) {
    console.error('[DocumentController.list]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to fetch documents', 500);
  }
};

// ── POST /api/v1/documents/upload ─────────────────────────────────────────────
const upload = async (req, res) => {
  if (!req.file) return failure(res, 'VALIDATION_ERROR', 'No file uploaded', 400);

  const { elderlyId, documentType = 'LAB_PDF' } = req.body;
  const orgId = BigInt(req.user.organizationId);

  try {
    const doc = await prisma.medicalDocument.create({
      data: {
        organizationId: orgId,
        elderlyId:      elderlyId ? BigInt(elderlyId) : undefined,
        documentType,
        fileName:       req.file.originalname,
        fileSizeBytes:  BigInt(req.file.size),
        mimeType:       req.file.mimetype,
        storageKey:     req.file.filename,
        ocrStatus:      'PENDING',
        uploadedBy:     BigInt(req.user.id),
      },
      include: { elderly: { select: { firstName: true, lastName: true } } },
    });

    await createAuditLog({
      userId: BigInt(req.user.id), action: 'CREATE',
      tableName: 'medical_documents', recordId: doc.id, req,
    });

    return success(res, serializeDoc(doc), 201);
  } catch (err) {
    console.error('[DocumentController.upload]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to save document record', 500);
  }
};

// ── POST /api/v1/documents/:id/parse ─────────────────────────────────────────
const parseLabWithAI = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const doc = await prisma.medicalDocument.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId), isDeleted: false },
    });
    if (!doc) return failure(res, 'NOT_FOUND', 'Document not found', 404);

    await prisma.medicalDocument.update({ where: { id }, data: { ocrStatus: 'PROCESSING' } });

    const filePath = path.join(UPLOAD_DIR, doc.storageKey);
    if (!fs.existsSync(filePath)) {
      await prisma.medicalDocument.update({ where: { id }, data: { ocrStatus: 'FAILED' } });
      return failure(res, 'NOT_FOUND', 'File not found on disk', 404);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString('base64');
    const mediaType  = doc.mimeType || 'image/jpeg';

    const isImage = mediaType.startsWith('image/');
    let extractedText = '';

    if (isImage) {
      const aiRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64File },
            },
            {
              type: 'text',
              text: `You are a medical lab report parser. Extract all lab test values from this image.
Return ONLY a JSON object with this structure (no markdown, no explanation):
{
  "patientName": "string or null",
  "collectedDate": "ISO date string or null",
  "labName": "string or null",
  "biomarkers": [
    {"name": "test name", "value": number, "unit": "unit string", "refMin": number or null, "refMax": number or null, "status": "NORMAL|BORDERLINE|ABNORMAL|CRITICAL"}
  ],
  "notes": "any important clinical notes or null"
}`,
            },
          ],
        }],
      });
      extractedText = aiRes.content[0].type === 'text' ? aiRes.content[0].text : '';
    } else {
      // For PDFs, use text extraction prompt
      const aiRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `I have a medical lab report document. Based on the filename "${doc.fileName}", please create a template JSON response that a real parser would generate. Return ONLY a JSON object:
{
  "patientName": null,
  "collectedDate": null,
  "labName": "Lab from ${doc.fileName}",
  "biomarkers": [],
  "notes": "PDF parsing requires server-side extraction. Please upload an image version for AI parsing."
}`,
        }],
      });
      extractedText = aiRes.content[0].type === 'text' ? aiRes.content[0].text : '';
    }

    // Parse AI response
    let parsed;
    try {
      const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    if (!parsed || !parsed.biomarkers?.length) {
      await prisma.medicalDocument.update({ where: { id }, data: { ocrStatus: 'FAILED' } });
      return failure(res, 'PARSE_FAILED', 'Could not extract lab values from this file', 422);
    }

    // Create lab_result from parsed data
    let labResultId = null;
    if (doc.elderlyId && parsed.biomarkers?.length > 0) {
      const labResult = await prisma.labResult.create({
        data: {
          elderlyId:      doc.elderlyId,
          organizationId: doc.organizationId,
          collectedAt:    parsed.collectedDate ? new Date(parsed.collectedDate) : new Date(),
          labName:        parsed.labName,
          status:         'PENDING',
          results:        parsed.biomarkers,
          notes:          parsed.notes,
          parsedByAi:     true,
          uploadedBy:     BigInt(req.user.id),
        },
      });
      labResultId = labResult.id;
    }

    await prisma.medicalDocument.update({
      where: { id },
      data: { ocrStatus: 'DONE', ocrResultId: labResultId },
    });

    return success(res, {
      documentId: id.toString(),
      ocrStatus: 'DONE',
      labResultId: labResultId?.toString() ?? null,
      parsed,
    });
  } catch (err) {
    console.error('[DocumentController.parseLabWithAI]', err);
    await prisma.medicalDocument.update({ where: { id }, data: { ocrStatus: 'FAILED' } }).catch(() => {});
    return failure(res, 'INTERNAL_ERROR', 'AI parsing failed', 500);
  }
};

// ── GET /api/v1/documents/:id/download ───────────────────────────────────────
const download = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const doc = await prisma.medicalDocument.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId), isDeleted: false },
    });
    if (!doc) return failure(res, 'NOT_FOUND', 'Document not found', 404);

    const filePath = path.join(UPLOAD_DIR, doc.storageKey);
    if (!fs.existsSync(filePath)) return failure(res, 'NOT_FOUND', 'File not found', 404);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.fileName)}"`);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[DocumentController.download]', err);
    return failure(res, 'INTERNAL_ERROR', 'Download failed', 500);
  }
};

// ── DELETE /api/v1/documents/:id ─────────────────────────────────────────────
const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return failure(res, 'VALIDATION_ERROR', 'Invalid ID', 400);

  try {
    const doc = await prisma.medicalDocument.findFirst({
      where: { id, organizationId: BigInt(req.user.organizationId), isDeleted: false },
    });
    if (!doc) return failure(res, 'NOT_FOUND', 'Document not found', 404);

    await prisma.medicalDocument.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
    return success(res, { id: id.toString() });
  } catch (err) {
    console.error('[DocumentController.remove]', err);
    return failure(res, 'INTERNAL_ERROR', 'Failed to delete document', 500);
  }
};

module.exports = { list, upload, parseLabWithAI, download, remove };
