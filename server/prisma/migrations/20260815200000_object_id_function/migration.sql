-- ═══════════════════════════════════════════════════════════════════════════
-- gen_object_id() — MongoDB ObjectId formatidagi (24 belgili hex) kalit.
--
-- NEGA cuid()/uuid() EMAS:
--   Klient va serverdagi 14 ta zod validator ID'ni /^[0-9a-fA-F]{24}$/
--   bo'yicha tekshiradi (masalan modules/roles/validators/create.validator.js).
--   Boshqa formatga o'tish o'sha tekshiruvlarni va frontend marshrutlarini
--   birdaniga buzardi. Format saqlansa — migratsiya klient uchun ko'rinmas.
--
-- TUZILISHI (ObjectId spetsifikatsiyasi bilan bir xil):
--   4 bayt — unix vaqt (sekund)   → tabiiy o'sish tartibi, indeks uchun yaxshi
--   3 bayt — mashina identifikatori
--   2 bayt — process identifikatori
--   3 bayt — hisoblagich (tasodifiy)
--
-- Bu migratsiya BIRINCHI bo'lib ishlaydi — qolgan barcha jadvallar ustunlari
-- DEFAULT sifatida shu funksiyaga tayanadi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gen_object_id() RETURNS varchar AS $$
DECLARE
    time_component  bigint;
    machine_id      bigint := FLOOR(random() * 16777215);
    process_id      bigint;
    seq_id          bigint := FLOOR(random() * 16777215);
    result          varchar := '';
BEGIN
    SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) INTO time_component;
    SELECT pg_backend_pid() INTO process_id;

    result := result || lpad(to_hex(time_component), 8, '0');
    result := result || lpad(to_hex(machine_id), 6, '0');
    result := result || lpad(to_hex(process_id), 4, '0');
    result := result || lpad(to_hex(seq_id), 6, '0');

    RETURN result;
END;
$$ LANGUAGE plpgsql;
