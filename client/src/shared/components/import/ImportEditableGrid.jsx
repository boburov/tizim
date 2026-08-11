import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Search, SlidersHorizontal, X } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import CreatableSelectField from "@/shared/components/ui/select/CreatableSelectField";

// Utils
import { cn } from "@/shared/utils/cn";

const STATUS_META = {
  ok: {
    label: "Tayyor",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  imported: {
    label: "Yaratildi",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  error: {
    label: "Xato",
    pill: "bg-destructive/10 text-destructive",
    Icon: AlertCircle,
  },
  failed: {
    label: "Yozilmadi",
    pill: "bg-destructive/10 text-destructive",
    Icon: AlertCircle,
  },
  duplicate: {
    label: "Takror",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: Copy,
  },
};

// Avatar ranglari. Ism bo'yicha barqaror tanlanadi - bir odam har
// render'da bir xil rangda qoladi, ro'yxat "miltillamaydi".
const AVATARS = [
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
];

const money = (n) =>
  new Intl.NumberFormat("uz-UZ").format(Math.round(Number(n) || 0));

const cellText = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return "";
  return String(v);
};

const isBad = (s) => s === "error" || s === "failed" || s === "duplicate";

const hashIndex = (text, len) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 9973;
  return len ? h % len : 0;
};

const initialsOf = (parts) =>
  parts
    .map((p) => String(p || "").trim()[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

/**
 * NATIJA - hisoblangan yakuniy qoldiq.
 *
 * Bu butun jadvalning MA'NOSI: foydalanuvchi "Yaratish"ni bosishdan
 * OLDIN har bir odamda nima bo'lishini ko'radi. Shu ustunsiz `+`/`-`
 * ishorasidagi xatoni faqat yaratgandan keyin topish mumkin bo'lardi,
 * u paytda esa tuzatib bo'lmaydi.
 *
 * Ko'rinishi ataylab BITTA belgi: ilgari bu katak to'rt qatorli izoh
 * chiqarib, jadvalning yarmini egallardi. Batafsili hover izohida.
 */
const ResultPill = ({ preview }) => {
  if (!preview) return <span className="text-xs text-muted-foreground">—</span>;

  const { billed, opening, finalBalance, direction, warning, months, note } = preview;
  const value = direction !== undefined ? opening : finalBalance;

  if (!value) {
    return (
      <span className="text-xs text-muted-foreground" title={direction || ""}>
        0
      </span>
    );
  }

  const positive = value > 0;
  const title =
    direction !== undefined
      ? [direction, warning].filter(Boolean).join(" — ")
      : [
          `${months} oy × hisob = ${money(billed)}`,
          opening
            ? `Boshlang'ich: ${opening > 0 ? "+" : "−"}${money(Math.abs(opening))}`
            : "",
          note || "",
        ]
          .filter(Boolean)
          .join("\n");

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        positive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive",
      )}
    >
      {positive ? "+" : "−"}
      {money(Math.abs(value))}
      {(warning || note) && <span className="ml-1">!</span>}
    </span>
  );
};

// MAYDONLAR TINCH TURADI, kerak bo'lganda "uyg'onadi".
//
// Ilgari har katak o'z foni va chegarasi bilan QUTI edi: bitta qatorda
// 6 ta quti, ular yonma-yon turib jadvalni siqib qo'yardi va ko'z
// ma'lumotni emas, ramkalarni ko'rardi. Endi maydon shaffof - hover'da
// chegara, fokusda fon va halqa chiqadi. Ya'ni jadval MATNdek o'qiladi,
// tahrirlash imkoni esa yo'qolmaydi.
//
// Balandlik `h-10`: SelectSearch triggeri ham shu balandlikda (Button
// standarti), shuning uchun matn va tanlov kataklari bir chiziqda
// turadi.
const controlBase =
  "h-10 w-full rounded-lg border border-transparent bg-transparent px-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20";

/**
 * TANLOV KATAGI - loyihaning O'Z select komponenti ustida.
 *
 * `CreatableSelectField` allaqachon hamma narsani qiladi: qidiruv,
 * "＋ Yangi qo'shish" (dropdown ichida), yaratish oynasi va yaratilgan
 * yozuvni so'rov yangilanguncha vaqtincha ro'yxatda ushlab turish.
 * Shuning uchun bu yerda hech narsa qayta yozilmaydi.
 *
 * RO'YXATDA FAQAT HAQIQIY QIYMATLAR bo'ladi. Fayldan kelgan noma'lum
 * guruh nomi bu yerga umuman yetib kelmaydi - server uni qoralama
 * bosqichidayoq bo'shatadi (userImportBase.js -> draftUserRow).
 * Shuning uchun bu komponentda "topilmadi" kabi soxta variant yo'q.
 */
const SelectControl = ({
  value,
  options,
  header,
  invalid,
  disabled,
  create,
  onCreated,
  onChange,
}) => {
  return (
    <CreatableSelectField
      searchable
      addNewInHeader={false}
      value={value}
      onChange={onChange}
      options={options}
      error={invalid}
      disabled={disabled}
      placeholder={header}
      searchPlaceholder="Qidirish..."
      emptyText={`${header} topilmadi`}
      createLabel={create?.label}
      createTitle={create?.title || create?.label}
      createClassName={create?.className}
      create={create?.modal}
      // Import qatorlari NOM bilan ishlaydi, ID bilan emas - shuning
      // uchun standart `optionOf` (_id) bu yerda to'g'ri kelmaydi.
      optionOf={(e) => {
        const v = create?.valueOf?.(e);
        return { value: v, label: v };
      }}
      onCreated={(e) => {
        const v = create?.valueOf?.(e);
        if (v) onChange(v);
        onCreated?.();
      }}
    />
  );
};

/**
 * BITTA MAYDON - matn yoki tanlov. Jadval va mobil kartochka IKKALASI
 * ham shuni ishlatadi, shunda ikki ko'rinish bir-biridan uzilib
 * qolmaydi (yangi ustun turi qo'shilsa bitta joyda yoziladi).
 */
const Field = ({
  column,
  row,
  options,
  optionsReady,
  creatable,
  onOptionCreated,
  disabled,
  onEdit,
  className,
}) => {
  const value = cellText(row.raw?.[column.key]);
  const invalid = (row.errors || []).some((e) => e.field === column.key);
  const errors = (row.errors || []).filter((e) => e.field === column.key);
  // Variantlar hali kelmagan bo'lsa matn maydoni - so'rov yiqilsa ham
  // ma'lumot kiritish yopilib qolmasin.
  const asSelect = Boolean(column.optionsKey) && optionsReady;
  const create = creatable?.[column.optionsKey];

  const commit = (next) => {
    if (next === value) return;
    onEdit(row.rowNumber, column.key, next);
  };

  return (
    <div className={className}>
      {asSelect ? (
        <SelectControl
          value={value}
          options={options[column.optionsKey] || []}
          header={column.header}
          invalid={invalid}
          disabled={disabled}
          create={create}
          onCreated={onOptionCreated}
          onChange={commit}
        />
      ) : (
        <input
          type="text"
          disabled={disabled}
          defaultValue={value}
          // key - server qiymatni o'zgartirsa (autofill, login
          // to'qnashuvi) maydon yangilansin.
          key={`${column.key}:${value}`}
          placeholder={column.header}
          onBlur={(e) => commit(e.target.value)}
          className={cn(
            controlBase,
            invalid && "border-destructive",
            disabled && "opacity-60",
          )}
        />
      )}
      {errors.map((e, i) => (
        <p key={i} className="mt-1 text-[11px] leading-tight text-destructive">
          {e.message}
        </p>
      ))}
    </div>
  );
};

/**
 * MIJOZ BLOKI - avatar + ism/familiya + @login.
 *
 * Uchta ustunni bitta katakka yig'ish qasddan: odam qatorni ISMIDAN
 * taniydi, uch xil tor maydondan emas. Maydonlar baribir tahrirlanadi -
 * ular faqat chegarasiz ko'rinadi va hover'da chiziq chiqadi.
 */
const IdentityBlock = ({ row, nameColumns, subColumn, disabled, onEdit }) => {
  const names = nameColumns.map((c) => cellText(row.raw?.[c.key]));
  const seed = names.join(" ") || String(row.rowNumber);
  const tone = AVATARS[hashIndex(seed, AVATARS.length)];

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          tone,
        )}
        aria-hidden="true"
      >
        {initialsOf(names)}
      </span>
      {/* Ikki qator BIR XIL kenglikda: yuqorida ism+familiya `flex-1`
          bilan ota kenglikni to'ldiradi, pastda login esa yakka maydon
          sifatida o'sha kenglikni oladi. Shuning uchun chap va o'ng
          chetlari aniq bir chiziqda turadi. "@" maydon ICHIGA
          joylashtirilgan (absolute), aks holda u login maydonini o'ngga
          surib, pastki qator yuqoridagidan tor bo'lib qolardi. */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex gap-1.5">
          {nameColumns.map((c) => (
            <Field
              key={c.key}
              column={c}
              row={row}
              options={{}}
              optionsReady={false}
              disabled={disabled}
              onEdit={onEdit}
              className="min-w-0 flex-1 [&_input]:h-9 [&_input]:font-semibold"
            />
          ))}
        </div>
        {subColumn && (
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              @
            </span>
            <Field
              column={subColumn}
              row={row}
              options={{}}
              optionsReady={false}
              disabled={disabled}
              onEdit={onEdit}
              className="[&_input]:h-7 [&_input]:pl-6 [&_input]:text-xs [&_input]:text-muted-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
};

const StatusPill = ({ row }) => {
  const meta = STATUS_META[row.status] || STATUS_META.ok;
  const general = (row.errors || []).filter((e) => !e.field);
  return (
    <span
      title={[meta.label, ...general.map((e) => e.message), row.message]
        .filter(Boolean)
        .join(" — ")}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        meta.pill,
      )}
    >
      <meta.Icon className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  );
};

const Checkbox = ({ checked, onChange, label }) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={onChange}
    aria-label={label}
    className="size-4 cursor-pointer rounded accent-primary"
  />
);

/**
 * JADVAL QATORI (desktop) - `memo` bilan.
 *
 * NEGA MEMO: 300 qatorli jadvalda har katak tahriri yoki har checkbox
 * bosilishi BUTUN ro'yxatni qayta chizardi va yozish sezilarli
 * kechikardi. Bu ishlashi uchun ikki shart ta'minlangan: ishlovchilar
 * barqaror (useCallback) va tahrirda faqat O'ZGARGAN qator yangi obyekt
 * bo'ladi (modal'dagi `map` qolganlarning havolasini saqlaydi).
 */
const GridRow = memo(function GridRow({
  row,
  nameColumns,
  subColumn,
  columns,
  options,
  optionsReady,
  creatable,
  onOptionCreated,
  checked,
  disabled,
  onToggle,
  onEdit,
}) {
  return (
    <tr
      className={cn(
        "border-b transition-colors last:border-b-0 hover:bg-muted/40",
        isBad(row.status) && "bg-destructive/5",
        checked && "bg-primary/5",
      )}
    >
      {!disabled && (
        <td className="px-4 py-3 align-middle">
          <Checkbox
            checked={checked}
            onChange={() => onToggle(row.rowNumber)}
            label={`${row.rowNumber}-qator`}
          />
        </td>
      )}

      <td className="min-w-[260px] py-3 pr-4 align-middle">
        <IdentityBlock
          row={row}
          nameColumns={nameColumns}
          subColumn={subColumn}
          disabled={disabled}
          onEdit={onEdit}
        />
      </td>

      {columns.map((c) => (
        <td
          key={c.key}
          className={cn(
            "px-2 py-2.5 align-middle",
            // Tanlov ustuni kengroq: trigger ichida nom + strelka
            // sig'ishi kerak, aks holda matn qirqilib turardi.
            c.optionsKey ? "min-w-[168px]" : "min-w-[132px]",
          )}
        >
          <Field
            column={c}
            row={row}
            options={options}
            optionsReady={optionsReady}
            creatable={creatable}
            onOptionCreated={onOptionCreated}
            disabled={disabled}
            onEdit={onEdit}
          />
        </td>
      ))}

      <td className="px-4 py-3 align-middle">
        <ResultPill preview={row.preview} />
      </td>

      <td className="px-4 py-3 align-middle">
        <StatusPill row={row} />
      </td>
    </tr>
  );
});

/** MOBIL KARTOCHKA - jadval o'rniga. Tor ekranda 8 ta ustunni
 *  gorizontal aylantirish o'rniga har odam alohida kartochka bo'ladi. */
const GridCard = memo(function GridCard({
  row,
  nameColumns,
  subColumn,
  columns,
  options,
  optionsReady,
  creatable,
  onOptionCreated,
  checked,
  disabled,
  onToggle,
  onEdit,
}) {
  return (
    <li
      className={cn(
        "space-y-3 rounded-xl border p-3",
        isBad(row.status) && "border-destructive/40 bg-destructive/5",
        checked && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-2">
        {!disabled && (
          <span className="pt-2.5">
            <Checkbox
              checked={checked}
              onChange={() => onToggle(row.rowNumber)}
              label={`${row.rowNumber}-qator`}
            />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <IdentityBlock
            row={row}
            nameColumns={nameColumns}
            subColumn={subColumn}
            disabled={disabled}
            onEdit={onEdit}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {columns.map((c) => (
          <div key={c.key} className="min-w-0">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              {c.header}
              {c.required && <span className="text-destructive"> *</span>}
            </p>
            <Field
              column={c}
              row={row}
              options={options}
              optionsReady={optionsReady}
              creatable={creatable}
              onOptionCreated={onOptionCreated}
              disabled={disabled}
              onEdit={onEdit}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <StatusPill row={row} />
        <ResultPill preview={row.preview} />
      </div>
    </li>
  );
});

/**
 * TAHRIRLANADIGAN IMPORT JADVALI.
 *
 * Maxsus grid kutubxonasi ATAYLAB ishlatilmadi: 2000 qatorgacha bo'lgan
 * jadval uchun u ortiqcha bog'liqlik, uslub farqi va yangi xatolar
 * manbai bo'lardi.
 *
 * Matn o'zgarishi ONBLUR da uzatiladi (onChange da emas): har harfda
 * server tekshiruvi chaqirilardi. Tanlov (select) esa darhol - u yerda
 * "yozib tugatish" degan holat yo'q.
 *
 * ─── USTUNLAR UCH DARAJALI ───
 *   slot ("name"/"sub") - "Mijoz" blokiga yig'iladi;
 *   primary             - alohida ustun sifatida ko'rinadi;
 *   qolgani             - "Barcha ustunlar" ortida.
 * Yashirilgan ustun qiymati SAQLANADI va import qilinadi - u faqat
 * ko'zdan olib qo'yilgan.
 */
const ImportEditableGrid = ({
  rows = [],
  columns = [],
  options = {},
  optionsReady = false,
  creatable = null,
  onOptionCreated,
  onEdit,
  onBulkEdit,
  disabled = false,
}) => {
  const [search, setSearch] = useState("");
  const [onlyBad, setOnlyBad] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  // Ommaviy belgilash uchun tanlangan qiymatlar: {groupName: "IELTS-A1"}
  const [bulkValue, setBulkValue] = useState({});

  const nameColumns = useMemo(() => columns.filter((c) => c.slot === "name"), [columns]);
  const subColumn = useMemo(() => columns.find((c) => c.slot === "sub"), [columns]);

  const dataColumns = useMemo(() => columns.filter((c) => !c.slot), [columns]);
  const hasPrimary = dataColumns.some((c) => c.primary);
  const visibleColumns = useMemo(
    () =>
      showAll || !hasPrimary ? dataColumns : dataColumns.filter((c) => c.primary),
    [dataColumns, showAll, hasPrimary],
  );

  // Ommaviy belgilash faqat TANLOV ustunlari uchun: erkin matnni
  // (ism, telefon) bir necha qatorga birdek yozishning ma'nosi yo'q.
  // Variantsiz ustun ham chiqarib tashlanadi - bo'shdan tanlab bo'lmaydi.
  // Variantlari bor YOKI yaratish mumkin bo'lgan ustunlar. Ikkinchisi
  // muhim: markazda hali guruh yo'q bo'lsa ham panel ko'rinib, undan
  // birinchi guruhni yaratsa bo'ladi.
  const bulkColumns = useMemo(
    () =>
      dataColumns.filter(
        (c) =>
          c.optionsKey &&
          ((options[c.optionsKey] || []).length || creatable?.[c.optionsKey]),
      ),
    [dataColumns, options, creatable],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyBad && !isBad(r.status)) return false;
      if (!term) return true;
      if (String(r.rowNumber).includes(term)) return true;
      return Object.values(r.raw || {})
        .map(cellText)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, onlyBad]);

  // KO'RINADIGAN TANLOV - holat emas, HISOBLANADI.
  //
  // Filtr yoqilganda ekrandan chiqib ketgan qator tanlovda qolib
  // ketmasligi kerak: foydalanuvchi "5 ta tanlandi" ni ko'rib turib,
  // ekranda ikkita qator ko'rardi va "Belgilash" ko'rinmayotganlarni ham
  // o'zgartirardi. Kesishmani o'qish vaqtida hisoblaymiz - shunda filtr
  // olib tashlansa avvalgi tanlov joyida qoladi.
  const visibleSelected = useMemo(() => {
    if (!selected.size) return selected;
    const alive = new Set(filtered.map((r) => r.rowNumber));
    return new Set([...selected].filter((n) => alive.has(n)));
  }, [selected, filtered]);

  const badCount = useMemo(() => rows.filter((r) => isBad(r.status)).length, [rows]);
  const allChecked = filtered.length > 0 && visibleSelected.size === filtered.length;

  // BARQAROR ISHLOVCHILAR - qator memo'si aynan shularga tayanadi.
  const toggleRow = useCallback((rowNumber) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }, []);

  // "Oxirgi havola" naqshi: `onEdit` ota komponentda har render'da yangi
  // funksiya bo'lishi mumkin (useMutation obyekti o'zgaradi), lekin
  // qatorlarga BARQAROR havola berish kerak. Havola effektda
  // yangilanadi - render paytida ref yozish React qoidasini buzadi.
  const editRef = useRef(onEdit);
  useEffect(() => {
    editRef.current = onEdit;
  }, [onEdit]);
  const handleEdit = useCallback((rowNumber, key, value) => {
    editRef.current?.(rowNumber, key, value);
  }, []);

  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(filtered.map((r) => r.rowNumber)));

  const applyBulk = (key) => {
    const value = bulkValue[key] ?? "";
    if (!visibleSelected.size || !value) return;
    onBulkEdit?.([...visibleSelected], key, value);
    setSelected(new Set());
    setBulkValue((p) => ({ ...p, [key]: "" }));
  };

  const shared = {
    nameColumns,
    subColumn,
    columns: visibleColumns,
    options,
    optionsReady,
    creatable,
    onOptionCreated,
    disabled,
    onToggle: toggleRow,
    onEdit: handleEdit,
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* ── Asboblar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[150px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <InputField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ism, login yoki qator raqami"
            className="h-9 rounded-lg pl-9 text-sm"
          />
        </div>

        {badCount > 0 && (
          <Button
            size="sm"
            variant={onlyBad ? "default" : "outline"}
            className="h-9 rounded-lg"
            onClick={() => setOnlyBad((v) => !v)}
          >
            <AlertCircle className="size-4" />
            Muammoli {badCount}
          </Button>
        )}

        {hasPrimary && (
          <Button
            size="sm"
            variant={showAll ? "default" : "outline"}
            className="h-9 rounded-lg"
            onClick={() => setShowAll((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">Barcha ustunlar</span>
            <span className="sm:hidden">Ustunlar</span>
          </Button>
        )}

        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {filtered.length}/{rows.length}
        </span>
      </div>

      {/* ── Ommaviy amal: tanlanganlarni bitta guruhga/rolga ──
          Bitta so'rov yuboriladi (modal'dagi handleBulkEdit), shuning
          uchun 200 qatorni belgilash ham bitta tekshiruvga teng. */}
      {!disabled && visibleSelected.size > 0 && bulkColumns.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5">
          <span className="text-sm font-medium">
            {visibleSelected.size} ta tanlandi
          </span>
          {bulkColumns.map((c) => (
            <div key={c.key} className="flex flex-1 items-center gap-2 sm:flex-none">
              <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">
                <SelectControl
                  value={bulkValue[c.key] ?? ""}
                  options={options[c.optionsKey] || []}
                  header={c.header}
                  create={creatable?.[c.optionsKey]}
                  onCreated={onOptionCreated}
                  onChange={(v) => setBulkValue((p) => ({ ...p, [c.key]: v }))}
                />
              </div>
              <Button
                size="sm"
                className="h-9 shrink-0 rounded-lg"
                disabled={!bulkValue[c.key]}
                onClick={() => applyBulk(c.key)}
              >
                Belgilash
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-9 rounded-lg"
            onClick={() => setSelected(new Set())}
            aria-label="Tanlovni bekor qilish"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* ── DESKTOP: jadval ──
          `min-w-0` MUHIM: ota element grid/flex bo'lsa, bola elementning
          standart `min-width: auto` qiymati jadval kengligini tashqariga
          "itarib" yuboradi va modal ekrandan chiqib ketadi. */}
      <div className="hidden min-w-0 max-h-[60vh] overflow-auto rounded-xl border md:block">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr className="border-b">
              {!disabled && (
                <th className="w-12 px-4 py-3">
                  <Checkbox
                    checked={allChecked}
                    onChange={toggleAll}
                    label="Hammasini tanlash"
                  />
                </th>
              )}
              <th className="py-3 pr-4 text-left text-xs font-semibold text-muted-foreground">
                Mijoz
              </th>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  title={c.note}
                  className="whitespace-nowrap px-2 py-3 text-left text-xs font-semibold text-muted-foreground"
                >
                  {c.header}
                  {c.required && <span className="text-destructive"> *</span>}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Natija
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Holat
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <GridRow
                key={row.rowNumber}
                row={row}
                checked={visibleSelected.has(row.rowNumber)}
                {...shared}
              />
            ))}
          </tbody>
        </table>

        {!filtered.length && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Qator topilmadi
          </p>
        )}
      </div>

      {/* ── MOBIL: kartochkalar ── */}
      <div className="min-w-0 md:hidden">
        {!disabled && filtered.length > 0 && (
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={allChecked}
              onChange={toggleAll}
              label="Hammasini tanlash"
            />
            Hammasini tanlash
          </label>
        )}
        <ul className="max-h-[60vh] space-y-2 overflow-auto">
          {filtered.map((row) => (
            <GridCard
              key={row.rowNumber}
              row={row}
              checked={visibleSelected.has(row.rowNumber)}
              {...shared}
            />
          ))}
        </ul>
        {!filtered.length && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Qator topilmadi
          </p>
        )}
      </div>
    </div>
  );
};

export default ImportEditableGrid;
