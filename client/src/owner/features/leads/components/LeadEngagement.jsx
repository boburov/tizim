import { Link } from "react-router-dom";
import { PhoneOff, PhoneCall, ArrowRight } from "lucide-react";
import Card from "@/shared/components/ui/card/Card";

// ALOQA HOLATI - "umuman aloqaga chiqilmagan" lidlar.
//
// Bu kartochka boshqalaridan MUHIMROQ va shuning uchun harakatga
// bog'langan (ro'yxatga filtr bilan o'tadi).
//
// Sabab: voronkadagi yo'qotish odatda "mijoz rozi bo'lmadi" deb
// tushuniladi. Lekin lid kelib, HECH KIM QO'NG'IROQ QILMAGAN bo'lsa -
// bu mijozning qarori emas, markazning ishlamagani. Bu eng arzon
// yo'qotish: odam allaqachon O'ZI qiziqib murojaat qilgan.
const LeadEngagement = ({ engagement }) => {
  const noContact = engagement?.noContact || 0;
  const contacted = engagement?.contacted || 0;
  const share = engagement?.noContactShare || 0;
  const oldest = engagement?.noContactOldestDays || 0;
  const openTotal = noContact + contacted;

  return (
    <Card title="Aloqa holati" className="space-y-3">
      {openTotal === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Ochiq lidlar yo&apos;q
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* BUTUN KARTOCHKA BOSILADI, faqat pastdagi havola emas.
                Raqamni ko'rgan odamning birinchi refleksi - o'sha raqam
                ustiga bosish. Faqat kichkina havola qoldirilsa, ko'pchilik
                raqamni bosib, hech narsa bo'lmasligini ko'radi va
                ro'yxatni qo'lda qidirishga tushadi. */}
            <Link
              to="/owner/leads?engagement=no_contact"
              className="group rounded-lg border p-3 text-left transition-colors hover:border-rose-400 hover:bg-rose-50 dark:hover:border-rose-500/50 dark:hover:bg-rose-500/10"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PhoneOff className="size-3.5" />
                Aloqa qilinmagan
              </div>
              <p
                className={
                  noContact > 0
                    ? "mt-1 text-2xl font-semibold text-rose-600 dark:text-rose-300"
                    : "mt-1 text-2xl font-semibold"
                }
              >
                {noContact}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                ochiq lidlarning {share}%
                <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>

            <Link
              to="/owner/leads?engagement=stale"
              className="group rounded-lg border p-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PhoneCall className="size-3.5" />
                Ishlanmoqda
              </div>
              <p className="mt-1 text-2xl font-semibold">{contacted}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                aloqa qilingan
                <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          </div>

          {noContact > 0 && oldest > 0 && (
            <p className="text-sm text-muted-foreground">
              Eng eskisi <b>{oldest} kun</b> oldin kelgan va hali ham hech kim
              bog&apos;lanmagan.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default LeadEngagement;
