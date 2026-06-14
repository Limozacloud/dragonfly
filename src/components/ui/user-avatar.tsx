import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  color: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizeClasses = {
  xs: "w-5 h-5 text-[0.6rem]",
  sm: "w-6 h-6 text-xs",
  md: "w-8 h-8 text-sm",
};

function UserAvatar({ name, color, size = "md", className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white shrink-0",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: color }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export { UserAvatar };
