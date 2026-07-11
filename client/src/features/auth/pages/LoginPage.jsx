// Hooks
import { useIsMobile } from "@/shared/hooks/useMobile";
import useLoginMutation from "../hooks/useLoginMutation";
import useObjectState from "@/shared/hooks/useObjectState";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

const LoginPage = () => {
  const isMobile = useIsMobile();
  const { mutate, isPending } = useLoginMutation();
  const { login, password, setField, state } = useObjectState({
    login: "",
    password: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!login || !password) return;
    mutate(state);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        required
        label="Login"
        value={login}
        name="username"
        disabled={isPending}
        autoFocus={!isMobile}
        placeholder="Foydalanuvchi nomi"
        className="animate__animated animate__fadeInUp"
        onChange={(e) => setField("login", e.target.value)}
      />

      <InputField
        required
        label="Parol"
        type="password"
        name="password"
        value={password}
        disabled={isPending}
        className="animate__animated animate__fadeInUp"
        onChange={(e) => setField("password", e.target.value)}
      />

      <Button
        disabled={isPending}
        className="w-full animate__animated animate__fadeInUp"
      >
        Kirish{isPending && "..."}
      </Button>
    </form>
  );
};

export default LoginPage;
