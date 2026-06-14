import * as React from "react";
import { cn } from "@/lib/utils";
import { IconX } from "@tabler/icons-react";

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "default" | "sm";
}

function AppModal({ isOpen, onClose, title, children, footer, size = "default" }: AppModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1040] bg-[rgba(13,17,23,0.6)] backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal Container */}
      <div className="fixed inset-0 z-[1050] flex items-center justify-center">
        <div
          className={cn(
            "relative z-[1060] flex flex-col overflow-hidden bg-[#eef1f6] shadow-2xl animate-in fade-in zoom-in-95 duration-200",
            size === "default"
              ? "w-[80vw] max-w-[80vw] h-[80vh] max-h-[80vh]"
              : "w-[480px] max-w-[90vw] max-h-[80vh]"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-sidebar-bg shrink-0">
            <h5 className="text-[1.15rem] font-bold text-white flex items-center gap-2">
              {title}
            </h5>
            <button
              type="button"
              onClick={onClose}
              className="text-white/50 hover:text-white/90 transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-[#eef1f6]">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center gap-2 px-6 py-3 border-t border-[#dde1e8] bg-[#e4e8ee] shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export { AppModal };
