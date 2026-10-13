-- ── Pruebas adjuntas a un reclamo, denuncia o sugerencia ─────────────────────
-- Quien presenta un caso puede acompañarlo de archivos (fotos, capturas, documentos, audio o video).
-- Son confidenciales: van a un bucket propio que solo leen quien los subió y el equipo directivo,
-- igual que el caso mismo. No se usa el bucket `materials`, que lee todo el colegio.
alter table public.reports
  add column evidence jsonb not null default '[]'::jsonb
  check (jsonb_typeof(evidence) = 'array' and jsonb_array_length(evidence) <= 5);

-- evidence: {institution_id}/{user_id}/{archivo}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('evidence', 'evidence', false, 52428800, array[
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a'])
on conflict (id) do nothing;

create policy evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and app.is_member(app.safe_uuid((storage.foldername(name))[1])) and (
    (storage.foldername(name))[2] = (select auth.uid())::text
    or app.has_role(app.safe_uuid((storage.foldername(name))[1]), 'directivo')));
create policy evidence_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[2] = (select auth.uid())::text
              and app.is_member(app.safe_uuid((storage.foldername(name))[1])));
