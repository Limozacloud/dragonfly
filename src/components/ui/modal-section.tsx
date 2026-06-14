import * as React from "react";
import { cn } from "@/lib/utils";

interface ModalSectionProps {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  variant?: "default" | "subtle";
}

function ModalSection({ title, children, className, noPadding = false, variant = "default" }: ModalSectionProps) {
  return (
    <div className={cn("bg-white border border-[#dde1e8] mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] last:mb-0", className)}>
      <div className={cn(
        "text-[0.7rem] font-semibold uppercase tracking-wider px-5 py-2",
        variant === "default"
          ? "text-white bg-gradient-to-r from-primary to-primary-dark"
          : "text-muted-foreground bg-[#f0f2f5] border-b border-[#dde1e8]"
      )}>
        {title}
      </div>
      <div className={cn(noPadding ? "" : "p-5")}>
        {children}
      </div>
    </div>
  );
}

export { ModalSection };
