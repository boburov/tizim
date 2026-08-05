// Utils
import { cn } from "@/shared/utils/cn";

// React
import { cloneElement, useEffect, useRef, useState } from "react";

// Hooks
import useModal from "@/shared/hooks/useModal";
import useMediaQuery from "@/shared/hooks/useMediaQuery";

// Ui components
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/shared/components/shadcn/dialog";
import { Drawer, DrawerContent } from "@/shared/components/shadcn/drawer";

const ModalWrapper = ({
  children,
  name = "",
  className = "",
  description = "",
  title = "Modal sarlavhasi",
}) => {
  const { closeModal, isOpen, data } = useModal(name);

  /**
   * Yopilish animatsiyasi davomida OXIRGI ma'lumot saqlanadi.
   *
   * `close` reduceri `data` ni darhol bo'shatadi, lekin oyna yana ~200ms
   * ekranda turadi (chiqish animatsiyasi). O'sha oraliqda bola komponent
   * uzilmaydi - qayta render bo'ladi va propslari to'satdan `undefined`
   * ga aylanadi. Effekt bog'liqliklari o'zgarib, yopilayotgan oynadan
   * bo'sh so'rov ketishi (yoki matn "yo'qolib" ko'rinishi) shundan.
   */
  const [retainedData, setRetainedData] = useState(data);
  if (isOpen && retainedData !== data) setRetainedData(data);
  const activeData = isOpen ? data : retainedData;

  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);
  const isDesktop = useMediaQuery("(min-width: 480px)");
  const handleSetIsLoading = (value) => {
    isLoadingRef.current = value;
    setIsLoading(value);
  };
  const hanldeCloseModal = (data) => {
    if (isLoadingRef.current) return;
    closeModal(name, data);
  };

  const body = cloneElement(children, {
    isLoading,
    setIsLoading: handleSetIsLoading,
    close: hanldeCloseModal,
    ...(activeData || {}),
  });

  if (isDesktop) {
    return (
      <Dialog open={isOpen} onOpenChange={hanldeCloseModal}>
        <DialogContent className={cn("max-w-md", className)}>
          {/* Header */}
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          {/* Body */}
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={hanldeCloseModal}>
      <DrawerContent className={cn("px-5 pb-5 max-h-[90dvh]", className)}>
        {/* Header */}
        <DialogHeader className="bg-card pb-3.5 shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Body */}
        <div className="w-full flex-1 min-h-0 overflow-y-auto hidden-scroll">
          {body}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default ModalWrapper;
