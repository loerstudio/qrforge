"use client";
import {
  SquarePen,
  MessageSquare,
  Search,
  Compass,
  History,
  Settings,
} from "lucide-react";
import Link from "next/link";

export function Sidebar() {
  return (
    <aside className="w-[56px] shrink-0 bg-sidebar border-r border-border flex flex-col items-center py-3 gap-1">
      <Link
        href="/"
        className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-sm mb-2"
        aria-label="QRForge home"
      >
        Q
      </Link>

      <SideIcon icon={<SquarePen size={18} />} label="New" href="/" active />
      <SideIcon icon={<MessageSquare size={18} />} label="Chats" />
      <SideIcon icon={<Search size={18} />} label="Search" />
      <SideIcon icon={<Compass size={18} />} label="Discover" />
      <SideIcon icon={<History size={18} />} label="History" />

      <div className="mt-auto flex flex-col gap-1">
        <SideIcon icon={<Settings size={18} />} label="Settings" />
      </div>
    </aside>
  );
}

function SideIcon({
  icon,
  label,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const cls = `relative group w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
    active
      ? "bg-foreground/5 text-foreground"
      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
  }`;
  const tooltip = (
    <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md bg-foreground text-background text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
      {label}
    </span>
  );
  if (href)
    return (
      <Link href={href} className={cls} aria-label={label}>
        {icon}
        {tooltip}
      </Link>
    );
  return (
    <button className={cls} aria-label={label}>
      {icon}
      {tooltip}
    </button>
  );
}
