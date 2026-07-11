// Toaster
import { toast } from "sonner";

// Icons
import { BugIcon } from "lucide-react";

// Router
import { useLocation } from "react-router-dom";

// Tanstack Query
import { useQuery } from "@tanstack/react-query";

// API
import axios from "axios";
import { authAPI } from "@/features/auth/api/auth.api";

// Env variables
const chatId = import.meta.env.VITE_BUG_REPORT_CHAT_ID;
const token = import.meta.env.VITE_BUG_REPORT_BOT_TOKEN;

// Utils
import { formatUzDate } from "@/shared/utils/formatDate";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useObjectState from "@/shared/hooks/useObjectState";

// Components
import InputGroup from "../ui/input/InputGroup";
import InputField from "../ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import ModalWrapper from "@/shared/components/ui/modal/ModalWrapper";

const BugReport = () => {
  const { openModal } = useModal();

  return (
    <>
      <Button
        title="Xatolik haqida xabar berish"
        onClick={() => openModal("bugReport")}
        className="fixed bottom-6 right-6 z-50 rounded-full size-12"
      >
        <BugIcon />
      </Button>

      <ModalWrapper
        name="bugReport"
        title="Xatolik haqida xabar berish"
        description="Platforma bo'yicha xatolik yoki taklif xabaringiz bo'lsa, bizga xabar bering. Biz uni iloji boricha tezroq ko'rib chiqishga harakat qilamiz."
      >
        <BugReportForm />
      </ModalWrapper>
    </>
  );
};

const BugReportForm = ({ close, isLoading, setIsLoading }) => {
  const { data: user } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authAPI.getMe().then((res) => res.data.data),
  });

  const location = useLocation();
  const { description, username, image, setField, setFields } = useObjectState({
    image: null,
    username: "",
    description: "",
  });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) return;

    setField("image", file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    try {
      setIsLoading(true);

      const dateStr = formatUzDate(new Date());
      const pathUrl =
        window.location.origin + location.pathname + location.search;

      const sessionUserStr = user
        ? user.fullName || user.firstName
        : "Noma'lum";
      const tgUsernameStr = username.trim()
        ? `\n✈️ Telegram: ${username.trim().startsWith("@") ? username.trim() : "@" + username.trim()}`
        : "";

      const userInfo = user
        ? `👤 User: ${sessionUserStr}\n🆔 Username: ${user.username}\n🔑 Rol: ${user.role || "Noma'lum"}${tgUsernameStr}`
        : `👤 User: Topilmadi${tgUsernameStr}`;

      const caption = `🔥 Yangi xatolik\n\n📝 Izoh: ${description.trim()}\n\n🔗 Sahifa: ${pathUrl}\n🕒 Sana: ${dateStr}\n\n${userInfo}`;

      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append("caption", caption);

      let apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      if (image) {
        apiUrl = `https://api.telegram.org/bot${token}/sendPhoto`;
        formData.append("photo", image);
      } else {
        formData.append("text", caption);
      }

      await axios.post(apiUrl, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Xabar yuborildi, rahmat!");
      setFields({ description: "", username: "", image: null });
      close?.();
    } catch (error) {
      toast.error("Xabarni yuborishda xatolik!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <InputGroup as="form" onSubmit={handleSubmit}>
      <InputField
        id="username"
        value={username}
        disabled={isLoading}
        placeholder="@username"
        label="Telegram username (ixtiyoriy)"
        onChange={(e) => setField("username", e.target.value)}
      />

      <InputField
        required
        type="textarea"
        id="description"
        value={description}
        disabled={isLoading}
        label="Muammo haqida"
        placeholder="Muammo haqida batafsil izoh qoldiring"
        onChange={(e) => setField("description", e.target.value)}
      />

      <InputField
        id="image"
        type="file"
        accept="image/*"
        disabled={isLoading}
        onChange={handleImageChange}
        label="Ekran rasmi (ixtiyoriy)"
      />

      <div className="flex flex-col-reverse gap-3.5 w-full xs:flex-row xs:justify-end">
        <Button
          type="button"
          onClick={close}
          variant="secondary"
          className="w-full xs:w-32"
        >
          Bekor qilish
        </Button>

        <Button
          className="w-full xs:w-32"
          disabled={isLoading || !description?.trim().length}
        >
          Yuborish
          {isLoading && "..."}
        </Button>
      </div>
    </InputGroup>
  );
};

export default BugReport;
