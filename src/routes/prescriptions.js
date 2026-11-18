// POST /api/prescriptions  GET /api/prescriptions  GET /pending (staff)
// GET /:id/file (pharmacist/admin)  PATCH /:id (pharmacist/admin — verify or decline)
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requirePharmacy } from '../middleware/auth-middleware.js';
import { prescriptionUpload, RX_TYPES } from '../middleware/upload.js';
import { isUuid } from '../lib/helpers.js';
import { audit } from '../lib/audit.js';

const router = Router();
const BUCKET = 'prescriptions';

router.post('/', requireAuth, prescriptionUpload.single('prescription'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  const storagePath = `${req.user.id}/${Date.now()}-${randomUUID()}.${RX_TYPES[file.mimetype]}`;
  const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadErr) { console.error(uploadErr); return res.status(500).json({ error: 'File upload failed.' }); }

  const { data, error } = await supabaseAdmin.from('Prescription').insert({
    customer_id: req.user.id,
    prescription_file: storagePath,
    file_name: file.originalname?.slice(0, 200) || null,
  }).select('prescription_id, status').single();

  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    console.error(error);
    return res.status(500).json({ error: 'Unable to save your prescription.' });
  }
  await audit(req, 'prescription.uploaded', {
    target_type: 'prescription', target_id: data.prescription_id, details: { file: file.originalname?.slice(0, 200) || null },
  });
  return res.status(201).json({
    message: 'Prescription uploaded successfully. A pharmacist will review it shortly.',
    prescription_id: data.prescription_id,
    status: data.status,
  });
});

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('Prescription')
    .select('prescription_id, status, rejection_reason, uploaded_at')
    .eq('customer_id', req.user.id)
    .order('uploaded_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load prescriptions.' });
  return res.json(data);
});

router.get('/pending', requirePharmacy, async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('Prescription')
    .select('prescription_id, status, file_name, uploaded_at, profiles:Profiles!Prescription_customer_id_fkey(full_name, phone)')
    .eq('status', 'pending')
    .order('uploaded_at', { ascending: true });
  if (error) { console.error(error); return res.status(500).json({ error: 'Unable to load prescriptions.' }); }
  return res.json(data);
});

router.get('/:id/file', requirePharmacy, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Prescription not found.' });
  const { data: rx } = await supabaseAdmin.from('Prescription')
    .select('prescription_file').eq('prescription_id', req.params.id).maybeSingle();
  if (!rx) return res.status(404).json({ error: 'Prescription not found.' });

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(rx.prescription_file, 600);
  if (error) return res.status(500).json({ error: 'Unable to open the file.' });
  return res.json({ url: data.signedUrl });
});

router.patch('/:id', requirePharmacy, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Prescription not found.' });
  let { status, rejection_reason } = req.body ?? {};
  if (status === 'rejected') status = 'declined';
  if (!['verified', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'Status must be "verified" or "declined".' });
  }
  if (status === 'declined' && !rejection_reason?.trim()) {
    return res.status(400).json({ error: 'A reason is required when declining.' });
  }

  const { data, error } = await supabaseAdmin.from('Prescription').update({
    status,
    rejection_reason: status === 'declined' ? rejection_reason.trim().slice(0, 500) : null,
    pharmacist_id: req.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('prescription_id', req.params.id).eq('status', 'pending')
    .select('prescription_id, status, rejection_reason').maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(409).json({ error: 'Prescription not found or already reviewed.' });
  await audit(req, `prescription.${status}`, {
    target_type: 'prescription', target_id: data.prescription_id,
    details: status === 'declined' ? { reason: data.rejection_reason } : null,
  });
  return res.json({ message: `Prescription ${status}.`, prescription: data });
});

export default router;
