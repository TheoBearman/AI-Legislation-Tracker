import { SidebarTrigger } from "@/components/ui/sidebar";
import { Bot } from "lucide-react";

export function StatePulseHeader() {
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b bg-background px-2 sm:px-4 md:px-6 lg:px-8 shadow-sm w-full max-w-none min-w-0">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <SidebarTrigger />
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold font-headline truncate hidden sm:block">AI Legislation Tracker</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 flex-wrap min-w-0">
        {/* Auth buttons removed for AI specific version */}
      </div>
    </header>
  );
}
